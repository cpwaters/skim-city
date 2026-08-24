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
 * {date}` is a sanitised public projection of it — booleans only, because it is
 * world-readable and Firestore rules cannot filter fields on read.
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
 * Claims a slot inside a caller-supplied transaction.
 *
 * This is what makes concurrent bookings safe: two customers submitting the
 * same slot at the same moment both read `dayBookings/{date}`, and Firestore
 * aborts and retries the loser, which then sees the slot taken and is rejected.
 * The onJobWrite trigger alone could not do this — triggers fire *after* the
 * write has already landed.
 */
export function claimSlotInTransaction(
  tx: Transaction,
  day: DayBooking,
  slot: JobSlot,
  jobId: string,
): void {
  if (!isSlotFree(day, slot)) {
    throw new HttpsError(
      'failed-precondition',
      'That slot has just been taken. Please choose another date.',
    );
  }

  const updated: DayBooking = { ...day, [slotField(slot)]: jobId, updatedAt: nowIso() };
  writeDay(tx, updated);
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
 * anything Chris edits by hand in the CRM flow through to the public calendar.
 * Deliberately derives state from the jobs themselves rather than patching, so
 * the diary cannot drift out of sync with reality.
 */
export async function recomputeDay(date: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const jobsSnap = await tx.get(
      db
        .collection(COLLECTIONS.jobs)
        .where('date', '==', date)
        .where('status', 'in', ACTIVE_JOB_STATUSES),
    );

    const existing = await readDayBooking(tx, date);
    const rebuilt = emptyDayBooking(date);
    rebuilt.blocked = existing.blocked;
    if (existing.note) rebuilt.note = existing.note;

    for (const doc of jobsSnap.docs) {
      const job = doc.data() as Job;
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
