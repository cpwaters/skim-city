import { useState } from 'react';

/**
 * Before/after comparison slider.
 *
 * Built on a real <input type="range"> rather than pointer events on a div:
 * that gets keyboard support, touch, and screen-reader semantics for free, and
 * it is the one control on the marketing site someone is most likely to try
 * with a thumb while scrolling.
 */
export function BeforeAfter({
  beforeUrl,
  afterUrl,
  alt,
}: {
  beforeUrl: string;
  afterUrl: string;
  alt: string;
}) {
  const [position, setPosition] = useState(50);

  return (
    <div className="relative size-full overflow-hidden select-none">
      <img
        src={afterUrl}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 size-full object-cover"
      />

      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        aria-hidden="true"
      >
        <img src={beforeUrl} alt="" loading="lazy" className="size-full object-cover" />
      </div>

      {/* The seam. Pure decoration — the range input below is the real control. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 w-0.5 bg-city-500 pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center size-8 rounded-full bg-city-500 text-noir-900 text-[0.7rem] font-display shadow-[var(--shadow-hard-sm)]">
          ↔
        </span>
      </div>

      <span
        aria-hidden="true"
        className="absolute top-2 left-2 px-2 py-0.5 bg-noir-900/80 text-bone text-[0.6rem] font-display uppercase tracking-[0.14em] rounded-[2px]"
      >
        Before
      </span>
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 px-2 py-0.5 bg-city-500/90 text-noir-900 text-[0.6rem] font-display uppercase tracking-[0.14em] rounded-[2px]"
      >
        After
      </span>

      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={`Reveal before and after: ${alt}`}
        className="absolute inset-0 size-full opacity-0 cursor-ew-resize"
      />
    </div>
  );
}
