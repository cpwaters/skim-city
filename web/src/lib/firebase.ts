import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

/**
 * Public-site Firebase surface: the app handle and callable functions, nothing
 * more.
 *
 * Auth, Firestore and Storage are deliberately NOT imported here. They are only
 * needed by the CRM, and pulling them in at this level would drag the whole SDK
 * into the marketing bundle that every customer downloads. See firebase-crm.ts.
 *
 * The web config is public by design — it identifies the project, it does not
 * authorise anything. Access control lives in firestore.rules and in the admin
 * claim checks inside Cloud Functions.
 */
const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(config);

/** Must match the region the functions are deployed to (functions/src/lib/config.ts). */
export const FUNCTIONS_REGION = 'europe-west2';

export const USE_EMULATORS =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true';

export const functions = getFunctions(app, FUNCTIONS_REGION);

if (USE_EMULATORS) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
