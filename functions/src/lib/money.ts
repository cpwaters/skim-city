import type { BusinessSettings, LineItem } from '../domain';

/**
 * All money is handled as integer pence. These helpers are the only place
 * rounding happens, and they always round half-up to the nearest penny.
 */

export function roundPence(value: number): number {
  return Math.round(value);
}

export function lineItemTotal(item: LineItem): number {
  return roundPence(item.quantity * item.unitPricePence);
}

export function subtotal(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + lineItemTotal(item), 0);
}

export interface Totals {
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
}

/**
 * VAT is only applied when Chris is actually VAT registered. Until then the
 * settings toggle keeps it at zero and invoices show no VAT line at all —
 * charging or displaying VAT while unregistered is an offence, not a cosmetic
 * detail.
 */
export function calculateTotals(items: LineItem[], settings: BusinessSettings): Totals {
  const sub = subtotal(items);
  const vat = settings.vatRegistered
    ? roundPence((sub * settings.vatRatePercent) / 100)
    : 0;
  return { subtotalPence: sub, vatPence: vat, totalPence: sub + vat };
}

export function calculateDeposit(totalPence: number, settings: BusinessSettings): number {
  return roundPence((totalPence * settings.depositPercent) / 100);
}

/** Formats pence as `£1,234.56` for emails and PDFs. */
export function formatMoney(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(pence / 100);
}
