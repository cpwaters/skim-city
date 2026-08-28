import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReviewCard } from './ReviewCard';
import { StarRatingDisplay } from '../StarRating';
import { getReviews, type PublicReview } from '../../lib/callables';

/**
 * Social proof on the home page.
 *
 * Renders nothing at all when there are no published reviews. There is
 * deliberately no placeholder here — an invented testimonial on a trade
 * website is a lie about work that was never done, and unlike the gallery's
 * abstract tiles there is no honest stand-in for one.
 */
export function ReviewsStrip() {
  const [data, setData] = useState<{ reviews: PublicReview[]; average: number; count: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    getReviews({})
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setData({ reviews: [], average: 0, count: 0 }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <section className="border-t border-noir-700 bg-noir-850 hatch">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-12">
          <div>
            <p className="eyebrow mb-4">What customers say</p>
            <h2 className="display text-3xl sm:text-4xl text-bone">
              Straight from the people we've worked for
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="display text-3xl text-city-500 tabular-nums">{data.average}</span>
            <div>
              <StarRatingDisplay rating={data.average} />
              <p className="text-xs text-smoke-dim mt-0.5">
                {data.count} review{data.count === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.reviews.slice(0, 3).map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>

        {data.count > 3 && (
          <div className="mt-8">
            <Link
              to="/reviews"
              className="font-display uppercase text-xs tracking-[0.16em] text-city-500 hover:text-city-600 transition-colors border-b border-city-700 pb-1"
            >
              Read all {data.count} reviews →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
