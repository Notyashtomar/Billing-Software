'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { getApiBase } from '@/lib/getApiBase';
import { frisFetch } from '@/lib/fris-auth-fetch';

/**
 * Beacons the current browser route to Nest so admin live-page hover
 * can show where a signed-in user is (not only the last API path).
 */
export function PagePresenceBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<{ path: string; at: number }>({ path: '', at: 0 });

  useEffect(() => {
    if (!pathname) return;
    const search = searchParams?.toString();
    const path = search ? `${pathname}?${search}` : pathname;
    if (
      path.startsWith('/login') ||
      path.startsWith('/admin/login') ||
      path === '/' ||
      pathname === '/ultraadm' ||
      pathname.startsWith('/ultraadm/')
    ) {
      return;
    }

    const now = Date.now();
    if (
      lastSent.current.path === path &&
      now - lastSent.current.at < 25_000
    ) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const base = getApiBase().replace(/\/$/, '');
      void frisFetch(`${base}/auth/page-presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
        timeoutMs: 8_000,
      })
        .then((res) => {
          if (res.ok) {
            lastSent.current = { path, at: Date.now() };
          }
        })
        .catch(() => {
          /* non-blocking */
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, searchParams]);

  return null;
}
