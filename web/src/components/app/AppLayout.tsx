import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Logo } from '../Logo';

/**
 * CRM shell. Sidebar on desktop, bottom bar on mobile — Chris uses this
 * one-handed on site, so the primary destinations sit within thumb reach
 * rather than behind a hamburger.
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
        <header className="lg:hidden sticky top-0 z-30 bg-chrome/95 backdrop-blur-sm border-b border-noir-700 px-4 h-16 flex items-center justify-between">
          <Logo size="sm" to="/app" />
          <button
            onClick={() => void signOut()}
            className="text-xs font-display uppercase tracking-[0.14em] text-smoke cursor-pointer"
          >
            Sign out
          </button>
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
