import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '../lib/config';
import {
  WebhookConfigError,
  WebhookSignatureError,
  withVatLine,
  type CreateInvoiceInput,
  type CreateInvoiceResult,
  type PaymentAdapter,
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

    if (event.type !== 'invoice.paid' && event.type !== 'invoice.payment_succeeded') {
      return { event: null };
    }

    const invoice = event.data.object as Stripe.Invoice;
    if (!invoice.id) return { event: null };

    return {
      event: {
        eventId: event.id,
        processor: 'stripe',
        processorInvoiceId: invoice.id,
        processorPaymentId: event.id,
        // amount_paid is cumulative for the invoice, matching Square's shape.
        cumulativePaidPence: invoice.amount_paid ?? 0,
        currency: (invoice.currency ?? 'gbp').toUpperCase(),
        method: 'card',
        receivedAt: new Date(event.created * 1000).toISOString(),
      },
    };
  },
};
