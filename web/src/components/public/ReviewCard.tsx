import { StarRatingDisplay } from '../StarRating';
import type { PublicReview } from '../../lib/callables';

function monthYear(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <figure className="bg-noir-800 border border-noir-700 rounded-[3px] p-6 flex flex-col h-full">
      <StarRatingDisplay
        rating={review.rating}
        label={`${review.rating} out of 5 stars`}
      />

      <blockquote className="mt-4 text-smoke leading-relaxed flex-1">
        {review.body}
      </blockquote>

      {review.reply && (
        <div className="mt-4 pl-4 border-l-2 border-maroon-500">
          <p className="text-[0.6rem] font-display uppercase tracking-[0.14em] text-smoke-dim mb-1.5">
            Chris replied
          </p>
          <p className="text-sm text-smoke leading-relaxed">{review.reply}</p>
        </div>
      )}

      <figcaption className="mt-5 pt-4 border-t border-noir-700">
        <span className="display text-sm text-bone">{review.authorName}</span>
        <span className="block text-xs text-smoke-dim mt-1">
          {[review.location, monthYear(review.submittedAt)].filter(Boolean).join(' · ')}
        </span>
      </figcaption>
    </figure>
  );
}
