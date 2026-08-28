import { poundsToPence } from './format';
import type { LineItem } from '../types/domain';

/**
 * The priced lines of a quote, before they become LineItems.
 *
 * Kept out of the component so the quote builder on a job and the on-site
 * new-quote form price work identically — a line typed at the door and a line
 * typed at the kitchen table must produce the same pence.
 */
export interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
}

export const BLANK_LINE: LineDraft = { description: '', quantity: '1', unitPrice: '' };

/**
 * Drops incomplete rows and converts pounds to integer pence.
 *
 * Prices are typed in pounds and stored in pence — the whole backend works in
 * pence, and letting pounds through as floats is how a quote ends up a penny
 * out from its own line items.
 */
export function toLineItems(rows: LineDraft[]): LineItem[] {
  return rows
    .filter((row) => row.description.trim() && row.unitPrice.trim())
    .map((row) => ({
      description: row.description.trim(),
      quantity: Number(row.quantity) || 1,
      unitPricePence: poundsToPence(row.unitPrice),
    }));
}

export function lineItemsTotal(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPricePence), 0);
}
