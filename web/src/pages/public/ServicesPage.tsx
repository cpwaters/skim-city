import { ButtonLink } from '../../components/ui/Button';
import { formatPhone } from '../../lib/format';
import { SERVICES } from '../../lib/services';
import { PageHeader } from '../../components/public/PageHeader';
import { useBusiness } from '../../hooks/useBusiness';

export function ServicesPage() {
  const business = useBusiness();
  return (
    <>
      <PageHeader
        eyebrow="What we do"
        title="Services"
        intro="Domestic and light commercial plastering across Greater Manchester. Every job gets a written, fixed-price quote before anything starts."
      />

      <section className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
        <div className="space-y-px bg-noir-700 border border-noir-700 rounded-[3px] overflow-hidden">
          {SERVICES.map((service) => (
            <article key={service.slug} className="bg-noir-800 p-6 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-4">
                <h2 className="display text-xl sm:text-2xl text-bone">{service.title}</h2>
                <span className="font-display uppercase text-[0.65rem] tracking-[0.16em] text-city-500 border border-city-700 px-2.5 py-1 rounded-[2px]">
                  {service.typical}
                </span>
              </div>
              <p className="text-smoke leading-relaxed">{service.detail}</p>
            </article>
          ))}
        </div>

        <div className="mt-12 border border-noir-700 bg-noir-850 rounded-[3px] p-6 sm:p-8">
          <h2 className="display text-lg text-bone mb-3">What a slot means</h2>
          <dl className="grid gap-5 sm:grid-cols-2 text-sm">
            <div>
              <dt className="font-display uppercase tracking-[0.14em] text-city-500 text-xs mb-1.5">
                Full day
              </dt>
              <dd className="text-smoke leading-relaxed">
                The whole day is yours. Rooms, ceilings, replasters — anything that needs
                a proper run at it without watching the clock.
              </dd>
            </div>
            <div>
              <dt className="font-display uppercase tracking-[0.14em] text-city-500 text-xs mb-1.5">
                Repair slot
              </dt>
              <dd className="text-smoke leading-relaxed">
                A morning or an afternoon for smaller work — patches, cracks, making good.
                Two repair slots can run in one day, so book early for the one you want.
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-12 text-center">
          <ButtonLink to={`tel:${business.phone}`} size="lg">
            Call {formatPhone(business.phone)}
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
