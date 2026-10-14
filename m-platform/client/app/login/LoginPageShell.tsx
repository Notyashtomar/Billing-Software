'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageLoading } from '@/components/ui/PageLoading';
import LoginPageClient from '@/features/fris/auth/LoginPageClient';
import { logoutFrisToStationMap } from '@/lib/fris-session';
import {
  buildLandingMapSelectUrl,
  hasLoginPageContext,
  hasLoginStationContext,
  SKIP_LANDING_INTRO_PARAM,
} from '@/lib/login-station';
import {
  resolveStoredLoginStation,
  stashLoginReturnNext,
} from '@/lib/login-station-client';

function isSessionReason(reason: string): boolean {
  const r = reason.trim().toLowerCase();
  return r === 'expired' || r === 'forbidden';
}

/**
 * Login shell. Bare `/login` (no context) is redirected by middleware — do not
 * add a second client redirect here (avoids hard/soft nav races).
 *
 * `/login?next=…` without a station is not a valid entry — restore station from
 * map selection storage or send the user back to the station map.
 */
export default function LoginPageShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stationCode = searchParams.get('stationCode')?.trim() ?? '';
  const stationId = searchParams.get('stationId')?.trim() ?? '';
  const next = searchParams.get('next')?.trim() ?? '';
  const reason = searchParams.get('reason')?.trim() ?? '';
  const logout = searchParams.get('logout')?.trim() ?? '';
  const showLogin = hasLoginPageContext(searchParams);
  const hasStationInUrl = hasLoginStationContext(searchParams);
  const [stationGate, setStationGate] = useState<'pending' | 'ready' | 'map'>(
    hasStationInUrl ? 'ready' : 'pending',
  );

  useEffect(() => {
    if (logout === '1') {
      void (async () => {
        await logoutFrisToStationMap();
        router.replace(`/?${SKIP_LANDING_INTRO_PARAM}=1`);
      })();
      return;
    }

    if (hasStationInUrl) {
      setStationGate('ready');
      return;
    }

    const stored = resolveStoredLoginStation();
    if (stored?.stationCode) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('stationCode', stored.stationCode);
      if (stored.stationName) params.set('stationName', stored.stationName);
      if (stored.stationCity) params.set('stationCity', stored.stationCity);
      router.replace(`/login?${params.toString()}`);
      return;
    }

    if (next) stashLoginReturnNext(next);
    setStationGate('map');
    router.replace(buildLandingMapSelectUrl());
  }, [
    hasStationInUrl,
    logout,
    next,
    router,
    searchParams,
  ]);

  // Defensive only — middleware should already have redirected bare /login.
  if (!showLogin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#03050d] px-4">
        <PageLoading />
        <div className="max-w-sm text-center">
          <p className="text-sm text-slate-300">
            Select a station on the map before signing in.
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200"
          >
            Go to station map
          </Link>
        </div>
      </div>
    );
  }

  if (logout === '1' || stationGate === 'pending' || stationGate === 'map') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#03050d]">
        <PageLoading />
      </div>
    );
  }

  return <LoginPageClient />;
}
