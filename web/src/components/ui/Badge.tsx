import type { ReactNode } from 'react';
import type { InvoiceStatus, JobStatus, QuoteStatus } from '../../types/domain';
import { INVOICE_STATUS_LABELS, JOB_STATUS_LABELS, QUOTE_STATUS_LABELS } from '../../lib/format';

type Tone = 'neutral' | 'blue' | 'maroon' | 'green' | 'amber';

const TONES: Record<Tone, string> = {
  neutral: 'bg-noir-700 text-smoke border-noir-600',
  blue: 'bg-city-900/60 text-city-500 border-city-700',
  maroon: 'bg-maroon-900/70 text-[#e08a97] border-maroon-500',
  green: 'bg-moss-900 text-moss-500 border-moss-700',
  amber: 'bg-[#33270c] text-[#e0b055] border-[#6b5320]',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[2px] border text-[0.65rem] font-display uppercase tracking-[0.12em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const JOB_TONES: Record<JobStatus, Tone> = {
  enquiry: 'amber',
  quoted: 'blue',
  confirmed: 'green',
  in_progress: 'blue',
  completed: 'neutral',
  cancelled: 'maroon',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_TONES[status]}>{JOB_STATUS_LABELS[status]}</Badge>;
}

const QUOTE_TONES: Record<QuoteStatus, Tone> = {
  draft: 'neutral',
  sent: 'blue',
  accepted: 'green',
  declined: 'maroon',
  expired: 'maroon',
  cancelled: 'neutral',
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Badge tone={QUOTE_TONES[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>;
}

const INVOICE_TONES: Record<InvoiceStatus, Tone> = {
  draft: 'neutral',
  sent: 'blue',
  partially_paid: 'amber',
  paid: 'green',
  overdue: 'maroon',
  void: 'neutral',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={INVOICE_TONES[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>;
}
