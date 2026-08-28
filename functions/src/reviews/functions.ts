import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  REGION,
  RESEND_API_KEY,
  SITE_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso } from '../lib/dates';
import { assertAdmin } from '../lib/auth';
import { assertAppCheck } from '../lib/appCheck';
import { parseOrThrow } from '../lib/validation';
import { generateToken } from '../lib/tokens';
import { sendEmail } from '../messaging/email';
import { notifyTelegram } from '../messaging/telegram';
import { escapeHtml, reviewRequestEmail } from '../messaging/templates';
import {
  MAX_REVIEW_LENGTH,
  MIN_REVIEW_LENGTH,
  type Customer,
  type Job,
  type Review,
} from '../domain';

/** "Danielle Hartley" → "Danielle H." — enough to be credible, not identifying. */
function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Admin: invite a customer to review a completed job.
 *
 * Only completed jobs qualify, and only one invite per job — the point of
 * tying reviews to jobs is that every published review corresponds to real work
 * we actually did.
 */
export const requestReview = onCall(
  { region: REGION, secrets: [RESEND_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] },
  async (request) => {
    assertAdmin(request);
    const { jobId } = parseOrThrow(z.object({ jobId: z.string().min(1) }), request.data);

    const jobSnap = await db.collection(COLLECTIONS.jobs).doc(jobId).get();
    if (!jobSnap.exists) throw new HttpsError('not-found', 'Job not found.');
    const job = { id: jobSnap.id, ...jobSnap.data() } as Job;

    if (job.status !== 'completed') {
      throw new HttpsError('failed-precondition', 'Finish the job before asking for a review.');
    }

    const existing = await db
      .collection(COLLECTIONS.reviews)
      .where('jobId', '==', jobId)
      .limit(1)
      .get();

    if (!existing.empty) {
      const review = existing.docs[0].data() as Review;
      throw new HttpsError(
        'already-exists',
        review.submittedAt
          ? 'This customer has already left a review for this job.'
          : "You've already asked for a review on this job.",
      );
    }

    const customerSnap = await db.collection(COLLECTIONS.customers).doc(job.customerId).get();
    if (!customerSnap.exists) throw new HttpsError('not-found', 'Customer not found.');
    const customer = { id: customerSnap.id, ...customerSnap.data() } as Customer;

    const timestamp = nowIso();
    const reviewRef = db.collection(COLLECTIONS.reviews).doc();

    const review: Omit<Review, 'id'> = {
      jobId: job.id,
      customerId: customer.id,
      authorName: displayName(customer.name),
      location: customer.address?.city ?? '',
      rating: 0,
      body: '',
      status: 'pending',
      source: 'invited',
      requestToken: generateToken(),
      requestedAt: timestamp,
      submittedAt: null,
      publishedAt: null,
      reply: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await reviewRef.set(review);

    const email = reviewRequestEmail({
      customerName: customer.name,
      reviewUrl: `${SITE_URL.value()}/review/${review.requestToken}`,
      jobDate: job.date,
    });

    const sent = await sendEmail({
      to: customer.email,
      subject: email.subject,
      html: email.html,
      template: 'review-request',
      relatedTo: { jobId: job.id, customerId: customer.id },
    });

    if (!sent) {
      // The invite exists but never reached them; without the link it is dead
      // weight in the CRM, so take it back out.
      await reviewRef.delete();
      throw new HttpsError('internal', 'Could not email the review request. Check the Resend configuration.');
    }

    return { reviewId: reviewRef.id, sentTo: customer.email };
  },
);

/** Public: load the context for a review form. */
export const getReviewRequest = onCall({ region: REGION, cors: true }, async (request) => {
  assertAppCheck(request);
  const { token } = parseOrThrow(z.object({ token: z.string().min(10).max(200) }), request.data);

  const snap = await db
    .collection(COLLECTIONS.reviews)
    .where('requestToken', '==', token)
    .limit(1)
    .get();

  if (snap.empty) throw new HttpsError('not-found', 'This review link is not valid.');

  const review = snap.docs[0].data() as Review;
  const jobSnap = review.jobId
    ? await db.collection(COLLECTIONS.jobs).doc(review.jobId).get()
    : null;
  const job = jobSnap?.data() as Job | undefined;

  return {
    authorName: review.authorName,
    alreadySubmitted: Boolean(review.submittedAt),
    jobDate: job?.date ?? null,
    jobDescription: job?.description ?? '',
  };
});

/**
 * Public: the customer submits their review.
 *
 * Arrives as `pending`. Nothing reaches the website until Chris publishes it —
 * not to filter out bad reviews, but because unmoderated text on a public page
 * is a liability whoever writes it.
 */
export const submitReview = onCall(
  { region: REGION, cors: true, secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] },
  async (request) => {
    assertAppCheck(request);

    const { token, rating, body, authorName } = parseOrThrow(
      z.object({
        token: z.string().min(10).max(200),
        rating: z.number().int().min(1).max(5),
        body: z
          .string()
          .trim()
          .min(MIN_REVIEW_LENGTH, 'Please write a little more.')
          .max(MAX_REVIEW_LENGTH),
        authorName: z.string().trim().min(1).max(60).optional(),
      }),
      request.data,
    );

    const snap = await db
      .collection(COLLECTIONS.reviews)
      .where('requestToken', '==', token)
      .limit(1)
      .get();

    if (snap.empty) throw new HttpsError('not-found', 'This review link is not valid.');

    const ref = snap.docs[0].ref;
    const review = snap.docs[0].data() as Review;

    if (review.submittedAt) {
      throw new HttpsError('failed-precondition', "You've already left a review — thank you.");
    }

    const timestamp = nowIso();
    await ref.set(
      {
        rating,
        body,
        ...(authorName ? { authorName } : {}),
        submittedAt: timestamp,
        updatedAt: timestamp,
        // The token deliberately stays live. `submittedAt` above is what stops
        // the review being overwritten, and keeping the link working means a
        // customer who clicks it again gets "you've already reviewed, thanks"
        // rather than "this link is not valid" and a reason to ring up worried
        // that something broke. All the link then exposes is a job description
        // they wrote themselves.
      },
      { merge: true },
    );

    await notifyTelegram(
      [
        `<b>${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} New review</b>`,
        ``,
        `${escapeHtml(review.authorName)} — ${rating}/5`,
        ``,
        escapeHtml(body.slice(0, 400)),
        ``,
        `Publish it: ${SITE_URL.value()}/app/reviews`,
      ].join('\n'),
      { template: 'review-submitted', relatedTo: { jobId: review.jobId ?? undefined } },
    );

    return { submitted: true };
  },
);

/**
 * Public: published reviews for the marketing site.
 *
 * A callable rather than a Firestore read for two reasons: the collection is
 * admin-only (it holds request tokens), and the public bundle does not carry
 * the Firestore SDK.
 */
export const getReviews = onCall({ region: REGION, cors: true }, async (request) => {
  assertAppCheck(request);

  const snap = await db
    .collection(COLLECTIONS.reviews)
    .where('status', '==', 'published')
    .orderBy('submittedAt', 'desc')
    .get();

  const reviews = snap.docs.map((doc) => {
    const review = doc.data() as Review;
    return {
      id: doc.id,
      authorName: review.authorName,
      location: review.location,
      rating: review.rating,
      body: review.body,
      reply: review.reply ?? null,
      submittedAt: review.submittedAt,
    };
  });

  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / count) * 10) / 10
    : 0;

  return { reviews, average, count };
});
