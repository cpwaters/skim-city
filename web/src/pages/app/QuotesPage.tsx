import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { PageTitle } from '../../components/app/PageTitle';
import { Card } from '../../components/ui/Card';
import { QuoteStatusBadge } from '../../components/ui/Badge';
import { EmptyState, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { money, shortDate, todayIso } from '../../lib/format';
import type { Customer, Quote } from '../../types/domain';

export function QuotesPage() {
  const { data: quotes, loading } = useCollection<Quote>('quotes', [orderBy('createdAt', 'desc')], 'quotes-all');
  const { data: customers } = useCollection<Customer>('customers', [], 'quotes-customers');

  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name ?? '—';
  const today = todayIso();

  const outstanding = quotes
    .filter((quote) => quote.status === 'sent' && quote.expiresAt >= today)
    .reduce((sum, quote) => sum + quote.totalPence, 0);

  return (
    <>
      <PageTitle title="Quotes" subtitle={`${money(outstanding)} out with customers and still live`} />

      <Card>
        {loading ? (
          <Spinner />
        ) : quotes.length === 0 ? (
          <EmptyState
            title="No quotes yet"
            message="Build a quote from any job and it turns up here."
          />
        ) : (
          <ul className="divide-y divide-noir-700">
            {quotes.map((quote) => {
              // A quote past its date is expired in effect even if the stored
              // status still says "sent" — the sweep only runs on a schedule.
              const expired = quote.status === 'sent' && quote.expiresAt < today;

              return (
                <li key={quote.id}>
                  <Link
                    to={`/app/jobs/${quote.jobId}`}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-noir-850 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-bone truncate">{customerName(quote.customerId)}</p>
                      <p className="text-xs text-smoke">
                        {quote.reference} · {shortDate(quote.createdAt.slice(0, 10))}
                        {quote.status === 'sent' && (
                          <> · {expired ? 'expired' : `valid to ${shortDate(quote.expiresAt.slice(0, 10))}`}</>
                        )}
                      </p>
                    </div>

                    <p className="text-sm text-bone tabular-nums shrink-0 hidden sm:block">
                      {money(quote.totalPence)}
                    </p>

                    <div className="shrink-0">
                      <QuoteStatusBadge status={expired ? 'expired' : quote.status} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
