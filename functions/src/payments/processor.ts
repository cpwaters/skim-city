import type { InvoiceKind, LineItem, Processor } from '../domain';

/**
 * One interface, one adapter. Stripe is the only processor, but everything
 * above this layer works in terms of `PaymentAdapter` and never imports a
 * vendor SDK directly, so adding another is a change to this folder alone.
 */

export interface InvoiceCustomer {
  name: string;
  email: string;
  phone?: string;
}

export interface CreateInvoiceInput {
  /** Our own sequential number, e.g. SC-0007. Shown to the customer. */
  invoiceNumber: string;
  customer: InvoiceCustomer;
  lineItems: LineItem[];
  /** VAT as a single amount; adapters append it as its own line when non-zero. */
  vatPence: number;
  vatRatePercent: number;
  totalPence: number;
  dueDate: string;
  memo?: string;
  /**
   * Our Firestore ids, echoed back on webhooks. `instalmentId` says which
   * collection of the invoice this payable object is for.
   */
  metadata: { invoiceId: string; jobId: string; instalmentId?: InvoiceKind };
}

export interface CreateInvoiceResult {
  processorInvoiceId: string;
  /** Hosted payment page. Emailed to the customer by us, not the processor. */
  paymentUrl: string | null;
}

/**
 * Normalised payment notification.
 *
 * `cumulativePaidPence` is the processor's running total for the invoice rather
 * than the amount of this single payment. Stripe reports it that way, and it
 * makes replays trivially safe: we compare against what we have already
 * recorded and do nothing when the delta is zero or negative.
 */
export interface NormalisedPaymentEvent {
  kind: 'payment';
  eventId: string;
  processor: Processor;
  processorInvoiceId: string;
  processorPaymentId: string;
  /** Charge or payment-intent id, for refunding later. Null if unavailable. */
  processorChargeId: string | null;
  cumulativePaidPence: number;
  currency: string;
  method?: string;
  receivedAt: string;
}

/**
 * Money given back, in whole or in part.
 *
 * `cumulativeRefundedPence` is the processor's running total for the charge,
 * for the same reason payments carry a cumulative figure: it makes replays and
 * successive partial refunds safe to apply without tracking deltas ourselves.
 */
export interface NormalisedRefundEvent {
  kind: 'refund';
  eventId: string;
  processor: Processor;
  processorInvoiceId: string | null;
  /** Charge or payment-intent id — how the refund is matched to its payment. */
  processorChargeId: string;
  /** The charge itself, for the audit trail. */
  processorPaymentId: string;
  processorRefundId: string | null;
  cumulativeRefundedPence: number;
  currency: string;
  receivedAt: string;
}

/** A card was declined, or the charge otherwise failed to go through. */
export interface NormalisedPaymentFailedEvent {
  kind: 'payment_failed';
  eventId: string;
  processor: Processor;
  processorInvoiceId: string;
  amountPence: number;
  reason?: string;
  receivedAt: string;
}

/** The customer has gone to their bank. Time-critical: evidence is due in days. */
export interface NormalisedDisputeEvent {
  kind: 'dispute';
  eventId: string;
  processor: Processor;
  processorPaymentId: string;
  amountPence: number;
  reason?: string;
  dueBy?: string | null;
  receivedAt: string;
}

/** Voided at the processor's end rather than ours; keep our copy honest. */
export interface NormalisedVoidedEvent {
  kind: 'voided';
  eventId: string;
  processor: Processor;
  processorInvoiceId: string;
  receivedAt: string;
}

export type NormalisedEvent =
  | NormalisedPaymentEvent
  | NormalisedRefundEvent
  | NormalisedPaymentFailedEvent
  | NormalisedDisputeEvent
  | NormalisedVoidedEvent;

export interface WebhookVerification {
  /** null when the event is valid but not one we act on. */
  event: NormalisedEvent | null;
}

export interface RefundInput {
  processorPaymentId: string;
  amountPence: number;
  reason?: string;
}

export interface RefundResult {
  processorRefundId: string;
  /** Stripe settles asynchronously; `pending` is normal and not a failure. */
  status: 'succeeded' | 'pending' | 'failed';
}

export interface PaymentAdapter {
  readonly name: Processor;
  createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult>;
  voidInvoice(processorInvoiceId: string): Promise<void>;
  /** Gives money back. The webhook, not this return value, is the record of it. */
  refundPayment(input: RefundInput): Promise<RefundResult>;
  /** Throws if the signature is invalid — callers must return 400, not 500. */
  verifyAndParseWebhook(rawBody: string, headers: Record<string, string | undefined>, notificationUrl: string): Promise<WebhookVerification>;
}

/**
 * The request was verifiable and its signature did not match. The caller must
 * answer 400 — the payload is not ours and never will be, so a retry is wasted.
 */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * We could not verify at all because a signing secret is missing.
 *
 * Distinct from WebhookSignatureError on purpose: this is OUR fault, and the
 * caller must answer 500 so the processor keeps retrying. Answering 400 here
 * would make a misconfigured deploy silently discard real payments.
 */
export class WebhookConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookConfigError';
  }
}

/** Adds VAT as an explicit line so the customer sees the same breakdown we do. */
export function withVatLine(input: CreateInvoiceInput): LineItem[] {
  if (input.vatPence <= 0) return input.lineItems;
  return [
    ...input.lineItems,
    { description: `VAT @ ${input.vatRatePercent}%`, quantity: 1, unitPricePence: input.vatPence },
  ];
}
