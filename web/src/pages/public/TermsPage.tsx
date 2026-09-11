import { PageHeader } from '../../components/public/PageHeader';
import { BUSINESS } from '../../lib/business';
import { LegalBody } from '../../components/public/LegalBody';

export function TermsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Terms & conditions"
        intro="The plain-English version of how we work together."
      />
      <LegalBody updated="24 August 2026">
        <div className="not-prose border-l-2 border-maroon-500 bg-maroon-900/25 px-4 py-3 mb-8">
          <p className="text-sm text-[#e5a3ad]">
            <strong>Placeholder to review.</strong> These terms are a sensible starting point
            but have not been checked by a solicitor. Confirm the deposit, cancellation and
            guarantee clauses reflect how you actually work before relying on them.
          </p>
        </div>

        <h2>1. Quotes</h2>
        <p>
          Quotes are free and valid for 30 days from the date issued unless stated otherwise.
          A quote is based on the information and photos you give us and on the work being
          reasonably accessible. If we arrive and the job is materially different from what
          was described, we'll tell you before carrying on and agree any change in price
          with you in writing first.
        </p>

        <h2>2. Booking and deposits</h2>
        <p>
          A date is only held provisionally until you accept the quote and pay the deposit.
          The deposit is 20% of the quoted total unless we've agreed otherwise, and it comes
          off the final bill. Until the deposit is paid the slot may be offered to someone else.
        </p>

        <h2>3. Cancellations</h2>
        <ul>
          <li>Cancel more than 7 days before the date: deposit refunded in full.</li>
          <li>Cancel 3–7 days before: half the deposit is retained.</li>
          <li>Cancel less than 48 hours before: the deposit is retained in full.</li>
        </ul>
        <p>
          If we have to cancel or move your date, you'll get the deposit back in full or the
          choice of a new date, whichever you prefer.
        </p>

        <h2>4. Getting the room ready</h2>
        <p>
          Please clear the room of furniture and belongings, and make sure we have access,
          water and power. We put dust sheets down and clear up after ourselves, but plastering
          is wet, dusty work — anything left in the room is at your own risk.
        </p>

        <h2>5. Payment</h2>
        <p>
          The balance is due on completion, within 14 days of the invoice date unless agreed
          otherwise. We accept card payments through Stripe. We reserve the right
          to charge statutory interest on invoices that go past their due date under the Late
          Payment of Commercial Debts (Interest) Act 1998 where it applies.
        </p>

        <h2>6. Drying and decorating</h2>
        <p>
          Fresh plaster needs time to dry — usually four to seven days depending on the room,
          the season and ventilation. Don't paint it before it has gone a uniform pale colour
          throughout, and use a mist coat first. Cracking or peeling caused by decorating too
          early isn't covered.
        </p>

        <h2>7. Our work</h2>
        <p>
          We guarantee our workmanship for 12 months against defects. That doesn't cover
          movement in the building, damp coming from elsewhere, damage by others, or normal
          settlement cracking. Tell us as soon as you spot a problem and we'll come and look
          at it.
        </p>

        <h2>8. Insurance and liability</h2>
        <p>
          We carry public liability insurance. Nothing in these terms limits our liability for
          death or personal injury caused by negligence, for fraud, or for anything else that
          can't be limited in law. Otherwise our liability is limited to the value of the work.
        </p>

        <h2>9. Your rights</h2>
        <p>
          Where you're a consumer, nothing in these terms affects your statutory rights under
          the Consumer Rights Act 2015. For work agreed off-premises you normally have 14 days
          to change your mind; if you ask us to start within that period you may be charged
          for work already done.
        </p>

        <h2>10. Getting hold of us</h2>
        <p>
          Any question, complaint or claim: <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
          These terms are governed by the law of England and Wales.
        </p>
      </LegalBody>
    </>
  );
}
