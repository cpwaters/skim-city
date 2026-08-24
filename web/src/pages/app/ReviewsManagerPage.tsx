import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { collection, doc, setDoc } from 'firebase/firestore';
import { PageTitle, StatTile } from '../../components/app/PageTitle';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, LiveInput, Textarea } from '../../components/ui/Field';
import { StarRatingDisplay, StarRatingInput } from '../../components/StarRating';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, Notice, Spinner } from '../../components/ui/States';
import { useCollection } from '../../hooks/useFirestore';
import { db } from '../../lib/firebase-crm';
import { shortDate } from '../../lib/format';
import type { Review, ReviewStatus } from '../../types/domain';

const FILTERS: Array<{ value: ReviewStatus | 'all' | 'awaiting'; label: string }> = [
  { value: 'pending', label: 'To approve' },
  { value: 'published', label: 'Live' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'awaiting', label: 'Not replied yet' },
  { value: 'all', label: 'All' },
];

export function ReviewsManagerPage() {
  const { data: reviews, loading } = useCollection<Review>(
    'reviews',
    [orderBy('createdAt', 'desc')],
    'reviews-manager',
  );

  const [filter, setFilter] = useState<ReviewStatus | 'all' | 'awaiting'>('pending');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitted = useMemo(() => reviews.filter((review) => review.submittedAt), [reviews]);
  const published = submitted.filter((review) => review.status === 'published');
  const average = published.length
    ? Math.round((published.reduce((sum, review) => sum + review.rating, 0) / published.length) * 10) / 10
    : 0;

  const visible = useMemo(() => {
    if (filter === 'all') return reviews;
    // "Not replied yet" means an invite has gone out and nothing has come back.
    if (filter === 'awaiting') return reviews.filter((review) => !review.submittedAt);
    return submitted.filter((review) => review.status === filter);
  }, [reviews, submitted, filter]);

  async function patch(reviewId: string, changes: Partial<Review>) {
    try {
      await setDoc(
        doc(db, 'reviews', reviewId),
        { ...changes, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not save that.');
    }
  }

  return (
    <>
      <PageTitle
        title="Reviews"
        subtitle={`${published.length} live on the website`}
        action={
          <Button variant="secondary" onClick={() => setAdding((value) => !value)}>
            {adding ? 'Cancel' : 'Add one manually'}
          </Button>
        }
      />

      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatTile
          label="Average"
          value={published.length ? `${average}` : '—'}
          tone={published.length ? 'blue' : 'default'}
          hint={`${published.length} published`}
        />
        <StatTile
          label="To approve"
          value={String(submitted.filter((r) => r.status === 'pending').length)}
          tone={submitted.some((r) => r.status === 'pending') ? 'blue' : 'default'}
        />
        <StatTile
          label="Awaiting reply"
          value={String(reviews.filter((r) => !r.submittedAt).length)}
          hint="Invites sent, nothing back"
        />
      </div>

      {adding && (
        <div className="mb-5">
          <ManualReviewForm onDone={() => setAdding(false)} onError={setError} />
        </div>
      )}

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={[
              'shrink-0 px-3 py-2 rounded-[2px] border text-[0.65rem] font-display uppercase tracking-[0.12em] transition-colors cursor-pointer',
              filter === option.value
                ? 'border-city-500 bg-city-900/40 text-city-500'
                : 'border-noir-700 text-smoke hover:text-bone hover:border-noir-600',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing here"
            message="Finish a job, then use 'Ask for a review' on the job page. The customer gets a private link — there's no public review form, so nothing can be spammed in."
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {visible.map((review) => (
            <li key={review.id}>
              <Card accent={review.status === 'published'}>
                <div className="px-4 py-3 border-b border-noir-700 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {review.submittedAt ? (
                      <StarRatingDisplay rating={review.rating} size="sm" />
                    ) : (
                      <span className="text-xs text-smoke-dim">No reply yet</span>
                    )}
                    <span className="text-sm text-bone">{review.authorName}</span>
                    {review.source === 'manual' && <Badge>Added by you</Badge>}
                    {review.status === 'published' && <Badge tone="green">Live</Badge>}
                    {review.status === 'hidden' && <Badge tone="maroon">Hidden</Badge>}
                    {review.submittedAt && review.status === 'pending' && (
                      <Badge tone="amber">Needs approving</Badge>
                    )}
                  </div>

                  <span className="text-xs text-smoke-dim">
                    {review.submittedAt
                      ? shortDate(review.submittedAt.slice(0, 10))
                      : review.requestedAt
                        ? `Asked ${shortDate(review.requestedAt.slice(0, 10))}`
                        : ''}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {review.submittedAt ? (
                    <>
                      <p className="text-sm text-smoke leading-relaxed whitespace-pre-wrap">
                        {review.body}
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <LiveInput
                          label="Shown as"
                          value={review.authorName}
                          onCommit={(authorName) => void patch(review.id, { authorName })}
                        />
                        <LiveInput
                          label="Area"
                          value={review.location}
                          placeholder="Chorlton, Manchester"
                          onCommit={(location) => void patch(review.id, { location })}
                        />
                      </div>

                      <LiveInput
                        label="Your public reply (optional)"
                        value={review.reply ?? ''}
                        placeholder="Thanks Danielle — glad you're happy with it."
                        onCommit={(reply) => void patch(review.id, { reply: reply || null })}
                      />

                      <div className="flex flex-wrap gap-2 pt-3 border-t border-noir-700">
                        {review.status !== 'published' && (
                          <Button
                            size="sm"
                            onClick={() =>
                              void patch(review.id, {
                                status: 'published',
                                publishedAt: new Date().toISOString(),
                              })
                            }
                          >
                            Put it on the site
                          </Button>
                        )}
                        {review.status === 'published' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void patch(review.id, { status: 'hidden' })}
                          >
                            Take it down
                          </Button>
                        )}
                        {review.status !== 'hidden' && review.status !== 'published' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void patch(review.id, { status: 'hidden' })}
                          >
                            Hide
                          </Button>
                        )}
                        {review.jobId && (
                          <Link
                            to={`/app/jobs/${review.jobId}`}
                            className="ml-auto self-center text-xs text-city-500 hover:text-city-600"
                          >
                            View job →
                          </Link>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-smoke">
                      Invite sent. Nothing back yet — worth a nudge on WhatsApp if it's been a
                      while.
                      {review.jobId && (
                        <>
                          {' '}
                          <Link to={`/app/jobs/${review.jobId}`} className="text-city-500 hover:text-city-600">
                            View job →
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * For reviews given by text or over the phone.
 *
 * Marked `source: 'manual'` so it is always obvious in the CRM which reviews
 * came through a verified link and which Chris typed in himself.
 */
function ManualReviewForm({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [authorName, setAuthorName] = useState('');
  const [location, setLocation] = useState('');
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = authorName.trim() && rating > 0 && body.trim().length >= 15;

  async function save() {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const ref = doc(collection(db, 'reviews'));
      const review: Omit<Review, 'id'> = {
        jobId: null,
        customerId: null,
        authorName: authorName.trim(),
        location: location.trim(),
        rating,
        body: body.trim(),
        status: 'pending',
        source: 'manual',
        requestToken: null,
        requestedAt: null,
        submittedAt: now,
        publishedAt: null,
        reply: null,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(ref, review);
      onDone();
    } catch (cause: unknown) {
      onError(cause instanceof Error ? cause.message : 'Could not save that review.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Add a review you were given" />
      <div className="p-4 space-y-4">
        <Notice tone="info">
          Only for reviews a customer actually gave you — by text, email or in person. Type it as
          close to their words as you can.
        </Notice>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Shown as"
            required
            value={authorName}
            placeholder="Danielle H."
            onChange={(event) => setAuthorName(event.target.value)}
          />
          <Input
            label="Area"
            value={location}
            placeholder="Chorlton, Manchester"
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>

        <StarRatingInput value={rating} onChange={setRating} />

        <Textarea
          label="What they said"
          required
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />

        <div className="flex gap-2">
          <Button size="sm" disabled={!valid} loading={busy} onClick={() => void save()}>
            Save review
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
