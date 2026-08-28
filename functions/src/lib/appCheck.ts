import { defineString } from 'firebase-functions/params';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/**
 * App Check enforcement is a runtime flag rather than a deploy-time function
 * option so the site still works before reCAPTCHA is configured — an
 * unconfigured App Check would otherwise take the booking form down entirely.
 *
 * Set ENFORCE_APP_CHECK=true once the reCAPTCHA v3 site key is in place.
 */
export const ENFORCE_APP_CHECK = defineString('ENFORCE_APP_CHECK', { default: 'false' });

export function assertAppCheck(request: CallableRequest<unknown>): void {
  if (ENFORCE_APP_CHECK.value() !== 'true') return;
  if (!request.app) {
    throw new HttpsError('failed-precondition', 'Request failed verification. Please reload and try again.');
  }
}
