import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '../lib/config';
import {
  WebhookConfigError,
  WebhookSignatureError,
  withVatLine,
  type CreateInvoiceInput,
  type CreateInvoiceResult,
  type PaymentAdapter,
  type RefundResult,
  type WebhookVerification,
} from './processor';

function client(): Stripe {
  return new Stripe(STRIPE_SECRET_KEY.value());
}

async function findOrCreateCustomer(
  stripe: Stripe,
  customer: { name: string; email: string; phone?: string },
): Promise<string> {
  const existing = await stripe.customers.list({ email: customer.email, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;

  const created = await stripe.customers.create({
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
  });
  return created.id;
}

export const stripeAdapter: PaymentAdapter = {
  name: 'stripe',

  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const stripe = client();
    const customerId = await findOrCreateCustomer(stripe, input.customer);

    const daysUntilDue = Math.max(
      0,
      Math.ceil((Date.parse(input.dueDate) - Date.now()) / 86_400_000),
    );

    // auto_advance stays off so the invoice cannot finalise or start chasing
    // before every line item is attached.
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: daysUntilDue,
      currency: 'gbp',
      auto_advance: false,
      description: input.memo,
      metadata: {
        invoiceId: input.metadata.invoiceId,
        jobId: input.metadata.jobId,
        invoiceNumber: input.invoiceNumber,
      },
    });

    if (!invoice.id) throw new Error('Stripe did not return an invoice id');

    for (const item of withVatLine(input)) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        currency: 'gbp',
        description: item.description,
        // Stripe's `quantity` needs a unit price, so send the computed line
        // total instead and keep the quantity in the description where it
        // is already spelled out.
        amount: Math.round(item.quantity * item.unitPricePence),
      });
    }

    // Finalising is what produces the hosted payment page.
    const finalised = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false });

    return {
      processorInvoiceId: finalised.id ?? invoice.id,
      paymentUrl: finalised.hosted_invoice_url ?? null,
    };
  },

  async refundPayment({ processorPaymentId, amountPence, reason }): Promise<RefundResult> {
    const stripe = client();
    // Stripe takes either a payment intent or a charge; ours are invoice-backed
    // so a payment intent is what we hold.
    const refund = await stripe.refunds.create({
      ...(processorPaymentId.startsWith('ch_')
        ? { charge: processorPaymentId }
        : { payment_intent: processorPaymentId }),
      amount: amountPence,
      ...(reason ? { metadata: { reason } } : {}),
    });

    return {
      processorRefundId: refund.id,
      status:
        refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' ? 'failed' : 'pending',
    };
  },

  async voidInvoice(processorInvoiceId: string): Promise<void> {
    const stripe = client();
    await stripe.invoices.voidInvoice(processorInvoiceId);
  },

  async verifyAndParseWebhook(rawBody, headers, _notificationUrl): Promise<WebhookVerification> {
    // Checked before constructing the client: the Stripe SDK throws on an empty
    // API key, and that throw would otherwise surface as a 500 and be
    // indistinguishable from a genuine processing failure.
    if (!STRIPE_SECRET_KEY.value() || !STRIPE_WEBHOOK_SECRET.value()) {
      throw new WebhookConfigError('Stripe keys are not set — cannot verify Stripe webhooks');
    }

    const signature = headers['stripe-signature'];
    if (!signature) throw new WebhookSignatureError('Missing Stripe signature header');

    const stripe = client();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
    } catch (error) {
      throw new WebhookSignatureError(
        error instanceof Error ? error.message : 'Stripe signature verification failed',
      );
    }

    const receivedAt = new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

    // Money given back, in whole or in part.
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const latest = charge.refunds?.data?.[0];
      return {
        event: {
          kind: 'refund',
          eventId: event.id,
          processor: 'stripe',
          // Charge carries no invoice link in this API version, so a refund is
          // matched to its payment by the charge/payment-intent id we stored
          // when the payment landed.
          processorInvoiceId: null,
          processorChargeId: charge.payment_intent ? String(charge.payment_intent) : charge.id,
          processorPaymentId: charge.id,
          processorRefundId: latest?.id ?? null,
          // Cumulative for the charge, so replays and successive partial
          // refunds land correctly without tracking deltas here.
          cumulativeRefundedPence: charge.amount_refunded ?? 0,
          currency: (charge.currency ?? 'gbp').toUpperCase(),
          receivedAt,
        },
      };
    }

    if (event.type === 'invoice.payment_failed') {
      const failed = event.data.object as Stripe.Invoice;
      if (!failed.id) return { event: null };
      return {
        event: {
          kind: 'payment_failed',
          eventId: event.id,
          processor: 'stripe',
          processorInvoiceId: failed.id,
          amountPence: failed.amount_due ?? 0,
          reason: failed.last_finalization_error?.message ?? undefined,
          receivedAt,
        },
      };
    }

    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as Stripe.Dispute;
      return {
        event: {
          kind: 'dispute',
          eventId: event.id,
          processor: 'stripe',
          processorPaymentId: typeof dispute.charge === 'string' ? dispute.charge : '',
          amountPence: dispute.amount ?? 0,
          reason: dispute.reason ?? undefined,
          dueBy: dispute.evidence_details?.due_by
            ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
            : null,
          receivedAt,
        },
      };
    }

    if (event.type === 'invoice.voided') {
      const voided = event.data.object as Stripe.Invoice;
      if (!voided.id) return { event: null };
      return {
        event: { kind: 'voided', eventId: event.id, processor: 'stripe', processorInvoiceId: voided.id, receivedAt },
      };
    }

    if (event.type !== 'invoice.paid' && event.type !== 'invoice.payment_succeeded') {
      return { event: null };
    }

    const invoice = event.data.object as Stripe.Invoice;
    if (!invoice.id) return { event: null };

    return {
      event: {
        kind: 'payment',
        eventId: event.id,
        processor: 'stripe',
        processorChargeId: await chargeIdForInvoice(stripe, invoice.id),
        processorInvoiceId: invoice.id,
        processorPaymentId: event.id,
        // amount_paid is cumulative for the invoice, not per-payment.
        cumulativePaidPence: invoice.amount_paid ?? 0,
        currency: (invoice.currency ?? 'gbp').toUpperCase(),
        method: 'card',
        receivedAt: new Date(event.created * 1000).toISOString(),
      },
    };
  },
};

/**
 * The charge or payment-intent behind a paid invoice.
 *
 * Needed because a refund is issued against the charge, not the invoice, and
 * the webhook's own event id joins to nothing on Stripe's side. One extra call
 * per payment — payments are rare, and without it no refund can be raised at
 * all. A failure here is not worth losing the payment over, so it degrades to
 * null and the refund path reports the id as missing.
 */
async function chargeIdForInvoice(stripe: Stripe, invoiceId: string): Promise<string | null> {
  try {
    const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 1 });
    const payment = payments.data[0]?.payment;
    if (!payment) return null;

    if (payment.payment_intent) {
      return typeof payment.payment_intent === 'string'
        ? payment.payment_intent
        : payment.payment_intent.id;
    }
    if (payment.charge) {
      return typeof payment.charge === 'string' ? payment.charge : payment.charge.id;
    }
    return null;
  } catch (error) {
    console.error(`Could not resolve the charge behind invoice ${invoiceId}`, error);
    return null;
  }
}
