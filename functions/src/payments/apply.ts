import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { notifyTelegram } from '../messaging/telegram';
import { sendEmail } from '../messaging/email';
import { paymentReceiptEmail } from '../messaging/templates';
import { collectedPence, deriveInvoiceStatus, hasInstalments, readInstalments } from './instalments';
import type { NormalisedPaymentEvent } from './processor';
import type { Customer, Instalment, Invoice, Job, Payment } from '../domain';

/**
 * Records a payment and moves everything downstream of it.
 *
 * Idempotency matters more here than anywhere else in the system: Stripe
 * retries webhooks, and a duplicate would overstate revenue and could mark an
 * invoice paid twice. Two independent guards handle it —
 *
 *   1. the ledger document id is derived from the processor's event id, so a
 *      replay overwrites rather than appends; and
 *   2. we compare the processor's cumulative total against what we have already
 *      recorded and do nothing when the delta is not positive.
 *
 * The second guard is the load-bearing one: it also makes partial payments and
 * out-of-order delivery behave correctly. It compares against the INSTALMENT,
 * not the invoice, because the processor's running total is per payable object
 * — a deposit and a balance are two objects against one invoice.
 */
export async function applyPaymentEvent(event: NormalisedPaymentEvent): Promise<void> {
  const invoiceRef = await findInvoiceRef(event.processorInvoiceId);

  if (!invoiceRef) {
    // Not ours — a Stripe invoice raised by hand in their dashboard, say.
    console.warn(`No invoice found for ${event.processor} invoice ${event.processorInvoiceId}`);
    return;
  }

  const paymentRef = db
    .collection(COLLECTIONS.payments)
    .doc(`${event.processor}_${event.processorPaymentId}`);

  const result = await db.runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) return null;

    const invoice = { id: invoiceSnap.id, ...invoiceSnap.data() } as Invoice;
    const instalments = readInstalments(invoice);
    const target = instalments.find(
      (instalment) => instalment.processorInvoiceId === event.processorInvoiceId,
    );

    if (!target) {
      console.warn(`Invoice ${invoice.number} has no instalment for ${event.processorInvoiceId}`);
      return null;
    }

    const deltaPence = event.cumulativePaidPence - target.amountPaidPence;
    if (deltaPence <= 0) return null; // replay, or already recorded

    const jobRef = db.collection(COLLECTIONS.jobs).doc(invoice.jobId);
    const jobSnap = await tx.get(jobRef);
    const job = jobSnap.exists ? ({ id: jobSnap.id, ...jobSnap.data() } as Job) : null;

    const timestamp = nowIso();
    const instalmentSettled = event.cumulativePaidPence >= target.amountPence;

    const updated: Instalment[] = instalments.map((instalment) =>
      instalment.id === target.id
        ? {
            ...instalment,
            amountPaidPence: event.cumulativePaidPence,
            status: instalmentSettled ? ('paid' as const) : instalment.status,
            paidAt: instalmentSettled ? timestamp : (instalment.paidAt ?? null),
          }
        : instalment,
    );

    const collected = collectedPence(updated);
    const status = deriveInvoiceStatus(invoice, updated);

    const payment: Omit<Payment, 'id'> = {
      invoiceId: invoice.id,
      instalmentId: target.id,
      jobId: invoice.jobId,
      processor: event.processor,
      processorPaymentId: event.processorPaymentId,
      amountPence: deltaPence,
      currency: 'GBP',
      status: 'completed',
      method: event.method ?? 'card',
      receivedAt: event.receivedAt,
      createdAt: timestamp,
    };
    tx.set(paymentRef, payment);

    tx.set(
      invoiceRef,
      {
        // A legacy invoice must not grow an instalments array: its shape is
        // what the customer was actually billed against.
        ...(hasInstalments(invoice) ? { instalments: updated } : {}),
        amountPaidPence: collected,
        status,
        paidAt: status === 'paid' ? timestamp : null,
        updatedAt: timestamp,
      },
      { merge: true },
    );

    // A paid deposit is what actually confirms the slot. Later instalments say
    // nothing new about the job, which by then is already under way.
    if (job && target.kind === 'deposit' && instalmentSettled && job.status === 'quoted') {
      tx.set(jobRef, { status: 'confirmed', updatedAt: timestamp }, { merge: true });
    }

    return {
      invoice,
      job,
      deltaPence,
      target,
      outstanding: Math.max(0, invoice.totalPence - collected),
    };
  });

  if (!result) return;

  const { invoice, job, deltaPence, target } = result;
  const customerSnap = await db.collection(COLLECTIONS.customers).doc(invoice.customerId).get();
  const customer = customerSnap.exists
    ? ({ id: customerSnap.id, ...customerSnap.data() } as Customer)
    : null;

  // A new invoice bills the whole job, so its own arithmetic is the answer.
  const outstanding = hasInstalments(invoice)
    ? result.outstanding
    : await legacyOutstandingForJob(invoice, job, event.cumulativePaidPence);
  const settledInFull = outstanding <= 0;

  await Promise.all([
    customer
      ? (() => {
          const receipt = paymentReceiptEmail({
            customerName: customer.name,
            invoice,
            instalmentKind: target.kind,
            amountPence: deltaPence,
            outstandingPence: outstanding,
          });
          return sendEmail({
            to: customer.email,
            subject: receipt.subject,
            html: receipt.html,
            template: 'payment-receipt',
            relatedTo: { invoiceId: invoice.id, jobId: invoice.jobId, customerId: customer.id },
          });
        })()
      : Promise.resolve(false),
    notifyTelegram(
      [
        `<b>💷 Payment received</b>`,
        ``,
        `${formatMoney(deltaPence)} via Stripe`,
        `Invoice ${invoice.number} (${target.kind})`,
        customer ? `From ${customer.name}` : '',
        settledInFull ? 'Job settled in full.' : `Still outstanding: ${formatMoney(outstanding)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      { template: 'payment-alert', relatedTo: { invoiceId: invoice.id, jobId: invoice.jobId } },
    ),
  ]);
}

/**
 * The invoice a processor invoice id belongs to.
 *
 * New invoices mirror every instalment's processor id into a flat array,
 * because Firestore cannot query a field inside an array of maps. Legacy
 * invoices hold a single id at the top level, so both are tried — the second
 * read only happens on the path that has already missed.
 */
async function findInvoiceRef(processorInvoiceId: string) {
  const byInstalment = await db
    .collection(COLLECTIONS.invoices)
    .where('processorInvoiceIds', 'array-contains', processorInvoiceId)
    .limit(1)
    .get();

  if (!byInstalment.empty) return byInstalment.docs[0].ref;

  const legacy = await db
    .collection(COLLECTIONS.invoices)
    .where('processorInvoiceId', '==', processorInvoiceId)
    .limit(1)
    .get();

  return legacy.empty ? null : legacy.docs[0].ref;
}

/**
 * What is still owed across a job billed the old way, as two invoices.
 *
 * Those records predate instalments, so the deposit and the balance are
 * separate documents and only the job's own value ties them together. A new
 * invoice carries the whole job total and needs none of this.
 */
async function legacyOutstandingForJob(
  invoice: Invoice,
  job: Job | null,
  cumulativePaidPence: number,
): Promise<number> {
  const jobTotalPence = job?.valuePence;
  if (jobTotalPence === undefined) {
    // `invoice` was read before this payment landed, so use the processor's
    // cumulative figure rather than the stale stored one.
    return Math.max(0, invoice.totalPence - cumulativePaidPence);
  }

  const paidSnap = await db.collection(COLLECTIONS.payments).where('jobId', '==', invoice.jobId).get();
  const collected = paidSnap.docs.reduce((sum, doc) => sum + ((doc.data().amountPence as number) ?? 0), 0);
  return Math.max(0, jobTotalPence - collected);
}
