import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Logo } from '../Logo';

/**
 * CRM shell. Sidebar on desktop; on mobile a bottom bar plus a drawer.
 *
 * The bottom bar keeps the five most-used destinations within thumb reach,
 * because Chris works this one-handed on site. It cannot hold everything
 * though, and the rest — quotes, payments, gallery, reviews, settings — had no
 * mobile route at all, so the drawer carries the full list.
 */

const NAV = [
  { to: '/app', label: 'Today', icon: HomeIcon, end: true },
  { to: '/app/diary', label: 'Diary', icon: CalendarIcon },
  { to: '/app/jobs', label: 'Jobs', icon: JobsIcon },
  { to: '/app/invoices', label: 'Invoices', icon: InvoiceIcon },
  { to: '/app/customers', label: 'Customers', icon: PeopleIcon },
];

const SECONDARY_NAV = [
  { to: '/app/quotes', label: 'Quotes' },
  { to: '/app/payments', label: 'Payments' },
  { to: '/app/gallery', label: 'Gallery' },
  { to: '/app/reviews', label: 'Reviews' },
  { to: '/app/settings', label: 'Settings' },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Tapping a link navigates without unmounting the drawer, so close on route
  // change rather than wiring an onClick into every link.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    // Focus moves into the drawer, and back to the burger on close, so the
    // keyboard and screen-reader path does not get stranded behind the overlay.
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      burgerRef.current?.focus();
    };
  }, [menuOpen]);

  return (
    <div className="min-h-dvh bg-noir-900 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:flex flex-col border-r border-noir-700 bg-chrome-deep sticky top-0 h-dvh">
        <div className="px-5 py-6 border-b border-noir-700">
          <Logo size="sm" to="/app" />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="CRM">
          {NAV.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
          <div className="pt-4 mt-4 border-t border-noir-700 space-y-1">
            {SECONDARY_NAV.map((item) => (
              <SidebarLink key={item.to} {...item} />
            ))}
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-noir-700">
          <p className="text-xs text-smoke-dim truncate mb-2" title={user?.email ?? ''}>
            {user?.email}
          </p>
          <button
            onClick={() => void signOut()}
            className="text-xs font-display uppercase tracking-[0.14em] text-smoke hover:text-maroon-400 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 bg-chrome/95 backdrop-blur-sm border-b border-noir-700 px-4 h-16 flex items-center gap-3">
          <button
            ref={burgerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="crm-drawer"
            className="-ml-1 p-2 text-smoke hover:text-bone transition-colors cursor-pointer"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Logo size="sm" to="/app" />
        </header>

        {/* Bottom padding clears the mobile tab bar. */}
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-7 pb-24 lg:pb-8 min-w-0">
          <Outlet />
        </main>
      </div>

      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-chrome-deep border-t border-noir-700 pb-[env(safe-area-inset-bottom)]"
        aria-label="CRM"
      >
        <ul className="grid grid-cols-5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center gap-1 py-2.5 text-[0.6rem] font-display uppercase tracking-[0.1em] transition-colors',
                    isActive ? 'text-city-500' : 'text-smoke',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon active={isActive} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-noir-900/80 backdrop-blur-sm cursor-default"
          />

          <div
            id="crm-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="CRM menu"
            className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] bg-chrome-deep border-r border-noir-700 flex flex-col"
          >
            <div className="px-5 py-5 border-b border-noir-700 flex items-center justify-between">
              <Logo size="sm" to="/app" />
              <button
                ref={closeRef}
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="p-2 -mr-2 text-smoke hover:text-bone transition-colors cursor-pointer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="All CRM pages">
              {NAV.map((item) => (
                <SidebarLink key={item.to} {...item} />
              ))}
              <div className="pt-4 mt-4 border-t border-noir-700 space-y-1">
                {SECONDARY_NAV.map((item) => (
                  <SidebarLink key={item.to} {...item} />
                ))}
              </div>
            </nav>

            <div className="px-5 py-4 border-t border-noir-700 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <p className="text-xs text-smoke-dim truncate mb-2" title={user?.email ?? ''}>
                {user?.email}
              </p>
              <button
                onClick={() => void signOut()}
                className="text-xs font-display uppercase tracking-[0.14em] text-smoke hover:text-maroon-400 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  to,
  label,
  end,
  icon: Icon,
}: {
  to: string;
  label: string;
  end?: boolean;
  icon?: (props: { active: boolean }) => React.ReactElement;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 py-2.5 rounded-[2px] text-sm transition-colors',
          isActive
            ? 'bg-noir-800 text-city-500 border-l-2 border-city-500'
            : 'text-smoke hover:text-bone hover:bg-noir-800 border-l-2 border-transparent',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {Icon && <Icon active={isActive} />}
          <span className="font-display uppercase tracking-[0.12em] text-xs">{label}</span>
        </>
      )}
    </NavLink>
  );
}

/* Inline SVGs rather than an icon package: five icons do not justify a
   dependency, and these inherit currentColor for free. */

function iconProps(active: boolean) {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: active ? 2.2 : 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <rect x="3" y="5" width="18" height="16" rx="1" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function JobsIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M4 20 14 10" />
      <path d="M11 7l6-3 3 3-3 6-6-6Z" />
      <path d="M3 21l3-1-2-2-1 3Z" />
    </svg>
  );
}

function InvoiceIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function PeopleIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 14.8c2.1.6 3.5 2.4 3.5 4.6" />
    </svg>
  );
}
