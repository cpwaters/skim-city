import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { functions } from './firebase';
import type {
  Address,
  JobSlot,
  JobType,
  JobStatus,
  LineItem,
} from '../types/domain';

/**
 * Typed wrappers around every Cloud Function.
 *
 * Keeping the call signatures in one file means a change to a function's
 * payload shows up as a compile error at the call site rather than a runtime
 * `invalid-argument` in front of a customer.
 */

function callable<Request, Response>(name: string) {
  const fn = httpsCallable<Request, Response>(functions, name);
  return async (data: Request): Promise<Response> => {
    const result: HttpsCallableResult<Response> = await fn(data);
    return result.data;
  };
}

export const blockDay = callable<
  { date: string; blocked: boolean; note?: string },
  { date: string; blocked: boolean }
>('blockDay');

export const createJob = callable<
  {
    name: string;
    phone: string;
    email: string;
    type: JobType;
    date: string;
    slot: JobSlot;
    address: Address;
    description: string;
    days?: number;
    source?: 'website' | 'phone' | 'referral' | 'repeat' | 'other';
  },
  { jobId: string; customerId: string }
>('createJob');

export const peekQuoteNumber = callable<Record<string, never>, { number: string }>('peekQuoteNumber');

export const createQuote = callable<
  { jobId: string; lineItems: LineItem[]; notes?: string; depositPence?: number; validDays?: number },
  { quoteId: string; reference: string; totalPence: number; depositPence: number }
>('createQuote');

export const sendQuote = callable<{ quoteId: string }, { quoteId: string; sentTo: string }>('sendQuote');

export interface PublicQuote {
  reference: string;
  status: string;
  lineItems: LineItem[];
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  depositPence: number;
  notes: string | null;
  expiresAt: string;
  showVat: boolean;
  vatRatePercent: number;
  customerName: string;
  jobDate: string | null;
  jobSlot: JobSlot | null;
  jobDescription: string;
}

export const getQuote = callable<{ token: string }, PublicQuote>('getQuote');

export const acceptQuote = callable<
  { token: string },
  { alreadyAccepted: boolean; paymentUrl: string | null; depositPence: number; invoiceNumber?: string }
>('acceptQuote');

export const declineQuote = callable<{ token: string; reason?: string }, { declined: boolean }>('declineQuote');

export const cancelQuote = callable<
  { quoteId: string; reason?: string },
  { quoteId: string; status: string; refundsRaised: number }
>('cancelQuote');

export const deleteQuote = callable<{ quoteId: string }, { quoteId: string; deleted: boolean }>(
  'deleteQuote',
);

export const approveRefund = callable<
  { refundRequestId: string },
  { refundRequestId: string; amountPence: number; status: string }
>('approveRefund');

export const dismissRefund = callable<
  { refundRequestId: string },
  { refundRequestId: string; status: string }
>('dismissRefund');

export const createInvoice = callable<
  {
    jobId: string;
    kind: 'deposit' | 'balance' | 'full';
    lineItems?: LineItem[];
    dueDate?: string;
    memo?: string;
  },
  { invoiceId: string; number: string; paymentUrl: string | null; totalPence: number }
>('createInvoice');

export const billBalance = callable<
  { jobId: string },
  { invoiceId: string; number: string; paymentUrl: string | null; totalPence: number }
>('billBalance');

export const sendInvoice = callable<
  { invoiceId: string },
  { invoiceId: string; sentTo: string; totalPence: number; summary: string }
>('sendInvoice');

export const voidInvoice = callable<{ invoiceId: string }, { invoiceId: string; status: string }>('voidInvoice');

export const markJobComplete = callable<
  { jobId: string; notes?: string },
  { jobId: string; alreadyComplete: boolean }
>('markJobComplete');

export interface PublicGalleryItem {
  id: string;
  title: string;
  location: string;
  alt: string;
  afterUrl: string;
  beforeUrl: string | null;
  width: number;
  height: number;
}

export interface PublicBusinessInfo {
  name: string;
  email: string;
  phone: string;
  coverageAreas: string[];
  whatsappGreeting: string | null;
}

export const getBusinessInfo = callable<Record<string, never>, PublicBusinessInfo>('getBusinessInfo');

export const getGallery = callable<Record<string, never>, { items: PublicGalleryItem[] }>('getGallery');

export const deleteGalleryItem = callable<
  { itemId: string },
  { itemId: string; filesDeleted: number }
>('deleteGalleryItem');

export interface PublicReview {
  id: string;
  authorName: string;
  location: string;
  rating: number;
  body: string;
  reply: string | null;
  submittedAt: string | null;
}

export const getReviews = callable<
  Record<string, never>,
  { reviews: PublicReview[]; average: number; count: number }
>('getReviews');

export const getReviewRequest = callable<
  { token: string },
  { authorName: string; alreadySubmitted: boolean; jobDate: string | null; jobDescription: string }
>('getReviewRequest');

export const submitReview = callable<
  { token: string; rating: number; body: string; authorName?: string },
  { submitted: boolean }
>('submitReview');

export const requestReview = callable<{ jobId: string }, { reviewId: string; sentTo: string }>(
  'requestReview',
);

export const updateJobStatus = callable<
  { jobId: string; status: JobStatus },
  { jobId: string; status: JobStatus; quotesCancelled: number; refundsRaised: number }
>('updateJobStatus');
