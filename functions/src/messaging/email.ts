import { Resend } from 'resend';
import { BUSINESS_EMAIL, FROM_EMAIL, RESEND_API_KEY } from '../lib/config';
import { logMessage } from './log';
import type { MessageLogEntry } from '../domain';

/**
 * Transactional email via Resend.
 *
 * Sends from FROM_EMAIL, which must sit on a domain verified in Resend —
 * quote.skimcity.co.uk, not the apex. That subdomain only sends, so replies
 * default to BUSINESS_EMAIL: a customer answering a quote reaches Chris's real
 * inbox rather than a mailbox that does not exist.
 *
 * Like Telegram, a delivery failure is logged rather than thrown: a customer's
 * payment must not be rolled back because a receipt bounced.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  template: string;
  relatedTo?: MessageLogEntry['relatedTo'];
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = RESEND_API_KEY.value();

  if (!apiKey) {
    console.warn(`Resend not configured — skipping "${params.template}" to ${params.to}`);
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL.value(),
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo ?? BUSINESS_EMAIL,
    });

    if (error) throw new Error(error.message);

    await logMessage({
      channel: 'email',
      template: params.template,
      to: params.to,
      subject: params.subject,
      status: 'sent',
      ...(params.relatedTo ? { relatedTo: params.relatedTo } : {}),
    });
    return true;
  } catch (error) {
    console.error(`Email "${params.template}" to ${params.to} failed`, error);
    await logMessage({
      channel: 'email',
      template: params.template,
      to: params.to,
      subject: params.subject,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      ...(params.relatedTo ? { relatedTo: params.relatedTo } : {}),
    });
    return false;
  }
}
