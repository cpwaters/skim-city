#!/usr/bin/env node
/**
 * Grants (or revokes) the `admin` custom claim that gates the whole CRM.
 *
 *   npm run grant-admin -- chris@skimcity.co.uk
 *   npm run grant-admin -- chris@skimcity.co.uk --revoke
 *
 * Against the emulator, set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 first.
 * Against production you need credentials — either GOOGLE_APPLICATION_CREDENTIALS
 * pointing at a service-account JSON, or an active `gcloud auth application-default login`.
 *
 * The claim is what firestore.rules and every callable check. It cannot be set
 * from the browser, which is the whole point of doing it here.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'skimcity-bac3b';

const args = process.argv.slice(2);
const email = args.find((arg) => !arg.startsWith('--'));
const revoke = args.includes('--revoke');

if (!email) {
  console.error('Usage: npm run grant-admin -- <email> [--revoke]');
  process.exit(1);
}

const usingEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

initializeApp({
  projectId: PROJECT_ID,
  ...(usingEmulator ? {} : { credential: applicationDefault() }),
});

const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}), admin: !revoke };

  if (revoke) delete claims.admin;

  await auth.setCustomUserClaims(user.uid, claims);

  console.log(
    `${revoke ? 'Revoked' : 'Granted'} admin for ${email} (${user.uid})` +
      `${usingEmulator ? ' [emulator]' : ` on ${PROJECT_ID}`}`,
  );
  console.log('They must sign out and back in, or refresh the page, for it to take effect.');
} catch (error) {
  if (error.code === 'auth/user-not-found') {
    console.error(
      `No account for ${email}. Create it first — Firebase console → Authentication → Add user,\n` +
        'or sign in once at /app/login with a password you set there.',
    );
  } else {
    console.error('Failed:', error.message);
  }
  process.exit(1);
}
