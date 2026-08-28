import { COLLECTIONS, db } from './firebase';

/**
 * Sequential, human-facing document numbers.
 *
 * Runs in a transaction because two documents raised in the same second must
 * never share a number — HMRC expects invoice numbers to be unique and
 * sequential, and a duplicate is a real accounting problem, not a cosmetic one.
 * Quotes use the same machinery so the two sets of paperwork read alike.
 */
async function nextNumber(counterId: string, prefix: string): Promise<string> {
  const ref = db.collection(COLLECTIONS.counters).doc(counterId);

  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data()?.value as number) ?? 0) : 0;
    const value = current + 1;
    tx.set(ref, { value, updatedAt: new Date().toISOString() }, { merge: true });
    return value;
  });

  return format(prefix, next);
}

function format(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(4, '0')}`;
}

/** Allocates the next invoice number (`SC-0001`). */
export function nextInvoiceNumber(): Promise<string> {
  return nextNumber('invoices', 'SC');
}

/** Allocates the next quote number (`Q-0001`). */
export function nextQuoteNumber(): Promise<string> {
  return nextNumber('quotes', 'Q');
}

/**
 * The number the next quote WOULD get, without consuming it.
 *
 * Only ever used to show a number on the quote form before it is saved. It is
 * a preview, not a reservation: the real number is allocated transactionally
 * on save, so a quote started and abandoned leaves no gap in the sequence.
 */
export async function peekNextQuoteNumber(): Promise<string> {
  const snap = await db.collection(COLLECTIONS.counters).doc('quotes').get();
  const current = snap.exists ? ((snap.data()?.value as number) ?? 0) : 0;
  return format('Q', current + 1);
}
