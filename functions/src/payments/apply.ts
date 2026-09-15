import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { notifyTelegram } from '../messaging/telegram';
import { escapeHtml } from '../messaging/templates';
import { sendEmail } from '../messaging/email';
import { paymentReceiptEmail } from '../messaging/templates';
import { collectedPence, deriveInvoiceStatus, hasInstalments, readInstalments } from './instalments';
import type {
  NormalisedDisputeEvent,
  NormalisedEvent,
  NormalisedPaymentEvent,
  NormalisedPaymentFailedEvent,
  NormalisedRefundEvent,
  NormalisedVoidedEvent,
} from './processor';
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
      processorChargeId: event.processorChargeId,
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

/**
 * Every verified webhook lands here and is sent to the handler for its kind.
 *
 * Anything this throws is retried by the processor, so a handler must be safe
 * to run twice. Each one is: payments and refunds compare a cumulative total
 * against what is recorded, and the alert-only handlers write nothing.
 */
export async function applyProcessorEvent(event: NormalisedEvent): Promise<void> {
  switch (event.kind) {
    case 'payment':
      return applyPaymentEvent(event);
    case 'refund':
      return applyRefundEvent(event);
    case 'payment_failed':
      return applyPaymentFailedEvent(event);
    case 'dispute':
      return applyDisputeEvent(event);
    case 'voided':
      return applyVoidedEvent(event);
  }
}

/**
 * Money given back, whether raised from the CRM or straight from Stripe.
 *
 * The processor is the authority on a refund, not our button: the CRM records
 * a request and asks Stripe to act, but the payment is only marked refunded
 * here, when Stripe confirms it. A refund issued in the dashboard lands in
 * exactly the same place.
 */
async function applyRefundEvent(event: NormalisedRefundEvent): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.payments)
    .where('processorChargeId', '==', event.processorChargeId)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn(`Refund for unknown charge ${event.processorChargeId} — nothing to reconcile`);
    return;
  }

  const ref = snap.docs[0].ref;
  const payment = { id: snap.docs[0].id, ...snap.docs[0].data() } as Payment;

  // Cumulative, so a replay or a second partial refund both settle correctly.
  if ((payment.refundedPence ?? 0) >= event.cumulativeRefundedPence) return;

  const fully = event.cumulativeRefundedPence >= payment.amountPence;
  const timestamp = nowIso();

  await ref.set(
    {
      refundedPence: event.cumulativeRefundedPence,
      refundedAt: timestamp,
      status: fully ? 'refunded' : payment.status,
    },
    { merge: true },
  );

  // Settle any request this answers, whichever way the refund was started.
  const open = await db
    .collection(COLLECTIONS.refundRequests)
    .where('paymentId', '==', payment.id)
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (!open.empty) {
    await open.docs[0].ref.set(
      {
        status: 'settled',
        processorRefundId: event.processorRefundId,
        settledAt: timestamp,
        updatedAt: timestamp,
      },
      { merge: true },
    );
  }

  await notifyTelegram(
    [
      `<b>↩️ Refund confirmed</b>`,
      ``,
      `${formatMoney(event.cumulativeRefundedPence)} returned${fully ? ' in full' : ' (partial)'}`,
      (open.empty ? 'Refunded at Stripe, not from the CRM.' : 'Settles the refund request raised in the CRM.'),
    ].join('\n'),
    { template: 'refund-confirmed', relatedTo: { invoiceId: payment.invoiceId, jobId: payment.jobId } },
  );
}

/**
 * A card was declined. Nothing is written — the invoice is still owed, and its
 * status already says so. This exists so Chris hears about it, because today a
 * failed payment is completely silent.
 */
async function applyPaymentFailedEvent(event: NormalisedPaymentFailedEvent): Promise<void> {
  const ref = await findInvoiceRef(event.processorInvoiceId);
  const invoice = ref ? ((await ref.get()).data() as Invoice | undefined) : undefined;

  await notifyTelegram(
    [
      `<b>⚠️ Payment failed</b>`,
      ``,
      `${formatMoney(event.amountPence)} did not go through`,
      invoice ? `Invoice ${invoice.number}` : `Stripe invoice ${event.processorInvoiceId}`,
      event.reason ? `Reason: ${escapeHtml(event.reason)}` : '',
      `They will need a new payment link, or another card.`,
    ]
      .filter(Boolean)
      .join('\n'),
    { template: 'payment-failed', ...(invoice ? { relatedTo: { jobId: invoice.jobId } } : {}) },
  );
}

/**
 * A chargeback. Alert only, and deliberately loud: Stripe gives a deadline to
 * submit evidence and missing it loses the money by default.
 */
async function applyDisputeEvent(event: NormalisedDisputeEvent): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.payments)
    .where('processorChargeId', '==', event.processorPaymentId)
    .limit(1)
    .get();

  const payment = snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Payment);

  await notifyTelegram(
    [
      `<b>🚨 CHARGEBACK opened</b>`,
      ``,
      `${formatMoney(event.amountPence)} disputed`,
      event.reason ? `Reason: ${escapeHtml(event.reason)}` : '',
      event.dueBy ? `Evidence due by ${event.dueBy.slice(0, 10)} — miss it and the money is gone.` : '',
      `Respond in the Stripe dashboard.`,
    ]
      .filter(Boolean)
      .join('\n'),
    { template: 'dispute-opened', ...(payment ? { relatedTo: { jobId: payment.jobId, invoiceId: payment.invoiceId } } : {}) },
  );
}

/** Voided at Stripe's end. Keeps our copy from claiming money is still due. */
async function applyVoidedEvent(event: NormalisedVoidedEvent): Promise<void> {
  const ref = await findInvoiceRef(event.processorInvoiceId);
  if (!ref) return;

  const invoice = { id: ref.id, ...(await ref.get()).data() } as Invoice;
  if (invoice.status === 'void' || invoice.amountPaidPence > 0) return;

  const instalments = readInstalments(invoice).map((instalment) =>
    instalment.processorInvoiceId === event.processorInvoiceId
      ? { ...instalment, status: 'void' as const }
      : instalment,
  );

  await ref.set(
    {
      ...(hasInstalments(invoice) ? { instalments } : {}),
      status: deriveInvoiceStatus(invoice, instalments),
      updatedAt: nowIso(),
    },
    { merge: true },
  );
}
