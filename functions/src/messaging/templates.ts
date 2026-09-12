import { BUSINESS_EMAIL, BUSINESS_PHONE, TAGLINE } from '../lib/config';
import { formatMoney } from '../lib/money';
import { formatLongDate } from '../lib/dates';
import type { Invoice, JobSlot, LineItem, Quote } from '../domain';

/**
 * Email HTML is deliberately table-based with inline styles — Outlook and
 * Gmail strip <style> blocks and ignore flex/grid. The noir header carries the
 * brand; the body stays light so it is readable in every client and when
 * printed.
 */

const NOIR = '#08090B';
const CITY_BLUE = '#6CABDD';
const MAROON = '#7A1F2B';
const BONE = '#F2F4F7';
const INK = '#1A1F27';
const SMOKE = '#5C6673';

export function baseTemplate(options: {
  preheader: string;
  heading: string;
  body: string;
  cta?: { label: string; url: string };
}): string {
  const { preheader, heading, body, cta } = options;

  const ctaBlock = cta
    ? `<tr><td style="padding:8px 32px 32px 32px;">
         <a href="${cta.url}" style="display:inline-block;background:${CITY_BLUE};color:${NOIR};
            font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:.08em;
            text-transform:uppercase;text-decoration:none;padding:15px 30px;border-radius:2px;">
           ${cta.label}
         </a>
       </td></tr>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${NOIR};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NOIR};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

    <tr><td style="background:${NOIR};padding:28px 32px 22px 32px;border-bottom:3px solid ${CITY_BLUE};">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:28px;font-weight:800;
                  letter-spacing:.16em;color:${BONE};text-transform:uppercase;">SKIM&nbsp;CITY</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:.14em;
                  color:${CITY_BLUE};text-transform:uppercase;margin-top:8px;">${TAGLINE}</div>
    </td></tr>

    <tr><td style="background:${BONE};padding:32px 32px 8px 32px;">
      <h1 style="margin:0 0 18px 0;font-family:Helvetica,Arial,sans-serif;font-size:21px;
                 font-weight:700;color:${INK};letter-spacing:-.01em;">${escapeHtml(heading)}</h1>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK};">
        ${body}
      </div>
    </td></tr>

    <tr><td style="background:${BONE};">${ctaBlock ? `<table role="presentation" width="100%">${ctaBlock}</table>` : '<div style="height:24px"></div>'}</td></tr>

    <tr><td style="background:${NOIR};padding:24px 32px;border-top:2px solid ${MAROON};">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:${SMOKE};">
        <strong style="color:${BONE};">Skim City</strong> &middot; Plastering &amp; rendering, Manchester<br>
        <a href="tel:${BUSINESS_PHONE}" style="color:${CITY_BLUE};text-decoration:none;">${formatPhone(BUSINESS_PHONE)}</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:${BUSINESS_EMAIL}" style="color:${CITY_BLUE};text-decoration:none;">${BUSINESS_EMAIL}</a>
      </div>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}

export function lineItemsTable(items: LineItem[], totals: {
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  vatRatePercent: number;
  showVat: boolean;
}): string {
  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #D8DEE6;font-size:14px;">
          ${escapeHtml(item.description)}
          ${item.quantity !== 1 ? `<span style="color:${SMOKE};"> &times; ${item.quantity}</span>` : ''}
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #D8DEE6;font-size:14px;white-space:nowrap;">
          ${formatMoney(Math.round(item.quantity * item.unitPricePence))}
        </td>
      </tr>`,
    )
    .join('');

  const vatRow = totals.showVat
    ? `<tr><td style="padding:6px 0;font-size:14px;color:${SMOKE};">VAT @ ${totals.vatRatePercent}%</td>
       <td align="right" style="padding:6px 0;font-size:14px;">${formatMoney(totals.vatPence)}</td></tr>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="font-family:Helvetica,Arial,sans-serif;margin:20px 0;">
    ${rows}
    <tr><td style="padding:12px 0 6px 0;font-size:14px;color:${SMOKE};">Subtotal</td>
        <td align="right" style="padding:12px 0 6px 0;font-size:14px;">${formatMoney(totals.subtotalPence)}</td></tr>
    ${vatRow}
    <tr><td style="padding:10px 0;border-top:2px solid ${INK};font-size:16px;font-weight:700;">Total</td>
        <td align="right" style="padding:10px 0;border-top:2px solid ${INK};font-size:16px;font-weight:700;">
          ${formatMoney(totals.totalPence)}</td></tr>
  </table>`;
}

export function slotLabel(slot: JobSlot): string {
  if (slot === 'full') return 'Full day';
  if (slot === 'am') return 'Morning (AM)';
  return 'Afternoon (PM)';
}

export function quoteEmail(params: {
  customerName: string;
  quote: Quote;
  quoteUrl: string;
  jobDate: string;
  slot: JobSlot;
  vatRatePercent: number;
  showVat: boolean;
}): { subject: string; html: string } {
  const { quote } = params;
  return {
    subject: `Your quote from Skim City — ${formatMoney(quote.totalPence)}`,
    html: baseTemplate({
      preheader: `${formatMoney(quote.totalPence)} for ${formatLongDate(params.jobDate)}. Valid until ${formatLongDate(quote.expiresAt.slice(0, 10))}.`,
      heading: `Your quote is ready`,
      body: `
        <p style="margin:0 0 4px 0;">Hi ${escapeHtml(firstName(params.customerName))}, here's the price for the work we discussed.</p>
        <p style="margin:0 0 8px 0;color:${SMOKE};font-size:14px;">
          ${formatLongDate(params.jobDate)} &middot; ${slotLabel(params.slot)} &middot; Ref ${escapeHtml(quote.reference)}
        </p>
        ${lineItemsTable(quote.lineItems, {
          subtotalPence: quote.subtotalPence,
          vatPence: quote.vatPence,
          totalPence: quote.totalPence,
          vatRatePercent: params.vatRatePercent,
          showVat: params.showVat,
        })}
        <p style="margin:0 0 16px 0;padding:14px 16px;background:#E7EDF4;border-left:3px solid ${CITY_BLUE};">
          To lock in the date, accept the quote and pay a deposit of
          <strong>${formatMoney(quote.depositPence)}</strong>. The balance is due on completion.
        </p>
        ${quote.notes ? `<p style="margin:0 0 16px 0;color:${SMOKE};font-size:14px;">${escapeHtml(quote.notes)}</p>` : ''}
        <p style="margin:0;color:${SMOKE};font-size:14px;">
          This quote is valid until ${formatLongDate(quote.expiresAt.slice(0, 10))}.
        </p>`,
      cta: { label: 'View & accept quote', url: params.quoteUrl },
    }),
  };
}

export function invoiceEmail(params: {
  customerName: string;
  invoice: Invoice;
  vatRatePercent: number;
  showVat: boolean;
}): { subject: string; html: string } {
  const { invoice } = params;
  const kindLabel =
    invoice.kind === 'deposit' ? 'Deposit invoice' : invoice.kind === 'balance' ? 'Balance due' : 'Invoice';

  return {
    subject: `${kindLabel} ${invoice.number} — ${formatMoney(invoice.totalPence)}`,
    html: baseTemplate({
      preheader: `${formatMoney(invoice.totalPence)} due by ${formatLongDate(invoice.dueDate)}.`,
      heading: `${kindLabel} ${escapeHtml(invoice.number)}`,
      body: `
        <p style="margin:0 0 4px 0;">Hi ${escapeHtml(firstName(params.customerName))}, here's your invoice.</p>
        <p style="margin:0 0 8px 0;color:${SMOKE};font-size:14px;">Due by ${formatLongDate(invoice.dueDate)}</p>
        ${lineItemsTable(invoice.lineItems, {
          subtotalPence: invoice.subtotalPence,
          vatPence: invoice.vatPence,
          totalPence: invoice.totalPence,
          vatRatePercent: params.vatRatePercent,
          showVat: params.showVat,
        })}
        <p style="margin:0;color:${SMOKE};font-size:14px;">
          Card payment is handled securely by Stripe.
          We never see or store your card details.
        </p>`,
      ...(invoice.paymentUrl ? { cta: { label: 'Pay now', url: invoice.paymentUrl } } : {}),
    }),
  };
}

export function reviewRequestEmail(params: {
  customerName: string;
  reviewUrl: string;
  jobDate: string;
}): { subject: string; html: string } {
  return {
    subject: 'How did we do?',
    html: baseTemplate({
      preheader: 'Two minutes to leave a review of your plastering.',
      heading: `How did we do?`,
      body: `
        <p style="margin:0 0 16px 0;">
          Hi ${escapeHtml(firstName(params.customerName))}, thanks again for having us out on
          ${formatLongDate(params.jobDate)}.
        </p>
        <p style="margin:0 0 16px 0;">
          We're a small outfit and word of mouth is most of how we get work, so if you've a
          spare two minutes we'd really appreciate a quick review. Good or bad — we'd rather
          know either way.
        </p>
        <p style="margin:0;color:${SMOKE};font-size:14px;">
          Your review goes on our website with your first name and area only, never your full
          name or address.
        </p>`,
      cta: { label: 'Leave a review', url: params.reviewUrl },
    }),
  };
}

export function paymentReceiptEmail(params: {
  customerName: string;
  invoice: Invoice;
  amountPence: number;
  outstandingPence: number;
}): { subject: string; html: string } {
  const settled = params.outstandingPence <= 0;
  return {
    subject: `Payment received — ${formatMoney(params.amountPence)} (${params.invoice.number})`,
    html: baseTemplate({
      preheader: `Thanks — we've received ${formatMoney(params.amountPence)}.`,
      heading: 'Payment received — thank you',
      body: `
        <p style="margin:0 0 16px 0;">
          Hi ${escapeHtml(firstName(params.customerName))}, we've received
          <strong>${formatMoney(params.amountPence)}</strong> against invoice
          ${escapeHtml(params.invoice.number)}.
        </p>
        ${
          settled
            ? `<p style="margin:0 0 16px 0;padding:14px 16px;background:#E7EDF4;border-left:3px solid ${CITY_BLUE};">
                 That settles this invoice in full. Nothing further to pay.</p>`
            : `<p style="margin:0 0 16px 0;padding:14px 16px;background:#F6ECEE;border-left:3px solid ${MAROON};">
                 Outstanding balance: <strong>${formatMoney(params.outstandingPence)}</strong>.</p>`
        }
        <p style="margin:0;color:${SMOKE};font-size:14px;">Keep this email as your receipt.</p>`,
    }),
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function formatPhone(phone: string): string {
  return phone.replace(/^(\d{5})(\d{6})$/, '$1 $2');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
