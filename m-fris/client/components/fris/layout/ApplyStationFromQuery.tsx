'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { switchFrisStation } from '@/lib/fris-session';

/**
 * Billing opens FRIS on another host. That host keeps its own station (often COK)
 * unless the link names the billing station and we switch to it.
 */
export function ApplyStationFromQuery() {
  const searchParams = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const requested = String(searchParams.get('stationCode') ?? '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(requested)) return;
    const current = (
      localStorage.getItem('userStationCode') || ''
    )
      .trim()
      .toUpperCase();
    if (current === requested) return;
    started.current = true;
    void switchFrisStation({ stationCode: requested })
      .then(() => {
        window.location.reload();
      })
      .catch(() => {
        started.current = false;
      });
  }, [searchParams]);

  return null;
}
