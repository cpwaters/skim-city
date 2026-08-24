import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  REGION,
  RESEND_API_KEY,
  SITE_URL,
  SQUARE_ACCESS_TOKEN,
  SQUARE_LOCATION_ID,
  STRIPE_SECRET_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { addDaysIso, formatLongDate, nowIso, todayIso } from '../lib/dates';
import { calculateDeposit, calculateTotals, formatMoney } from '../lib/money';
import { getSettings } from '../lib/settings';
import { assertAdmin } from '../lib/auth';
import { assertAppCheck } from '../lib/appCheck';
import { lineItemSchema, parseOrThrow } from '../lib/validation';
import { generateReference, generateToken } from '../lib/tokens';
import { adapterFor } from '../payments/adapters';
import { nextInvoiceNumber } from '../lib/counters';
import { sendEmail } from '../messaging/email';
import { notifyTelegram } from '../messaging/telegram';
import { escapeHtml, quoteEmail, slotLabel } from '../messaging/templates';
import type { Customer, Invoice, Job, Quote } from '../domain';

const QUOTE_SECRETS = [
  RESEND_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  SQUARE_ACCESS_TOKEN,
  SQUARE_LOCATION_ID,
  STRIPE_SECRET_KEY,
];

/** Admin: price up an enquiry. */
export const createQuote = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const input = parseOrThrow(
    z.object({
      jobId: z.string().min(1),
      lineItems: z.array(lineItemSchema).min(1, 'Add at least one line item').max(50),
      notes: z.string().trim().max(1000).optional(),
      /** Overrides the settings percentage when a job needs a specific figure. */
      depositPence: z.number().int().min(0).optional(),
      validDays: z.number().int().min(1).max(180).optional(),
    }),
    request.data,
  );

  const settings = await getSettings();
  const jobSnap = await db.collection(COLLECTIONS.jobs).doc(input.jobId).get();
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
  const job = { id: jobSnap.id, ...jobSnap.data() } as Job;

  const totals = calculateTotals(input.lineItems, settings);
  const depositPence = input.depositPence ?? calculateDeposit(totals.totalPence, settings);

  if (depositPence > totals.totalPence) {
    throw new HttpsError('invalid-argument', 'The deposit cannot exceed the quote total.');
  }

  const timestamp = nowIso();
  const quoteRef = db.collection(COLLECTIONS.quotes).doc();

  const quote: Omit<Quote, 'id'> = {
    jobId: job.id,
    customerId: job.customerId,
    reference: generateReference('Q'),
    lineItems: input.lineItems,
    ...totals,
    depositPence,
    ...(input.notes ? { notes: input.notes } : {}),
    status: 'draft',
    publicToken: generateToken(),
    expiresAt: addDaysIso(todayIso(), input.validDays ?? settings.quoteValidDays),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await quoteRef.set(quote);

  return { quoteId: quoteRef.id, reference: quote.reference, totalPence: totals.totalPence, depositPence };
});

/** Admin: email the quote and move the job to `quoted`. */
export const sendQuote = onCall({ region: REGION, secrets: QUOTE_SECRETS }, async (request) => {
  assertAdmin(request);
  const { quoteId } = parseOrThrow(z.object({ quoteId: z.string().min(1) }), request.data);

  const quoteSnap = await db.collection(COLLECTIONS.quotes).doc(quoteId).get();
  if (!quoteSnap.exists) throw new HttpsError('not-found', 'Quote not found.');
  const quote = { id: quoteSnap.id, ...quoteSnap.data() } as Quote;

  if (quote.status === 'accepted') {
    throw new HttpsError('failed-precondition', 'This quote has already been accepted.');
  }

  const [jobSnap, customerSnap, settings] = await Promise.all([
    db.collection(COLLECTIONS.jobs).doc(quote.jobId).get(),
    db.collection(COLLECTIONS.customers).doc(quote.customerId).get(),
    getSettings(),
  ]);

  if (!jobSnap.exists || !customerSnap.exists) throw new HttpsError('not-found', 'Job or customer missing.');
  const job = jobSnap.data() as Job;
  const customer = customerSnap.data() as Customer;

  const email = quoteEmail({
    customerName: customer.name,
    quote,
    quoteUrl: `${SITE_URL.value()}/quote/${quote.publicToken}`,
    jobDate: job.date,
    slot: job.slot,
    vatRatePercent: settings.vatRatePercent,
    showVat: settings.vatRegistered && quote.vatPence > 0,
  });

  const sent = await sendEmail({
    to: customer.email,
    subject: email.subject,
    html: email.html,
    template: 'quote',
    relatedTo: { quoteId: quote.id, jobId: quote.jobId, customerId: quote.customerId },
  });

  if (!sent) throw new HttpsError('internal', 'The quote could not be emailed. Check the Resend configuration.');

  const timestamp = nowIso();
  await Promise.all([
    quoteSnap.ref.set({ status: 'sent', sentAt: timestamp, updatedAt: timestamp }, { merge: true }),
    jobSnap.ref.set({ status: 'quoted', updatedAt: timestamp }, { merge: true }),
  ]);

  return { quoteId, sentTo: customer.email };
});

/**
 * Public: read a quote by its token.
 *
 * Returns only what the quote page renders. The customer's own record, the job
 * notes and every internal id stay server-side — the token proves you were sent
 * this quote, not that you may read the CRM.
 */
export const getQuote = onCall({ region: REGION, cors: true }, async (request) => {
  assertAppCheck(request);
  const { token } = parseOrThrow(z.object({ token: z.string().min(10).max(200) }), request.data);

  const snap = await db
    .collection(COLLECTIONS.quotes)
    .where('publicToken', '==', token)
    .limit(1)
    .get();

  if (snap.empty) throw new HttpsError('not-found', 'This quote link is not valid.');

  const quote = { id: snap.docs[0].id, ...snap.docs[0].data() } as Quote;
  const [jobSnap, customerSnap, settings] = await Promise.all([
    db.collection(COLLECTIONS.jobs).doc(quote.jobId).get(),
    db.collection(COLLECTIONS.customers).doc(quote.customerId).get(),
    getSettings(),
  ]);

  const job = jobSnap.data() as Job | undefined;
  const customer = customerSnap.data() as Customer | undefined;
  const expired = quote.expiresAt < todayIso();

  return {
    reference: quote.reference,
    status: expired && quote.status === 'sent' ? 'expired' : quote.status,
    lineItems: quote.lineItems,
    subtotalPence: quote.subtotalPence,
    vatPence: quote.vatPence,
    totalPence: quote.totalPence,
    depositPence: quote.depositPence,
    notes: quote.notes ?? null,
    expiresAt: quote.expiresAt,
    showVat: settings.vatRegistered && quote.vatPence > 0,
    vatRatePercent: settings.vatRatePercent,
    customerName: customer?.name ?? '',
    jobDate: job?.date ?? null,
    jobSlot: job?.slot ?? null,
    jobDescription: job?.description ?? '',
  };
});

/**
 * Public: the customer accepts, and we raise the deposit invoice.
 *
 * Accepting and raising the invoice are separated from taking the money: the
 * customer is handed the processor's hosted payment page, so no card data ever
 * touches this system. The slot is only truly confirmed when the deposit
 * payment webhook lands — see payments/apply.ts.
 */
export const acceptQuote = onCall({ region: REGION, cors: true, secrets: QUOTE_SECRETS }, async (request) => {
  assertAppCheck(request);

  const { token, processor } = parseOrThrow(
    z.object({
      token: z.string().min(10).max(200),
      processor: z.enum(['square', 'stripe']).default('square'),
    }),
    request.data,
  );

  const snap = await db.collection(COLLECTIONS.quotes).where('publicToken', '==', token).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'This quote link is not valid.');

  const quoteRef = snap.docs[0].ref;
  const quote = { id: snap.docs[0].id, ...snap.docs[0].data() } as Quote;

  if (quote.status === 'declined') throw new HttpsError('failed-precondition', 'This quote was declined.');
  if (quote.expiresAt < todayIso()) {
    throw new HttpsError('failed-precondition', 'This quote has expired. Please get in touch for a fresh price.');
  }

  const [jobSnap, customerSnap, settings] = await Promise.all([
    db.collection(COLLECTIONS.jobs).doc(quote.jobId).get(),
    db.collection(COLLECTIONS.customers).doc(quote.customerId).get(),
    getSettings(),
  ]);
  if (!jobSnap.exists || !customerSnap.exists) throw new HttpsError('not-found', 'Job or customer missing.');

  const job = { id: jobSnap.id, ...jobSnap.data() } as Job;
  const customer = { id: customerSnap.id, ...customerSnap.data() } as Customer;

  // Accepting twice must not raise a second deposit invoice.
  const existingDeposit = await db
    .collection(COLLECTIONS.invoices)
    .where('jobId', '==', job.id)
    .where('kind', '==', 'deposit')
    .limit(1)
    .get();

  if (!existingDeposit.empty) {
    const existing = existingDeposit.docs[0].data() as Invoice;
    return { alreadyAccepted: true, paymentUrl: existing.paymentUrl, depositPence: existing.totalPence };
  }

  const timestamp = nowIso();
  await Promise.all([
    quoteRef.set({ status: 'accepted', acceptedAt: timestamp, updatedAt: timestamp }, { merge: true }),
    jobSnap.ref.set({ valuePence: quote.totalPence, updatedAt: timestamp }, { merge: true }),
  ]);

  const number = await nextInvoiceNumber();
  const dueDate = addDaysIso(todayIso(), 7);
  const invoiceRef = db.collection(COLLECTIONS.invoices).doc();
  const lineItems = [
    {
      description: `Deposit to confirm booking — quote ${quote.reference}`,
      quantity: 1,
      unitPricePence: quote.depositPence,
    },
  ];

  const invoice: Omit<Invoice, 'id'> = {
    jobId: job.id,
    customerId: customer.id,
    quoteId: quote.id,
    number,
    kind: 'deposit',
    lineItems,
    subtotalPence: quote.depositPence,
    vatPence: 0,
    totalPence: quote.depositPence,
    amountPaidPence: 0,
    status: 'sent',
    processor,
    processorInvoiceId: null,
    paymentUrl: null,
    dueDate,
    sentAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await invoiceRef.set(invoice);

  let paymentUrl: string | null = null;
  try {
    const result = await adapterFor(processor).createInvoice({
      invoiceNumber: number,
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      lineItems,
      vatPence: 0,
      vatRatePercent: settings.vatRatePercent,
      totalPence: quote.depositPence,
      dueDate,
      memo: `Deposit for ${formatLongDate(job.date)} — ${slotLabel(job.slot)}`,
      metadata: { invoiceId: invoiceRef.id, jobId: job.id },
    });
    paymentUrl = result.paymentUrl;
    await invoiceRef.set(
      { processorInvoiceId: result.processorInvoiceId, paymentUrl, updatedAt: nowIso() },
      { merge: true },
    );
  } catch (error) {
    console.error('Deposit invoice creation failed', error);
    // The acceptance itself still stands — Chris can raise the deposit
    // manually rather than the customer losing their acceptance.
    await notifyTelegram(
      `<b>⚠️ Deposit invoice failed</b>\n\n${escapeHtml(customer.name)} accepted quote ${escapeHtml(quote.reference)} but the ${processor} invoice could not be created. Raise it by hand.`,
      { template: 'deposit-failed', relatedTo: { quoteId: quote.id, jobId: job.id } },
    );
    throw new HttpsError('internal', 'We could not set up the payment. Chris has been alerted and will be in touch.');
  }

  await notifyTelegram(
    [
      `<b>✅ Quote accepted</b>`,
      ``,
      `${escapeHtml(customer.name)} accepted ${escapeHtml(quote.reference)} — ${formatMoney(quote.totalPence)}`,
      `${formatLongDate(job.date)} — ${slotLabel(job.slot)}`,
      `Deposit of ${formatMoney(quote.depositPence)} invoiced (${number}).`,
    ].join('\n'),
    { template: 'quote-accepted', relatedTo: { quoteId: quote.id, jobId: job.id, invoiceId: invoiceRef.id } },
  );

  return { alreadyAccepted: false, paymentUrl, depositPence: quote.depositPence, invoiceNumber: number };
});

/** Public: the customer turns the quote down. */
export const declineQuote = onCall({ region: REGION, cors: true, secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] }, async (request) => {
  assertAppCheck(request);
  const { token, reason } = parseOrThrow(
    z.object({ token: z.string().min(10).max(200), reason: z.string().trim().max(500).optional() }),
    request.data,
  );

  const snap = await db.collection(COLLECTIONS.quotes).where('publicToken', '==', token).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'This quote link is not valid.');

  const quote = { id: snap.docs[0].id, ...snap.docs[0].data() } as Quote;
  if (quote.status === 'accepted') {
    throw new HttpsError('failed-precondition', 'This quote has already been accepted.');
  }

  const timestamp = nowIso();
  await Promise.all([
    snap.docs[0].ref.set({ status: 'declined', declinedAt: timestamp, updatedAt: timestamp }, { merge: true }),
    // Declining frees the slot: the job leaves the active statuses and the
    // onJobWrite trigger puts the day back on the public calendar.
    db.collection(COLLECTIONS.jobs).doc(quote.jobId).set({ status: 'cancelled', updatedAt: timestamp }, { merge: true }),
  ]);

  await notifyTelegram(
    `<b>Quote declined</b>\n\n${escapeHtml(quote.reference)}${reason ? `\n\nReason: ${escapeHtml(reason)}` : ''}\n\nThe slot is back on the calendar.`,
    { template: 'quote-declined', relatedTo: { quoteId: quote.id, jobId: quote.jobId } },
  );

  return { declined: true };
});
