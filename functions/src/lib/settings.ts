import { COLLECTIONS, db } from './firebase';
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from '../domain';

/**
 * Reads `settings/business`, merged over the defaults so a partially
 * populated settings doc can never leave a required field undefined.
 */
export async function getSettings(): Promise<BusinessSettings> {
  const snap = await db.collection(COLLECTIONS.settings).doc('business').get();
  if (!snap.exists) return { ...DEFAULT_BUSINESS_SETTINGS };
  return { ...DEFAULT_BUSINESS_SETTINGS, ...(snap.data() as Partial<BusinessSettings>) };
}
