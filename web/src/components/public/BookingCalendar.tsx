import { useEffect, useMemo, useState } from 'react';
import { getAvailability } from '../../lib/callables';
import { BUSINESS } from '../../lib/business';
import { formatPhone, whatsappLink } from '../../lib/format';
import { dayOfWeek, todayIso } from '../../lib/format';
import { Spinner } from '../ui/States';
import type { Availability, JobType } from '../../types/domain';

interface Rules {
  workingDays: number[];
  earliestDate: string;
  latestDate: string;
}

export interface DayState {
  date: string;
  inMonth: boolean;
  selectable: boolean;
  amFree: boolean;
  pmFree: boolean;
  fullFree: boolean;
  reason: string | null;
}

/**
 * The public month calendar.
 *
 * What counts as available depends on what's being booked, which is why the job
 * type is an input: a full day needs the whole day clear, while a repair only
 * needs one half of it. That rule lives in the backend too (availability.ts) —
 * this is the customer-facing half of the same logic, and the server is the one
 * that decides.
 */
export function BookingCalendar({
  jobType,
  selectedDate,
  onSelect,
}: {
  jobType: JobType;
  selectedDate: string | null;
  onSelect: (date: string, day: DayState) => void;
}) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [days, setDays] = useState<Record<string, Availability>>({});
  const [rules, setRules] = useState<Rules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAvailability({ month })
      .then((result) => {
        if (cancelled) return;
        setDays(result.days);
        setRules(result.rules);
      })
      .catch(() => {
        if (cancelled) return;
        // The underlying reason is for our logs, not the customer's screen:
        // a raw callable error reads as "internal [0]", which tells them
        // nothing and looks broken. Give them a way to reach us instead.
        setError('unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  const grid = useMemo(() => buildGrid(month, days, rules, jobType), [month, days, rules, jobType]);

  const canGoBack = month > todayIso().slice(0, 7);
  const canGoForward = rules ? `${month}-01` < rules.latestDate.slice(0, 8) + '01' : true;

  if (error) {
    return (
      <div className="bg-noir-800 border border-noir-700 rounded-[3px] p-6 sm:p-8 text-center">
        <div aria-hidden="true" className="mx-auto mb-4 h-px w-12 bg-maroon-500" />
        <h3 className="display text-base text-bone mb-2">Can't load the calendar</h3>
        <p className="text-sm text-smoke max-w-sm mx-auto mb-6">
          Something's up at our end — it's not you. Give us a ring or send a message and
          we'll get you a date sorted the quick way.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`tel:${BUSINESS.phone}`}
            className="inline-flex items-center justify-center px-5 py-3 rounded-[2px] bg-city-500 text-noir-900 font-display uppercase text-sm tracking-[0.1em] hover:bg-city-600 transition-colors"
          >
            {formatPhone(BUSINESS.phone)}
          </a>
          <a
            href={whatsappLink(BUSINESS.phone, BUSINESS.whatsappGreeting)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center justify-center px-5 py-3 rounded-[2px] border border-noir-600 text-bone font-display uppercase text-sm tracking-[0.1em] hover:border-city-700 transition-colors"
          >
            WhatsApp
          </a>
        </div>
        <button
          type="button"
          onClick={() => setMonth((value) => value)}
          className="mt-5 text-xs text-smoke hover:text-city-500 underline underline-offset-4 cursor-pointer"
        >
          Try the calendar again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-noir-800 border border-noir-700 rounded-[3px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-noir-700">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={!canGoBack}
          className="p-2 -ml-2 text-smoke hover:text-bone disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Previous month"
        >
          <Chevron direction="left" />
        </button>

        <h3 className="display text-sm tracking-[0.14em] text-bone" aria-live="polite">
          {monthLabel(month)}
        </h3>

        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={!canGoForward}
          className="p-2 -mr-2 text-smoke hover:text-bone disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Next month"
        >
          <Chevron direction="right" />
        </button>
      </div>

      {loading ? (
        <Spinner label="Loading the diary" />
      ) : (
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 mb-2" aria-hidden="true">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="text-center text-[0.6rem] font-display uppercase tracking-[0.14em] text-smoke-dim py-1"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map((day) =>
              day.inMonth ? (
                <button
                  key={day.date}
                  type="button"
                  disabled={!day.selectable}
                  onClick={() => onSelect(day.date, day)}
                  aria-pressed={selectedDate === day.date}
                  aria-label={`${day.date}${day.selectable ? '' : ` — ${day.reason ?? 'unavailable'}`}`}
                  className={dayClasses(day, selectedDate === day.date)}
                >
                  <span>{Number(day.date.slice(8))}</span>
                  {day.selectable && jobType === 'repair' && (
                    <span className="flex gap-0.5 mt-1" aria-hidden="true">
                      <span className={`h-0.5 w-2 ${day.amFree ? 'bg-city-500' : 'bg-noir-600'}`} />
                      <span className={`h-0.5 w-2 ${day.pmFree ? 'bg-city-500' : 'bg-noir-600'}`} />
                    </span>
                  )}
                </button>
              ) : (
                <div key={day.date} />
              ),
            )}
          </div>

          <Legend jobType={jobType} />
        </div>
      )}
    </div>
  );
}

function dayClasses(day: DayState, selected: boolean): string {
  const base =
    'aspect-square flex flex-col items-center justify-center rounded-[2px] text-sm transition-colors';

  if (selected) return `${base} bg-city-500 text-noir-900 font-semibold cursor-pointer`;
  if (!day.selectable) return `${base} text-noir-600 cursor-not-allowed line-through decoration-1`;
  return `${base} bg-noir-850 text-bone hover:bg-noir-700 hover:ring-1 hover:ring-city-700 cursor-pointer`;
}

function Legend({ jobType }: { jobType: JobType }) {
  return (
    <div className="mt-4 pt-3 border-t border-noir-700 flex flex-wrap gap-x-5 gap-y-2 text-[0.65rem] text-smoke-dim">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 bg-noir-850 border border-noir-600" /> Available
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 bg-city-500" /> Selected
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 bg-transparent border border-noir-600" /> Taken or closed
      </span>
      {jobType === 'repair' && (
        <span className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            <span className="h-0.5 w-2 bg-city-500 self-center" />
            <span className="h-0.5 w-2 bg-noir-600 self-center" />
          </span>
          AM / PM free
        </span>
      )}
    </div>
  );
}

/**
 * Builds a Monday-first grid for the month, marking each day against the same
 * rules the server enforces. Days with no availability document have simply
 * never been booked, so they are free.
 */
function buildGrid(
  month: string,
  days: Record<string, Availability>,
  rules: Rules | null,
  jobType: JobType,
): DayState[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstOfMonth = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();

  // getUTCDay: 0 = Sunday. Shift so Monday is the first column.
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7;

  const grid: DayState[] = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    grid.push({
      date: `blank-${index}`,
      inMonth: false,
      selectable: false,
      amFree: false,
      pmFree: false,
      fullFree: false,
      reason: null,
    });
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = `${month}-${String(dayNumber).padStart(2, '0')}`;
    const availability = days[date];

    const amFree = !(availability?.amTaken ?? false);
    const pmFree = !(availability?.pmTaken ?? false);
    const fullFree = !(availability?.fullDayTaken ?? false);
    const blocked = availability?.blocked ?? false;

    let reason: string | null = null;
    let selectable = true;

    if (rules && !rules.workingDays.includes(dayOfWeek(date))) {
      selectable = false;
      reason = "we don't work this day";
    } else if (rules && date < rules.earliestDate) {
      selectable = false;
      reason = 'too soon to book';
    } else if (rules && date > rules.latestDate) {
      selectable = false;
      reason = 'too far ahead';
    } else if (blocked) {
      selectable = false;
      reason = availability?.note || 'unavailable';
    } else if (jobType === 'full_day' && !fullFree) {
      selectable = false;
      reason = 'already booked';
    } else if (jobType === 'repair' && !amFree && !pmFree) {
      selectable = false;
      reason = 'fully booked';
    }

    grid.push({ date, inMonth: true, selectable, amFree, pmFree, fullFree, reason });
  }

  return grid;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1, 12));
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1, 12)),
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

