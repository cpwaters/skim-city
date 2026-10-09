import { Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { COLLECTIONS, db } from '../lib/firebase';
import { nowIso } from '../lib/dates';
import { ACTIVE_JOB_STATUSES, type Availability, type DayBooking, type Job, type JobSlot } from '../domain';

/**
 * The diary rule, in one place:
 *
 *   A working day is EITHER one full-day job OR up to two repair slots (AM/PM).
 *
 * So a full-day booking consumes both repair slots, and a single repair
 * booking leaves the other half of the day open but rules out a full day.
 *
 * `dayBookings/{date}` is the authoritative record and the lock. `availability/
 * {date}` is a projection of it, carrying no job ids, so the diary can render a
 * whole month from one query. Both are admin-only (see firestore.rules) — the
 * public calendar that once made the projection world-readable is gone.
 */

export function emptyDayBooking(date: string): DayBooking {
  return {
    date,
    fullDayJobId: null,
    amJobId: null,
    pmJobId: null,
    blocked: false,
    updatedAt: nowIso(),
  };
}

/** Projects the private booking record down to the public booleans. */
export function projectAvailability(day: DayBooking): Availability {
  const anythingBooked = Boolean(day.fullDayJobId || day.amJobId || day.pmJobId);
  return {
    date: day.date,
    // A full day needs the whole day clear, so any repair booking blocks it.
    fullDayTaken: anythingBooked,
    amTaken: Boolean(day.fullDayJobId || day.amJobId),
    pmTaken: Boolean(day.fullDayJobId || day.pmJobId),
    blocked: day.blocked,
    ...(day.note ? { note: day.note } : {}),
  };
}

export function isSlotFree(day: DayBooking, slot: JobSlot): boolean {
  if (day.blocked) return false;
  const availability = projectAvailability(day);
  if (slot === 'full') return !availability.fullDayTaken;
  if (slot === 'am') return !availability.amTaken;
  return !availability.pmTaken;
}

function slotField(slot: JobSlot): 'fullDayJobId' | 'amJobId' | 'pmJobId' {
  if (slot === 'full') return 'fullDayJobId';
  if (slot === 'am') return 'amJobId';
  return 'pmJobId';
}

/**
 * Claims a slot across one or more days inside a caller-supplied transaction.
 *
 * Every day is checked before any is written, so a three-day job that runs
 * into a booked Wednesday fails cleanly rather than half-claiming the week.
 * The caller must have read all the DayBookings already — Firestore requires
 * every read in a transaction to happen before the first write.
 */
export function claimDaysInTransaction(
  tx: Transaction,
  days: DayBooking[],
  slot: JobSlot,
  jobId: string,
): void {
  const clash = days.find((day) => !isSlotFree(day, slot));
  if (clash) {
    throw new HttpsError(
      'failed-precondition',
      days.length === 1
        ? 'That slot has just been taken. Please choose another date.'
        : `The job runs over ${days.length} days and ${clash.date} is not free. Pick another start date.`,
    );
  }

  const timestamp = nowIso();
  for (const day of days) {
    writeDay(tx, { ...day, [slotField(slot)]: jobId, updatedAt: timestamp });
  }
}

function writeDay(tx: Transaction, day: DayBooking): void {
  tx.set(db.collection(COLLECTIONS.dayBookings).doc(day.date), day);
  tx.set(db.collection(COLLECTIONS.availability).doc(day.date), projectAvailability(day));
}

export async function readDayBooking(tx: Transaction, date: string): Promise<DayBooking> {
  const snap = await tx.get(db.collection(COLLECTIONS.dayBookings).doc(date));
  return snap.exists ? (snap.data() as DayBooking) : emptyDayBooking(date);
}

/**
 * Rebuilds a day from the jobs collection — the reconciler.
 *
 * Called by the onJobWrite trigger so that cancellations, date changes and
 * anything Chris edits by hand in the CRM flow through to the diary.
 * Deliberately derives state from the jobs themselves rather than patching, so
 * the diary cannot drift out of sync with reality.
 */
export async function recomputeDay(date: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    // Two queries, unioned. `dates` holds every day a job occupies and is what
    // multi-day jobs are found by; the `date` query keeps jobs written before
    // multi-day support from silently losing their slot. Filtering status in
    // memory keeps this to a single-field array index — no composite needed.
    const [spanning, legacy] = await Promise.all([
      tx.get(db.collection(COLLECTIONS.jobs).where('dates', 'array-contains', date)),
      tx.get(db.collection(COLLECTIONS.jobs).where('date', '==', date)),
    ]);

    const existing = await readDayBooking(tx, date);
    const rebuilt = emptyDayBooking(date);
    rebuilt.blocked = existing.blocked;
    if (existing.note) rebuilt.note = existing.note;

    const seen = new Set<string>();
    for (const doc of [...spanning.docs, ...legacy.docs]) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);

      const job = doc.data() as Job;
      if (!ACTIVE_JOB_STATUSES.includes(job.status)) continue;
      rebuilt[slotField(job.slot)] = doc.id;
    }

    writeDay(tx, rebuilt);
  });
}

/** Marks a day unavailable (holiday, sick, weather) without inventing a job. */
export async function setDayBlocked(date: string, blocked: boolean, note?: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const day = await readDayBooking(tx, date);
    const updated: DayBooking = { ...day, blocked, updatedAt: nowIso() };
    if (note !== undefined) updated.note = note;
    writeDay(tx, updated);
  });
}

/**
 * Sets or clears the note against a day, leaving its bookings alone.
 *
 * Kept apart from `setDayBlocked` because a note says nothing about
 * availability — most of them sit on days that are working normally. Folding
 * the two together would force the CRM to restate `blocked` every time it saved
 * a note, and a screen holding a stale value would then unblock a day by
 * accident.
 *
 * An empty note deletes the field rather than storing `''`: `writeDay`
 * replaces the document instead of merging, so omitting the key is the delete,
 * and `projectAvailability` already drops a falsy note from the projection.
 *
 * Returns whatever note it replaced (`''` when there was none), read inside the
 * transaction so it cannot be a stale value from before someone else's write.
 * The caller needs it to say whether a note was added, changed or cleared.
 */
export async function writeDayNote(date: string, note: string): Promise<string> {
  return db.runTransaction(async (tx) => {
    const day = await readDayBooking(tx, date);
    const updated: DayBooking = { ...day, updatedAt: nowIso() };

    if (note) updated.note = note;
    else delete updated.note;

    writeDay(tx, updated);
    return day.note ?? '';
  });
}
