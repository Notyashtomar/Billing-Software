'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  FRIS_LIGHT_LOCK_ATTR,
  shouldLockFrisLight,
} from '@/components/fris/layout/fris-light-lock';

/**
 * Keeps FRIS pages on the designed light palette when the browser/OS prefers dark.
 * Dashboard is excluded so its in-app light/dark toggle still works.
 */
export function FrisThemeLock() {
  const pathname = usePathname();
  const lockLight = shouldLockFrisLight(pathname);

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const night = root.getAttribute('data-billing-night') != null;
      if (lockLight && !night) {
        root.setAttribute(FRIS_LIGHT_LOCK_ATTR, '');
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      } else if (night) {
        root.setAttribute(FRIS_LIGHT_LOCK_ATTR, '');
        root.classList.remove('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.removeAttribute(FRIS_LIGHT_LOCK_ATTR);
      }
    };
    apply();
    window.addEventListener('billing-night-change', apply);

    return () => {
      window.removeEventListener('billing-night-change', apply);
      if (lockLight) {
        root.removeAttribute(FRIS_LIGHT_LOCK_ATTR);
      }
    };
  }, [lockLight]);

  return null;
}
