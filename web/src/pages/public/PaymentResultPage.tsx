import { useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { ButtonLink } from '../../components/ui/Button';
import { BUSINESS } from '../../lib/business';
import { formatPhone } from '../../lib/format';

/**
 * Where Square and Stripe send the customer back to after checkout.
 *
 * This page reports the *redirect*, not the payment: the money is only
 * confirmed when the processor's webhook reaches us. The copy is careful not
 * to promise more than that — a customer who closes the tab early must not be
 * told they have paid when the webhook says otherwise.
 */
export function PaymentResultPage() {
  const { result } = useParams<{ result: string }>();
  const [params] = useSearchParams();
  const success = result === 'success';
  const invoiceNumber = params.get('invoice');

  return (
    <div className="min-h-dvh grid place-items-center bg-noir-900 spotlight hatch px-5 py-16">
      <div className="w-full max-w-lg text-center">
        <div className="mb-10 flex justify-center">
          <Logo size="md" />
        </div>

        <div className="bg-noir-800 border border-noir-700 rounded-[3px] p-8 sm:p-10">
          <div
            aria-hidden="true"
            className={`mx-auto mb-6 h-px w-14 ${success ? 'bg-city-500' : 'bg-maroon-500'}`}
          />

          {success ? (
            <>
              <h1 className="display text-2xl sm:text-3xl text-bone mb-4">Thanks — payment sent</h1>
              <p className="text-smoke leading-relaxed mb-3">
                Your card payment has gone through to our processor.
                {invoiceNumber && (
                  <>
                    {' '}
                    Invoice <span className="text-bone">{invoiceNumber}</span>.
                  </>
                )}
              </p>
              <p className="text-sm text-smoke-dim leading-relaxed mb-8">
                A receipt will land in your inbox once it clears — usually within a minute
                or two. Your date is confirmed as soon as the deposit is settled.
              </p>
            </>
          ) : (
            <>
              <h1 className="display text-2xl sm:text-3xl text-bone mb-4">Payment cancelled</h1>
              <p className="text-smoke leading-relaxed mb-3">
                No money has been taken and nothing has changed.
              </p>
              <p className="text-sm text-smoke-dim leading-relaxed mb-8">
                Your quote is still valid — open the link in your email again whenever
                you're ready, or give us a ring if something didn't look right.
              </p>
            </>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <ButtonLink to="/" variant={success ? 'primary' : 'secondary'}>
              Back to Skim City
            </ButtonLink>
            <ButtonLink to={`tel:${BUSINESS.phone}`} variant="secondary">
              {formatPhone(BUSINESS.phone)}
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
