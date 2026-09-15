import { addDaysIso, todayIso } from '../lib/dates';
import type { Instalment, Invoice, InvoiceKind, InvoiceStatus } from '../domain';

/**
 * Instalment handling, and the bridge back to invoices raised before it existed.
 *
 * An invoice bills a job once, for the agreed figure. How that figure is
 * collected — one payment or a deposit plus a balance — is an instalment
 * detail. Everything downstream (receipts, the CRM, the webhook) reads the
 * instalments rather than counting invoices, so a job has exactly one number
 * and one outstanding figure however the money arrives.
 *
 * Invoices written before this existed have no `instalments` array and carry a
 * top-level `kind`, `processorInvoiceId` and `paymentUrl`. Those records are
 * not migrated — a number on an invoice a customer has already paid must not
 * change — so `readInstalments` presents them as a single instalment and the
 * rest of the code never has to branch on which shape it is looking at.
 */

/** The deposit-then-balance split, or a single collection when there is no deposit. */
export function buildInstalments(params: {
  totalPence: number;
  depositPence: number;
  dueDate: string;
}): Instalment[] {
  const { totalPence, depositPence, dueDate } = params;

  if (depositPence <= 0 || depositPence >= totalPence) {
    return [blank('full', totalPence, dueDate)];
  }

  return [
    // The deposit falls due on acceptance; the balance only once the work is done.
    blank('deposit', depositPence, todayIso()),
    blank('balance', totalPence - depositPence, dueDate),
  ];
}

function blank(kind: InvoiceKind, amountPence: number, dueDate: string): Instalment {
  return {
    id: kind,
    kind,
    amountPence,
    amountPaidPence: 0,
    status: 'pending',
    processorInvoiceId: null,
    paymentUrl: null,
    dueDate,
    sentAt: null,
    paidAt: null,
  };
}

/**
 * The invoice's instalments, synthesising one for a legacy invoice.
 *
 * Never returns an empty array, so callers can treat every invoice the same.
 */
export function readInstalments(invoice: Invoice): Instalment[] {
  if (invoice.instalments?.length) return invoice.instalments;

  return [
    {
      id: invoice.kind ?? 'full',
      kind: invoice.kind ?? 'full',
      amountPence: invoice.totalPence,
      amountPaidPence: invoice.amountPaidPence,
      status: legacyInstalmentStatus(invoice),
      processorInvoiceId: invoice.processorInvoiceId ?? null,
      paymentUrl: invoice.paymentUrl ?? null,
      dueDate: invoice.dueDate,
      sentAt: invoice.sentAt ?? null,
      paidAt: invoice.paidAt ?? null,
    },
  ];
}

function legacyInstalmentStatus(invoice: Invoice): Instalment['status'] {
  if (invoice.status === 'void') return 'void';
  if (invoice.status === 'paid') return 'paid';
  if (invoice.sentAt || invoice.paymentUrl) return 'sent';
  return 'pending';
}

/** Whether this invoice uses the instalment shape rather than the legacy one. */
export function hasInstalments(invoice: Invoice): boolean {
  return Boolean(invoice.instalments?.length);
}

export function findInstalment(invoice: Invoice, id: InvoiceKind): Instalment | undefined {
  return readInstalments(invoice).find((instalment) => instalment.id === id);
}

/** The instalment a processor invoice id belongs to, for an incoming webhook. */
export function instalmentForProcessorInvoice(
  invoice: Invoice,
  processorInvoiceId: string,
): Instalment | undefined {
  return readInstalments(invoice).find(
    (instalment) => instalment.processorInvoiceId === processorInvoiceId,
  );
}

/** Every processor invoice id on the invoice, for the array-contains lookup. */
export function processorInvoiceIds(instalments: Instalment[]): string[] {
  return instalments
    .map((instalment) => instalment.processorInvoiceId)
    .filter((id): id is string => Boolean(id));
}

export function collectedPence(instalments: Instalment[]): number {
  return instalments
    .filter((instalment) => instalment.status !== 'void')
    .reduce((sum, instalment) => sum + instalment.amountPaidPence, 0);
}

/**
 * The invoice's status, derived from its instalments.
 *
 * Billed in full and collected in full is `paid`; anything collected but not
 * all of it is `partially_paid` — which is exactly what a deposit-paid job is,
 * and is the state the old two-invoice model could not express.
 */
export function deriveInvoiceStatus(
  invoice: Invoice,
  instalments: Instalment[],
  today = todayIso(),
): InvoiceStatus {
  if (invoice.status === 'void') return 'void';

  const live = instalments.filter((instalment) => instalment.status !== 'void');
  if (live.length === 0) return 'void';

  const collected = collectedPence(live);
  const billed = live.reduce((sum, instalment) => sum + instalment.amountPence, 0);

  if (collected >= billed) return 'paid';
  if (collected > 0) return 'partially_paid';

  const anySent = live.some((instalment) => instalment.status === 'sent');
  if (!anySent) return 'draft';

  const overdue = live.some(
    (instalment) =>
      instalment.status === 'sent' && instalment.dueDate != null && instalment.dueDate < today,
  );

  return overdue ? 'overdue' : 'sent';
}

/** Default due date for an instalment raised today. */
export function defaultDueDate(termsDays: number): string {
  return addDaysIso(todayIso(), termsDays);
}
