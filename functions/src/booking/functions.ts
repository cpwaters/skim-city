import { onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { z } from 'zod';
import { REGION, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { assertAdmin } from '../lib/auth';
import { formatLongDate } from '../lib/dates';
import { notifyTelegram } from '../messaging/telegram';
import { escapeHtml } from '../messaging/templates';
import { isoDateSchema, parseOrThrow } from '../lib/validation';
import {
  emptyDayBooking,
  projectAvailability,
  recomputeDay,
  setDayBlocked,
  writeDayNote,
} from './availability';
import { MAX_DAY_NOTE_LENGTH, type Job } from '../domain';

/** Admin: block or unblock a day (holiday, weather, sickness). */
export const blockDay = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const { date, blocked, note } = parseOrThrow(
    z.object({
      date: isoDateSchema,
      blocked: z.boolean(),
      note: z.string().trim().max(MAX_DAY_NOTE_LENGTH).optional(),
    }),
    request.data,
  );

  await setDayBlocked(date, blocked, note);
  return { date, blocked };
});

/**
 * Admin: set the note against a day, or clear it by sending an empty string.
 *
 * Takes no `blocked` flag on purpose — see `writeDayNote`. The note is required
 * rather than optional because an absent one would be ambiguous: there would be
 * no way to say "remove it" that a dropped field could not also mean.
 */
export const setDayNote = onCall(
  { region: REGION, secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] },
  async (request) => {
    assertAdmin(request);

    const { date, note } = parseOrThrow(
      z.object({ date: isoDateSchema, note: z.string().trim().max(MAX_DAY_NOTE_LENGTH) }),
      request.data,
    );

    const previous = await writeDayNote(date, note);

    // Nothing actually changed — saving the same text again is not news.
    if (note !== previous) {
      await notifyTelegram(dayNoteMessage(date, note, previous), {
        template: note ? (previous ? 'day-note-changed' : 'day-note-added') : 'day-note-cleared',
      });
    }

    return { date, note };
  },
);

/**
 * The three shapes a note change takes.
 *
 * An edit and a clear both carry the old text: the point of hearing about them
 * on the phone is knowing what is no longer there, which the new text alone
 * cannot tell you.
 */
function dayNoteMessage(date: string, note: string, previous: string): string {
  const day = formatLongDate(date);

  if (!note) {
    return `<b>📌 Note cleared</b>\n\n${day}\n\nWas: ${escapeHtml(previous)}`;
  }

  if (previous) {
    return `<b>📌 Note changed</b>\n\n${day}\n\n${escapeHtml(note)}\n\nWas: ${escapeHtml(previous)}`;
  }

  return `<b>📌 Note added</b>\n\n${day}\n\n${escapeHtml(note)}`;
}

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
