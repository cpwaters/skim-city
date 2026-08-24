import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { where } from 'firebase/firestore';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { InvoiceStatusBadge, JobStatusBadge, QuoteStatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, Notice, Spinner } from '../../components/ui/States';
import { QuoteBuilder } from '../../components/app/QuoteBuilder';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { createInvoice, markJobComplete, requestReview, sendInvoice, updateJobStatus } from '../../lib/callables';
import {
  formatPhone,
  longDate,
  money,
  shortDate,
  slotLabel,
  whatsappLink,
} from '../../lib/format';
import type { BusinessSettings, Customer, Invoice, Job, Payment, Processor, Quote } from '../../types/domain';

/**
 * The spine of the CRM: everything about one job, and every action Chris takes
 * on it, in one screen he can drive one-handed from a scaffold.
 */
export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: job, loading, error } = useDocument<Job>('jobs', jobId);
  const { data: customer } = useDocument<Customer>('customers', job?.customerId);
  const { data: settings } = useDocument<BusinessSettings>('settings', 'business');

  const { data: quotes } = useCollection<Quote>(
    'quotes',
    jobId ? [where('jobId', '==', jobId)] : [],
    `job-quotes-${jobId}`,
  );
  const { data: invoices } = useCollection<Invoice>(
    'invoices',
    jobId ? [where('jobId', '==', jobId)] : [],
    `job-invoices-${jobId}`,
  );
  const { data: payments } = useCollection<Payment>(
    'payments',
    jobId ? [where('jobId', '==', jobId)] : [],
    `job-payments-${jobId}`,
  );

  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [processor, setProcessor] = useState<Processor>('square');

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;
  if (!job) return <ErrorState message="That job no longer exists." />;

  const acceptedQuote = quotes.find((quote) => quote.status === 'accepted');
  const collected = payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  const jobValue = job.valuePence ?? acceptedQuote?.totalPence ?? 0;
  const outstanding = Math.max(0, jobValue - collected);
  const hasBalanceInvoice = invoices.some((invoice) => invoice.kind === 'balance');

  async function run(label: string, action: () => Promise<string | void>) {
    setBusy(label);
    setActionError(null);
    setActionNote(null);

    try {
      const note = await action();
      if (note) setActionNote(note);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  const whatsappMessages = customer
    ? [
        {
          label: 'On my way',
          text: `Hi ${customer.name.split(' ')[0]}, it's Chris from Skim City — on my way to you now, see you shortly.`,
        },
        {
          label: 'Quote sent',
          text: `Hi ${customer.name.split(' ')[0]}, it's Chris from Skim City. I've just emailed your quote over — give me a shout if anything needs changing.`,
        },
        {
          label: 'Invoice due',
          text: `Hi ${customer.name.split(' ')[0]}, it's Chris from Skim City. Just a nudge about the invoice for your plastering — the payment link is in your email. Thanks!`,
        },
      ]
    : [];

  return (
    <>
      <Link to="/app/jobs" className="text-xs font-display uppercase tracking-[0.14em] text-smoke hover:text-bone">
        ← All jobs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mt-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="display text-2xl sm:text-3xl text-bone">{customer?.name ?? 'Unknown customer'}</h1>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="text-sm text-smoke">
            {longDate(job.date)} · {slotLabel(job.slot)} ·{' '}
            {job.type === 'full_day' ? 'Full day' : 'Repair'}
          </p>
        </div>

        {jobValue > 0 && (
          <div className="text-right">
            <p className="text-[0.6rem] font-display uppercase tracking-[0.16em] text-smoke-dim">Job value</p>
            <p className="display text-2xl text-city-500 tabular-nums">{money(jobValue)}</p>
            {outstanding > 0 && (
              <p className="text-xs text-smoke-dim mt-1">{money(outstanding)} outstanding</p>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <div className="mb-5">
          <Notice tone="error">{actionError}</Notice>
        </div>
      )}
      {actionNote && (
        <div className="mb-5">
          <Notice tone="success">{actionNote}</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="The job" />
            <div className="p-4 space-y-4">
              <p className="text-sm text-smoke leading-relaxed whitespace-pre-wrap">{job.description}</p>

              {job.address && (
                <div>
                  <p className="text-[0.6rem] font-display uppercase tracking-[0.16em] text-smoke-dim mb-1.5">
                    Address
                  </p>
                  <address className="text-sm text-bone not-italic leading-relaxed">
                    {job.address.line1}
                    {job.address.line2 && <>, {job.address.line2}</>}
                    <br />
                    {job.address.city}, {job.address.postcode}
                  </address>
                  <a
                    href={`https://maps.apple.com/?q=${encodeURIComponent(
                      `${job.address.line1}, ${job.address.postcode}`,
                    )}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-block mt-2 text-xs text-city-500 hover:text-city-600"
                  >
                    Open in maps →
                  </a>
                </div>
              )}

              {job.internalNotes && (
                <div className="border-l-2 border-noir-600 pl-3">
                  <p className="text-[0.6rem] font-display uppercase tracking-[0.16em] text-smoke-dim mb-1">
                    Your notes
                  </p>
                  <p className="text-sm text-smoke">{job.internalNotes}</p>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Quotes"
              action={
                !acceptedQuote && !quoting ? (
                  <button
                    onClick={() => setQuoting(true)}
                    className="text-xs font-display uppercase tracking-[0.12em] text-city-500 hover:text-city-600 cursor-pointer"
                  >
                    + New quote
                  </button>
                ) : null
              }
            />

            {quoting ? (
              <div className="p-4">
                <QuoteBuilder
                  jobId={job.id}
                  depositPercent={settings?.depositPercent ?? 20}
                  onDone={() => setQuoting(false)}
                />
              </div>
            ) : quotes.length === 0 ? (
              <EmptyState
                title="Not quoted yet"
                message="Price the job up and the customer gets an email with an accept-and-pay link."
                action={<Button size="sm" onClick={() => setQuoting(true)}>Build a quote</Button>}
              />
            ) : (
              <ul className="divide-y divide-noir-700">
                {quotes.map((quote) => (
                  <li key={quote.id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="text-sm text-bone">{quote.reference}</span>
                      <QuoteStatusBadge status={quote.status} />
                    </div>
                    <p className="text-xs text-smoke">
                      {money(quote.totalPence)} · deposit {money(quote.depositPence)} · expires{' '}
                      {shortDate(quote.expiresAt.slice(0, 10))}
                    </p>
                    {quote.status !== 'accepted' && quote.status !== 'declined' && (
                      <a
                        href={`/quote/${quote.publicToken}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-block mt-2 text-xs text-city-500 hover:text-city-600"
                      >
                        Open customer view →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Invoices" />
            {invoices.length === 0 ? (
              <EmptyState
                title="Nothing invoiced"
                message="The deposit invoice is raised automatically when the customer accepts their quote."
              />
            ) : (
              <ul className="divide-y divide-noir-700">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="text-sm text-bone">
                        {invoice.number}
                        <span className="text-smoke-dim text-xs ml-2">{invoice.kind}</span>
                      </span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                    <p className="text-xs text-smoke">
                      {money(invoice.totalPence)} · {invoice.processor === 'square' ? 'Square' : 'Stripe'} ·
                      due {shortDate(invoice.dueDate)}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {invoice.paymentUrl && (
                        <a
                          href={invoice.paymentUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-xs text-city-500 hover:text-city-600"
                        >
                          Payment page →
                        </a>
                      )}
                      {invoice.status !== 'paid' && invoice.status !== 'void' && (
                        <button
                          onClick={() =>
                            void run(`send-${invoice.id}`, async () => {
                              const result = await sendInvoice({ invoiceId: invoice.id });
                              return `Invoice ${invoice.number} emailed to ${result.sentTo}.`;
                            })
                          }
                          disabled={busy !== null}
                          className="text-xs text-city-500 hover:text-city-600 disabled:opacity-40 cursor-pointer"
                        >
                          {busy === `send-${invoice.id}` ? 'Sending…' : 'Email it again'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {payments.length > 0 && (
            <Card>
              <CardHeader title="Payments" />
              <ul className="divide-y divide-noir-700">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-bone tabular-nums">{money(payment.amountPence)}</p>
                      <p className="text-xs text-smoke-dim">
                        {shortDate(payment.receivedAt.slice(0, 10))} ·{' '}
                        {payment.processor === 'square' ? 'Square' : 'Stripe'}
                      </p>
                    </div>
                    <span className="text-[0.6rem] font-display uppercase tracking-[0.12em] text-[#5fd39a]">
                      Received
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {customer && (
            <Card>
              <CardHeader title="Customer" />
              <div className="p-4 space-y-3">
                <div>
                  <Link to={`/app/customers/${customer.id}`} className="text-sm text-bone hover:text-city-500">
                    {customer.name}
                  </Link>
                  <p className="text-xs text-smoke-dim mt-0.5">{customer.source}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <ButtonLink to={`tel:${customer.phone}`} size="sm" variant="secondary" full>
                    Call
                  </ButtonLink>
                  <ButtonLink to={whatsappLink(customer.phone)} size="sm" variant="secondary" full>
                    WhatsApp
                  </ButtonLink>
                </div>

                <p className="text-xs text-smoke break-all">
                  <a href={`mailto:${customer.email}`} className="hover:text-city-500">
                    {customer.email}
                  </a>
                  <br />
                  <a href={`tel:${customer.phone}`} className="hover:text-city-500">
                    {formatPhone(customer.phone)}
                  </a>
                </p>

                <div className="pt-3 border-t border-noir-700">
                  <p className="text-[0.6rem] font-display uppercase tracking-[0.16em] text-smoke-dim mb-2">
                    Quick WhatsApp
                  </p>
                  <div className="space-y-1.5">
                    {whatsappMessages.map((message) => (
                      <a
                        key={message.label}
                        href={whatsappLink(customer.phone, message.text)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block text-xs text-city-500 hover:text-city-600"
                      >
                        {message.label} →
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Actions" />
            <div className="p-4 space-y-3">
              {job.status !== 'completed' && job.status !== 'cancelled' && (
                <Button
                  full
                  size="sm"
                  loading={busy === 'complete'}
                  onClick={() =>
                    void run('complete', async () => {
                      await markJobComplete({ jobId: job.id });
                      return 'Marked complete. Raise the balance invoice when you are ready.';
                    })
                  }
                >
                  Mark complete
                </Button>
              )}

              {job.status === 'completed' && acceptedQuote && !hasBalanceInvoice && outstanding > 0 && (
                <>
                  <div>
                    <p className="text-[0.6rem] font-display uppercase tracking-[0.16em] text-smoke-dim mb-2">
                      Raise balance with
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['square', 'stripe'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setProcessor(option)}
                          aria-pressed={processor === option}
                          className={[
                            'px-3 py-2 rounded-[2px] border text-[0.65rem] font-display uppercase tracking-[0.12em] transition-colors cursor-pointer',
                            processor === option
                              ? 'border-city-500 bg-city-900/40 text-city-500'
                              : 'border-noir-600 text-smoke hover:border-city-700',
                          ].join(' ')}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    full
                    size="sm"
                    loading={busy === 'balance'}
                    onClick={() =>
                      void run('balance', async () => {
                        const invoice = await createInvoice({ jobId: job.id, kind: 'balance', processor });
                        await sendInvoice({ invoiceId: invoice.invoiceId });
                        return `Balance invoice ${invoice.number} for ${money(invoice.totalPence)} sent.`;
                      })
                    }
                  >
                    Invoice {money(outstanding)} balance
                  </Button>
                </>
              )}

              {job.status === 'completed' && (
                <Button
                  full
                  size="sm"
                  variant="secondary"
                  loading={busy === 'review'}
                  onClick={() =>
                    void run('review', async () => {
                      const result = await requestReview({ jobId: job.id });
                      return `Review request emailed to ${result.sentTo}.`;
                    })
                  }
                >
                  Ask for a review
                </Button>
              )}

              {job.status !== 'cancelled' && (
                <Button
                  full
                  size="sm"
                  variant="ghost"
                  loading={busy === 'cancel'}
                  onClick={() => {
                    if (!window.confirm('Cancel this job? The slot goes back on the public calendar.')) return;
                    void run('cancel', async () => {
                      await updateJobStatus({ jobId: job.id, status: 'cancelled' });
                      return 'Job cancelled and the slot released.';
                    });
                  }}
                >
                  Cancel job
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
