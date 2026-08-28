import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { PageTitle } from '../../components/app/PageTitle';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Notice } from '../../components/ui/States';
import { JobPhotos } from '../../components/app/JobPhotos';
import { QuoteLines } from '../../components/app/QuoteLines';
import { BLANK_LINE, lineItemsTotal, toLineItems, type LineDraft } from '../../lib/quotes';
import { useDocument } from '../../hooks/useFirestore';
import { createJob, createQuote, peekQuoteNumber, sendQuote } from '../../lib/callables';
import { db } from '../../lib/firebase-crm';
import {
  money,
  penceToPounds,
  poundsToPence,
  shortDate,
  todayIso,
  workingDatesFrom,
} from '../../lib/format';
import { releaseDraft, uploadPhotoDrafts, type PhotoDraft } from '../../lib/photos';
import type { BusinessSettings, JobSlot, JobType } from '../../types/domain';

/**
 * Quote a job from the doorstep.
 *
 * Most work arrives by phone or word of mouth, so there is usually no enquiry
 * to price up — this creates the customer, the job and the quote in one pass.
 *
 * The steps are deliberately NOT one atomic operation. On a driveway with one
 * bar of signal the useful question is "how much of this survived?", and a job
 * on the books with no quote is far better than losing the customer's details
 * entirely. Each stage reports what it got done and what is left to redo.
 */
export function NewQuotePage() {
  const navigate = useNavigate();
  const { data: settings } = useDocument<BusinessSettings>('settings', 'business');
  const depositPercent = settings?.depositPercent ?? 20;

  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);

  // Customer
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');

  // Job
  const [type, setType] = useState<JobType>('full_day');
  const [date, setDate] = useState(todayIso());
  const [repairSlot, setRepairSlot] = useState<'am' | 'pm'>('am');
  const [days, setDays] = useState('1');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);

  // Pricing
  const [rows, setRows] = useState<LineDraft[]>([{ ...BLANK_LINE }]);
  const [notes, setNotes] = useState('');
  const [depositOverride, setDepositOverride] = useState('');

  const [busy, setBusy] = useState<null | 'save' | 'send'>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  // A full day takes the whole day; a repair takes a half. Deriving it means
  // the server's assertSlotMatchesType can never be handed a bad combination.
  const slot: JobSlot = type === 'full_day' ? 'full' : repairSlot;

  // Only a full day can run over more than one day; a repair is half a day by
  // definition, so the count is forced back to 1 rather than being remembered.
  const dayCount = type === 'full_day' ? Math.max(1, Math.min(20, Number(days) || 1)) : 1;
  const spanDates = workingDatesFrom(date, dayCount, settings?.workingDays ?? [1, 2, 3, 4, 5, 6]);
  const lastDate = spanDates[spanDates.length - 1];

  const lineItems = toLineItems(rows);
  const total = lineItemsTotal(lineItems);
  const deposit = depositOverride.trim()
    ? poundsToPence(depositOverride)
    : Math.round((total * depositPercent) / 100);

  useEffect(() => {
    peekQuoteNumber({})
      .then((result) => setQuoteNumber(result.number))
      // Only ever a display nicety — never block quoting on it.
      .catch(() => setQuoteNumber(null));
  }, []);

  // Object URLs would leak if the page is left without saving. The ref keeps
  // this to an unmount-only cleanup — running it on every change would revoke
  // thumbnails that are still on screen.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach(releaseDraft), []);

  function validate(): string | null {
    if (name.trim().length < 2) return 'Give the customer a name.';
    if (!phone.trim()) return 'A phone number is needed.';
    if (!email.trim()) return 'An email address is needed — the quote is emailed to it.';
    if (!line1.trim() || !city.trim() || !postcode.trim()) return 'Fill in the job address.';
    if (!description.trim()) return 'Describe the job.';
    if (lineItems.length === 0) return 'Add at least one line with a description and a price.';
    if (deposit > total) return 'The deposit cannot be more than the total.';
    return null;
  }

  async function save(andSend: boolean) {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(andSend ? 'send' : 'save');
    setError(null);

    let jobId: string;
    try {
      setProgress('Saving the job…');
      const job = await createJob({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        type,
        date,
        slot,
        days: dayCount,
        address: {
          line1: line1.trim(),
          ...(line2.trim() ? { line2: line2.trim() } : {}),
          city: city.trim(),
          postcode: postcode.trim(),
        },
        description: description.trim(),
        source: 'phone',
      });
      jobId = job.jobId;
    } catch (cause) {
      setBusy(null);
      setProgress(null);
      setError(cause instanceof Error ? cause.message : 'Could not save the job.');
      return;
    }

    // Photos are attached best-effort. Losing one to a dropped connection must
    // not cost the quote — they can be added again from the job at any time.
    let photoWarning: string | null = null;
    if (photos.length > 0) {
      try {
        setProgress(`Uploading ${photos.length} photo${photos.length === 1 ? '' : 's'}…`);
        const urls = await uploadPhotoDrafts(jobId, photos);
        await updateDoc(doc(db, 'jobs', jobId), { photos: urls, updatedAt: new Date().toISOString() });
      } catch {
        photoWarning = ' The photos did not upload — add them again from the job.';
      }
    }

    try {
      setProgress('Building the quote…');
      const quote = await createQuote({
        jobId,
        lineItems,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(depositOverride.trim() ? { depositPence: deposit } : {}),
      });

      if (andSend) {
        setProgress('Emailing the quote…');
        await sendQuote({ quoteId: quote.quoteId });
      }

      // Drafts are now uploaded (or lost); either way the previews go.
      photos.forEach(releaseDraft);
      setPhotos([]);

      navigate(`/app/jobs/${jobId}`, {
        state: {
          flash:
            `Quote ${quote.reference} ${andSend ? 'emailed to ' + email.trim() : 'saved as a draft'}.` +
            (photoWarning ?? ''),
        },
      });
    } catch (cause) {
      setBusy(null);
      setProgress(null);
      setError(
        (cause instanceof Error ? cause.message : 'Could not build the quote.') +
          ` The job has been saved — open it from Jobs and price it there.${photoWarning ?? ''}`,
      );
    }
  }

  const working = busy !== null;

  return (
    <>
      <PageTitle
        title="New quote"
        subtitle={
          quoteNumber
            ? `${quoteNumber} — allocated when you save`
            : 'Customer, job and price in one go'
        }
      />

      <div className="space-y-5 max-w-2xl">
        {error && <Notice tone="error">{error}</Notice>}

        <Card>
          <CardHeader title="Customer" />
          <div className="p-4 space-y-4">
            <Input
              label="Name"
              required
              value={name}
              autoComplete="name"
              disabled={working}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Phone"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                disabled={working}
                onChange={(event) => setPhone(event.target.value)}
              />
              <Input
                label="Email"
                required
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                hint="The quote is emailed here."
                disabled={working}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Job" />
          <div className="p-4 space-y-4">
            <Input
              label="Address"
              required
              value={line1}
              placeholder="12 Bury New Road"
              disabled={working}
              onChange={(event) => setLine1(event.target.value)}
            />
            <Input
              label="Address line 2"
              value={line2}
              disabled={working}
              onChange={(event) => setLine2(event.target.value)}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Town or city"
                required
                value={city}
                disabled={working}
                onChange={(event) => setCity(event.target.value)}
              />
              <Input
                label="Postcode"
                required
                value={postcode}
                placeholder="M25 1AA"
                disabled={working}
                onChange={(event) => setPostcode(event.target.value)}
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <Select
                label="Type"
                value={type}
                disabled={working}
                onChange={(event) => setType(event.target.value as JobType)}
              >
                <option value="full_day">Full day</option>
                <option value="repair">Repair</option>
              </Select>
              <Input
                label="Date"
                type="date"
                required
                value={date}
                disabled={working}
                onChange={(event) => setDate(event.target.value)}
              />
              {type === 'full_day' ? (
                <Input
                  label="Days"
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  inputMode="numeric"
                  value={days}
                  disabled={working}
                  hint={dayCount > 1 ? `Runs to ${shortDate(lastDate)}` : 'Working days'}
                  onChange={(event) => setDays(event.target.value)}
                />
              ) : (
                <Select
                  label="Slot"
                  value={repairSlot}
                  disabled={working}
                  onChange={(event) => setRepairSlot(event.target.value as 'am' | 'pm')}
                >
                  <option value="am">Morning</option>
                  <option value="pm">Afternoon</option>
                </Select>
              )}
            </div>

            <Textarea
              label="What needs doing"
              required
              rows={3}
              value={description}
              placeholder="Back bedroom, artexed ceiling and two blown walls. Skim throughout."
              disabled={working}
              onChange={(event) => setDescription(event.target.value)}
            />

            <p className="text-xs text-smoke-dim border-t border-noir-700 pt-3">
              Saving holds {dayCount > 1 ? `all ${dayCount} days` : 'this slot'} in the diary
              while the quote is out. If the customer declines, {dayCount > 1 ? 'they go' : 'the day goes'}{' '}
              back on the calendar automatically.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Photos" />
          <div className="p-4">
            <JobPhotos drafts={photos} onDraftsChange={setPhotos} disabled={working} />
          </div>
        </Card>

        <Card>
          <CardHeader title={quoteNumber ? `Price — ${quoteNumber}` : 'Price'} />
          <div className="p-4 space-y-4">
            <QuoteLines rows={rows} onChange={setRows} disabled={working} />

            <Textarea
              label="Notes for the customer"
              rows={3}
              value={notes}
              placeholder="Price includes materials and clearing up. Walls need to be clear before we start."
              disabled={working}
              onChange={(event) => setNotes(event.target.value)}
            />

            <Input
              label="Deposit £"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={depositOverride}
              placeholder={penceToPounds(deposit)}
              hint={`Leave blank for the standard ${depositPercent}% (${money(deposit)}).`}
              disabled={working}
              onChange={(event) => setDepositOverride(event.target.value)}
            />

            <div className="border-t border-noir-700 pt-4">
              <p className="text-[0.6rem] font-display uppercase tracking-[0.16em] text-smoke-dim">
                Total
              </p>
              <p className="display text-2xl text-city-500 tabular-nums">{money(total)}</p>
              <p className="text-xs text-smoke-dim mt-1">Deposit {money(deposit)}</p>
            </div>
          </div>
        </Card>

        {progress && <Notice tone="info">{progress}</Notice>}

        <div className="flex flex-wrap gap-3">
          <Button loading={busy === 'send'} disabled={working} onClick={() => void save(true)}>
            Save &amp; email quote
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'save'}
            disabled={working}
            onClick={() => void save(false)}
          >
            Save as draft
          </Button>
        </div>
      </div>
    </>
  );
}
