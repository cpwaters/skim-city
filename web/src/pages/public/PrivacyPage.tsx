import { PageHeader } from '../../components/public/PageHeader';
import { LegalBody } from '../../components/public/LegalBody';
import { useBusiness } from '../../hooks/useBusiness';

export function PrivacyPage() {
  const business = useBusiness();
  return (
    <>
      <PageHeader eyebrow="Legal" title="Privacy policy" intro="What we collect, why, and how to get it removed." />
      <LegalBody updated="24 August 2026">
        <h2>Who we are</h2>
        <p>
          Skim City is a plastering business based in Manchester, United Kingdom. For the
          purposes of UK GDPR we are the data controller for the information described below.
          Contact us at <a href={`mailto:${business.email}`}>{business.email}</a>.
        </p>

        <h2>What we collect</h2>
        <p>When you request a booking or ask for a quote, we collect:</p>
        <ul>
          <li>your name, phone number and email address;</li>
          <li>the address where the work is to be carried out;</li>
          <li>the description and any photos you send us of the job; and</li>
          <li>a record of quotes, invoices and payments relating to your work.</li>
        </ul>

        <h2>What we do with it</h2>
        <p>
          We use it to quote for your job, arrange the work, invoice you and keep proper
          business records. Our lawful bases are performance of a contract (or steps taken
          at your request before entering one) and our legal obligation to retain accounting
          records.
        </p>

        <h2>Card payments</h2>
        <p>
          Card payments are handled by Stripe. Your card details are entered on their secure
          pages and are never seen, handled or stored by us. Stripe is an independent
          controller for the payment data it processes.
        </p>

        <h2>Who else sees it</h2>
        <p>We share the minimum necessary with:</p>
        <ul>
          <li>Google (Firebase) — hosting, database and application infrastructure;</li>
          <li>Stripe — payment processing and invoicing;</li>
          <li>Resend — sending you quotes, invoices and receipts by email; and</li>
          <li>our accountant, for tax and bookkeeping.</li>
        </ul>
        <p>We do not sell your data, and we do not use it for advertising.</p>

        <h2>How long we keep it</h2>
        <p>
          Enquiries that don't become jobs are deleted after 12 months. Records relating to
          completed work are kept for six years, which is the period HMRC requires for
          business records.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask us for a copy of your data, ask us to correct it, or ask us to delete it
          where we're not required to keep it. Email{' '}
          <a href={`mailto:${business.email}`}>{business.email}</a> and we'll respond within
          one month. If you're not happy with how we've handled it, you can complain to the
          Information Commissioner's Office at ico.org.uk.
        </p>

        <h2>Cookies</h2>
        <p>
          This site does not use advertising or analytics cookies. Firebase sets essential
          storage in your browser to keep you signed in, which only applies to the staff area.
        </p>
      </LegalBody>
    </>
  );
}
