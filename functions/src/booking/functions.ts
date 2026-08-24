import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { z } from 'zod';
import {
  REGION,
  RESEND_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  SITE_URL,
} from '../lib/config';
import { COLLECTIONS, db } from '../lib/firebase';
import { addDaysIso, dayOfWeek, formatLongDate, nowIso, todayIso } from '../lib/dates';
import { getSettings } from '../lib/settings';
import { assertAdmin } from '../lib/auth';
import { assertAppCheck } from '../lib/appCheck';
import { assertSlotMatchesType, bookingRequestSchema, isoDateSchema, parseOrThrow } from '../lib/validation';
import {
  claimSlotInTransaction,
  emptyDayBooking,
  projectAvailability,
  readDayBooking,
  recomputeDay,
  setDayBlocked,
} from './availability';
import { sendEmail } from '../messaging/email';
import { notifyTelegram } from '../messaging/telegram';
import { bookingReceivedEmail, escapeHtml, slotLabel } from '../messaging/templates';
import type { Availability, Customer, Job } from '../domain';

/**
 * Public: the month view behind the booking calendar.
 *
 * Returns the sanitised availability booleans plus the rules the calendar needs
 * to grey out days (working days, lead time, horizon), so the client never has
 * to hardcode business rules that live in settings.
 */
export const getAvailability = onCall(
  { region: REGION, cors: true },
  async (request) => {
    assertAppCheck(request);

    const { month } = parseOrThrow(
      z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Invalid month') }),
      request.data,
    );

    const settings = await getSettings();
    const start = `${month}-01`;
    const end = `${month}-31`;

    // Queried on the `date` field rather than the document id: availability
    // doc ids are ISO dates, but a field query keeps the index ordinary.
    const snap = await db
      .collection(COLLECTIONS.availability)
      .where('date', '>=', start)
      .where('date', '<=', end)
      .get();

    const days: Record<string, Availability> = {};
    for (const doc of snap.docs) {
      days[doc.id] = doc.data() as Availability;
    }

    return {
      month,
      days,
      rules: {
        workingDays: settings.workingDays,
        earliestDate: addDaysIso(todayIso(), settings.leadTimeDays),
        latestDate: addDaysIso(todayIso(), settings.bookingHorizonDays),
      },
    };
  },
);

/**
 * Public: a customer requests a slot.
 *
 * Creates the customer (or reuses an existing one matched on email), creates
 * the job as an `enquiry`, and claims the slot — all in one transaction, so two
 * people submitting the same slot simultaneously cannot both succeed.
 */
export const requestBooking = onCall(
  {
    region: REGION,
    cors: true,
    secrets: [RESEND_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
  },
  async (request) => {
    assertAppCheck(request);

    const payload = parseOrThrow(bookingRequestSchema, request.data);
    assertSlotMatchesType(payload.type, payload.slot);

    const settings = await getSettings();
    const earliest = addDaysIso(todayIso(), settings.leadTimeDays);
    const latest = addDaysIso(todayIso(), settings.bookingHorizonDays);

    if (payload.date < earliest) {
      throw new HttpsError('invalid-argument', `The earliest date we can take is ${formatLongDate(earliest)}.`);
    }
    if (payload.date > latest) {
      throw new HttpsError('invalid-argument', 'That date is too far ahead to book online.');
    }
    if (!settings.workingDays.includes(dayOfWeek(payload.date))) {
      throw new HttpsError('invalid-argument', "We don't work that day.");
    }

    const timestamp = nowIso();
    const jobRef = db.collection(COLLECTIONS.jobs).doc();

    const { customerId, customerIsNew } = await db.runTransaction(async (tx) => {
      // All reads first — Firestore transactions require it.
      const day = await readDayBooking(tx, payload.date);
      const existingCustomer = await tx.get(
        db.collection(COLLECTIONS.customers).where('email', '==', payload.email).limit(1),
      );

      const customerRef = existingCustomer.empty
        ? db.collection(COLLECTIONS.customers).doc()
        : existingCustomer.docs[0].ref;

      // Throws if the slot went while the customer was filling the form.
      claimSlotInTransaction(tx, day, payload.slot, jobRef.id);

      if (existingCustomer.empty) {
        const customer: Omit<Customer, 'id'> = {
          name: payload.name,
          phone: payload.phone,
          email: payload.email,
          address: payload.address,
          source: 'website',
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        tx.set(customerRef, customer);
      } else {
        // Returning customer: refresh contact details, keep their history.
        tx.set(
          customerRef,
          { name: payload.name, phone: payload.phone, address: payload.address, updatedAt: timestamp },
          { merge: true },
        );
      }

      const job: Omit<Job, 'id'> = {
        customerId: customerRef.id,
        type: payload.type,
        status: 'enquiry',
        date: payload.date,
        slot: payload.slot,
        address: payload.address,
        description: payload.description,
        photos: payload.photos ?? [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      tx.set(jobRef, job);

      return { customerId: customerRef.id, customerIsNew: existingCustomer.empty };
    });

    // Notifications happen after the transaction commits — never inside one.
    const email = bookingReceivedEmail({
      customerName: payload.name,
      date: payload.date,
      slot: payload.slot,
      description: payload.description,
    });

    await Promise.all([
      sendEmail({
        to: payload.email,
        subject: email.subject,
        html: email.html,
        template: 'booking-received',
        relatedTo: { jobId: jobRef.id, customerId },
      }),
      notifyTelegram(
        [
          `<b>New booking request</b>`,
          ``,
          `${escapeHtml(payload.name)}${customerIsNew ? '' : ' (returning)'}`,
          `${formatLongDate(payload.date)} — ${slotLabel(payload.slot)}`,
          `${escapeHtml(payload.address.line1)}, ${escapeHtml(payload.address.postcode)}`,
          `${escapeHtml(payload.phone)}`,
          ``,
          escapeHtml(payload.description.slice(0, 300)),
          ``,
          `${SITE_URL.value()}/app/jobs/${jobRef.id}`,
        ].join('\n'),
        { template: 'booking-alert', relatedTo: { jobId: jobRef.id, customerId } },
      ),
    ]);

    return { jobId: jobRef.id, date: payload.date, slot: payload.slot };
  },
);

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
 * `requestBooking` already claims slots transactionally, so this is not the
 * primary guard — it is what keeps the public calendar honest when a job is
 * cancelled, rescheduled or edited by hand in the CRM. It recomputes from the
 * jobs collection rather than patching, so the calendar cannot drift.
 */
export const onJobWrite = onDocumentWritten(
  { region: REGION, document: 'jobs/{jobId}' },
  async (event) => {
    const before = event.data?.before.data() as Job | undefined;
    const after = event.data?.after.data() as Job | undefined;

    const dates = new Set<string>();
    if (before?.date) dates.add(before.date);
    if (after?.date) dates.add(after.date);

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
