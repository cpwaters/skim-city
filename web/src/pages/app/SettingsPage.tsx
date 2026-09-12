import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { PageTitle } from '../../components/app/PageTitle';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Notice, Spinner } from '../../components/ui/States';
import { useDocument } from '../../hooks/useFirestore';
import { db } from '../../lib/firebase-crm';
import { penceToPounds, poundsToPence } from '../../lib/format';
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from '../../types/domain';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Business settings. These drive real behaviour — the diary's working days,
 * the deposit percentage on every quote, and whether VAT appears on invoices —
 * so they live in Firestore rather than in code, and Chris can change them
 * without a redeploy.
 */
export function SettingsPage() {
  const { data: stored, loading } = useDocument<BusinessSettings>('settings', 'business');
  const [form, setForm] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (stored) setForm({ ...DEFAULT_BUSINESS_SETTINGS, ...stored });
  }, [stored]);

  function update<K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleWorkingDay(day: number) {
    const days = form.workingDays.includes(day)
      ? form.workingDays.filter((value) => value !== day)
      : [...form.workingDays, day].sort();
    update('workingDays', days);
  }

  async function save() {
    setSaving(true);
    setMessage(null);

    try {
      await setDoc(doc(db, 'settings', 'business'), form, { merge: true });
      setMessage({ tone: 'success', text: 'Settings saved.' });
    } catch (cause: unknown) {
      setMessage({
        tone: 'error',
        text: cause instanceof Error ? cause.message : 'Could not save the settings.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageTitle title="Settings" subtitle="How the diary, quotes and invoices behave" />

      {message && (
        <div className="mb-5">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2 items-start max-w-4xl">
        <Card>
          <CardHeader title="Business" />
          <div className="p-4 space-y-4">
            <Input label="Trading name" value={form.tradingName} onChange={(event) => update('tradingName', event.target.value)} />
            <Input label="Email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
            <Input label="Phone" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Rates" />
          <div className="p-4 space-y-4">
            <Input
              label="Day rate £"
              type="number"
              step="0.01"
              min="0"
              value={penceToPounds(form.dayRatePence)}
              onChange={(event) => update('dayRatePence', poundsToPence(event.target.value))}
              hint="Guide price only — every quote is priced individually."
            />
            <Input
              label="Repair slot rate £"
              type="number"
              step="0.01"
              min="0"
              value={penceToPounds(form.repairRatePence)}
              onChange={(event) => update('repairRatePence', poundsToPence(event.target.value))}
            />
            <Input
              label="Deposit %"
              type="number"
              min="0"
              max="100"
              value={String(form.depositPercent)}
              onChange={(event) => update('depositPercent', Number(event.target.value) || 0)}
              hint="Taken to confirm a booking. Comes off the final bill."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Diary" />
          <div className="p-4 space-y-4">
            <fieldset>
              <legend className="text-xs font-display uppercase tracking-[0.14em] text-smoke mb-2">
                Working days
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((name, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWorkingDay(day)}
                    aria-pressed={form.workingDays.includes(day)}
                    className={[
                      'px-3 py-2 rounded-[2px] border text-[0.65rem] font-display uppercase tracking-[0.1em] transition-colors cursor-pointer',
                      form.workingDays.includes(day)
                        ? 'border-city-500 bg-city-900/40 text-city-500'
                        : 'border-noir-600 text-smoke-dim hover:text-smoke',
                    ].join(' ')}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </fieldset>

            <Input
              label="Lead time (days)"
              type="number"
              min="0"
              value={String(form.leadTimeDays)}
              onChange={(event) => update('leadTimeDays', Number(event.target.value) || 0)}
              hint="How soon someone can book from today."
            />
            <Input
              label="Booking horizon (days)"
              type="number"
              min="1"
              value={String(form.bookingHorizonDays)}
              onChange={(event) => update('bookingHorizonDays', Number(event.target.value) || 1)}
              hint="How far ahead the public calendar goes."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Quotes & invoices" />
          <div className="p-4 space-y-4">
            <Input
              label="Quote valid for (days)"
              type="number"
              min="1"
              value={String(form.quoteValidDays)}
              onChange={(event) => update('quoteValidDays', Number(event.target.value) || 1)}
            />
            <Input
              label="Invoice payment terms (days)"
              type="number"
              min="0"
              value={String(form.invoiceTermsDays)}
              onChange={(event) => update('invoiceTermsDays', Number(event.target.value) || 0)}
            />

            <div className="pt-3 border-t border-noir-700">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.vatRegistered}
                  onChange={(event) => update('vatRegistered', event.target.checked)}
                  className="mt-1 size-4 accent-[#6cabdd]"
                />
                <span>
                  <span className="block text-sm text-bone">VAT registered</span>
                  <span className="block text-xs text-smoke-dim mt-0.5">
                    Leave off until you're actually registered — charging or showing VAT
                    before then isn't allowed.
                  </span>
                </span>
              </label>

              {form.vatRegistered && (
                <div className="mt-4 space-y-4">
                  <Input
                    label="VAT number"
                    value={form.vatNumber ?? ''}
                    placeholder="GB123456789"
                    onChange={(event) => update('vatNumber', event.target.value)}
                    hint="Must appear on every VAT invoice."
                  />
                  <Input
                    label="VAT rate %"
                    type="number"
                    min="0"
                    max="100"
                    value={String(form.vatRatePercent)}
                    onChange={(event) => update('vatRatePercent', Number(event.target.value) || 0)}
                  />
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 max-w-4xl">
        <Button loading={saving} onClick={() => void save()}>
          Save settings
        </Button>
      </div>
    </>
  );
}
