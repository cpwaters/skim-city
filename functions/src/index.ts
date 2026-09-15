/**
 * SKIM CITY — Cloud Functions entry point.
 *
 * Everything is exported from here; the modules below hold the logic.
 * Region and secrets are declared per-function in lib/config.ts.
 */

export { blockDay, onJobWrite } from './booking/functions';
export {
  peekQuoteNumber,
  createQuote,
  sendQuote,
  getQuote,
  acceptQuote,
  declineQuote,
  cancelQuote,
  deleteQuote,
} from './quotes/functions';
export { createInvoice, billBalance, sendInvoice, voidInvoice } from './payments/invoices';
export { approveRefund, dismissRefund } from './payments/refunds';
export { stripeWebhook } from './payments/webhooks';
export { createJob, markJobComplete, updateJobStatus } from './jobs/functions';
export { getGallery, deleteGalleryItem } from './gallery/functions';
export { requestReview, getReviewRequest, submitReview, getReviews } from './reviews/functions';
export { dailyDigest, sweepOverdueInvoices } from './scheduled/daily';
