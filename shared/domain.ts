/**
 * SKIM CITY — shared domain types.
 *
 * CANONICAL SOURCE: /shared/domain.ts
 * Copied into web/src/types/domain.ts and functions/src/domain.ts by
 * `npm run sync:types` (wired into both builds). Edit the canonical file only.
 *
 * Money convention: every amount is an integer number of PENCE. Plastering
 * quotes get split into deposits and percentages, and floating-point pounds
 * accumulate rounding error the moment you do that. Convert at the edges only.
 */

export type JobType = 'full_day' | 'repair';

/** Which part of the day a job occupies. A `full` job consumes am + pm. */
export type JobSlot = 'full' | 'am' | 'pm';

export type JobStatus =
  | 'enquiry'
  | 'quoted'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export type InvoiceKind = 'deposit' | 'balance' | 'full';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void';

export type Processor = 'stripe';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

/** Statuses that still occupy a slot in the diary. */
export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  'enquiry',
  'quoted',
  'confirmed',
  'in_progress',
  'completed',
];

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: Address | null;
  notes?: string;
  source: 'website' | 'phone' | 'referral' | 'repeat' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  customerId: string;
  type: JobType;
  status: JobStatus;
  /**
   * First working day of the job. ISO date, `YYYY-MM-DD`, Europe/London.
   * Stays the sort and display key even for a job spanning several days.
   */
  date: string;
  /**
   * How many working days the job spans. 1 for repairs and single full days.
   *
   * Optional because jobs created before multi-day support have neither this
   * nor `dates`; treat a missing value as 1.
   */
  days?: number;
  /**
   * Every working date the job occupies, ascending, starting with `date`.
   *
   * This is what the diary queries (`array-contains`), so a job holds all of
   * its days rather than just the first. Missing on pre-multi-day jobs, where
   * `date` alone is the whole story.
   */
  dates?: string[];
  slot: JobSlot;
  address: Address | null;
  description: string;
  photos: string[];
  /** Set once a quote is accepted, for at-a-glance value in the diary. */
  valuePence?: number;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPricePence: number;
}

export interface Quote {
  id: string;
  jobId: string;
  customerId: string;
  /** Sequential, human-facing: `Q-0001`. Allocated transactionally on save. */
  reference: string;
  lineItems: LineItem[];
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  depositPence: number;
  notes?: string;
  status: QuoteStatus;
  /** Unguessable token for the public /quote/:token page. */
  publicToken: string;
  expiresAt: string;
  sentAt?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  jobId: string;
  customerId: string;
  quoteId?: string | null;
  /** Sequential, human-facing: `SC-0001`. Allocated transactionally. */
  number: string;
  kind: InvoiceKind;
  lineItems: LineItem[];
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  amountPaidPence: number;
  status: InvoiceStatus;
  processor: Processor;
  processorInvoiceId?: string | null;
  /** Hosted payment page provided by Stripe. */
  paymentUrl?: string | null;
  dueDate: string;
  sentAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  jobId: string;
  processor: Processor;
  /** Processor's own payment id. Used as the doc id so replays are no-ops. */
  processorPaymentId: string;
  amountPence: number;
  currency: 'GBP';
  status: PaymentStatus;
  method?: string;
  receivedAt: string;
  createdAt: string;
}

/**
 * PUBLIC-READ. Booleans only — this document is world-readable so the booking
 * calendar can render, and Firestore rules cannot filter fields on read.
 * Never add customer data here; the private mirror is `dayBookings`.
 */
export interface Availability {
  date: string;
  fullDayTaken: boolean;
  amTaken: boolean;
  pmTaken: boolean;
  blocked: boolean;
  note?: string;
}

/** Private mirror of `availability`, holding the job ids behind each slot. */
export interface DayBooking {
  date: string;
  fullDayJobId: string | null;
  amJobId: string | null;
  pmJobId: string | null;
  blocked: boolean;
  note?: string;
  updatedAt: string;
}

export interface BusinessSettings {
  tradingName: string;
  email: string;
  phone: string;
  addressLines: string[];
  dayRatePence: number;
  repairRatePence: number;
  /** Percentage of the quote total taken as a deposit, 0-100. */
  depositPercent: number;
  vatRegistered: boolean;
  vatNumber?: string;
  /** Whole percent, e.g. 20. Only applied when vatRegistered is true. */
  vatRatePercent: number;
  /** 0 = Sunday … 6 = Saturday. */
  workingDays: number[];
  /** Minimum days between today and the earliest bookable date. */
  leadTimeDays: number;
  /** How far ahead the public calendar will accept bookings. */
  bookingHorizonDays: number;
  quoteValidDays: number;
  invoiceTermsDays: number;
  coverageAreas: string[];
}

/**
 * A photo on the public gallery.
 *
 * Images live in Cloud Storage under `public/gallery/` and are served straight
 * from their download URL, so `published` is a DISPLAY flag, not a security
 * boundary — an unpublished photo's URL still resolves if someone has it. That
 * is fine for job photos; do not put anything private in here.
 */
export interface GalleryItem {
  id: string;
  title: string;
  location: string;
  /** Alt text. Required — the gallery is the one place screen readers need it. */
  alt: string;
  /** The finished-work photo. */
  afterPath: string;
  afterUrl: string;
  /** Optional "before" shot. When present the tile becomes a comparison slider. */
  beforePath?: string | null;
  beforeUrl?: string | null;
  /** Intrinsic size of the after image, so the grid can reserve space. */
  width: number;
  height: number;
  /** Ascending. Lower numbers appear first. */
  order: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReviewStatus = 'pending' | 'published' | 'hidden';

/**
 * A customer review.
 *
 * Reviews are only ever created against a completed job, and the customer
 * reaches the form through an unguessable token emailed to them — the same
 * pattern as quotes. That makes every review traceable to real work, and means
 * the public form cannot be spammed because there is no public form.
 *
 * This collection is NOT publicly readable: it holds request tokens and
 * unmoderated text. The marketing site reads published reviews through the
 * getReviews callable, which returns display fields only.
 */
export interface Review {
  id: string;
  /** Null only for reviews Chris transcribes from a text or a phone call. */
  jobId: string | null;
  customerId: string | null;
  /** What the public sees, e.g. "Danielle H." — never a full name by default. */
  authorName: string;
  location: string;
  /** Whole stars, 1-5. */
  rating: number;
  body: string;
  status: ReviewStatus;
  /** `invited` came through a review link; `manual` was entered by Chris. */
  source: 'invited' | 'manual';
  /** Unguessable token for /review/:token. Cleared once the review is in. */
  requestToken: string | null;
  requestedAt: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  /** Optional public reply from Chris. */
  reply: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MIN_REVIEW_LENGTH = 15;
export const MAX_REVIEW_LENGTH = 1500;

export type MessageChannel = 'email' | 'telegram' | 'whatsapp';

export interface MessageLogEntry {
  id: string;
  channel: MessageChannel;
  template: string;
  to: string;
  subject?: string;
  relatedTo?: { jobId?: string; quoteId?: string; invoiceId?: string; customerId?: string };
  status: 'sent' | 'failed' | 'generated';
  error?: string;
  createdAt: string;
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
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
  coverageAreas: [
    'Manchester',
    'Salford',
    'Stockport',
    'Oldham',
    'Rochdale',
    'Bury',
    'Bolton',
    'Trafford',
    'Tameside',
    'Wigan',
  ],
};
