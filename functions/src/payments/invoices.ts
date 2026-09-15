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
import { addDaysIso, nowIso, todayIso } from '../lib/dates';
import { calculateTotals, formatMoney } from '../lib/money';
import { getSettings } from '../lib/settings';
import { assertAdmin } from '../lib/auth';
import { lineItemSchema, parseOrThrow } from '../lib/validation';
import { nextInvoiceNumber } from '../lib/counters';
import { deriveInvoiceStatus, processorInvoiceIds, readInstalments } from './instalments';
import { adapterFor } from './adapters';
import { sendEmail } from '../messaging/email';
import { invoiceEmail } from '../messaging/templates';
import type { Customer, Instalment, Invoice, Job, LineItem, Quote } from '../domain';

const PAYMENT_SECRETS = [
  STRIPE_SECRET_KEY,
  RESEND_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
];

async function loadJobContext(jobId: string): Promise<{ job: Job; customer: Customer; quote: Quote | null }> {
  const jobSnap = await db.collection(COLLECTIONS.jobs).doc(jobId).get();
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
  const job = { id: jobSnap.id, ...jobSnap.data() } as Job;

  const customerSnap = await db.collection(COLLECTIONS.customers).doc(job.customerId).get();
  if (!customerSnap.exists) throw new HttpsError('not-found', 'Customer not found.');
  const customer = { id: customerSnap.id, ...customerSnap.data() } as Customer;

  const quoteSnap = await db
    .collection(COLLECTIONS.quotes)
    .where('jobId', '==', jobId)
    .where('status', '==', 'accepted')
    .limit(1)
    .get();

  const quote = quoteSnap.empty ? null : ({ id: quoteSnap.docs[0].id, ...quoteSnap.docs[0].data() } as Quote);

  return { job, customer, quote };
}

/**
 * Builds the invoice lines for each kind.
 *
 * Deposit and balance are derived from the accepted quote rather than retyped,
 * so the two invoices for a job always add up to exactly what the customer
 * agreed to — no drift, no rounding gap on the final payment.
 */
async function buildLineItems(
  kind: 'deposit' | 'balance' | 'full',
  job: Job,
  quote: Quote | null,
  provided: LineItem[] | undefined,
): Promise<{ lineItems: LineItem[]; overrideTotalPence?: number }> {
  if (kind === 'full') {
    if (!provided?.length) throw new HttpsError('invalid-argument', 'Add at least one line item.');
    return { lineItems: provided };
  }

  if (!quote) {
    throw new HttpsError(
      'failed-precondition',
      'This job has no accepted quote, so a deposit or balance invoice cannot be derived. Raise a full invoice instead.',
    );
  }

  if (kind === 'deposit') {
    return {
      lineItems: [
        {
          description: `Deposit to confirm booking — quote ${quote.reference}`,
          quantity: 1,
          unitPricePence: quote.depositPence,
        },
      ],
      // The deposit is a slice of an already-VAT-inclusive quote total, so VAT
      // is not applied again here; the balance invoice carries the breakdown.
      overrideTotalPence: quote.depositPence,
    };
  }

  // Balance = quote total minus everything actually collected for this job.
  const paidSnap = await db.collection(COLLECTIONS.payments).where('jobId', '==', job.id).get();
  const collected = paidSnap.docs.reduce((sum, doc) => sum + ((doc.data().amountPence as number) ?? 0), 0);
  const balance = quote.totalPence - collected;

  if (balance <= 0) {
    throw new HttpsError('failed-precondition', 'This job is already paid in full.');
  }

  return {
    lineItems: [
      {
        description: `Balance on completion — quote ${quote.reference}`,
        quantity: 1,
        unitPricePence: balance,
      },
    ],
    overrideTotalPence: balance,
  };
}

/** Admin: raise an invoice against a job. */
export const createInvoice = onCall({ region: REGION, secrets: PAYMENT_SECRETS }, async (request) => {
  assertAdmin(request);

  const input = parseOrThrow(
    z.object({
      jobId: z.string().min(1),
      kind: z.enum(['deposit', 'balance', 'full']),
      lineItems: z.array(lineItemSchema).max(50).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      memo: z.string().trim().max(500).optional(),
    }),
    request.data,
  );

  const settings = await getSettings();
  const { job, customer, quote } = await loadJobContext(input.jobId);
  const { lineItems, overrideTotalPence } = await buildLineItems(input.kind, job, quote, input.lineItems);

  const totals =
    overrideTotalPence !== undefined
      ? { subtotalPence: overrideTotalPence, vatPence: 0, totalPence: overrideTotalPence }
      : calculateTotals(lineItems, settings);

  const number = await nextInvoiceNumber();
  const dueDate = input.dueDate ?? addDaysIso(todayIso(), settings.invoiceTermsDays);
  const timestamp = nowIso();
  const invoiceRef = db.collection(COLLECTIONS.invoices).doc();

  // One instalment: this call raises a single collection. The two-instalment
  // shape (deposit then balance) is built once, on acceptance — see acceptQuote.
  const instalments: Instalment[] = [
    {
      id: input.kind,
      kind: input.kind,
      amountPence: totals.totalPence,
      amountPaidPence: 0,
      status: 'pending',
      processorInvoiceId: null,
      paymentUrl: null,
      dueDate,
      sentAt: null,
      paidAt: null,
    },
  ];

  const invoice: Omit<Invoice, 'id'> = {
    jobId: job.id,
    customerId: customer.id,
    quoteId: quote?.id ?? null,
    quoteReference: quote?.reference ?? null,
    number,
    instalments,
    processorInvoiceIds: [],
    lineItems,
    ...totals,
    amountPaidPence: 0,
    status: 'draft',
    processor: 'stripe',
    dueDate,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // Written before calling out so a processor timeout leaves a visible draft
  // in the CRM rather than a silently lost invoice number.
  await invoiceRef.set(invoice);

  try {
    const result = await adapterFor('stripe').createInvoice({
      invoiceNumber: number,
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      lineItems,
      vatPence: totals.vatPence,
      vatRatePercent: settings.vatRatePercent,
      totalPence: totals.totalPence,
      dueDate,
      memo: input.memo,
      metadata: { invoiceId: invoiceRef.id, jobId: job.id },
    });

    const billed: Instalment[] = instalments.map((instalment) => ({
      ...instalment,
      status: 'sent' as const,
      processorInvoiceId: result.processorInvoiceId,
      paymentUrl: result.paymentUrl,
      sentAt: nowIso(),
    }));

    await invoiceRef.set(
      {
        instalments: billed,
        processorInvoiceIds: processorInvoiceIds(billed),
        status: 'sent',
        updatedAt: nowIso(),
      },
      { merge: true },
    );

    return { invoiceId: invoiceRef.id, number, paymentUrl: result.paymentUrl, totalPence: totals.totalPence };
  } catch (error) {
    console.error('Processor invoice creation failed', error);
    throw new HttpsError(
      'internal',
      `Could not create the invoice with Stripe. The draft has been saved as ${number}.`,
    );
  }
});

/** Admin: email the invoice with its hosted payment link. */
export const sendInvoice = onCall({ region: REGION, secrets: PAYMENT_SECRETS }, async (request) => {
  assertAdmin(request);
  const { invoiceId } = parseOrThrow(z.object({ invoiceId: z.string().min(1) }), request.data);

  const snap = await db.collection(COLLECTIONS.invoices).doc(invoiceId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Invoice not found.');
  const invoice = { id: snap.id, ...snap.data() } as Invoice;

  // Whatever is currently billed and not yet settled is what gets emailed.
  const due = readInstalments(invoice).find(
    (instalment) => instalment.status === 'sent' && instalment.paymentUrl,
  );

  if (!due?.paymentUrl) {
    throw new HttpsError('failed-precondition', 'This invoice has no payment link yet.');
  }

  const customerSnap = await db.collection(COLLECTIONS.customers).doc(invoice.customerId).get();
  if (!customerSnap.exists) throw new HttpsError('not-found', 'Customer not found.');
  const customer = { id: customerSnap.id, ...customerSnap.data() } as Customer;

  const settings = await getSettings();
  const email = invoiceEmail({
    customerName: customer.name,
    invoice,
    instalment: due,
    vatRatePercent: settings.vatRatePercent,
    showVat: settings.vatRegistered && invoice.vatPence > 0,
  });

  const sent = await sendEmail({
    to: customer.email,
    subject: email.subject,
    html: email.html,
    template: 'invoice',
    relatedTo: { invoiceId: invoice.id, jobId: invoice.jobId, customerId: customer.id },
  });

  if (!sent) throw new HttpsError('internal', 'The invoice could not be emailed. Check the Resend configuration.');

  await snap.ref.set({ status: 'sent', sentAt: nowIso(), updatedAt: nowIso() }, { merge: true });

  return {
    invoiceId,
    sentTo: customer.email,
    totalPence: due.amountPence,
    summary: formatMoney(due.amountPence),
  };
});

/** Admin: void an invoice at the processor and in our own records. */
export const voidInvoice = onCall({ region: REGION, secrets: PAYMENT_SECRETS }, async (request) => {
  assertAdmin(request);
  const { invoiceId } = parseOrThrow(z.object({ invoiceId: z.string().min(1) }), request.data);

  const snap = await db.collection(COLLECTIONS.invoices).doc(invoiceId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Invoice not found.');
  const invoice = { id: snap.id, ...snap.data() } as Invoice;

  if (invoice.amountPaidPence > 0) {
    throw new HttpsError(
      'failed-precondition',
      'This invoice has payments against it and cannot be voided. Refund it at the processor instead.',
    );
  }

  // An invoice can have raised a payable object per instalment; all of them go.
  const instalments = readInstalments(invoice);
  const raised = instalments
    .map((instalment) => instalment.processorInvoiceId)
    .filter((id): id is string => Boolean(id));

  for (const processorInvoiceId of raised) {
    await adapterFor(invoice.processor).voidInvoice(processorInvoiceId);
  }

  await snap.ref.set(
    {
      ...(invoice.instalments?.length
        ? { instalments: instalments.map((instalment) => ({ ...instalment, status: 'void' as const })) }
        : {}),
      status: 'void',
      updatedAt: nowIso(),
    },
    { merge: true },
  );
  return { invoiceId, status: 'void' };
});

/**
 * Admin: collect the balance once the work is done.
 *
 * Handles both shapes so the CRM never has to know which it is looking at. A
 * job invoiced under the instalment model already has a `balance` instalment
 * sitting pending on its one invoice — that gets its payment page raised here.
 * A job invoiced before instalments existed has only a deposit invoice, so a
 * separate balance invoice is raised for it exactly as it always was.
 */
export const billBalance = onCall({ region: REGION, secrets: PAYMENT_SECRETS }, async (request) => {
  assertAdmin(request);
  const { jobId } = parseOrThrow(z.object({ jobId: z.string().min(1) }), request.data);

  const { job, customer, quote } = await loadJobContext(jobId);
  const settings = await getSettings();

  const invoiceSnap = await db
    .collection(COLLECTIONS.invoices)
    .where('jobId', '==', jobId)
    .get();

  const withBalance = invoiceSnap.docs
    .map((doc) => ({ ref: doc.ref, invoice: { id: doc.id, ...doc.data() } as Invoice }))
    .find(({ invoice }) =>
      invoice.instalments?.some(
        (instalment) => instalment.kind === 'balance' && instalment.status === 'pending',
      ),
    );

  // Legacy job: no pending instalment to bill, so raise the separate invoice.
  if (!withBalance) {
    throw new HttpsError(
      'failed-precondition',
      'This job has no balance waiting to be billed. Raise a separate invoice instead.',
    );
  }

  const { ref, invoice } = withBalance;
  const instalments = readInstalments(invoice);
  const balance = instalments.find((instalment) => instalment.kind === 'balance');
  if (!balance) throw new HttpsError('failed-precondition', 'No balance instalment on this invoice.');

  const dueDate = balance.dueDate ?? addDaysIso(todayIso(), settings.invoiceTermsDays);
  const description = `Balance for ${job.description || 'plastering work'} — invoice ${invoice.number}${
    quote ? ` (quote ${quote.reference})` : ''
  }`;

  const result = await adapterFor('stripe').createInvoice({
    invoiceNumber: `${invoice.number}-BALANCE`,
    customer: { name: customer.name, email: customer.email, phone: customer.phone },
    lineItems: [{ description, quantity: 1, unitPricePence: balance.amountPence }],
    // The balance is the remainder of an already-VAT-inclusive quote total, so
    // VAT is not applied again — the invoice itself carries the breakdown.
    vatPence: 0,
    vatRatePercent: settings.vatRatePercent,
    totalPence: balance.amountPence,
    dueDate,
    memo: description,
    metadata: { invoiceId: invoice.id, jobId: job.id, instalmentId: 'balance' },
  });

  const billed: Instalment[] = instalments.map((instalment) =>
    instalment.kind === 'balance'
      ? {
          ...instalment,
          status: 'sent' as const,
          processorInvoiceId: result.processorInvoiceId,
          paymentUrl: result.paymentUrl,
          dueDate,
          sentAt: nowIso(),
        }
      : instalment,
  );

  await ref.set(
    {
      instalments: billed,
      processorInvoiceIds: processorInvoiceIds(billed),
      status: deriveInvoiceStatus(invoice, billed),
      updatedAt: nowIso(),
    },
    { merge: true },
  );

  return {
    invoiceId: invoice.id,
    number: invoice.number,
    paymentUrl: result.paymentUrl,
    totalPence: balance.amountPence,
  };
});
