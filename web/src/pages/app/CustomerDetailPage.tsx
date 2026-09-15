import { Link, useParams } from 'react-router-dom';
import { where } from 'firebase/firestore';
import { Card, CardHeader } from '../../components/ui/Card';
import { ButtonLink } from '../../components/ui/Button';
import { InvoiceStatusBadge, JobStatusBadge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States';
import { StatTile } from '../../components/app/PageTitle';
import { useCollection, useDocument } from '../../hooks/useFirestore';
import { formatPhone, money, moneyShort, shortDate, slotLabel, whatsappLink } from '../../lib/format';
import type { Customer, Invoice, Job } from '../../types/domain';
import { instalmentSummary } from '../../lib/invoices';

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { data: customer, loading, error } = useDocument<Customer>('customers', customerId);

  const { data: jobs } = useCollection<Job>(
    'jobs',
    customerId ? [where('customerId', '==', customerId)] : [],
    `customer-jobs-${customerId}`,
  );
  const { data: invoices } = useCollection<Invoice>(
    'invoices',
    customerId ? [where('customerId', '==', customerId)] : [],
    `customer-invoices-${customerId}`,
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;
  if (!customer) return <ErrorState message="That customer no longer exists." />;

  const lifetime = invoices.reduce((sum, invoice) => sum + invoice.amountPaidPence, 0);
  const outstanding = invoices
    .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void')
    .reduce((sum, invoice) => sum + (invoice.totalPence - invoice.amountPaidPence), 0);

  return (
    <>
      <Link to="/app/customers" className="text-xs font-display uppercase tracking-[0.14em] text-smoke hover:text-bone">
        ← All customers
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="display text-2xl sm:text-3xl text-bone mb-2">{customer.name}</h1>
        <p className="text-sm text-smoke">
          <a href={`tel:${customer.phone}`} className="hover:text-city-500">
            {formatPhone(customer.phone)}
          </a>
          {' · '}
          <a href={`mailto:${customer.email}`} className="hover:text-city-500 break-all">
            {customer.email}
          </a>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <ButtonLink to={`tel:${customer.phone}`} size="sm" variant="secondary">
          Call
        </ButtonLink>
        <ButtonLink to={whatsappLink(customer.phone)} size="sm" variant="secondary">
          WhatsApp
        </ButtonLink>
        <ButtonLink to={`mailto:${customer.email}`} size="sm" variant="ghost">
          Email
        </ButtonLink>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatTile label="Jobs" value={String(jobs.length)} />
        <StatTile label="Paid to date" value={moneyShort(lifetime)} />
        <StatTile label="Outstanding" value={moneyShort(outstanding)} tone={outstanding ? 'maroon' : 'default'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader title="Jobs" />
          {jobs.length === 0 ? (
            <EmptyState title="No jobs yet" message="Nothing booked for this customer." />
          ) : (
            <ul className="divide-y divide-noir-700">
              {[...jobs]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/app/jobs/${job.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-noir-850 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-bone">{shortDate(job.date)}</p>
                        <p className="text-xs text-smoke truncate">
                          {slotLabel(job.slot)} · {job.description}
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
          <CardHeader title="Invoices" />
          {invoices.length === 0 ? (
            <EmptyState title="No invoices" message="Nothing has been invoiced to this customer." />
          ) : (
            <ul className="divide-y divide-noir-700">
              {[...invoices]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div>
                      <p className="text-sm text-bone">{invoice.number}</p>
                      <p className="text-xs text-smoke tabular-nums">
                        {money(invoice.totalPence)} · {instalmentSummary(invoice)}
                      </p>
                    </div>
                    <InvoiceStatusBadge status={invoice.status} />
                  </li>
                ))}
            </ul>
          )}
        </Card>

        {customer.address && (
          <Card>
            <CardHeader title="Address" />
            <address className="p-4 text-sm text-smoke not-italic leading-relaxed">
              {customer.address.line1}
              {customer.address.line2 && <>, {customer.address.line2}</>}
              <br />
              {customer.address.city}
              <br />
              {customer.address.postcode}
            </address>
          </Card>
        )}
      </div>
    </>
  );
}
