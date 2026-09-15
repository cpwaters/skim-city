import { onCall } from 'firebase-functions/v2/https';
import { REGION } from '../lib/config';
import { getSettings } from '../lib/settings';

/**
 * Public: the business details the marketing site renders.
 *
 * Served as a callable so the public bundle never pulls in Firestore. The
 * marketing site already speaks to callables for the gallery and reviews, and
 * dragging the whole Firestore SDK in for a phone number would cost every
 * visitor who never opens the CRM.
 *
 * Only display values are returned. Rates, deposit percentage and working days
 * live in the same document but drive pricing and availability, and are nobody
 * else's business — so the fields are listed out rather than spread.
 */
export const getBusinessInfo = onCall({ region: REGION, cors: true }, async () => {
  const settings = await getSettings();

  return {
    name: settings.tradingName,
    email: settings.email,
    phone: settings.phone,
    coverageAreas: settings.coverageAreas,
    whatsappGreeting: settings.whatsappGreeting ?? null,
  };
});
