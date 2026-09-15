import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { StarRatingInput } from '../../components/StarRating';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Textarea, Input } from '../../components/ui/Field';
import { ErrorState, Notice, Spinner } from '../../components/ui/States';
import { getReviewRequest, submitReview } from '../../lib/callables';
import { formatPhone, longDate } from '../../lib/format';
import { MIN_REVIEW_LENGTH, MAX_REVIEW_LENGTH } from '../../types/domain';
import { useBusiness } from '../../hooks/useBusiness';

/**
 * The review form a customer reaches from the link in their email.
 *
 * No sign-in and no public entry point — the token in the URL is the only way
 * in, which is what stops the reviews being spammable without a CAPTCHA.
 */
export function ReviewPage() {
  const business = useBusiness();
  const { token = '' } = useParams<{ token: string }>();
  const [context, setContext] = useState<Awaited<ReturnType<typeof getReviewRequest>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [errors, setErrors] = useState<{ rating?: string; body?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getReviewRequest({ token })
      .then((result) => {
        if (cancelled) return;
        setContext(result);
        setAuthorName(result.authorName);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : 'This review link is not valid.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const next: typeof errors = {};
    if (rating === 0) next.rating = 'Pick a rating.';
    if (body.trim().length < MIN_REVIEW_LENGTH) next.body = 'Please write a little more.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitReview({
        token,
        rating,
        body: body.trim(),
        ...(authorName.trim() ? { authorName: authorName.trim() } : {}),
      });
      setDone(true);
    } catch (cause: unknown) {
      setSubmitError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-noir-900 hatch">
      <header className="border-b border-noir-700 spotlight">
        <div className="mx-auto max-w-2xl px-5 py-8 flex justify-center">
          <Logo size="md" to={null} showTagline />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        {loading && <Spinner label="Just a moment" />}
        {!loading && loadError && <ErrorState message={loadError} />}

        {!loading && context && (done || context.alreadySubmitted) ? (
          <div className="text-center py-10">
            <div aria-hidden="true" className="mx-auto mb-6 h-px w-14 bg-city-500" />
            <h1 className="display text-2xl sm:text-3xl text-bone mb-4">
              {done ? 'Thanks — that means a lot' : "You've already left a review"}
            </h1>
            <p className="text-smoke mb-8 max-w-md mx-auto">
              {done
                ? "We read every one. It'll go up on the site shortly."
                : 'Thanks again for taking the time.'}
            </p>
            <ButtonLink to="/">Have a look at the site</ButtonLink>
          </div>
        ) : null}

        {!loading && context && !done && !context.alreadySubmitted && (
          <>
            <div className="mb-8">
              <p className="eyebrow mb-3">Your review</p>
              <h1 className="display text-3xl sm:text-4xl text-bone mb-2">
                How did we do{context.authorName ? `, ${context.authorName.split(' ')[0]}` : ''}?
              </h1>
              {context.jobDate && (
                <p className="text-smoke">
                  For the work on {longDate(context.jobDate)}.
                </p>
              )}
            </div>

            <form onSubmit={submit} noValidate className="space-y-7">
              {submitError && <Notice tone="error">{submitError}</Notice>}

              <div className="bg-noir-800 border border-noir-700 rounded-[3px] p-5 sm:p-6">
                <StarRatingInput
                  value={rating}
                  onChange={(next) => {
                    setRating(next);
                    setErrors((current) => ({ ...current, rating: undefined }));
                  }}
                  error={errors.rating}
                />
              </div>

              <Textarea
                label="Tell us how it went"
                required
                rows={6}
                value={body}
                error={errors.body}
                maxLength={MAX_REVIEW_LENGTH}
                placeholder="What we did, how it turned out, whether we turned up when we said we would…"
                hint={`${body.trim().length}/${MAX_REVIEW_LENGTH} — honest is more useful than polite.`}
                onChange={(event) => {
                  setBody(event.target.value);
                  if (event.target.value.trim().length >= MIN_REVIEW_LENGTH) {
                    setErrors((current) => ({ ...current, body: undefined }));
                  }
                }}
              />

              <Input
                label="Shown as"
                value={authorName}
                maxLength={60}
                hint="We only ever show a first name and initial, never your full name or address."
                onChange={(event) => setAuthorName(event.target.value)}
              />

              <Button type="submit" size="lg" full loading={submitting}>
                {submitting ? 'Sending' : 'Send review'}
              </Button>

              <p className="text-xs text-smoke-dim text-center">
                Your review is checked before it goes on the site. If something went wrong with
                the job, ring{' '}
                <a href={`tel:${business.phone}`} className="text-city-500 hover:text-city-600">
                  {formatPhone(business.phone)}
                </a>{' '}
                and we'll put it right.
              </p>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
