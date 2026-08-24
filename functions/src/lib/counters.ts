import { COLLECTIONS, db } from './firebase';

/**
 * Allocates the next sequential invoice number (`SC-0001`).
 *
 * Runs in a transaction because two invoices raised in the same second must
 * never share a number — HMRC expects invoice numbers to be unique and
 * sequential, and a duplicate is a real accounting problem, not a cosmetic one.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const ref = db.collection(COLLECTIONS.counters).doc('invoices');

  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data()?.value as number) ?? 0) : 0;
    const value = current + 1;
    tx.set(ref, { value, updatedAt: new Date().toISOString() }, { merge: true });
    return value;
  });

  return `SC-${String(next).padStart(4, '0')}`;
}
