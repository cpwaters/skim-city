import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '../Logo';
import { ButtonLink } from '../ui/Button';
import { formatPhone, whatsappLink } from '../../lib/format';
import { BUSINESS } from '../../lib/business';

const NAV = [
  { to: '/services', label: 'Services' },
  { to: '/gallery', label: 'Work' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/contact', label: 'Contact' },
];

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  // The logo rests at double size, hanging below the header rule, and pulls
  // back into the bar once the page moves so it stops competing with content.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll(); // a reload can restore a scrolled position before we ever fire
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The overhang would collide with the open mobile menu, so collapse it too.
  const compact = scrolled || open;

  return (
    <div className="min-h-dvh flex flex-col bg-noir-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:bg-city-500 focus:text-noir-900 focus:px-4 focus:py-2 focus:rounded-[2px] focus:font-display focus:uppercase focus:text-sm"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 bg-chrome/95 backdrop-blur-sm border-b border-noir-700">
        <div className="mx-auto max-w-6xl px-5 h-20 flex items-center justify-between gap-6">
          <Logo
            size={compact ? 'sm' : 'banner'}
            className={compact ? '' : 'translate-y-[20%]'}
          />

          <nav className="hidden md:flex items-center gap-7" aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'font-display uppercase text-xs tracking-[0.16em] transition-colors pb-1 border-b',
                    isActive
                      ? 'text-city-500 border-city-500'
                      : 'text-smoke border-transparent hover:text-bone',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
            <ButtonLink to={`tel:${BUSINESS.phone}`} size="sm" variant="primary">
              {formatPhone(BUSINESS.phone)}
            </ButtonLink>
          </nav>

          <button
            className="md:hidden text-bone p-2 -mr-2 cursor-pointer"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span className="block w-6 space-y-1.5" aria-hidden="true">
              <span className={`block h-0.5 bg-current transition-transform ${open ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`block h-0.5 bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 bg-current transition-transform ${open ? '-translate-y-2 -rotate-45' : ''}`} />
            </span>
          </button>
        </div>

        {open && (
          <nav id="mobile-nav" className="md:hidden border-t border-noir-700 bg-chrome-deep" aria-label="Main">
            <ul className="px-5 py-3">
              {NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={`block py-3 font-display uppercase text-sm tracking-[0.14em] border-b border-noir-700 ${
                      location.pathname === item.to ? 'text-city-500' : 'text-bone'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="px-5 pb-5 grid grid-cols-2 gap-3">
              <ButtonLink to={`tel:${BUSINESS.phone}`} size="sm" full>
                Call
              </ButtonLink>
              <ButtonLink to={whatsappLink(BUSINESS.phone, BUSINESS.whatsappGreeting)} size="sm" variant="secondary" full>
                WhatsApp
              </ButtonLink>
            </div>
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <PublicFooter />
    </div>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-noir-700 bg-chrome-deep hatch">
      <div className="mx-auto max-w-6xl px-5 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo size="sm" to={null} showTagline />
        </div>

        <div>
          <h2 className="eyebrow mb-3">Get in touch</h2>
          <ul className="space-y-2 text-sm text-smoke">
            <li>
              <a href={`tel:${BUSINESS.phone}`} className="hover:text-city-500 transition-colors">
                {formatPhone(BUSINESS.phone)}
              </a>
            </li>
            <li>
              <a href={`mailto:${BUSINESS.email}`} className="hover:text-city-500 transition-colors break-all">
                {BUSINESS.email}
              </a>
            </li>
            <li>
              <a
                href={whatsappLink(BUSINESS.phone, BUSINESS.whatsappGreeting)}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-city-500 transition-colors"
              >
                WhatsApp
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="eyebrow mb-3">Services</h2>
          <ul className="space-y-2 text-sm text-smoke">
            <li><Link to="/services" className="hover:text-city-500 transition-colors">Skimming &amp; re-skimming</Link></li>
            <li><Link to="/services" className="hover:text-city-500 transition-colors">Full room replaster</Link></li>
            <li><Link to="/services" className="hover:text-city-500 transition-colors">Patch &amp; crack repairs</Link></li>
            <li><Link to="/services" className="hover:text-city-500 transition-colors">Rendering &amp; boarding</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="eyebrow mb-3">Covering</h2>
          <p className="text-sm text-smoke leading-relaxed">{BUSINESS.coverageAreas.join(' · ')}</p>
        </div>
      </div>

      <div className="border-t border-noir-700">
        <div className="mx-auto max-w-6xl px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-smoke-dim">
          <p>© {new Date().getFullYear()} Skim City. Plastering &amp; rendering, Manchester.</p>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-smoke transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-smoke transition-colors">Terms</Link>
            <Link to="/app" className="hover:text-smoke transition-colors">Staff login</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
