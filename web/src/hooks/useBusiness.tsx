import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getBusinessInfo } from '../lib/callables';
import { BUSINESS } from '../lib/business';

/**
 * Business details for the marketing site, live from the CRM.
 *
 * Fetched once and shared, rather than per page: the phone number alone
 * appears on nearly every screen, and one call at mount beats eleven.
 *
 * The static BUSINESS values are the starting state, so the first paint has a
 * real phone number rather than a gap, and a failed or slow call leaves the
 * site looking exactly as it did before. A missing field falls back the same
 * way — settings written before a field existed must not blank it out.
 */
export interface BusinessInfo {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  city: string;
  whatsappGreeting: string;
  coverageAreas: readonly string[];
}

const BusinessContext = createContext<BusinessInfo>(BUSINESS);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<Partial<BusinessInfo> | null>(null);

  useEffect(() => {
    let cancelled = false;

    getBusinessInfo({})
      .then((info) => {
        if (cancelled) return;
        setLive({
          ...(info.name ? { name: info.name } : {}),
          ...(info.email ? { email: info.email } : {}),
          ...(info.phone ? { phone: info.phone } : {}),
          ...(info.coverageAreas?.length ? { coverageAreas: info.coverageAreas } : {}),
          ...(info.whatsappGreeting ? { whatsappGreeting: info.whatsappGreeting } : {}),
        });
      })
      // Deliberately silent: the site is fully usable on the fallback values,
      // and a console error on every visit helps nobody.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<BusinessInfo>(() => ({ ...BUSINESS, ...(live ?? {}) }), [live]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): BusinessInfo {
  return useContext(BusinessContext);
}
