import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/public/PageHeader';
import { ReviewCard } from '../../components/public/ReviewCard';
import { StarRatingDisplay } from '../../components/StarRating';
import { ButtonLink } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/States';
import { getReviews, type PublicReview } from '../../lib/callables';
import { BUSINESS } from '../../lib/business';
import { formatPhone, whatsappLink } from '../../lib/format';

export function ReviewsPage() {
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

  return (
    <>
      <PageHeader
        eyebrow="What customers say"
        title="Reviews"
        intro="Every review here comes from a customer we've actually done work for — we send the link ourselves once the job's finished."
      />

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        {data === null ? (
          <Spinner label="Loading reviews" />
        ) : data.count === 0 ? (
          <div className="text-center max-w-md mx-auto py-8">
            <div aria-hidden="true" className="mx-auto mb-5 h-px w-12 bg-city-700" />
            <h2 className="display text-xl text-bone mb-3">No reviews up yet</h2>
            <p className="text-smoke mb-7">
              We're a new site and we'd rather show nothing than make something up. Ring us and
              we'll happily put you in touch with people we've worked for.
            </p>
            <ButtonLink to={`tel:${BUSINESS.phone}`} variant="secondary">
              {formatPhone(BUSINESS.phone)}
            </ButtonLink>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-10 pb-8 border-b border-noir-700">
              <div className="flex items-center gap-4">
                <span className="display text-5xl text-city-500 tabular-nums">{data.average}</span>
                <div>
                  <StarRatingDisplay rating={data.average} size="lg" />
                  <p className="text-sm text-smoke mt-1">
                    from {data.count} review{data.count === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>

            {/* Structured data so the rating can show in Google results. Only
                emitted when there are real reviews behind it. */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'LocalBusiness',
                  name: BUSINESS.name,
                  telephone: `+44${BUSINESS.phone.slice(1)}`,
                  email: BUSINESS.email,
                  areaServed: BUSINESS.coverageAreas,
                  aggregateRating: {
                    '@type': 'AggregateRating',
                    ratingValue: data.average,
                    reviewCount: data.count,
                    bestRating: 5,
                    worstRating: 1,
                  },
                  review: data.reviews.slice(0, 10).map((review) => ({
                    '@type': 'Review',
                    author: { '@type': 'Person', name: review.authorName },
                    reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5 },
                    reviewBody: review.body,
                    ...(review.submittedAt ? { datePublished: review.submittedAt.slice(0, 10) } : {}),
                  })),
                }),
              }}
            />
          </>
        )}

        <div className="mt-14 text-center border-t border-noir-700 pt-12">
          <h2 className="display text-2xl text-bone mb-3">Fancy joining them?</h2>
          <p className="text-smoke mb-7 max-w-md mx-auto">
            Book a slot, or send a photo of the wall and we'll price it up.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <ButtonLink to="/book" size="lg">
              Book a slot
            </ButtonLink>
            <ButtonLink
              to={whatsappLink(BUSINESS.phone, BUSINESS.whatsappGreeting)}
              size="lg"
              variant="secondary"
            >
              WhatsApp us
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
