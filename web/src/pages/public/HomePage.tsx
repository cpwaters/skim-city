import { Link } from 'react-router-dom';
import { ButtonLink } from '../../components/ui/Button';
import { BUSINESS } from '../../lib/business';
import { formatPhone, whatsappLink } from '../../lib/format';
import { SERVICES } from '../../lib/services';
import { ReviewsStrip } from '../../components/public/ReviewsStrip';

export function HomePage() {
  return (
    <>
      <Hero />
      <TrustBar />
      <Services />
      <ReviewsStrip />
      <Coverage />
      <FinalCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden spotlight hatch border-b border-noir-700">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28 lg:py-36">
        <p className="eyebrow mb-5">Plastering &amp; rendering · Manchester</p>

        <h1 className="display text-[2.75rem] leading-[0.95] sm:text-7xl lg:text-8xl text-bone max-w-4xl">
          Walls worth
          <span className="block text-city-500">looking at.</span>
        </h1>

        <p className="mt-7 text-lg sm:text-xl text-smoke max-w-xl leading-relaxed">
          Skimming, full replasters and repairs across Greater Manchester.
          Clean edges, dust sheets down, and the job finished when we said it would be.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <ButtonLink to={`tel:${BUSINESS.phone}`} size="lg">
            Call {formatPhone(BUSINESS.phone)}
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

      {/* The trowel edge: a hard diagonal where the plaster meets the wall. */}
      <div
        aria-hidden="true"
        className="absolute -right-24 -bottom-24 size-96 rotate-12 border-t-2 border-l-2 border-city-700/25"
      />
    </section>
  );
}

function TrustBar() {
  const points = [
    'Time-served plasterer',
    'Free written quotes',
    'Fully insured',
    'Card payments accepted',
  ];

  return (
    <section className="border-b border-noir-700 bg-noir-850">
      <ul className="mx-auto max-w-6xl px-5 py-5 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
        {points.map((point) => (
          <li key={point} className="flex items-center gap-2.5 text-sm text-smoke">
            <span aria-hidden="true" className="size-1.5 bg-city-500 rotate-45 shrink-0" />
            {point}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Services() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
      <div className="max-w-2xl mb-12">
        <p className="eyebrow mb-4">What we do</p>
        <h2 className="display text-3xl sm:text-4xl text-bone">
          From a hairline crack to a whole house
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((service) => (
          <article
            key={service.slug}
            className="group bg-noir-800 border border-noir-700 rounded-[3px] p-6 transition-colors hover:border-city-700"
          >
            <div aria-hidden="true" className="mb-5 h-px w-8 bg-city-500 transition-all group-hover:w-14" />
            <h3 className="display text-base text-bone mb-3">{service.title}</h3>
            <p className="text-sm text-smoke leading-relaxed">{service.summary}</p>
          </article>
        ))}
      </div>

      <div className="mt-10">
        <Link
          to="/services"
          className="font-display uppercase text-xs tracking-[0.16em] text-city-500 hover:text-city-600 transition-colors border-b border-city-700 pb-1"
        >
          All services &amp; what they cost →
        </Link>
      </div>
    </section>
  );
}

function Coverage() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-start">
        <div>
          <p className="eyebrow mb-4">Where we work</p>
          <h2 className="display text-3xl sm:text-4xl text-bone mb-5">
            Manchester and everywhere round it
          </h2>
          <p className="text-smoke leading-relaxed mb-6">
            Based in Manchester and covering the whole of Greater Manchester. If you're
            just outside the list, ask anyway — if the job's right, we'll travel.
          </p>
          <ButtonLink to="/contact" variant="secondary">
            Check your area
          </ButtonLink>
        </div>

        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-noir-700 border border-noir-700 rounded-[3px] overflow-hidden">
          {BUSINESS.coverageAreas.map((area) => (
            <li
              key={area}
              className="bg-noir-800 px-4 py-4 text-sm text-smoke font-display uppercase tracking-[0.1em]"
            >
              {area}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-noir-700 spotlight">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24 text-center">
        <h2 className="display text-3xl sm:text-5xl text-bone mb-4">
          Taking the rough
          <span className="text-city-500"> to the smooth</span>
        </h2>
        <p className="text-smoke max-w-md mx-auto mb-9">
          Free quotes, fixed prices, and a date in the diary you can rely on.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <ButtonLink to={`tel:${BUSINESS.phone}`} size="lg">
            Call {formatPhone(BUSINESS.phone)}
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
  );
}
