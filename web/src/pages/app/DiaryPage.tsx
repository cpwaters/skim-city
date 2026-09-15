import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { where } from 'firebase/firestore';
import { PageTitle } from '../../components/app/PageTitle';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { JobStatusBadge } from '../../components/ui/Badge';
import { Notice } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { blockDay } from '../../lib/callables';
import { dayOfWeek, longDate, money, slotLabel, todayIso } from '../../lib/format';
import type { Availability, Customer, Job } from '../../types/domain';

/**
 * The month diary.
 *
 * Reads jobs directly rather than the `availability` projection, because Chris
 * needs to see *who* is booked, not just that something is. The public
 * calendar's booleans are derived from the same jobs by the onJobWrite trigger.
 */
export function DiaryPage() {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [selected, setSelected] = useState<string | null>(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;

  const { data: jobs } = useCollection<Job>(
    'jobs',
    [where('date', '>=', monthStart), where('date', '<=', monthEnd)],
    `diary-jobs-${month}`,
  );

  const { data: availability } = useCollection<Availability>(
    'availability',
    [where('date', '>=', monthStart), where('date', '<=', monthEnd)],
    `diary-availability-${month}`,
  );

  const { data: customers } = useCollection<Customer>('customers', [], 'diary-customers');
  const customerName = (id: string) => customers.find((customer) => customer.id === id)?.name ?? '—';

  const activeJobs = useMemo(() => jobs.filter((job) => job.status !== 'cancelled'), [jobs]);
  const byDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of activeJobs) {
      // A multi-day job appears on every day it holds. `date` alone is the
      // fallback for jobs written before spans existed.
      for (const date of job.dates ?? [job.date]) {
        map.set(date, [...(map.get(date) ?? []), job]);
      }
    }
    return map;
  }, [activeJobs]);

  const blockedDates = useMemo(
    () => new Set(availability.filter((day) => day.blocked).map((day) => day.date)),
    [availability],
  );

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const selectedJobs = selected ? (byDate.get(selected) ?? []) : [];
  const selectedBlocked = selected ? blockedDates.has(selected) : false;

  async function toggleBlocked() {
    if (!selected) return;
    setBusy(true);
    setError(null);

    try {
      await blockDay({ date: selected, blocked: !selectedBlocked });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not update that day.');
    } finally {
      setBusy(false);
    }
  }

  const monthValue = money(
    activeJobs.reduce((sum, job) => sum + (job.valuePence ?? 0), 0),
  );

  return (
    <>
      <PageTitle title="Diary" subtitle={`${monthLabel(month)} · ${activeJobs.length} job${activeJobs.length === 1 ? '' : 's'} · ${monthValue} booked`} />

      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
        <Card>
          <div className="flex items-center justify-between px-4 py-3 border-b border-noir-700">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="p-2 -ml-2 text-smoke hover:text-bone cursor-pointer"
              aria-label="Previous month"
            >
              ←
            </button>
            <h2 className="display text-sm tracking-[0.14em] text-bone">{monthLabel(month)}</h2>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="p-2 -mr-2 text-smoke hover:text-bone cursor-pointer"
              aria-label="Next month"
            >
              →
            </button>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                <div key={label} className="text-center text-[0.55rem] font-display uppercase tracking-[0.14em] text-smoke-dim py-1">
                  {label.slice(0, 1)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.map((date, index) =>
                date === null ? (
                  <div key={`blank-${index}`} />
                ) : (
                  <DayCell
                    key={date}
                    date={date}
                    jobs={byDate.get(date) ?? []}
                    blocked={blockedDates.has(date)}
                    isToday={date === todayIso()}
                    selected={date === selected}
                    onSelect={() => setSelected(date)}
                  />
                ),
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="px-4 py-3 border-b border-noir-700">
            <h2 className="display text-sm tracking-[0.14em] text-bone">
              {selected ? longDate(selected) : 'Pick a day'}
            </h2>
          </div>

          <div className="p-4 space-y-4">
            {selectedBlocked && (
              <Notice tone="info">This day is blocked out and hidden from the public calendar.</Notice>
            )}

            {selectedJobs.length === 0 ? (
              <p className="text-sm text-smoke">
                {selectedBlocked ? 'No work booked.' : 'Nothing booked — the day is open.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {selectedJobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/app/jobs/${job.id}`}
                      className="block border border-noir-700 rounded-[2px] p-3 hover:border-city-700 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[0.6rem] font-display uppercase tracking-[0.14em] text-city-500">
                          {slotLabel(job.slot)}
                        </span>
                        <JobStatusBadge status={job.status} />
                      </div>
                      <p className="text-sm text-bone">{customerName(job.customerId)}</p>
                      <p className="text-xs text-smoke mt-0.5">
                        {job.address ? `${job.address.line1}, ${job.address.postcode}` : '—'}
                      </p>
                      {job.valuePence ? (
                        <p className="text-xs text-city-500 mt-1.5 tabular-nums">{money(job.valuePence)}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {selected && (
              <Button
                variant={selectedBlocked ? 'secondary' : 'ghost'}
                size="sm"
                full
                loading={busy}
                onClick={() => void toggleBlocked()}
              >
                {selectedBlocked ? 'Unblock this day' : 'Block this day off'}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function DayCell({
  date,
  jobs,
  blocked,
  isToday,
  selected,
  onSelect,
}: {
  date: string;
  jobs: Job[];
  blocked: boolean;
  isToday: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const isWeekend = dayOfWeek(date) === 0;
  const hasFullDay = jobs.some((job) => job.slot === 'full');
  const booked = jobs.length > 0;

  // Booked outranks blocked: the two together are contradictory and rare, and
  // when they do collide the job is the fact worth seeing. Selection outranks
  // everything, or you cannot tell what you have tapped.
  const tone = selected
    ? 'bg-city-500 text-noir-900'
    : booked
      ? 'bg-moss-900 text-bone hover:bg-moss-700'
      : blocked
        ? 'bg-maroon-900/40 text-smoke-dim'
        : isWeekend
          ? 'bg-noir-900 text-smoke-dim'
          : 'bg-noir-850 text-bone hover:bg-noir-700';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${date}, ${jobs.length} job${jobs.length === 1 ? '' : 's'}${blocked ? ', blocked' : ''}`}
      className={[
        'aspect-square p-1 rounded-[2px] flex flex-col items-center justify-start transition-colors cursor-pointer',
        tone,
      ].join(' ')}
    >
      <span className={`text-xs leading-tight mt-1 ${isToday && !selected ? 'text-city-500 font-semibold' : ''}`}>
        {Number(date.slice(8))}
      </span>

      <span className="flex gap-0.5 mt-1" aria-hidden="true">
        {hasFullDay ? (
          <span className={`h-1 w-5 rounded-full ${selected ? 'bg-noir-900' : 'bg-moss-500'}`} />
        ) : (
          jobs.map((job) => (
            <span
              key={job.id}
              className={`h-1 w-2 rounded-full ${selected ? 'bg-noir-900' : 'bg-moss-500/70'}`}
            />
          ))
        )}
      </span>
    </button>
  );
}

/** Monday-first month grid, padded with nulls for the leading blanks. */
function buildMonthGrid(month: string): Array<string | null> {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;

  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return cells;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1, 12)).toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1, 12)),
  );
}
