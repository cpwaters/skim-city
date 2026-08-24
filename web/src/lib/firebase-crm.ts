import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { USE_EMULATORS, app } from './firebase';

/**
 * CRM-only Firebase services.
 *
 * Every importer of this module sits behind a React.lazy() boundary in App.tsx,
 * so Auth, Firestore and Storage are only fetched once Chris opens /app —
 * customers browsing the marketing site never download them.
 */
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  console.info('Firebase: connected to local emulators');
}
