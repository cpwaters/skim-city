import { onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { z } from 'zod';
import { REGION } from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { assertAdmin } from '../lib/auth';
import { isoDateSchema, parseOrThrow } from '../lib/validation';
import { emptyDayBooking, projectAvailability, recomputeDay, setDayBlocked } from './availability';
import type { Job } from '../domain';

/** Admin: block or unblock a day (holiday, weather, sickness). */
export const blockDay = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const { date, blocked, note } = parseOrThrow(
    z.object({ date: isoDateSchema, blocked: z.boolean(), note: z.string().trim().max(200).optional() }),
    request.data,
  );

  await setDayBlocked(date, blocked, note);
  return { date, blocked };
});

/**
 * Reconciles the diary whenever a job changes.
 *
 * `createJob` already claims days transactionally, so this is not the primary
 * guard — it is what keeps the diary honest when a job is cancelled,
 * rescheduled or edited by hand in the CRM. It recomputes from the jobs
 * collection rather than patching, so the diary cannot drift.
 */
export const onJobWrite = onDocumentWritten(
  { region: REGION, document: 'jobs/{jobId}' },
  async (event) => {
    const before = event.data?.before.data() as Job | undefined;
    const after = event.data?.after.data() as Job | undefined;

    // `dates` covers a multi-day job; `date` is the fallback for jobs written
    // before spans existed. A rescheduled or shortened job must free every day
    // it used to hold, so both sides are unioned.
    const dates = new Set<string>();
    for (const job of [before, after]) {
      if (!job) continue;
      for (const date of job.dates ?? (job.date ? [job.date] : [])) dates.add(date);
    }

    // A rescheduled job frees its old date and takes the new one.
    await Promise.all([...dates].map((date) => recomputeDay(date)));
  },
);

/** Admin: seeds an availability doc for a date that has never been touched. */
export async function ensureAvailabilityDoc(date: string): Promise<void> {
  const ref = db.collection(COLLECTIONS.availability).doc(date);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(projectAvailability(emptyDayBooking(date)));
  }
}
