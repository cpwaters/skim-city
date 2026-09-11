import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { PageTitle, StatTile } from '../../components/app/PageTitle';
import { Card } from '../../components/ui/Card';
import { EmptyState, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { money, moneyShort, shortDate, todayIso } from '../../lib/format';
import type { Customer, Invoice, Payment } from '../../types/domain';

export function PaymentsPage() {
  const { data: payments, loading } = useCollection<Payment>(
    'payments',
    [orderBy('receivedAt', 'desc')],
    'payments-all',
  );
  const { data: invoices } = useCollection<Invoice>('invoices', [], 'payments-invoices');
  const { data: customers } = useCollection<Customer>('customers', [], 'payments-customers');

  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const totals = useMemo(() => {
    const month = payments
      .filter((payment) => payment.receivedAt >= monthStart)
      .reduce((sum, payment) => sum + payment.amountPence, 0);
    const year = payments
      .filter((payment) => payment.receivedAt >= yearStart)
      .reduce((sum, payment) => sum + payment.amountPence, 0);
    const all = payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    return { month, year, all };
  }, [payments, monthStart, yearStart]);

  function describe(payment: Payment) {
    const invoice = invoices.find((candidate) => candidate.id === payment.invoiceId);
    const customer = customers.find((candidate) => candidate.id === invoice?.customerId);
    return { invoice, customer };
  }

  return (
    <>
      <PageTitle title="Payments" subtitle="Every payment recorded from Stripe" />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatTile label="This month" value={moneyShort(totals.month)} tone="blue" />
        <StatTile label="This year" value={moneyShort(totals.year)} />
        <StatTile label="All time" value={moneyShort(totals.all)} />
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            message="Payments land here automatically the moment Stripe confirms them — nothing to enter by hand."
          />
        ) : (
          <ul className="divide-y divide-noir-700">
            {payments.map((payment) => {
              const { invoice, customer } = describe(payment);
              return (
                <li key={payment.id}>
                  <Link
                    to={`/app/jobs/${payment.jobId}`}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-noir-850 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-bone truncate">{customer?.name ?? 'Unknown customer'}</p>
                      <p className="text-xs text-smoke">
                        {invoice?.number ?? '—'} · {shortDate(payment.receivedAt.slice(0, 10))} ·{' '}
                        Stripe
                      </p>
                    </div>
                    <p className="text-sm text-[#5fd39a] tabular-nums shrink-0">
                      +{money(payment.amountPence)}
                    </p>
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
