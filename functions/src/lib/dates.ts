import { TIMEZONE } from './config';

/**
 * The diary is a UK business diary: every date is a calendar day in
 * Europe/London, stored as `YYYY-MM-DD`. Using UTC here would silently shift
 * bookings by a day during British Summer Time.
 */

export function toIsoDate(date: Date): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the storage format.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  // Midday UTC keeps the arithmetic clear of DST boundaries.
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, evaluated in London. */
export function dayOfWeek(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** `Saturday 6 September 2025` — for customer-facing emails. */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * The working dates a job occupies, starting at `start`.
 *
 * `start` is always included even if it is not normally a working day — an
 * admin booking his own Saturday has made a deliberate choice, and the public
 * form has already rejected non-working days by the time it gets here. Only
 * the days AFTER the first skip weekends and days off.
 */
export function workingDatesFrom(start: string, count: number, workingDays: number[]): string[] {
  const dates = [start];
  let cursor = start;

  // Guard the walk: an empty or nonsensical workingDays list must not spin.
  for (let step = 0; dates.length < count && step < count * 14; step += 1) {
    cursor = addDaysIso(cursor, 1);
    if (workingDays.includes(dayOfWeek(cursor))) dates.push(cursor);
  }

  return dates;
}
