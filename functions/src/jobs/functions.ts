import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { REGION, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso } from '../lib/dates';
import { assertAdmin } from '../lib/auth';
import { parseOrThrow } from '../lib/validation';
import { notifyTelegram } from '../messaging/telegram';
import { escapeHtml } from '../messaging/templates';
import type { Job } from '../domain';

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
    await ref.set({ status, updatedAt: nowIso() }, { merge: true });

    // Cancelling releases the slot via the onJobWrite reconciler; worth an
    // alert because it changes what the public calendar shows.
    if (status === 'cancelled' && job.status !== 'cancelled') {
      await notifyTelegram(
        `<b>Job cancelled</b>\n\n${escapeHtml(job.date)} — the slot is back on the calendar.`,
        { template: 'job-cancelled', relatedTo: { jobId } },
      );
    }

    return { jobId, status };
  },
);
