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

    if (lockLight) {
      root.setAttribute(FRIS_LIGHT_LOCK_ATTR, '');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    } else {
      root.removeAttribute(FRIS_LIGHT_LOCK_ATTR);
      // On dashboard, DashboardThemeProvider owns `dark` + colorScheme — do not reset here.
    }

    return () => {
      if (lockLight) {
        root.removeAttribute(FRIS_LIGHT_LOCK_ATTR);
      }
    };
  }, [lockLight]);

  return null;
}
