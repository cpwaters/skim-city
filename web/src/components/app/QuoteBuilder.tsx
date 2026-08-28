import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Field';
import { Notice } from '../ui/States';
import { QuoteLines } from './QuoteLines';
import { BLANK_LINE, lineItemsTotal, toLineItems, type LineDraft } from '../../lib/quotes';
import { createQuote, sendQuote } from '../../lib/callables';
import { money, penceToPounds, poundsToPence } from '../../lib/format';

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
  const [rows, setRows] = useState<LineDraft[]>([{ ...BLANK_LINE }]);
  const [notes, setNotes] = useState('');
  const [depositOverride, setDepositOverride] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const lineItems = toLineItems(rows);
  const total = lineItemsTotal(lineItems);
  const deposit = depositOverride.trim()
    ? poundsToPence(depositOverride)
    : Math.round((total * depositPercent) / 100);

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

      <QuoteLines rows={rows} onChange={setRows} disabled={busy} />

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
