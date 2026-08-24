import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import type { Response } from 'firebase-functions/v1';
import {
  REGION,
  RESEND_API_KEY,
  SQUARE_ACCESS_TOKEN,
  SQUARE_LOCATION_ID,
  SQUARE_WEBHOOK_SIGNATURE_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} from '../lib/config';
import { squareAdapter } from './square';
import { stripeAdapter } from './stripe';
import { applyPaymentEvent } from './apply';
import { WebhookConfigError, WebhookSignatureError, type PaymentAdapter } from './processor';

/**
 * Square verifies the signature against the exact notification URL registered
 * in the developer dashboard, so it has to be configured rather than inferred —
 * a proxy rewriting the Host header would silently break verification.
 */
const SQUARE_WEBHOOK_URL = defineString('SQUARE_WEBHOOK_URL', { default: '' });

/**
 * Shared webhook handling for both processors.
 *
 * The status code is the whole point of this function, because it decides
 * whether the processor retries:
 *
 *   400 — we verified and rejected it, or could not validate it at all. The
 *         payload is not ours; retrying would never help.
 *   500 — a signing secret is missing, or processing genuinely failed. Retry
 *         is exactly what we want, so the payment is not lost.
 *
 * Getting these the wrong way round is expensive in both directions: a 500 on a
 * forged payload invites an endless retry loop, and a 400 on a misconfigured
 * deploy silently discards real money.
 *
 * Both handlers read `req.rawBody`, never `req.body` — signature verification
 * runs over the exact bytes the processor sent, and a JSON body parser would
 * re-serialise the payload and break every signature.
 */
async function handleWebhook(
  adapter: PaymentAdapter,
  rawBody: string,
  headers: Record<string, string | undefined>,
  notificationUrl: string,
  res: Response,
): Promise<void> {
  const name = adapter.name;

  let event;
  try {
    ({ event } = await adapter.verifyAndParseWebhook(rawBody, headers, notificationUrl));
  } catch (error) {
    if (error instanceof WebhookConfigError) {
      console.error(`${name} webhook NOT VERIFIED — misconfiguration:`, error.message);
      res.status(500).send('Webhook verification not configured');
      return;
    }

    const message =
      error instanceof WebhookSignatureError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'unparseable payload';

    console.error(`${name} webhook rejected:`, message);
    res.status(400).send('Invalid signature');
    return;
  }

  // Verified. Anything failing from here is our problem, so let it retry.
  try {
    if (event) await applyPaymentEvent(event);
    res.status(200).send('ok');
  } catch (error) {
    console.error(`${name} webhook processing failed`, error);
    res.status(500).send('Webhook processing failed');
  }
}

export const squareWebhook = onRequest(
  {
    region: REGION,
    secrets: [
      SQUARE_ACCESS_TOKEN,
      SQUARE_LOCATION_ID,
      SQUARE_WEBHOOK_SIGNATURE_KEY,
      RESEND_API_KEY,
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID,
    ],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    await handleWebhook(
      squareAdapter,
      req.rawBody?.toString('utf8') ?? '',
      req.headers as Record<string, string | undefined>,
      SQUARE_WEBHOOK_URL.value() || `https://${req.headers.host}${req.originalUrl ?? req.url}`,
      res,
    );
  },
);

export const stripeWebhook = onRequest(
  {
    region: REGION,
    secrets: [
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET,
      RESEND_API_KEY,
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID,
    ],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    await handleWebhook(
      stripeAdapter,
      req.rawBody?.toString('utf8') ?? '',
      req.headers as Record<string, string | undefined>,
      '',
      res,
    );
  },
);
