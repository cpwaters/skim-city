import { Link } from 'react-router-dom';
import { orderBy, where } from 'firebase/firestore';
import { PageTitle, StatTile } from '../../components/app/PageTitle';
import { Card, CardHeader } from '../../components/ui/Card';
import { ButtonLink } from '../../components/ui/Button';
import { JobStatusBadge } from '../../components/ui/Badge';
import { EmptyState, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { addDays, longDate, money, moneyShort, relativeDay, shortDate, slotLabel, todayIso } from '../../lib/format';
import type { Customer, Invoice, Job, Payment } from '../../types/domain';

export function DashboardPage() {
  const today = todayIso();
  const tomorrow = addDays(today, 1);
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: jobs, loading: jobsLoading } = useCollection<Job>(
    'jobs',
    [where('date', '>=', today), where('date', '<=', tomorrow)],
    `dashboard-jobs-${today}`,
  );

  const { data: enquiries } = useCollection<Job>(
    'jobs',
    [where('status', '==', 'enquiry')],
    'dashboard-enquiries',
  );

  const { data: openInvoices } = useCollection<Invoice>(
    'invoices',
    [where('status', 'in', ['sent', 'partially_paid', 'overdue'])],
    'dashboard-open-invoices',
  );

  const { data: payments } = useCollection<Payment>(
    'payments',
    [orderBy('receivedAt', 'desc')],
    'dashboard-payments',
  );

  const { data: customers } = useCollection<Customer>('customers', [], 'dashboard-customers');
  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name ?? '—';

  const outstanding = openInvoices.reduce(
    (sum, invoice) => sum + (invoice.totalPence - invoice.amountPaidPence),
    0,
  );
  const overdueCount = openInvoices.filter((invoice) => invoice.status === 'overdue').length;
  const monthRevenue = payments
    .filter((payment) => payment.receivedAt >= monthStart)
    .reduce((sum, payment) => sum + payment.amountPence, 0);

  const sortedJobs = [...jobs]
    .filter((job) => job.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));

  return (
    <>
      <PageTitle
        title="Today"
        subtitle={longDate(today)}
        action={
          <ButtonLink to="/app/diary" variant="secondary" size="sm">
            Open diary
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <StatTile label="New enquiries" value={String(enquiries.length)} tone={enquiries.length ? 'blue' : 'default'} hint="Waiting on a quote" />
        <StatTile label="Outstanding" value={moneyShort(outstanding)} tone={outstanding ? 'blue' : 'default'} hint={`${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}`} />
        <StatTile label="Overdue" value={String(overdueCount)} tone={overdueCount ? 'maroon' : 'default'} hint="Past the due date" />
        <StatTile label="Taken this month" value={moneyShort(monthRevenue)} hint="Payments received" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Next two days"
            action={
              <Link to="/app/jobs" className="text-xs text-city-500 hover:text-city-600">
                All jobs →
              </Link>
            }
          />
          {jobsLoading ? (
            <Spinner />
          ) : sortedJobs.length === 0 ? (
            <EmptyState
              title="Nothing booked"
              message="No confirmed work today or tomorrow. A good day to chase quotes."
            />
          ) : (
            <ul className="divide-y divide-noir-700">
              {sortedJobs.map((job) => (
                <li key={job.id}>
                  <Link to={`/app/jobs/${job.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-noir-850 transition-colors">
                    <div className="text-center shrink-0 w-14">
                      <p className="text-[0.6rem] font-display uppercase tracking-[0.12em] text-city-500">
                        {relativeDay(job.date) ?? shortDate(job.date).slice(0, 3)}
                      </p>
                      <p className="text-[0.65rem] text-smoke-dim mt-0.5">{slotLabel(job.slot)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-bone truncate">{customerName(job.customerId)}</p>
                      <p className="text-xs text-smoke truncate">
                        {job.address ? `${job.address.line1}, ${job.address.postcode}` : job.description}
                      </p>
                    </div>
                    <JobStatusBadge status={job.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent payments"
            action={
              <Link to="/app/payments" className="text-xs text-city-500 hover:text-city-600">
                All →
              </Link>
            }
          />
          {payments.length === 0 ? (
            <EmptyState title="No payments yet" message="Money received will show up here as soon as it lands." />
          ) : (
            <ul className="divide-y divide-noir-700">
              {payments.slice(0, 6).map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm text-bone">{money(payment.amountPence)}</p>
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
          )}
        </Card>

        {enquiries.length > 0 && (
          <Card className="lg:col-span-2" accent>
            <CardHeader title={`${enquiries.length} enquiry waiting`} />
            <ul className="divide-y divide-noir-700">
              {enquiries.map((job) => (
                <li key={job.id}>
                  <Link to={`/app/jobs/${job.id}`} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-noir-850 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm text-bone truncate">{customerName(job.customerId)}</p>
                      <p className="text-xs text-smoke truncate">
                        {shortDate(job.date)} · {slotLabel(job.slot)} · {job.description}
                      </p>
                    </div>
                    <span className="text-xs text-city-500 shrink-0 font-display uppercase tracking-[0.12em]">
                      Quote it →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
