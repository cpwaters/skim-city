import { Link } from 'react-router-dom';

/**
 * The Skim City wordmark.
 *
 * The mark itself is artwork — a graffiti-cut wordmark in sky blue and white
 * with maroon and black outlines — so it is used as an image rather than
 * reconstructed in type. The tagline stays as live text beneath it: it needs to
 * be selectable, translatable and readable to a screen reader, and it wants to
 * scale independently of the mark.
 */

// Derived from brand/skim-city-text.png: the supplied artwork is a 1254px
// square with the wordmark letterboxed on an opaque black field, which would
// render as a visible box on the footer's hatched surface. This copy has that
// background lifted to transparency, is trimmed to the mark, and is sized for
// its largest on-screen use rather than shipping a megabyte on every page.
const WORDMARK = '/brand/skim-city-wordmark.png';

const SIZES = {
  sm: { mark: 'h-9 sm:h-10', tag: 'text-[0.5rem]' },
  // Twice `sm`, for the public header at rest. At desktop this matches the
  // h-20 header exactly, so a 20% downward nudge hangs it 20% below the rule.
  banner: { mark: 'h-18 sm:h-20', tag: 'text-[0.5rem]' },
  md: { mark: 'h-16 sm:h-20', tag: 'text-[0.55rem]' },
  lg: { mark: 'h-28 sm:h-36', tag: 'text-[0.65rem]' },
} as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  /** Link target, or null to render the mark on its own. */
  to?: string | null;
  /** The tagline is omitted in tight spots like the site header. */
  showTagline?: boolean;
  className?: string;
}

export function Logo({ size = 'md', to = '/', showTagline = false, className = '' }: LogoProps) {
  const { mark, tag } = SIZES[size];

  const content = (
    <span
      className={`inline-flex flex-col items-start transition-transform duration-300 ease-out motion-reduce:transition-none ${className}`}
    >
      <img
        src={WORDMARK}
        alt="Skim City"
        // Width is intrinsic so the mark keeps its proportions at any height,
        // and the height class is what actually drives its size.
        className={`${mark} w-auto object-contain transition-[height] duration-300 ease-out motion-reduce:transition-none`}
        // The mark is decorative weight, not content — never block first paint.
        loading="eager"
        decoding="async"
      />
      {showTagline && (
        <span
          className={`font-display uppercase ${tag} tracking-[0.3em] text-smoke mt-2 border-t border-city-700 pt-1.5`}
        >
          Taking the rough to the smooth
        </span>
      )}
    </span>
  );

  if (!to) return content;

  return (
    <Link to={to} className="inline-flex" aria-label="Skim City — home">
      {content}
    </Link>
  );
}
