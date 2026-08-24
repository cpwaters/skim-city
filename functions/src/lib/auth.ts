import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/**
 * Every CRM callable goes through here. The check is on the `admin` custom
 * claim rather than an email address: claims are minted server-side by
 * scripts/grant-admin.mjs and cannot be set by a signed-in client.
 */
export function assertAdmin(request: CallableRequest<unknown>): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
  return request.auth.uid;
}
