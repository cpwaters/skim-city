import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { REGION, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso, workingDatesFrom } from '../lib/dates';
import { assertAdmin } from '../lib/auth';
import {
  addressSchema,
  assertSlotMatchesType,
  isoDateSchema,
  parseOrThrow,
  ukPhoneSchema,
} from '../lib/validation';
import { claimDaysInTransaction, readDayBooking } from '../booking/availability';
import { getSettings } from '../lib/settings';
import { notifyTelegram } from '../messaging/telegram';
import { raiseRefundRequests } from '../payments/refunds';
import { escapeHtml } from '../messaging/templates';
import type { Customer, Job } from '../domain';

/**
 * Admin: put a job on the books that never came through the website.
 *
 * Most quoting happens at the door for work that arrived by phone or word of
 * mouth, so there is no enquiry to price up. This creates the customer (reusing
 * an existing record matched on email) and the job in one transaction, ready
 * for a quote to be built against it.
 *
 * The job is created as an `enquiry`, exactly as a website booking is, which
 * means it CLAIMS THE SLOT while the quote is out. That is deliberate: the day
 * is being held for this customer, and declining the quote cancels the job and
 * puts the day back on the calendar. Unlike the public form there is no lead
 * time or working-day check — Chris is allowed to book his own Sunday.
 */
export const createJob = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const input = parseOrThrow(
    z.object({
      name: z.string().trim().min(2, 'Give the customer a name').max(80),
      phone: ukPhoneSchema,
      email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
      type: z.enum(['full_day', 'repair']),
      date: isoDateSchema,
      slot: z.enum(['full', 'am', 'pm']),
      address: addressSchema,
      description: z.string().trim().min(1, 'Describe the job').max(2000),
      /** Working days the job spans. Only a full day can run over one. */
      days: z.number().int().min(1).max(20).default(1),
      source: z.enum(['website', 'phone', 'referral', 'repeat', 'other']).default('phone'),
    }),
    request.data,
  );

  assertSlotMatchesType(input.type, input.slot);

  if (input.days > 1 && input.type !== 'full_day') {
    throw new HttpsError('invalid-argument', 'Only a full-day job can run over more than one day.');
  }

  const settings = await getSettings();
  // The first day is taken as given; the rest skip his days off.
  const dates = workingDatesFrom(input.date, input.days, settings.workingDays);

  const timestamp = nowIso();
  const jobRef = db.collection(COLLECTIONS.jobs).doc();

  const customerId = await db.runTransaction(async (tx) => {
    // All reads before any write — Firestore transactions require it.
    const days = await Promise.all(dates.map((date) => readDayBooking(tx, date)));
    const existing = await tx.get(
      db.collection(COLLECTIONS.customers).where('email', '==', input.email).limit(1),
    );

    const customerRef = existing.empty
      ? db.collection(COLLECTIONS.customers).doc()
      : existing.docs[0].ref;

    // Throws if any day of the span is already spoken for.
    claimDaysInTransaction(tx, days, input.slot, jobRef.id);

    if (existing.empty) {
      const customer: Omit<Customer, 'id'> = {
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        source: input.source,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      tx.set(customerRef, customer);
    } else {
      // Standing at their door is a good moment to correct the details on file.
      tx.set(
        customerRef,
        { name: input.name, phone: input.phone, address: input.address, updatedAt: timestamp },
        { merge: true },
      );
    }

    const job: Omit<Job, 'id'> = {
      customerId: customerRef.id,
      type: input.type,
      status: 'enquiry',
      date: dates[0],
      days: input.days,
      dates,
      slot: input.slot,
      address: input.address,
      description: input.description,
      photos: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    tx.set(jobRef, job);

    return customerRef.id;
  });

  return { jobId: jobRef.id, customerId };
});

/**
 * Admin: mark a job finished.
 *
 * Deliberately does not raise the balance invoice automatically — Chris often
 * finishes a job with an agreed variation to add, and an invoice that fires
 * itself the moment he taps "complete" would go out at the wrong figure.
 */
export const markJobComplete = onCall(
  { region: REGION, secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] },
  async (request) => {
    assertAdmin(request);

    const { jobId, notes } = parseOrThrow(
      z.object({ jobId: z.string().min(1), notes: z.string().trim().max(1000).optional() }),
      request.data,
    );

    const ref = db.collection(COLLECTIONS.jobs).doc(jobId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Job not found.');

    const job = snap.data() as Job;
    if (job.status === 'completed') return { jobId, alreadyComplete: true };

    const timestamp = nowIso();
    await ref.set(
      {
        status: 'completed',
        completedAt: timestamp,
        updatedAt: timestamp,
        ...(notes ? { internalNotes: notes } : {}),
      },
      { merge: true },
    );

    return { jobId, alreadyComplete: false };
  },
);

/** Admin: change a job's status by hand (cancel, start, reopen). */
export const updateJobStatus = onCall(
  { region: REGION, secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] },
  async (request) => {
    assertAdmin(request);

    const { jobId, status } = parseOrThrow(
      z.object({
        jobId: z.string().min(1),
        status: z.enum(['enquiry', 'quoted', 'confirmed', 'in_progress', 'completed', 'cancelled']),
      }),
      request.data,
    );

    const ref = db.collection(COLLECTIONS.jobs).doc(jobId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Job not found.');

    const job = snap.data() as Job;
    const timestamp = nowIso();
    await ref.set({ status, updatedAt: timestamp }, { merge: true });

    // Cancelling releases the slot via the onJobWrite reconciler; worth an
    // alert because it changes what the public calendar shows.
    let quotesCancelled = 0;
    let refundsRaised = 0;
    if (status === 'cancelled' && job.status !== 'cancelled') {
      quotesCancelled = await cancelLiveQuotes(jobId, timestamp);
      refundsRaised = await raiseRefundRequests({
        jobId,
        reason: `Job on ${job.date} cancelled`,
      });
      await notifyTelegram(
        `<b>Job cancelled</b>\n\n${escapeHtml(job.date)} — the slot is back on the calendar.`,
        { template: 'job-cancelled', relatedTo: { jobId } },
      );
    }

    return { jobId, status, quotesCancelled, refundsRaised };
  },
);

/**
 * Cancelling a job cancels the paperwork that was still out with the customer.
 *
 * Only quotes that are still live — draft or sent — are touched. An accepted
 * quote is the basis of an invoice and possibly a payment already taken, and a
 * declined one already records the customer's own answer; rewriting either
 * would falsify the record of what happened.
 */
async function cancelLiveQuotes(jobId: string, timestamp: string): Promise<number> {
  // Filtered in code rather than with a second `where`: that would need a
  // composite index deployed ahead of this function, and a job carries a
  // handful of quotes at most.
  const snap = await db.collection(COLLECTIONS.quotes).where('jobId', '==', jobId).get();
  const live = snap.docs.filter((doc) => {
    const status = doc.data().status as string;
    return status === 'draft' || status === 'sent';
  });

  if (live.length === 0) return 0;

  const batch = db.batch();
  live.forEach((doc) => {
    batch.set(doc.ref, { status: 'cancelled', cancelledAt: timestamp, updatedAt: timestamp }, { merge: true });
  });
  await batch.commit();

  return live.length;
}
