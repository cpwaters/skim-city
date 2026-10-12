import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  REGION,
  TIMEZONE,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  SITE_URL,
} from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { addDaysIso, formatLongDate, nowIso, todayIso } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { notifyTelegram } from '../messaging/telegram';
import { escapeHtml, slotLabel } from '../messaging/templates';
import type { Customer, DayBooking, Invoice, Job } from '../domain';
import { readInstalments } from '../payments/instalments';

/**
 * 07:00 every morning: what's on tomorrow, and what's gone overdue.
 *
 * Scheduled in Europe/London rather than UTC so the digest arrives at 7am all
 * year rather than drifting an hour each time the clocks change.
 *
 * Carries the day's note as well as its jobs. A note is often the half of
 * tomorrow that is not a booking — boards being dropped off, a gate code, a
 * day being kept clear — so it has to survive an empty diary rather than being
 * attached to a job that may not exist.
 */
export const dailyDigest = onSchedule(
  {
    region: REGION,
    schedule: '0 7 * * *',
    timeZone: TIMEZONE,
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
  },
  async () => {
    const tomorrow = addDaysIso(todayIso(), 1);

    const [jobsSnap, daySnap] = await Promise.all([
      db
        .collection(COLLECTIONS.jobs)
        .where('date', '==', tomorrow)
        .where('status', 'in', ['confirmed', 'in_progress'])
        .get(),
      db.collection(COLLECTIONS.dayBookings).doc(tomorrow).get(),
    ]);

    const note = (daySnap.data() as DayBooking | undefined)?.note;

    const lines: string[] = [`<b>Tomorrow — ${formatLongDate(tomorrow)}</b>`, ''];

    if (jobsSnap.empty) {
      lines.push('Nothing booked in.');
    } else {
      for (const doc of jobsSnap.docs) {
        const job = doc.data() as Job;
        const customerSnap = await db.collection(COLLECTIONS.customers).doc(job.customerId).get();
        const customer = customerSnap.data() as Customer | undefined;
        lines.push(
          `• <b>${slotLabel(job.slot)}</b> — ${escapeHtml(customer?.name ?? 'Unknown')}`,
          `  ${escapeHtml(job.address?.line1 ?? '')}, ${escapeHtml(job.address?.postcode ?? '')}`,
          `  ${escapeHtml(customer?.phone ?? '')}`,
          '',
        );
      }
    }

    // After the jobs: the note annotates the day, and on a day that has work
    // on it the work is what you opened the message for. The job loop already
    // leaves a blank line behind it, so only separate when something else did
    // not — otherwise a booked day gets a double gap and an empty one a single.
    if (note) {
      if (lines[lines.length - 1] !== '') lines.push('');
      lines.push(`<b>📌 Note</b>`, escapeHtml(note));
    }

    await notifyTelegram(lines.join('\n'), { template: 'daily-digest' });
  },
);

/**
 * Flags invoices that have gone past their due date.
 *
 * Only touches `sent` and `partially_paid` invoices, so a paid or voided
 * invoice can never be dragged back into "overdue" by a late run.
 *
 * An invoice is overdue when an instalment that has ACTUALLY BEEN BILLED is
 * past its date — not merely when the invoice's own date has passed. A job
 * whose deposit is paid and whose balance is not billed until the work is done
 * is not late, and must not be chased as though it were. That test lives
 * inside the array, which Firestore cannot query, so the open invoices are
 * read and filtered here; there are only ever a handful.
 */
export const sweepOverdueInvoices = onSchedule(
  {
    region: REGION,
    schedule: '30 7 * * *',
    timeZone: TIMEZONE,
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
  },
  async () => {
    const today = todayIso();

    const snap = await db
      .collection(COLLECTIONS.invoices)
      .where('status', 'in', ['sent', 'partially_paid'])
      .get();

    if (snap.empty) return;

    const late = snap.docs.filter((doc) => {
      const invoice = { id: doc.id, ...doc.data() } as Invoice;
      return readInstalments(invoice).some(
        (instalment) =>
          instalment.status === 'sent' &&
          instalment.amountPaidPence < instalment.amountPence &&
          instalment.dueDate != null &&
          instalment.dueDate < today,
      );
    });

    if (late.length === 0) return;

    const batch = db.batch();
    let outstanding = 0;

    for (const doc of late) {
      const invoice = doc.data() as Invoice;
      outstanding += invoice.totalPence - invoice.amountPaidPence;
      batch.set(doc.ref, { status: 'overdue', updatedAt: nowIso() }, { merge: true });
    }

    await batch.commit();

    await notifyTelegram(
      [
        `<b>⏰ ${late.length} invoice${late.length === 1 ? '' : 's'} overdue</b>`,
        ``,
        `Total outstanding: ${formatMoney(outstanding)}`,
        ``,
        `${SITE_URL.value()}/app/invoices`,
      ].join('\n'),
      { template: 'overdue-sweep' },
    );
  },
);
