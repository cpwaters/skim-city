import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const storage = getStorage();
export { FieldValue, Timestamp };

/** Collection names in one place so a typo fails at compile time, not runtime. */
export const COLLECTIONS = {
  customers: 'customers',
  jobs: 'jobs',
  quotes: 'quotes',
  invoices: 'invoices',
  payments: 'payments',
  availability: 'availability',
  dayBookings: 'dayBookings',
  settings: 'settings',
  counters: 'counters',
  messageLog: 'messageLog',
  refundRequests: 'refundRequests',
  galleryItems: 'galleryItems',
  reviews: 'reviews',
} as const;
