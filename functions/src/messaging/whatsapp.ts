/**
 * WhatsApp is click-to-chat, not an API integration.
 *
 * The CRM builds a wa.me deep link with the message pre-filled and Chris sends
 * it from his own WhatsApp on 07876308681. This keeps his existing number and
 * chat history, needs no Meta business verification or template approval, and
 * costs nothing per message. If volume ever justifies the Cloud API, the call
 * sites already funnel through this one helper.
 */

/** Converts a UK number in any common format to E.164 digits (447876308681). */
export function toE164UK(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('44')) return digits;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return `44${digits}`;
}

export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${toE164UK(phone)}?text=${encodeURIComponent(message)}`;
}
