import { PageHeader } from '../../components/public/PageHeader';
import { ButtonLink } from '../../components/ui/Button';
import { BUSINESS } from '../../lib/business';
import { formatPhone, whatsappLink } from '../../lib/format';

export function ContactPage() {
  const channels = [
    {
      label: 'WhatsApp',
      value: formatPhone(BUSINESS.phone),
      note: 'Quickest way to reach us. Send a photo of the wall and we can usually price it from that.',
      href: whatsappLink(BUSINESS.phone, BUSINESS.whatsappGreeting),
      primary: true,
    },
    {
      label: 'Phone',
      value: formatPhone(BUSINESS.phone),
      note: "If we're on the tools we'll miss it — leave a message and we'll ring back the same day.",
      href: `tel:${BUSINESS.phone}`,
      primary: false,
    },
    {
      label: 'Email',
      value: BUSINESS.email,
      note: 'Best for detailed jobs, drawings or anything you need in writing.',
      href: `mailto:${BUSINESS.email}`,
      primary: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Get in touch"
        title="Contact"
        intro="Ring, message or book a slot straight from the calendar. Quotes are free and there's no obligation."
      />

      <section className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {channels.map((channel) => (
            <a
              key={channel.label}
              href={channel.href}
              {...(channel.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
              className={[
                'block bg-noir-800 border rounded-[3px] p-6 transition-colors',
                channel.primary
                  ? 'border-city-700 hover:border-city-500'
                  : 'border-noir-700 hover:border-city-700',
              ].join(' ')}
            >
              <p className="eyebrow mb-3">{channel.label}</p>
              <p className="display text-base text-bone mb-3 break-all">{channel.value}</p>
              <p className="text-xs text-smoke leading-relaxed">{channel.note}</p>
            </a>
          ))}
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 border-t border-noir-700 pt-12">
          <div>
            <h2 className="display text-lg text-bone mb-3">Where we cover</h2>
            <p className="text-sm text-smoke leading-relaxed mb-4">
              {BUSINESS.coverageAreas.join(', ')} — and anywhere else in Greater Manchester
              worth the drive. Not sure? Just ask.
            </p>
          </div>
          <div>
            <h2 className="display text-lg text-bone mb-3">When we work</h2>
            <p className="text-sm text-smoke leading-relaxed">
              Monday to Saturday. Full days start at 8am; morning repair slots run
              8am–12pm and afternoon slots 1pm–5pm.
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <ButtonLink to="/book" size="lg">
            Book a slot online
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
