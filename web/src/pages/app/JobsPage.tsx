import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { PageTitle } from '../../components/app/PageTitle';
import { Card } from '../../components/ui/Card';
import { JobStatusBadge } from '../../components/ui/Badge';
import { EmptyState, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { JOB_STATUS_LABELS, money, shortDate, slotLabel } from '../../lib/format';
import type { Customer, Job, JobStatus } from '../../types/domain';

const FILTERS: Array<{ value: JobStatus | 'all' | 'open'; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'enquiry', label: 'Enquiries' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
];

const OPEN_STATUSES: JobStatus[] = ['enquiry', 'quoted', 'confirmed', 'in_progress'];

export function JobsPage() {
  const [filter, setFilter] = useState<JobStatus | 'all' | 'open'>('open');
  const [search, setSearch] = useState('');

  const { data: jobs, loading } = useCollection<Job>('jobs', [orderBy('date', 'desc')], 'jobs-all');
  const { data: customers } = useCollection<Customer>('customers', [], 'jobs-customers');

  const customerFor = (id: string) => customers.find((customer) => customer.id === id);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'open'
            ? OPEN_STATUSES.includes(job.status)
            : job.status === filter;

      if (!matchesFilter) return false;
      if (!term) return true;

      const customer = customerFor(job.customerId);
      return [
        customer?.name,
        customer?.phone,
        customer?.email,
        job.address?.line1,
        job.address?.postcode,
        job.description,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(term));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, customers, filter, search]);

  return (
    <>
      <PageTitle title="Jobs" subtitle={`${visible.length} shown`} />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
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

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, postcode, job…"
          aria-label="Search jobs"
          className="flex-1 bg-noir-900 border border-noir-600 rounded-[2px] px-3 py-2 text-sm text-bone placeholder:text-smoke-dim focus:border-city-700"
        />
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No jobs here"
            message={
              search
                ? 'Nothing matches that search. Try a postcode or surname.'
                : 'Jobs booked through the website will land here automatically.'
            }
          />
        ) : (
          <ul className="divide-y divide-noir-700">
            {visible.map((job) => {
              const customer = customerFor(job.customerId);
              return (
                <li key={job.id}>
                  <Link
                    to={`/app/jobs/${job.id}`}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-noir-850 transition-colors"
                  >
                    <div className="w-16 shrink-0">
                      <p className="text-xs text-bone tabular-nums">{shortDate(job.date).slice(4)}</p>
                      <p className="text-[0.6rem] text-smoke-dim uppercase tracking-[0.1em]">
                        {slotLabel(job.slot)}
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-bone truncate">{customer?.name ?? 'Unknown customer'}</p>
                      <p className="text-xs text-smoke truncate">
                        {job.address ? `${job.address.line1}, ${job.address.postcode}` : job.description}
                      </p>
                    </div>

                    <div className="hidden sm:block text-right shrink-0">
                      {job.valuePence ? (
                        <p className="text-sm text-city-500 tabular-nums">{money(job.valuePence)}</p>
                      ) : (
                        <p className="text-xs text-smoke-dim">{JOB_STATUS_LABELS[job.status]}</p>
                      )}
                    </div>

                    <div className="shrink-0">
                      <JobStatusBadge status={job.status} />
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
