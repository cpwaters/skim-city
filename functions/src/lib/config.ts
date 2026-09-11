import { defineSecret, defineString } from 'firebase-functions/params';

/**
 * London region for everything. Must match the Firestore location of
 * skimcity-bac3b — a Firestore location is permanent once set, so if the
 * project was created elsewhere, change this to match rather than the reverse.
 */
export const REGION = 'europe-west2';

export const TIMEZONE = 'Europe/London';

export const CURRENCY = 'GBP';

/** Secrets. Set with: firebase functions:secrets:set NAME */
export const SQUARE_ACCESS_TOKEN = defineSecret('SQUARE_ACCESS_TOKEN');
export const SQUARE_LOCATION_ID = defineSecret('SQUARE_LOCATION_ID');
export const SQUARE_WEBHOOK_SIGNATURE_KEY = defineSecret('SQUARE_WEBHOOK_SIGNATURE_KEY');
export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
export const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
export const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
export const TELEGRAM_CHAT_ID = defineSecret('TELEGRAM_CHAT_ID');

/** Non-secret config. Set in .env / functions config or left at the default. */
export const SITE_URL = defineString('SITE_URL', { default: 'https://skimcity.co.uk' });
export const SQUARE_ENVIRONMENT = defineString('SQUARE_ENVIRONMENT', { default: 'sandbox' });
export const FROM_EMAIL = defineString('FROM_EMAIL', { default: 'Skim City <chris@skimcity.co.uk>' });

export const BUSINESS_PHONE = '07464848570';
export const BUSINESS_EMAIL = 'chris@skimcity.co.uk';
export const TAGLINE = 'Taking the rough to the smooth';
