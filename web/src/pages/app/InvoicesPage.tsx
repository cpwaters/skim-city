import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { PageTitle, StatTile } from '../../components/app/PageTitle';
import { Card } from '../../components/ui/Card';
import { InvoiceStatusBadge } from '../../components/ui/Badge';
import { EmptyState, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { money, moneyShort, shortDate } from '../../lib/format';
import type { Customer, Invoice, InvoiceStatus } from '../../types/domain';
import { instalmentSummary } from '../../lib/invoices';

const FILTERS: Array<{ value: InvoiceStatus | 'all' | 'open'; label: string }> = [
  { value: 'open', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
];

const OPEN: InvoiceStatus[] = ['draft', 'sent', 'partially_paid', 'overdue'];

export function InvoicesPage() {
  const [filter, setFilter] = useState<InvoiceStatus | 'all' | 'open'>('open');
  const { data: invoices, loading } = useCollection<Invoice>(
    'invoices',
    [orderBy('createdAt', 'desc')],
    'invoices-all',
  );
  const { data: customers } = useCollection<Customer>('customers', [], 'invoices-customers');

  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name ?? '—';

  const visible = useMemo(
    () =>
      invoices.filter((invoice) =>
        filter === 'all' ? true : filter === 'open' ? OPEN.includes(invoice.status) : invoice.status === filter,
      ),
    [invoices, filter],
  );

  const outstanding = invoices
    .filter((invoice) => OPEN.includes(invoice.status))
    .reduce((sum, invoice) => sum + (invoice.totalPence - invoice.amountPaidPence), 0);
  const overdue = invoices
    .filter((invoice) => invoice.status === 'overdue')
    .reduce((sum, invoice) => sum + (invoice.totalPence - invoice.amountPaidPence), 0);
  const paidTotal = invoices.reduce((sum, invoice) => sum + invoice.amountPaidPence, 0);

  return (
    <>
      <PageTitle title="Invoices" />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatTile label="Outstanding" value={moneyShort(outstanding)} tone={outstanding ? 'blue' : 'default'} />
        <StatTile label="Overdue" value={moneyShort(overdue)} tone={overdue ? 'maroon' : 'default'} />
        <StatTile label="Collected" value={moneyShort(paidTotal)} />
      </div>

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
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
            title="Nothing to show"
            message="Invoices raised against a job appear here, with their payment status kept up to date by Stripe."
          />
        ) : (
          <ul className="divide-y divide-noir-700">
            {visible.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  to={`/app/jobs/${invoice.jobId}`}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-noir-850 transition-colors"
                >
                  <div className="w-20 shrink-0">
                    <p className="text-xs text-bone">{invoice.number}</p>
                    <p className="text-[0.6rem] text-smoke-dim uppercase tracking-[0.1em]">{instalmentSummary(invoice)}</p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-bone truncate">{customerName(invoice.customerId)}</p>
                    <p className="text-xs text-smoke">
                      Due {shortDate(invoice.dueDate)} · Stripe
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm text-bone tabular-nums">{money(invoice.totalPence)}</p>
                    {invoice.amountPaidPence > 0 && invoice.amountPaidPence < invoice.totalPence && (
                      <p className="text-[0.65rem] text-smoke-dim tabular-nums">
                        {money(invoice.amountPaidPence)} paid
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 hidden sm:block">
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
