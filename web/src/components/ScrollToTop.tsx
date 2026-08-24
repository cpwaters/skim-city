import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Router navigation keeps the scroll position by default; a new page should not. */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
