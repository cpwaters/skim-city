import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../lib/config';
import { logMessage } from './log';
import type { MessageLogEntry } from '../domain';

/**
 * Operational alerts to Chris's phone: new booking, quote accepted, payment
 * received, tomorrow's schedule.
 *
 * Notifications must never break the business action that triggered them, so
 * every failure here is logged and swallowed. A payment webhook that succeeded
 * should not return 500 because Telegram was briefly down — Stripe would then
 * retry a payment we have already recorded.
 */
export async function notifyTelegram(
  text: string,
  options: { template: string; relatedTo?: MessageLogEntry['relatedTo'] },
): Promise<void> {
  const token = TELEGRAM_BOT_TOKEN.value();
  const chatId = TELEGRAM_CHAT_ID.value();

  if (!token || !chatId) {
    console.warn('Telegram not configured — skipping notification');
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram ${response.status}: ${body}`);
    }

    await logMessage({
      channel: 'telegram',
      template: options.template,
      to: chatId,
      status: 'sent',
      ...(options.relatedTo ? { relatedTo: options.relatedTo } : {}),
    });
  } catch (error) {
    console.error('Telegram notification failed', error);
    await logMessage({
      channel: 'telegram',
      template: options.template,
      to: chatId ?? 'unknown',
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      ...(options.relatedTo ? { relatedTo: options.relatedTo } : {}),
    });
  }
}
