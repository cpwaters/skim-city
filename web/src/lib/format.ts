import type { InvoiceStatus, JobSlot, JobStatus, QuoteStatus } from '../types/domain';

/** Pence → `£1,234.56`. Every amount in the app passes through here. */
export function money(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

/** Pence → `£1,235` — for dashboard tiles where the pennies are noise. */
export function moneyShort(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export function poundsToPence(pounds: string | number): number {
  const value = typeof pounds === 'string' ? parseFloat(pounds || '0') : pounds;
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

/** `Sat 6 Sep 2025` */
export function shortDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseIsoDate(isoDate));
}

/** `Saturday 6 September 2025` */
export function longDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(isoDate));
}

export function relativeDay(isoDate: string): string | null {
  const today = todayIso();
  if (isoDate === today) return 'Today';
  if (isoDate === addDays(today, 1)) return 'Tomorrow';
  if (isoDate === addDays(today, -1)) return 'Yesterday';
  return null;
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** Today in Europe/London — the diary is a UK diary, not a UTC one. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayOfWeek(isoDate: string): number {
  return parseIsoDate(isoDate).getUTCDay();
}

export function slotLabel(slot: JobSlot): string {
  if (slot === 'full') return 'Full day';
  if (slot === 'am') return 'Morning';
  return 'Afternoon';
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  enquiry: 'New enquiry',
  quoted: 'Quoted',
  confirmed: 'Confirmed',
  in_progress: 'On site',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

/** `07876 308681` */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('44') ? `0${digits.slice(2)}` : digits;
  return national.replace(/^(\d{5})(\d{6})$/, '$1 $2');
}

export function toE164UK(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('44')) return digits;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return `44${digits}`;
}

/**
 * Builds a wa.me deep link with the message pre-filled.
 *
 * WhatsApp here is click-to-chat, not an API: Chris taps the link and sends
 * from his own number, so there is no Meta verification, no message templates
 * and no per-message cost.
 */
export function whatsappLink(phone: string, message = ''): string {
  const base = `https://wa.me/${toE164UK(phone)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Preview of the working dates a job would occupy, starting at `start`.
 *
 * Mirrors workingDatesFrom in functions/src/lib/dates.ts. The server is
 * authoritative — this exists only so the form can say "runs to Thursday"
 * before anything is saved.
 */
export function workingDatesFrom(start: string, count: number, workingDays: number[]): string[] {
  const dates = [start];
  let cursor = start;

  for (let step = 0; dates.length < count && step < count * 14; step += 1) {
    cursor = addDays(cursor, 1);
    if (workingDays.includes(dayOfWeek(cursor))) dates.push(cursor);
  }

  return dates;
}
