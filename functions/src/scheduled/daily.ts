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
import type { Customer, Invoice, Job } from '../domain';

/**
 * 07:00 every morning: what's on tomorrow, and what's gone overdue.
 *
 * Scheduled in Europe/London rather than UTC so the digest arrives at 7am all
 * year rather than drifting an hour each time the clocks change.
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

    const jobsSnap = await db
      .collection(COLLECTIONS.jobs)
      .where('date', '==', tomorrow)
      .where('status', 'in', ['confirmed', 'in_progress'])
      .get();

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

    await notifyTelegram(lines.join('\n'), { template: 'daily-digest' });
  },
);

/**
 * Flags invoices that have gone past their due date.
 *
 * Only touches `sent` and `partially_paid` invoices, so a paid or voided
 * invoice can never be dragged back into "overdue" by a late run.
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
      .where('dueDate', '<', today)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    let outstanding = 0;

    for (const doc of snap.docs) {
      const invoice = doc.data() as Invoice;
      outstanding += invoice.totalPence - invoice.amountPaidPence;
      batch.set(doc.ref, { status: 'overdue', updatedAt: nowIso() }, { merge: true });
    }

    await batch.commit();

    await notifyTelegram(
      [
        `<b>⏰ ${snap.size} invoice${snap.size === 1 ? '' : 's'} overdue</b>`,
        ``,
        `Total outstanding: ${formatMoney(outstanding)}`,
        ``,
        `${SITE_URL.value()}/app/invoices`,
      ].join('\n'),
      { template: 'overdue-sweep' },
    );
  },
);
