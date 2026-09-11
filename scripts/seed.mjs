#!/usr/bin/env node
/**
 * Seeds realistic demo data for local development.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed
 *
 * Refuses to run without an emulator host unless --force is passed. Seeding a
 * live Firestore would drop fabricated customers and invoices into the real
 * books, so the guard is deliberate.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'skimcity-bac3b';
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const force = process.argv.includes('--force');

if (!usingEmulator && !force) {
  console.error(
    'Refusing to seed a live database.\n\n' +
      'Start the emulators and run:\n' +
      '  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed\n\n' +
      'Pass --force only if you really mean to write this into production.',
  );
  process.exit(1);
}

initializeApp({
  projectId: PROJECT_ID,
  ...(usingEmulator ? {} : { credential: applicationDefault() }),
});

const db = getFirestore();
const now = new Date().toISOString();

function isoDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const settings = {
  tradingName: 'Skim City',
  email: 'chris@skimcity.co.uk',
  phone: '07464848570',
  addressLines: ['Manchester', 'United Kingdom'],
  dayRatePence: 25000,
  repairRatePence: 12000,
  depositPercent: 20,
  vatRegistered: false,
  vatRatePercent: 20,
  workingDays: [1, 2, 3, 4, 5, 6],
  leadTimeDays: 2,
  bookingHorizonDays: 120,
  quoteValidDays: 30,
  invoiceTermsDays: 14,
  coverageAreas: ['Manchester', 'Salford', 'Stockport', 'Oldham', 'Rochdale', 'Bury', 'Bolton', 'Trafford', 'Tameside', 'Wigan'],
};

const customers = [
  {
    id: 'cust-hartley',
    name: 'Danielle Hartley',
    phone: '07700900123',
    email: 'd.hartley@example.com',
    address: { line1: '14 Beech Road', city: 'Chorlton, Manchester', postcode: 'M21 9EG' },
    source: 'website',
  },
  {
    id: 'cust-okafor',
    name: 'Marcus Okafor',
    phone: '07700900456',
    email: 'marcus.okafor@example.com',
    address: { line1: '8 Langworthy Road', city: 'Salford', postcode: 'M6 5PW' },
    source: 'referral',
  },
  {
    id: 'cust-whitfield',
    name: 'Susan Whitfield',
    phone: '07700900789',
    email: 's.whitfield@example.com',
    address: { line1: '32 Bramhall Lane', city: 'Stockport', postcode: 'SK2 6HX' },
    source: 'website',
  },
];

const jobs = [
  {
    id: 'job-hartley-ceiling',
    customerId: 'cust-hartley',
    type: 'full_day',
    status: 'confirmed',
    date: isoDate(1),
    days: 1,
    dates: [isoDate(1)],
    slot: 'full',
    address: customers[0].address,
    description: 'Front room ceiling and two walls re-skimmed. Artex coming off the ceiling first.',
    photos: [],
    valuePence: 42000,
  },
  {
    id: 'job-okafor-crack',
    customerId: 'cust-okafor',
    type: 'repair',
    status: 'enquiry',
    date: isoDate(5),
    days: 1,
    dates: [isoDate(5)],
    slot: 'am',
    address: customers[1].address,
    description: 'Settlement crack above the front door, about a metre long. Plus a patch where the old radiator was.',
    photos: [],
  },
  {
    id: 'job-whitfield-replaster',
    customerId: 'cust-whitfield',
    type: 'full_day',
    status: 'completed',
    date: isoDate(-6),
    days: 1,
    dates: [isoDate(-6)],
    slot: 'full',
    address: customers[2].address,
    description: 'Back bedroom stripped and replastered after damp work.',
    photos: [],
    valuePence: 58000,
    completedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
];

/** Mirrors the projection in functions/src/booking/availability.ts. */
function availabilityFor(day) {
  const anythingBooked = Boolean(day.fullDayJobId || day.amJobId || day.pmJobId);
  return {
    date: day.date,
    fullDayTaken: anythingBooked,
    amTaken: Boolean(day.fullDayJobId || day.amJobId),
    pmTaken: Boolean(day.fullDayJobId || day.pmJobId),
    blocked: day.blocked,
  };
}

const dayBookings = [
  { date: isoDate(1), fullDayJobId: 'job-hartley-ceiling', amJobId: null, pmJobId: null, blocked: false, updatedAt: now },
  { date: isoDate(5), fullDayJobId: null, amJobId: 'job-okafor-crack', pmJobId: null, blocked: false, updatedAt: now },
  { date: isoDate(-6), fullDayJobId: 'job-whitfield-replaster', amJobId: null, pmJobId: null, blocked: false, updatedAt: now },
  { date: isoDate(9), fullDayJobId: null, amJobId: null, pmJobId: null, blocked: true, note: 'Away', updatedAt: now },
];

const quotes = [
  {
    id: 'quote-hartley',
    jobId: 'job-hartley-ceiling',
    customerId: 'cust-hartley',
    reference: 'Q-4KD2M9',
    lineItems: [
      { description: 'Remove artex and re-skim ceiling', quantity: 1, unitPricePence: 24000 },
      { description: 'Re-skim two walls', quantity: 1, unitPricePence: 18000 },
    ],
    subtotalPence: 42000,
    vatPence: 0,
    totalPence: 42000,
    depositPence: 8400,
    status: 'accepted',
    publicToken: 'seed-token-hartley-do-not-use-in-production',
    expiresAt: isoDate(24),
    sentAt: now,
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
  },
];

const invoices = [
  {
    id: 'inv-hartley-deposit',
    jobId: 'job-hartley-ceiling',
    customerId: 'cust-hartley',
    quoteId: 'quote-hartley',
    number: 'SC-0001',
    kind: 'deposit',
    lineItems: [{ description: 'Deposit to confirm booking — quote Q-4KD2M9', quantity: 1, unitPricePence: 8400 }],
    subtotalPence: 8400,
    vatPence: 0,
    totalPence: 8400,
    amountPaidPence: 8400,
    status: 'paid',
    processor: 'square',
    processorInvoiceId: 'seed-square-invoice-1',
    paymentUrl: null,
    dueDate: isoDate(7),
    sentAt: now,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'inv-whitfield-full',
    jobId: 'job-whitfield-replaster',
    customerId: 'cust-whitfield',
    number: 'SC-0002',
    kind: 'full',
    lineItems: [{ description: 'Strip and replaster back bedroom', quantity: 1, unitPricePence: 58000 }],
    subtotalPence: 58000,
    vatPence: 0,
    totalPence: 58000,
    amountPaidPence: 0,
    status: 'overdue',
    processor: 'stripe',
    processorInvoiceId: 'seed-stripe-invoice-1',
    paymentUrl: null,
    dueDate: isoDate(-2),
    sentAt: now,
    createdAt: now,
    updatedAt: now,
  },
];

const payments = [
  {
    id: 'square_seed-payment-1',
    invoiceId: 'inv-hartley-deposit',
    jobId: 'job-hartley-ceiling',
    processor: 'square',
    processorPaymentId: 'seed-payment-1',
    amountPence: 8400,
    currency: 'GBP',
    status: 'completed',
    method: 'card',
    receivedAt: now,
    createdAt: now,
  },
];

const batch = db.batch();

batch.set(db.collection('settings').doc('business'), settings);
batch.set(db.collection('counters').doc('invoices'), { value: 2, updatedAt: now });

for (const { id, ...data } of customers) {
  batch.set(db.collection('customers').doc(id), { ...data, createdAt: now, updatedAt: now });
}
for (const { id, ...data } of jobs) {
  batch.set(db.collection('jobs').doc(id), { ...data, createdAt: now, updatedAt: now });
}
for (const day of dayBookings) {
  batch.set(db.collection('dayBookings').doc(day.date), day);
  batch.set(db.collection('availability').doc(day.date), availabilityFor(day));
}
for (const { id, ...data } of quotes) {
  batch.set(db.collection('quotes').doc(id), data);
}
for (const { id, ...data } of invoices) {
  batch.set(db.collection('invoices').doc(id), data);
}
for (const { id, ...data } of payments) {
  batch.set(db.collection('payments').doc(id), data);
}

await batch.commit();

console.log(`Seeded ${customers.length} customers, ${jobs.length} jobs, ${quotes.length} quote, ${invoices.length} invoices, ${payments.length} payment.`);
console.log(`Tomorrow (${isoDate(1)}) is booked as a full day; ${isoDate(5)} has the morning taken; ${isoDate(9)} is blocked.`);
if (usingEmulator) console.log('Wrote to the Firestore emulator.');
