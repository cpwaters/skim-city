import { Input } from '../ui/Field';
import { BLANK_LINE, type LineDraft } from '../../lib/quotes';

/** The line-item editor shared by the quote builder and the on-site form. */
export function QuoteLines({
  rows,
  onChange,
  disabled = false,
}: {
  rows: LineDraft[];
  onChange: (rows: LineDraft[]) => void;
  disabled?: boolean;
}) {
  function updateRow(index: number, patch: Partial<LineDraft>) {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_4rem_6rem_2rem] gap-2 items-end">
          <Input
            label={index === 0 ? 'Description' : ''}
            value={row.description}
            disabled={disabled}
            placeholder="Skim ceiling and two walls"
            onChange={(event) => updateRow(index, { description: event.target.value })}
          />
          <Input
            label={index === 0 ? 'Qty' : ''}
            type="number"
            min="0.5"
            step="0.5"
            disabled={disabled}
            value={row.quantity}
            onChange={(event) => updateRow(index, { quantity: event.target.value })}
          />
          <Input
            label={index === 0 ? 'Price £' : ''}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            disabled={disabled}
            value={row.unitPrice}
            placeholder="250.00"
            onChange={(event) => updateRow(index, { unitPrice: event.target.value })}
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, position) => position !== index))}
            disabled={disabled || rows.length === 1}
            aria-label={`Remove line ${index + 1}`}
            className="h-11 text-smoke hover:text-maroon-400 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...rows, { ...BLANK_LINE }])}
        className="text-xs font-display uppercase tracking-[0.14em] text-city-500 hover:text-city-600 disabled:opacity-40 cursor-pointer"
      >
        + Add line
      </button>
    </div>
  );
}
