import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { notifyTelegram } from '../messaging/telegram';
import { sendEmail } from '../messaging/email';
import { paymentReceiptEmail } from '../messaging/templates';
import type { NormalisedPaymentEvent } from './processor';
import type { Customer, Invoice, Job, Payment } from '../domain';

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
 * out-of-order delivery behave correctly.
 */
export async function applyPaymentEvent(event: NormalisedPaymentEvent): Promise<void> {
  const invoiceQuery = await db
    .collection(COLLECTIONS.invoices)
    .where('processorInvoiceId', '==', event.processorInvoiceId)
    .limit(1)
    .get();

  if (invoiceQuery.empty) {
    // Not ours — a Stripe invoice raised by hand in their dashboard, say.
    console.warn(`No invoice found for ${event.processor} invoice ${event.processorInvoiceId}`);
    return;
  }

  const invoiceRef = invoiceQuery.docs[0].ref;
  const paymentRef = db
    .collection(COLLECTIONS.payments)
    .doc(`${event.processor}_${event.processorPaymentId}`);

  const result = await db.runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) return null;

    const invoice = { id: invoiceSnap.id, ...invoiceSnap.data() } as Invoice;
    const deltaPence = event.cumulativePaidPence - invoice.amountPaidPence;

    if (deltaPence <= 0) return null; // replay, or already recorded

    const jobRef = db.collection(COLLECTIONS.jobs).doc(invoice.jobId);
    const jobSnap = await tx.get(jobRef);
    const job = jobSnap.exists ? ({ id: jobSnap.id, ...jobSnap.data() } as Job) : null;

    const settled = event.cumulativePaidPence >= invoice.totalPence;
    const timestamp = nowIso();

    const payment: Omit<Payment, 'id'> = {
      invoiceId: invoice.id,
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
        amountPaidPence: event.cumulativePaidPence,
        status: settled ? 'paid' : 'partially_paid',
        paidAt: settled ? timestamp : null,
        updatedAt: timestamp,
      },
      { merge: true },
    );

    // A paid deposit is what actually confirms the slot. The balance invoice
    // being paid says nothing new about the job, which is already complete.
    if (job && invoice.kind === 'deposit' && settled && job.status === 'quoted') {
      tx.set(jobRef, { status: 'confirmed', updatedAt: timestamp }, { merge: true });
    }

    return { invoice, job, deltaPence, settled };
  });

  if (!result) return;

  const { invoice, deltaPence, settled } = result;
  const customerSnap = await db.collection(COLLECTIONS.customers).doc(invoice.customerId).get();
  const customer = customerSnap.exists
    ? ({ id: customerSnap.id, ...customerSnap.data() } as Customer)
    : null;

  const outstanding = Math.max(0, invoice.totalPence - event.cumulativePaidPence);

  await Promise.all([
    customer
      ? (() => {
          const receipt = paymentReceiptEmail({
            customerName: customer.name,
            invoice,
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
        `Invoice ${invoice.number} (${invoice.kind})`,
        customer ? `From ${customer.name}` : '',
        settled ? 'Invoice settled in full.' : `Outstanding: ${formatMoney(outstanding)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      { template: 'payment-alert', relatedTo: { invoiceId: invoice.id, jobId: invoice.jobId } },
    ),
  ]);
}
