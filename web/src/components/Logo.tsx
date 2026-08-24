import { Link } from 'react-router-dom';

/**
 * The wordmark. Condensed uppercase with wide tracking against a sky-blue
 * rule — the whole brand in two lines of type, which is what a one-man trade
 * business actually needs rather than an illustrated mark.
 */
export function Logo({ size = 'md', to = '/' }: { size?: 'sm' | 'md' | 'lg'; to?: string | null }) {
  const sizes = {
    sm: { name: 'text-lg', tag: 'text-[0.5rem]' },
    md: { name: 'text-2xl', tag: 'text-[0.55rem]' },
    lg: { name: 'text-4xl sm:text-5xl', tag: 'text-[0.65rem]' },
  }[size];

  const mark = (
    <span className="inline-flex flex-col">
      <span className={`display ${sizes.name} tracking-[0.18em] text-bone leading-none`}>
        Skim<span className="text-city-500">&nbsp;City</span>
      </span>
      <span
        className={`font-display uppercase ${sizes.tag} tracking-[0.3em] text-smoke mt-1.5 border-t border-city-700 pt-1.5`}
      >
        Taking the rough to the smooth
      </span>
    </span>
  );

  if (!to) return mark;

  return (
    <Link to={to} className="inline-block" aria-label="Skim City — home">
      {mark}
    </Link>
  );
}
