import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  REGION,
  RESEND_API_KEY,
  STRIPE_SECRET_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { assertAdmin } from '../lib/auth';
import { parseOrThrow } from '../lib/validation';
import { adapterFor } from './adapters';
import { notifyTelegram } from '../messaging/telegram';
import { escapeHtml } from '../messaging/templates';
import type { Payment, RefundRequest } from '../domain';

const REFUND_SECRETS = [STRIPE_SECRET_KEY, RESEND_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID];

/**
 * Raises a request for every payment on a job that has not been given back.
 *
 * Cancelling never moves money on its own. Somebody has paid, the work is not
 * happening, and that is a decision for Chris to take deliberately — so this
 * records what is owed and tells him. The refund itself needs approval, and is
 * only true once the processor confirms it (see applyRefundEvent).
 *
 * Returns the number of requests raised, which is zero for the ordinary case
 * of cancelling a quote nobody has paid.
 */
export async function raiseRefundRequests(params: {
  jobId: string;
  quoteId?: string | null;
  reason: string;
}): Promise<number> {
  const { jobId, quoteId, reason } = params;

  const [paidSnap, openSnap] = await Promise.all([
    db.collection(COLLECTIONS.payments).where('jobId', '==', jobId).get(),
    db.collection(COLLECTIONS.refundRequests).where('jobId', '==', jobId).get(),
  ]);

  // Never raise a second request for a payment already spoken for.
  const spokenFor = new Set(
    openSnap.docs
      .filter((doc) => (doc.data().status as string) !== 'cancelled')
      .map((doc) => doc.data().paymentId as string),
  );

  const owed = paidSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Payment)
    .filter(
      (payment) =>
        payment.status === 'completed' &&
        (payment.refundedPence ?? 0) < payment.amountPence &&
        !spokenFor.has(payment.id),
    );

  if (owed.length === 0) return 0;

  const timestamp = nowIso();
  const batch = db.batch();

  for (const payment of owed) {
    const ref = db.collection(COLLECTIONS.refundRequests).doc();
    const request: Omit<RefundRequest, 'id'> = {
      jobId,
      invoiceId: payment.invoiceId,
      quoteId: quoteId ?? null,
      customerId: '',
      paymentId: payment.id,
      processorPaymentId: payment.processorChargeId ?? '',
      amountPence: payment.amountPence - (payment.refundedPence ?? 0),
      status: 'open',
      reason,
      processorRefundId: null,
      requestedAt: timestamp,
      settledAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    batch.set(ref, request);
  }

  await batch.commit();

  const total = owed.reduce(
    (sum, payment) => sum + payment.amountPence - (payment.refundedPence ?? 0),
    0,
  );

  await notifyTelegram(
    [
      `<b>💸 Refund owed</b>`,
      ``,
      `${formatMoney(total)} across ${owed.length} payment${owed.length === 1 ? '' : 's'}`,
      escapeHtml(reason),
      ``,
      `Approve it in the CRM, or refund at Stripe — either way it reconciles.`,
    ].join('\n'),
    { template: 'refund-requested', relatedTo: { jobId } },
  );

  return owed.length;
}

/**
 * Admin: approve a refund request and ask the processor to return the money.
 *
 * The request is NOT settled here. Stripe may take days, and can still fail,
 * so this only records that it was asked for; `charge.refunded` is what marks
 * the payment refunded and closes the request. That keeps one source of truth
 * for whether a customer actually has their money back.
 */
export const approveRefund = onCall({ region: REGION, secrets: REFUND_SECRETS }, async (request) => {
  assertAdmin(request);
  const { refundRequestId } = parseOrThrow(
    z.object({ refundRequestId: z.string().min(1) }),
    request.data,
  );

  const ref = db.collection(COLLECTIONS.refundRequests).doc(refundRequestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Refund request not found.');

  const refundRequest = { id: snap.id, ...snap.data() } as RefundRequest;

  if (refundRequest.status !== 'open') {
    throw new HttpsError('failed-precondition', `This request is already ${refundRequest.status}.`);
  }

  if (!refundRequest.processorPaymentId) {
    throw new HttpsError(
      'failed-precondition',
      'This payment has no processor charge recorded against it, so it cannot be refunded automatically. Refund it in the Stripe dashboard.',
    );
  }

  let result;
  try {
    result = await adapterFor('stripe').refundPayment({
      processorPaymentId: refundRequest.processorPaymentId,
      amountPence: refundRequest.amountPence,
      reason: refundRequest.reason,
    });
  } catch (error) {
    console.error('Refund failed at the processor', error);
    throw new HttpsError(
      'internal',
      'Stripe would not take the refund. Nothing has changed — try again, or refund in the Stripe dashboard.',
    );
  }

  await ref.set(
    {
      processorRefundId: result.processorRefundId,
      // Still open: the webhook settles it when the money has actually moved.
      updatedAt: nowIso(),
    },
    { merge: true },
  );

  return {
    refundRequestId,
    amountPence: refundRequest.amountPence,
    status: result.status,
  };
});

/** Admin: drop a request without refunding — the money is staying put. */
export const dismissRefund = onCall({ region: REGION, secrets: REFUND_SECRETS }, async (request) => {
  assertAdmin(request);
  const { refundRequestId } = parseOrThrow(
    z.object({ refundRequestId: z.string().min(1) }),
    request.data,
  );

  const ref = db.collection(COLLECTIONS.refundRequests).doc(refundRequestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Refund request not found.');

  const refundRequest = snap.data() as RefundRequest;
  if (refundRequest.status !== 'open') {
    throw new HttpsError('failed-precondition', `This request is already ${refundRequest.status}.`);
  }

  const timestamp = nowIso();
  await ref.set({ status: 'cancelled', settledAt: timestamp, updatedAt: timestamp }, { merge: true });

  return { refundRequestId, status: 'cancelled' };
});
