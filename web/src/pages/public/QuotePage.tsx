import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ErrorState, Notice, Spinner } from '../../components/ui/States';
import { acceptQuote, declineQuote, getQuote, type PublicQuote } from '../../lib/callables';
import { BUSINESS } from '../../lib/business';
import { formatPhone, longDate, money, slotLabel } from '../../lib/format';
import type { Processor } from '../../types/domain';

/**
 * The public quote page. No sign-in — the unguessable token in the URL is what
 * grants access, and the server only returns the fields rendered here.
 *
 * Accepting does not take payment: it raises a deposit invoice and hands the
 * customer off to Square's or Stripe's hosted page, so no card details ever
 * reach this application.
 */
export function QuotePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const [processor, setProcessor] = useState<Processor>('square');

  useEffect(() => {
    let cancelled = false;

    getQuote({ token })
      .then((result) => {
        if (!cancelled) setQuote(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'This quote link is not valid.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setWorking(true);
    setActionError(null);

    try {
      const result = await acceptQuote({ token, processor });
      if (result.paymentUrl) {
        // Hand off to the processor's hosted payment page.
        window.location.href = result.paymentUrl;
        return;
      }
      setActionError(
        "Your acceptance is recorded, but we couldn't set up the card payment. Chris will be in touch to take the deposit.",
      );
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  async function decline() {
    if (!window.confirm('Turn this quote down? The date will go back on the calendar.')) return;

    setWorking(true);
    setActionError(null);

    try {
      await declineQuote({ token });
      setDeclined(true);
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="min-h-dvh bg-noir-900 hatch">
      <header className="border-b border-noir-700 spotlight">
        <div className="mx-auto max-w-2xl px-5 py-8 flex justify-center">
          <Logo size="md" to={null} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        {loading && <Spinner label="Fetching your quote" />}
        {!loading && error && <ErrorState message={error} />}

        {!loading && quote && (
          <>
            <div className="mb-8">
              <p className="eyebrow mb-3">Quote {quote.reference}</p>
              <h1 className="display text-3xl sm:text-4xl text-bone mb-2">
                {quote.customerName ? `Hi ${quote.customerName.split(' ')[0]},` : 'Your quote'}
              </h1>
              <p className="text-smoke">here's the price for your plastering.</p>
            </div>

            {declined ? (
              <Notice tone="info">
                Thanks for letting us know — the quote has been turned down and the date is back
                on the calendar. If you change your mind, give us a ring on{' '}
                {formatPhone(BUSINESS.phone)}.
              </Notice>
            ) : (
              <>
                <StatusBanner status={quote.status} expiresAt={quote.expiresAt} />

                <section className="bg-noir-800 border border-noir-700 rounded-[3px] overflow-hidden mb-6">
                  {quote.jobDate && (
                    <div className="px-5 py-4 border-b border-noir-700 bg-noir-850">
                      <p className="text-sm text-bone">{longDate(quote.jobDate)}</p>
                      {quote.jobSlot && (
                        <p className="text-xs text-smoke mt-0.5">{slotLabel(quote.jobSlot)}</p>
                      )}
                    </div>
                  )}

                  <div className="px-5 py-4">
                    <h2 className="sr-only">Quote breakdown</h2>
                    <table className="w-full text-sm">
                      <tbody>
                        {quote.lineItems.map((item, index) => (
                          <tr key={index} className="border-b border-noir-700 last:border-0">
                            <td className="py-3 pr-4 text-smoke">
                              {item.description}
                              {item.quantity !== 1 && (
                                <span className="text-smoke-dim"> × {item.quantity}</span>
                              )}
                            </td>
                            <td className="py-3 text-right text-bone whitespace-nowrap tabular-nums">
                              {money(Math.round(item.quantity * item.unitPricePence))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="pt-4 text-smoke-dim">Subtotal</td>
                          <td className="pt-4 text-right text-smoke tabular-nums">
                            {money(quote.subtotalPence)}
                          </td>
                        </tr>
                        {quote.showVat && (
                          <tr>
                            <td className="pt-1.5 text-smoke-dim">VAT @ {quote.vatRatePercent}%</td>
                            <td className="pt-1.5 text-right text-smoke tabular-nums">
                              {money(quote.vatPence)}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="pt-4 border-t border-noir-600 display text-base text-bone">
                            Total
                          </td>
                          <td className="pt-4 border-t border-noir-600 text-right display text-base text-city-500 tabular-nums">
                            {money(quote.totalPence)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {quote.notes && (
                    <div className="px-5 py-4 border-t border-noir-700 bg-noir-850">
                      <p className="text-sm text-smoke leading-relaxed">{quote.notes}</p>
                    </div>
                  )}
                </section>

                {quote.status !== 'accepted' && quote.status !== 'expired' && quote.status !== 'declined' && (
                  <>
                    <div className="border-l-2 border-city-500 bg-city-900/30 px-5 py-4 mb-6">
                      <p className="text-sm text-smoke">
                        To confirm the date, pay a deposit of{' '}
                        <span className="text-bone font-semibold">{money(quote.depositPence)}</span>.
                        The balance of {money(quote.totalPence - quote.depositPence)} is due when
                        the work is finished.
                      </p>
                    </div>

                    <fieldset className="mb-6">
                      <legend className="eyebrow mb-3">Pay the deposit with</legend>
                      <div className="grid grid-cols-2 gap-3">
                        {(['square', 'stripe'] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setProcessor(option)}
                            aria-pressed={processor === option}
                            className={[
                              'px-4 py-3 rounded-[2px] border font-display uppercase text-xs tracking-[0.14em] transition-colors cursor-pointer',
                              processor === option
                                ? 'border-city-500 bg-city-900/40 text-bone'
                                : 'border-noir-600 text-smoke hover:border-city-700 hover:text-bone',
                            ].join(' ')}
                          >
                            {option === 'square' ? 'Square' : 'Stripe'}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-smoke-dim mt-2.5">
                        Both take all major cards. Your card details go straight to the payment
                        provider — we never see them.
                      </p>
                    </fieldset>

                    {actionError && (
                      <div className="mb-5">
                        <Notice tone="error">{actionError}</Notice>
                      </div>
                    )}

                    <div className="space-y-3">
                      <Button size="lg" full loading={working} onClick={() => void accept()}>
                        Accept &amp; pay {money(quote.depositPence)} deposit
                      </Button>
                      <Button variant="ghost" full disabled={working} onClick={() => void decline()}>
                        No thanks
                      </Button>
                    </div>
                  </>
                )}

                {quote.status === 'accepted' && (
                  <Notice tone="success">
                    You've already accepted this quote — thanks. If you still need to pay the
                    deposit, check your email for the payment link, or give us a ring.
                  </Notice>
                )}
              </>
            )}

            <footer className="mt-12 pt-8 border-t border-noir-700 text-center">
              <p className="text-sm text-smoke mb-4">Questions about anything on here?</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <ButtonLink to={`tel:${BUSINESS.phone}`} variant="secondary" size="sm">
                  {formatPhone(BUSINESS.phone)}
                </ButtonLink>
                <ButtonLink to={`mailto:${BUSINESS.email}`} variant="ghost" size="sm">
                  {BUSINESS.email}
                </ButtonLink>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function StatusBanner({ status, expiresAt }: { status: string; expiresAt: string }) {
  if (status === 'expired') {
    return (
      <div className="mb-6">
        <Notice tone="error">
          This quote expired on {longDate(expiresAt)}. Get in touch and we'll happily
          re-price the job at today's rates.
        </Notice>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className="mb-6">
        <Notice tone="info">This quote was turned down. Ring us if that was a mistake.</Notice>
      </div>
    );
  }

  return (
    <p className="text-xs text-smoke-dim mb-6">Valid until {longDate(expiresAt)}</p>
  );
}
