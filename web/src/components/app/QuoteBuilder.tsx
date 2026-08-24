import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Field';
import { Notice } from '../ui/States';
import { createQuote, sendQuote } from '../../lib/callables';
import { money, penceToPounds, poundsToPence } from '../../lib/format';
import type { LineItem } from '../../types/domain';

interface Draft {
  description: string;
  quantity: string;
  unitPrice: string;
}

const BLANK_ROW: Draft = { description: '', quantity: '1', unitPrice: '' };

/**
 * Builds and sends a quote for a job.
 *
 * Prices are typed in pounds and converted to integer pence on the way out —
 * the whole backend works in pence, and letting pounds through as floats is
 * how a quote ends up a penny out from its own line items.
 */
export function QuoteBuilder({
  jobId,
  depositPercent,
  onDone,
}: {
  jobId: string;
  depositPercent: number;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<Draft[]>([{ ...BLANK_ROW }]);
  const [notes, setNotes] = useState('');
  const [depositOverride, setDepositOverride] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const lineItems: LineItem[] = rows
    .filter((row) => row.description.trim() && row.unitPrice.trim())
    .map((row) => ({
      description: row.description.trim(),
      quantity: Number(row.quantity) || 1,
      unitPricePence: poundsToPence(row.unitPrice),
    }));

  const total = lineItems.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPricePence),
    0,
  );
  const deposit = depositOverride.trim()
    ? poundsToPence(depositOverride)
    : Math.round((total * depositPercent) / 100);

  function updateRow(index: number, patch: Partial<Draft>) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  async function createAndSend() {
    if (lineItems.length === 0) {
      setError('Add at least one line with a description and a price.');
      return;
    }
    if (deposit > total) {
      setError('The deposit cannot be more than the total.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const quote = await createQuote({
        jobId,
        lineItems,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(depositOverride.trim() ? { depositPence: deposit } : {}),
      });

      const result = await sendQuote({ quoteId: quote.quoteId });
      setSent(`Quote ${quote.reference} emailed to ${result.sentTo}.`);
      onDone();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not create the quote.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <Notice tone="success">{sent}</Notice>;
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_4rem_6rem_2rem] gap-2 items-end">
            <Input
              label={index === 0 ? 'Description' : ''}
              value={row.description}
              placeholder="Skim ceiling and two walls"
              onChange={(event) => updateRow(index, { description: event.target.value })}
            />
            <Input
              label={index === 0 ? 'Qty' : ''}
              type="number"
              min="0.5"
              step="0.5"
              value={row.quantity}
              onChange={(event) => updateRow(index, { quantity: event.target.value })}
            />
            <Input
              label={index === 0 ? 'Price £' : ''}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={row.unitPrice}
              placeholder="250.00"
              onChange={(event) => updateRow(index, { unitPrice: event.target.value })}
            />
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
              disabled={rows.length === 1}
              aria-label={`Remove line ${index + 1}`}
              className="h-11 text-smoke hover:text-maroon-400 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((current) => [...current, { ...BLANK_ROW }])}
        className="text-xs font-display uppercase tracking-[0.14em] text-city-500 hover:text-city-600 cursor-pointer"
      >
        + Add line
      </button>

      <Textarea
        label="Notes for the customer"
        rows={3}
        value={notes}
        placeholder="Price includes materials and clearing up. Walls need to be clear before we start."
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
        onChange={(event) => setDepositOverride(event.target.value)}
      />

      <div className="flex items-center justify-between border-t border-noir-700 pt-4">
        <div>
          <p className="text-[0.6rem] font-display uppercase tracking-[0.16em] text-smoke-dim">Total</p>
          <p className="display text-2xl text-city-500 tabular-nums">{money(total)}</p>
          <p className="text-xs text-smoke-dim mt-1">Deposit {money(deposit)}</p>
        </div>

        <Button loading={busy} onClick={() => void createAndSend()}>
          Create &amp; email quote
        </Button>
      </div>
    </div>
  );
}
