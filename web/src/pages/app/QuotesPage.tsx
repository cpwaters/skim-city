import { useState } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { PageTitle } from '../../components/app/PageTitle';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { QuoteStatusBadge } from '../../components/ui/Badge';
import { EmptyState, Notice, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { cancelQuote, deleteQuote } from '../../lib/callables';
import { money, shortDate, todayIso } from '../../lib/format';
import type { Customer, Quote, QuoteStatus } from '../../types/domain';

const FILTERS: Array<{ value: QuoteStatus | 'all' | 'live'; label: string }> = [
  { value: 'live', label: 'Live' },
  { value: 'draft', label: 'Drafts' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

/** Still out with the customer and worth chasing. */
const LIVE_STATUSES: QuoteStatus[] = ['draft', 'sent'];

export function QuotesPage() {
  const { data: quotes, loading } = useCollection<Quote>('quotes', [orderBy('createdAt', 'desc')], 'quotes-all');
  const { data: customers } = useCollection<Customer>('customers', [], 'quotes-customers');

  const [filter, setFilter] = useState<QuoteStatus | 'all' | 'live'>('live');
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name ?? '—';
  const today = todayIso();

  const outstanding = quotes
    .filter((quote) => quote.status === 'sent' && quote.expiresAt >= today)
    .reduce((sum, quote) => sum + quote.totalPence, 0);

  const visible = quotes.filter((quote) =>
    filter === 'all' ? true : filter === 'live' ? LIVE_STATUSES.includes(quote.status) : quote.status === filter,
  );

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setFlash(null);
    try {
      setFlash({ tone: 'success', message: await action() });
    } catch (cause) {
      setFlash({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'That did not work.',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageTitle
        title="Quotes"
        subtitle={`${money(outstanding)} out with customers and still live`}
        action={<ButtonLink to="/app/quotes/new">New quote</ButtonLink>}
      />

      {flash && <Notice tone={flash.tone}>{flash.message}</Notice>}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-5">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={[
              'shrink-0 px-3 py-2 rounded-[2px] border text-[0.65rem] font-display uppercase tracking-[0.12em] transition-colors cursor-pointer',
              filter === option.value
                ? 'border-city-500 bg-city-900/40 text-city-500'
                : 'border-noir-700 text-smoke hover:text-bone hover:border-noir-600',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={filter === 'cancelled' ? 'Nothing cancelled' : 'No quotes here'}
            message={
              filter === 'cancelled'
                ? 'Quotes you cancel show up here, and can be deleted once nothing has been paid against them.'
                : 'Start one from here when you are at the job, or build one from an existing job.'
            }
          />
        ) : (
          <ul className="divide-y divide-noir-700">
            {visible.map((quote) => {
              // A quote past its date is expired in effect even if the stored
              // status still says "sent" — the sweep only runs on a schedule.
              const expired = quote.status === 'sent' && quote.expiresAt < today;
              const cancellable = LIVE_STATUSES.includes(quote.status) || quote.status === 'accepted';

              return (
                <li key={quote.id} className="px-4 py-3.5">
                  <div className="flex items-center gap-4">
                    <Link to={`/app/jobs/${quote.jobId}`} className="min-w-0 flex-1 group">
                      <p className="text-sm text-bone truncate group-hover:text-city-500 transition-colors">
                        {customerName(quote.customerId)}
                      </p>
                      <p className="text-xs text-smoke">
                        {quote.reference} · {shortDate(quote.createdAt.slice(0, 10))}
                        {quote.status === 'sent' && (
                          <> · {expired ? 'expired' : `valid to ${shortDate(quote.expiresAt.slice(0, 10))}`}</>
                        )}
                        {quote.invoiceNumber && <> · invoiced {quote.invoiceNumber}</>}
                      </p>
                    </Link>

                    <p className="text-sm text-bone tabular-nums shrink-0 hidden sm:block">
                      {money(quote.totalPence)}
                    </p>

                    <div className="shrink-0">
                      <QuoteStatusBadge status={expired ? 'expired' : quote.status} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 mt-2">
                    {cancellable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `cancel-${quote.id}`}
                        disabled={busy !== null}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Cancel ${quote.reference}? If anything has been paid against it, a refund request is raised for you to approve.`,
                            )
                          )
                            return;
                          void run(`cancel-${quote.id}`, async () => {
                            const result = await cancelQuote({ quoteId: quote.id });
                            return result.refundsRaised > 0
                              ? `${quote.reference} cancelled. ${result.refundsRaised} refund request${result.refundsRaised === 1 ? '' : 's'} raised — approve on the job.`
                              : `${quote.reference} cancelled.`;
                          });
                        }}
                      >
                        Cancel
                      </Button>
                    )}

                    {quote.status === 'cancelled' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `delete-${quote.id}`}
                        disabled={busy !== null}
                        onClick={() => {
                          if (!window.confirm(`Delete ${quote.reference} for good? This cannot be undone.`)) return;
                          void run(`delete-${quote.id}`, async () => {
                            await deleteQuote({ quoteId: quote.id });
                            return `${quote.reference} deleted.`;
                          });
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
