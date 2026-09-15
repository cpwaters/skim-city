import type { Instalment, Invoice } from '../types/domain';

/**
 * Reading an invoice without caring which shape it is.
 *
 * An invoice bills a job once and collects it in one or two instalments. Records
 * raised before instalments existed are one-invoice-per-collection with the kind
 * at the top level; they are deliberately not migrated, because the number on an
 * invoice a customer has already paid must not change. These helpers present
 * both the same way so the CRM has one code path.
 */

export function readInstalments(invoice: Invoice): Instalment[] {
  if (invoice.instalments?.length) return invoice.instalments;

  return [
    {
      id: invoice.kind ?? 'full',
      kind: invoice.kind ?? 'full',
      amountPence: invoice.totalPence,
      amountPaidPence: invoice.amountPaidPence,
      status:
        invoice.status === 'void'
          ? 'void'
          : invoice.status === 'paid'
            ? 'paid'
            : invoice.sentAt || invoice.paymentUrl
              ? 'sent'
              : 'pending',
      processorInvoiceId: invoice.processorInvoiceId ?? null,
      paymentUrl: invoice.paymentUrl ?? null,
      dueDate: invoice.dueDate,
      sentAt: invoice.sentAt ?? null,
      paidAt: invoice.paidAt ?? null,
    },
  ];
}

/** The instalment currently being asked for, if any is outstanding. */
export function dueInstalment(invoice: Invoice): Instalment | undefined {
  return readInstalments(invoice).find(
    (instalment) => instalment.status === 'sent' && instalment.amountPaidPence < instalment.amountPence,
  );
}

/** A balance sitting on the invoice that has not been billed yet. */
export function pendingBalance(invoice: Invoice): Instalment | undefined {
  return invoice.instalments?.find(
    (instalment) => instalment.kind === 'balance' && instalment.status === 'pending',
  );
}

export function outstandingPence(invoice: Invoice): number {
  if (invoice.status === 'void') return 0;
  return Math.max(0, invoice.totalPence - invoice.amountPaidPence);
}

/** `deposit + balance`, or `full` — what the invoice's collections look like. */
export function instalmentSummary(invoice: Invoice): string {
  return readInstalments(invoice)
    .map((instalment) => instalment.kind)
    .join(' + ');
}
