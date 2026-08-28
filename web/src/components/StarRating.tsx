import { useId } from 'react';

/**
 * Star rating, in two modes.
 *
 * The interactive version is a real radio group rather than clickable icons:
 * screen readers announce it as "3 of 5 stars", arrow keys work, and it submits
 * correctly inside a form. Rating widgets built from <div>s do none of that.
 */

function Star({ filled, className = '' }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.2 6.7L12 17.7 6.1 20.9l1.2-6.7L2.5 9.5l6.6-.9L12 2.5Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StarRatingDisplay({
  rating,
  size = 'md',
  label,
}: {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const sizes = { sm: 'size-3.5', md: 'size-4', lg: 'size-6' }[size];

  return (
    <span className="inline-flex items-center gap-0.5 text-city-500">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} filled={star <= Math.round(rating)} className={sizes} />
      ))}
      <span className="sr-only">{label ?? `${rating} out of 5 stars`}</span>
    </span>
  );
}

export function StarRatingInput({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (rating: number) => void;
  error?: string;
}) {
  const name = useId();
  const labels = ['Poor', 'Not great', 'Fine', 'Good', 'Spot on'];

  return (
    <fieldset>
      <legend className="text-xs font-display uppercase tracking-[0.14em] text-smoke mb-3">
        How did we do?
      </legend>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className="cursor-pointer p-1 -m-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-city-500 rounded-[2px]"
            title={labels[star - 1]}
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <Star
              filled={star <= value}
              className={`size-9 transition-colors ${star <= value ? 'text-city-500' : 'text-noir-600 hover:text-city-700'}`}
            />
            <span className="sr-only">
              {star} star{star === 1 ? '' : 's'} — {labels[star - 1]}
            </span>
          </label>
        ))}

        {value > 0 && (
          <span className="ml-3 text-sm text-smoke" aria-hidden="true">
            {labels[value - 1]}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-[#e08a97] mt-2">
          {error}
        </p>
      )}
    </fieldset>
  );
}
