import type { LineItem, Processor } from '../domain';

/**
 * One interface, two adapters. Chris picks Square or Stripe per invoice, so
 * neither is privileged: everything above this layer works in terms of
 * `PaymentAdapter` and never imports a vendor SDK directly.
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
  /** Our Firestore ids, echoed back on webhooks. */
  metadata: { invoiceId: string; jobId: string };
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
 * than the amount of this single payment. Both Square and Stripe report it that
 * way, and it makes replays trivially safe: we compare against what we have
 * already recorded and do nothing when the delta is zero or negative.
 */
export interface NormalisedPaymentEvent {
  eventId: string;
  processor: Processor;
  processorInvoiceId: string;
  processorPaymentId: string;
  cumulativePaidPence: number;
  currency: string;
  method?: string;
  receivedAt: string;
}

export interface WebhookVerification {
  /** null when the event is valid but not one we act on. */
  event: NormalisedPaymentEvent | null;
}

export interface PaymentAdapter {
  readonly name: Processor;
  createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult>;
  voidInvoice(processorInvoiceId: string): Promise<void>;
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
