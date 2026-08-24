import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { PageTitle } from '../../components/app/PageTitle';
import { Card } from '../../components/ui/Card';
import { EmptyState, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { formatPhone, initials } from '../../lib/format';
import type { Customer, Job } from '../../types/domain';

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const { data: customers, loading } = useCollection<Customer>('customers', [orderBy('name')], 'customers-all');
  const { data: jobs } = useCollection<Job>('jobs', [], 'customers-jobs');

  const jobCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of jobs) {
      counts.set(job.customerId, (counts.get(job.customerId) ?? 0) + 1);
    }
    return counts;
  }, [jobs]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone, customer.address?.postcode]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(term)),
    );
  }, [customers, search]);

  return (
    <>
      <PageTitle title="Customers" subtitle={`${customers.length} on the books`} />

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search name, email, postcode…"
        aria-label="Search customers"
        className="w-full mb-5 bg-noir-900 border border-noir-600 rounded-[2px] px-3 py-2 text-sm text-bone placeholder:text-smoke-dim focus:border-city-700"
      />

      <Card>
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Nobody here yet"
            message="Customers are created automatically the first time someone books through the website."
          />
        ) : (
          <ul className="divide-y divide-noir-700">
            {visible.map((customer) => (
              <li key={customer.id}>
                <Link
                  to={`/app/customers/${customer.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-noir-850 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className="grid place-items-center size-9 shrink-0 rounded-[2px] bg-noir-700 text-city-500 text-xs font-display tracking-wider"
                  >
                    {initials(customer.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-bone truncate">{customer.name}</p>
                    <p className="text-xs text-smoke truncate">
                      {formatPhone(customer.phone)} · {customer.address?.postcode ?? customer.email}
                    </p>
                  </div>
                  <span className="text-xs text-smoke-dim shrink-0">
                    {jobCount.get(customer.id) ?? 0} job{(jobCount.get(customer.id) ?? 0) === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
