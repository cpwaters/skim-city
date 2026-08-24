import { SquareClient, SquareEnvironment, WebhooksHelper } from 'square';
import { randomUUID } from 'node:crypto';
import {
  SQUARE_ACCESS_TOKEN,
  SQUARE_ENVIRONMENT,
  SQUARE_LOCATION_ID,
  SQUARE_WEBHOOK_SIGNATURE_KEY,
  CURRENCY,
} from '../lib/config';
import {
  WebhookConfigError,
  WebhookSignatureError,
  withVatLine,
  type CreateInvoiceInput,
  type CreateInvoiceResult,
  type PaymentAdapter,
  type WebhookVerification,
} from './processor';

function client(): SquareClient {
  return new SquareClient({
    token: SQUARE_ACCESS_TOKEN.value(),
    environment:
      SQUARE_ENVIRONMENT.value() === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  });
}

/** Square holds money as bigint minor units — our pence map across directly. */
function money(pence: number) {
  return { amount: BigInt(pence), currency: CURRENCY as 'GBP' };
}

async function findOrCreateCustomer(
  square: SquareClient,
  customer: { name: string; email: string; phone?: string },
): Promise<string> {
  const search = await square.customers.search({
    query: { filter: { emailAddress: { exact: customer.email } } },
    limit: BigInt(1),
  });

  const existing = search.customers?.[0]?.id;
  if (existing) return existing;

  const [givenName, ...rest] = customer.name.trim().split(/\s+/);
  const created = await square.customers.create({
    idempotencyKey: randomUUID(),
    givenName,
    familyName: rest.join(' ') || undefined,
    emailAddress: customer.email,
    phoneNumber: customer.phone,
  });

  const id = created.customer?.id;
  if (!id) throw new Error('Square did not return a customer id');
  return id;
}

export const squareAdapter: PaymentAdapter = {
  name: 'square',

  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const square = client();
    const locationId = SQUARE_LOCATION_ID.value();
    const customerId = await findOrCreateCustomer(square, input.customer);

    // Square invoices are backed by an order, so the order comes first.
    const orderResponse = await square.orders.create({
      idempotencyKey: `order-${input.metadata.invoiceId}`,
      order: {
        locationId,
        referenceId: input.metadata.invoiceId,
        customerId,
        lineItems: withVatLine(input).map((item) => ({
          name: item.description,
          quantity: String(item.quantity),
          basePriceMoney: money(item.unitPricePence),
        })),
      },
    });

    const orderId = orderResponse.order?.id;
    if (!orderId) throw new Error('Square did not return an order id');

    const invoiceResponse = await square.invoices.create({
      idempotencyKey: `invoice-${input.metadata.invoiceId}`,
      invoice: {
        locationId,
        orderId,
        primaryRecipient: { customerId },
        invoiceNumber: input.invoiceNumber,
        title: `Skim City — ${input.invoiceNumber}`,
        description: input.memo,
        // SHARE_MANUALLY, not EMAIL: we send our own branded email so the
        // customer gets one message from Skim City rather than two, one of
        // which is Square-branded.
        deliveryMethod: 'SHARE_MANUALLY',
        acceptedPaymentMethods: { card: true, bankAccount: false, squareGiftCard: false, buyNowPayLater: false },
        paymentRequests: [{ requestType: 'BALANCE', dueDate: input.dueDate }],
        customFields: [{ label: 'Job reference', value: input.metadata.jobId, placement: 'ABOVE_LINE_ITEMS' }],
      },
    });

    const invoice = invoiceResponse.invoice;
    if (!invoice?.id || invoice.version === undefined) {
      throw new Error('Square did not return a usable invoice');
    }

    // A draft invoice has no public URL — publishing is what makes it payable.
    const published = await square.invoices.publish({
      invoiceId: invoice.id,
      version: invoice.version,
      idempotencyKey: `publish-${input.metadata.invoiceId}`,
    });

    return {
      processorInvoiceId: invoice.id,
      paymentUrl: published.invoice?.publicUrl ?? null,
    };
  },

  async voidInvoice(processorInvoiceId: string): Promise<void> {
    const square = client();
    const current = await square.invoices.get({ invoiceId: processorInvoiceId });
    const version = current.invoice?.version;
    if (version === undefined) throw new Error('Square invoice not found');
    await square.invoices.cancel({ invoiceId: processorInvoiceId, version });
  },

  async verifyAndParseWebhook(rawBody, headers, notificationUrl): Promise<WebhookVerification> {
    const signatureKey = SQUARE_WEBHOOK_SIGNATURE_KEY.value();
    if (!signatureKey) {
      throw new WebhookConfigError('SQUARE_WEBHOOK_SIGNATURE_KEY is not set — cannot verify Square webhooks');
    }

    const signature = headers['x-square-hmacsha256-signature'];
    if (!signature) throw new WebhookSignatureError('Missing Square signature header');

    // Any throw from the verifier means the payload could not be validated, so
    // it is treated the same as an explicit mismatch rather than escaping as a
    // server error.
    let valid = false;
    try {
      valid = await WebhooksHelper.verifySignature({
        requestBody: rawBody,
        signatureHeader: signature,
        signatureKey,
        notificationUrl,
      });
    } catch (error) {
      throw new WebhookSignatureError(
        error instanceof Error ? error.message : 'Square signature verification failed',
      );
    }

    if (!valid) throw new WebhookSignatureError('Square signature verification failed');

    const payload = JSON.parse(rawBody) as SquareWebhookPayload;

    // Only invoice payments move money in our model. Everything else is noise.
    if (payload.type !== 'invoice.payment_made') return { event: null };

    const invoice = payload.data?.object?.invoice;
    if (!invoice?.id) return { event: null };

    // Square reports a running total per payment request; summing them gives
    // the cumulative amount collected against the invoice.
    const cumulative = (invoice.payment_requests ?? []).reduce(
      (sum, request) => sum + (request.total_completed_amount_money?.amount ?? 0),
      0,
    );

    return {
      event: {
        eventId: payload.event_id,
        processor: 'square',
        processorInvoiceId: invoice.id,
        processorPaymentId: payload.event_id,
        cumulativePaidPence: cumulative,
        currency: invoice.payment_requests?.[0]?.total_completed_amount_money?.currency ?? CURRENCY,
        method: 'card',
        receivedAt: payload.created_at ?? new Date().toISOString(),
      },
    };
  },
};

interface SquareWebhookPayload {
  event_id: string;
  type: string;
  created_at?: string;
  data?: {
    object?: {
      invoice?: {
        id?: string;
        payment_requests?: Array<{
          total_completed_amount_money?: { amount?: number; currency?: string };
        }>;
      };
    };
  };
}
