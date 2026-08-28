import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/public/PageHeader';
import { BookingCalendar, type DayState } from '../../components/public/BookingCalendar';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { Notice } from '../../components/ui/States';
import { requestBooking } from '../../lib/callables';
import { BUSINESS } from '../../lib/business';
import { formatPhone, longDate, slotLabel, whatsappLink } from '../../lib/format';
import type { JobSlot, JobType } from '../../types/domain';

type Step = 'type' | 'date' | 'details' | 'done';

interface Details {
  name: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  description: string;
}

const EMPTY_DETAILS: Details = {
  name: '',
  phone: '',
  email: '',
  line1: '',
  line2: '',
  city: '',
  postcode: '',
  description: '',
};

export function BookPage() {
  const [step, setStep] = useState<Step>('type');
  const [jobType, setJobType] = useState<JobType>('full_day');
  const [date, setDate] = useState<string | null>(null);
  const [day, setDay] = useState<DayState | null>(null);
  const [slot, setSlot] = useState<JobSlot>('full');
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function chooseType(type: JobType) {
    setJobType(type);
    setSlot(type === 'full_day' ? 'full' : 'am');
    // The calendar's availability rules differ per job type, so a date chosen
    // under the old type can't be carried across.
    setDate(null);
    setDay(null);
    setStep('date');
  }

  function chooseDate(nextDate: string, nextDay: DayState) {
    setDate(nextDate);
    setDay(nextDay);
    if (jobType === 'repair') {
      setSlot(nextDay.amFree ? 'am' : 'pm');
    }
  }

  function validate(): boolean {
    const next: Partial<Record<keyof Details, string>> = {};

    if (details.name.trim().length < 2) next.name = 'Please give your name';
    if (!/^(\+44|0044|0)\d{9,10}$/.test(details.phone.replace(/[\s()-]/g, ''))) {
      next.phone = 'Enter a valid UK phone number';
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email.trim())) {
      next.email = 'Enter a valid email address';
    }
    if (!details.line1.trim()) next.line1 = 'Address is required';
    if (!details.city.trim()) next.city = 'Town or city is required';
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(details.postcode.trim())) {
      next.postcode = 'Enter a valid UK postcode';
    }
    if (details.description.trim().length < 10) {
      next.description = 'Tell us a bit more so we can price it properly';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!date || !validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await requestBooking({
        name: details.name.trim(),
        phone: details.phone.trim(),
        email: details.email.trim(),
        type: jobType,
        date,
        slot,
        address: {
          line1: details.line1.trim(),
          ...(details.line2.trim() ? { line2: details.line2.trim() } : {}),
          city: details.city.trim(),
          postcode: details.postcode.trim().toUpperCase(),
        },
        description: details.description.trim(),
      });
      setStep('done');
    } catch (cause: unknown) {
      setSubmitError(
        cause instanceof Error
          ? cause.message
          : 'Something went wrong sending your request. Please try again or give us a ring.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done' && date) {
    return <Confirmation date={date} slot={slot} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Book a slot"
        title="Get in the diary"
        intro="Pick a day that suits you and tell us about the job. We'll confirm the details and send a fixed-price quote — the slot is yours once you've accepted it and paid the deposit."
      />

      <section className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <Steps current={step} />

        {step === 'type' && <TypeStep onChoose={chooseType} />}

        {step === 'date' && (
          <div className="space-y-6">
            <StepHeading
              step="2"
              title="Choose a date"
              onBack={() => setStep('type')}
              note={
                jobType === 'full_day'
                  ? 'Full days need the whole day clear, so part-booked days are greyed out.'
                  : 'Two repair slots run per day — the bars under each date show which halves are free.'
              }
            />

            <BookingCalendar jobType={jobType} selectedDate={date} onSelect={chooseDate} />

            {date && day && jobType === 'repair' && (
              <fieldset className="bg-noir-800 border border-noir-700 rounded-[3px] p-5">
                <legend className="eyebrow px-2">Morning or afternoon?</legend>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <SlotOption
                    label="Morning"
                    time="8am – 12pm"
                    value="am"
                    selected={slot === 'am'}
                    disabled={!day.amFree}
                    onSelect={setSlot}
                  />
                  <SlotOption
                    label="Afternoon"
                    time="1pm – 5pm"
                    value="pm"
                    selected={slot === 'pm'}
                    disabled={!day.pmFree}
                    onSelect={setSlot}
                  />
                </div>
              </fieldset>
            )}

            {date && (
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between bg-noir-850 border border-noir-700 rounded-[3px] p-4">
                <p className="text-sm text-smoke">
                  <span className="text-bone">{longDate(date)}</span>
                  <span className="text-smoke-dim"> · {slotLabel(slot)}</span>
                </p>
                <Button onClick={() => setStep('details')}>Continue</Button>
              </div>
            )}
          </div>
        )}

        {step === 'details' && date && (
          <form onSubmit={submit} noValidate className="space-y-6">
            <StepHeading
              step="3"
              title="Your details"
              onBack={() => setStep('date')}
              note={`${longDate(date)} · ${slotLabel(slot)}`}
            />

            {submitError && <Notice tone="error">{submitError}</Notice>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Your name"
                required
                autoComplete="name"
                value={details.name}
                error={errors.name}
                onChange={(event) => setDetails({ ...details, name: event.target.value })}
              />
              <Input
                label="Phone"
                type="tel"
                required
                autoComplete="tel"
                placeholder="07…"
                value={details.phone}
                error={errors.phone}
                onChange={(event) => setDetails({ ...details, phone: event.target.value })}
              />
            </div>

            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              hint="This is where your quote and invoice will go."
              value={details.email}
              error={errors.email}
              onChange={(event) => setDetails({ ...details, email: event.target.value })}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Address"
                required
                autoComplete="address-line1"
                value={details.line1}
                error={errors.line1}
                onChange={(event) => setDetails({ ...details, line1: event.target.value })}
              />
              <Input
                label="Address line 2"
                autoComplete="address-line2"
                value={details.line2}
                onChange={(event) => setDetails({ ...details, line2: event.target.value })}
              />
              <Input
                label="Town or city"
                required
                autoComplete="address-level2"
                value={details.city}
                error={errors.city}
                onChange={(event) => setDetails({ ...details, city: event.target.value })}
              />
              <Input
                label="Postcode"
                required
                autoComplete="postal-code"
                value={details.postcode}
                error={errors.postcode}
                onChange={(event) => setDetails({ ...details, postcode: event.target.value })}
              />
            </div>

            <Textarea
              label="About the job"
              required
              rows={5}
              hint="Rough room sizes, what state the walls are in, and anything we should know about access."
              value={details.description}
              error={errors.description}
              onChange={(event) => setDetails({ ...details, description: event.target.value })}
            />

            <div className="border-l-2 border-city-700 bg-city-900/25 px-4 py-3">
              <p className="text-sm text-smoke">
                Requesting a slot doesn't confirm it and costs nothing. We'll price the job and
                email you a quote — the date is locked in once you accept it and pay the deposit.
              </p>
            </div>

            <Button type="submit" size="lg" full loading={submitting}>
              {submitting ? 'Sending' : 'Request this slot'}
            </Button>
          </form>
        )}
      </section>
    </>
  );
}

function Steps({ current }: { current: Step }) {
  const order: Array<Exclude<Step, 'done'>> = ['type', 'date', 'details'];
  const labels: Record<Exclude<Step, 'done'>, string> = { type: 'Job', date: 'Date', details: 'Details' };
  const activeIndex = order.indexOf(current as Exclude<Step, 'done'>);

  return (
    <ol className="flex items-center gap-2 mb-10" aria-label="Booking progress">
      {order.map((step, index) => (
        <li key={step} className="flex items-center gap-2 flex-1">
          <span
            className={[
              'flex items-center gap-2 text-[0.65rem] font-display uppercase tracking-[0.16em]',
              index <= activeIndex ? 'text-city-500' : 'text-noir-600',
            ].join(' ')}
            aria-current={index === activeIndex ? 'step' : undefined}
          >
            <span
              className={[
                'grid place-items-center size-6 rounded-full border text-[0.6rem]',
                index < activeIndex
                  ? 'bg-city-500 border-city-500 text-noir-900'
                  : index === activeIndex
                    ? 'border-city-500 text-city-500'
                    : 'border-noir-600 text-noir-600',
              ].join(' ')}
            >
              {index + 1}
            </span>
            <span className="hidden sm:inline">{labels[step]}</span>
          </span>
          {index < order.length - 1 && (
            <span
              aria-hidden="true"
              className={`h-px flex-1 ${index < activeIndex ? 'bg-city-700' : 'bg-noir-700'}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function StepHeading({
  step,
  title,
  note,
  onBack,
}: {
  step: string;
  title: string;
  note?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="display text-xl text-bone">
          <span className="text-noir-600 mr-2">{step}</span>
          {title}
        </h2>
        {note && <p className="text-sm text-smoke mt-1.5">{note}</p>}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-display uppercase tracking-[0.14em] text-smoke hover:text-bone transition-colors shrink-0 cursor-pointer pt-1"
      >
        ← Back
      </button>
    </div>
  );
}

function TypeStep({ onChoose }: { onChoose: (type: JobType) => void }) {
  const options: Array<{ type: JobType; title: string; body: string; examples: string }> = [
    {
      type: 'full_day',
      title: 'Full day',
      body: 'The whole day on site. Rooms, ceilings, replasters — anything that needs a proper run at it.',
      examples: 'Room skim · Full replaster · Ceilings · Boarding',
    },
    {
      type: 'repair',
      title: 'Repair slot',
      body: 'A morning or afternoon for smaller work. Two slots run per day, so pick the half that suits.',
      examples: 'Cracks · Patches · Corner beads · Making good',
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="display text-xl text-bone">
        <span className="text-noir-600 mr-2">1</span>
        What do you need?
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.type}
            type="button"
            onClick={() => onChoose(option.type)}
            className="text-left bg-noir-800 border border-noir-700 rounded-[3px] p-6 transition-all hover:border-city-700 hover:shadow-[var(--shadow-hard-sm)] cursor-pointer"
          >
            <div aria-hidden="true" className="mb-4 h-px w-8 bg-city-500" />
            <h3 className="display text-lg text-bone mb-2">{option.title}</h3>
            <p className="text-sm text-smoke leading-relaxed mb-4">{option.body}</p>
            <p className="text-xs text-smoke-dim">{option.examples}</p>
          </button>
        ))}
      </div>

      <p className="text-sm text-smoke-dim">
        Not sure which?{' '}
        <a
          href={whatsappLink(BUSINESS.phone, BUSINESS.whatsappGreeting)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-city-500 hover:text-city-600 underline underline-offset-4"
        >
          Send us a photo on WhatsApp
        </a>{' '}
        and we'll tell you.
      </p>
    </div>
  );
}

function SlotOption({
  label,
  time,
  value,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  time: string;
  value: JobSlot;
  selected: boolean;
  disabled: boolean;
  onSelect: (slot: JobSlot) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={[
        'p-4 rounded-[2px] border text-left transition-colors',
        disabled
          ? 'border-noir-700 text-noir-600 cursor-not-allowed'
          : selected
            ? 'border-city-500 bg-city-900/40 text-bone cursor-pointer'
            : 'border-noir-600 text-smoke hover:border-city-700 hover:text-bone cursor-pointer',
      ].join(' ')}
    >
      <span className="block display text-sm mb-1">{label}</span>
      <span className="block text-xs opacity-75">{disabled ? 'Already booked' : time}</span>
    </button>
  );
}

function Confirmation({ date, slot }: { date: string; slot: JobSlot }) {
  return (
    <section className="mx-auto max-w-2xl px-5 py-20 sm:py-28 text-center">
      <div aria-hidden="true" className="mx-auto mb-7 h-px w-14 bg-city-500" />
      <h1 className="display text-3xl sm:text-4xl text-bone mb-4">Request sent</h1>
      <p className="text-lg text-smoke mb-8">
        We've got you down for <span className="text-bone">{longDate(date)}</span>,{' '}
        {slotLabel(slot).toLowerCase()}.
      </p>

      <div className="bg-noir-800 border border-noir-700 rounded-[3px] p-6 text-left mb-8">
        <h2 className="display text-sm text-bone mb-4 tracking-[0.14em]">What happens next</h2>
        <ol className="space-y-3 text-sm text-smoke">
          <li className="flex gap-3">
            <span className="text-city-500 font-display shrink-0">01</span>
            Check your inbox — there's a confirmation of what you've asked for on its way.
          </li>
          <li className="flex gap-3">
            <span className="text-city-500 font-display shrink-0">02</span>
            We'll look at the details and email you a fixed-price quote, usually within a day.
          </li>
          <li className="flex gap-3">
            <span className="text-city-500 font-display shrink-0">03</span>
            Accept it and pay the deposit online — that's what locks the date in.
          </li>
        </ol>
      </div>

      <p className="text-sm text-smoke-dim mb-8">
        Need to change something or add a detail? Ring{' '}
        <a href={`tel:${BUSINESS.phone}`} className="text-city-500 hover:text-city-600">
          {formatPhone(BUSINESS.phone)}
        </a>{' '}
        or message us on WhatsApp.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <ButtonLink to="/">Back to home</ButtonLink>
        <ButtonLink to={whatsappLink(BUSINESS.phone, 'Hi Chris, I just booked a slot —')} variant="secondary">
          Message on WhatsApp
        </ButtonLink>
      </div>

      <p className="mt-10 text-xs text-smoke-dim">
        <Link to="/terms" className="hover:text-smoke underline underline-offset-4">
          Deposit and cancellation terms
        </Link>
      </p>
    </section>
  );
}
