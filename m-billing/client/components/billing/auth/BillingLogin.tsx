'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Receipt } from 'lucide-react';
import ModuleGlassLoginCard from '@/components/login/ModuleGlassLoginCard';
import { getApiBase } from '@/services/api';
import { fetchLoginStationOptions } from '@/lib/admin-stations-api';
import {
  BILLING_PORTAL_DENIED_MESSAGE,
  isBillingPortalUserid,
} from '@/lib/billing-portal-users';
import { hasBillingAppAccess, setBwmsEntryApp } from '@/lib/bwms-app-tools';
import {
  buildLandingMapSelectUrl,
  findAdminStationForAirportCode,
  parseLoginStationQuery,
  persistLoginStationSelection,
  readLoginStationSelection,
  type LoginStationQuery,
} from '@/lib/login-station';
import {
  isFrisAdminLikeSession,
  clearFrisSession,
  logoutFrisSession,
  persistFrisSession,
  prepareFrisLogin,
  type FrisPermissionScope,
  type FrisSessionUser,
} from '@/lib/fris-session';
import { persistLoginStationContext } from '@/lib/station-company-logo';
import {
  getDefaultFrisLandingPath,
  isFrisPathAllowedFromUrl,
  isSafeRelativeRedirect,
} from '@/lib/fris-route-permissions';
import { parseUserNavFlags, type UserNavFlags } from '@/lib/nav-permissions';
import BillingLoginBurst from './BillingLoginBurst';

const REMEMBER_KEY = 'billing.rememberUserId';
const BILLING_DESTINATION = '/billing/dashboard';
const GENERIC_LOGIN_ERROR = 'Unable to sign in. Check your details and try again.';

/** Billing brand — Color Hunt navy + lemon (Finance suite). */
const BILLING_BLUE = '#1C0770';
const BILLING_BLUE_DEEP = '#150558';
const BILLING_YELLOW = '#F1FF5E';
const BILLING_ROYAL = '#261CC1';

/** Dark fallback under Grainient (WebGL paints over this). */
const BILLING_SURFACE_DARK = `linear-gradient(165deg, #12084a 0%, ${BILLING_BLUE_DEEP} 45%, ${BILLING_ROYAL} 100%)`;

const BILLING_GLASS_THEME = {
  accent: BILLING_YELLOW,
  accentFg: BILLING_BLUE,
  accentMuted: 'rgba(241,255,94,0.35)',
  cardBorder: 'rgba(241,255,94,0.45)',
};

function resolveLoginStation(
  searchParams: Pick<URLSearchParams, 'get'>,
): LoginStationQuery | null {
  const fromUrl = parseLoginStationQuery(searchParams);
  if (fromUrl) return fromUrl;
  const fromSession = readLoginStationSelection();
  if (fromSession) return fromSession;
  if (typeof window === 'undefined') return null;
  const code = localStorage.getItem('userStationCode')?.trim();
  if (!code) return null;
  const name =
    localStorage.getItem('userStationCity')?.trim() ||
    localStorage.getItem('userStationName')?.trim() ||
    code;
  return {
    stationCode: code,
    stationName: name,
    stationCity: name,
  };
}

type LoginResponseUser = FrisSessionUser;

/**
 * Billing login — same dark glass pattern as GEMM / CHR / TRP,
 * themed with Finance suite blue + yellow.
 */
export default function BillingLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loginStation, setLoginStation] = useState<LoginStationQuery | null>(null);
  const [resolvedStationId, setResolvedStationId] = useState('');
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsFetchFailed, setStationsFetchFailed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmployeeId(saved);
        setRemember(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const station = resolveLoginStation(searchParams);
    setLoginStation(station);

    const reason = searchParams.get('reason');
    if (reason === 'expired') {
      setError('Your session expired. Sign in again to open Billing.');
    } else if (reason === 'forbidden' || reason === 'not-allowed') {
      setError(BILLING_PORTAL_DENIED_MESSAGE);
    }

    if (!station?.stationCode) {
      setResolvedStationId('');
      setStationsFetchFailed(false);
      setStationsLoading(false);
      router.replace(buildLandingMapSelectUrl());
      return;
    }

    persistLoginStationSelection(station);
    persistLoginStationContext({
      stationCode: station.stationCode,
      stationCity: station.stationCity || station.stationName,
    });

    let cancelled = false;
    setStationsLoading(true);
    setStationsFetchFailed(false);

    void fetchLoginStationOptions()
      .then((rows) => {
        if (cancelled) return;
        const match = findAdminStationForAirportCode(rows, station.stationCode, {
          stationName: station.stationName,
          stationCity: station.stationCity,
        });
        setResolvedStationId(match?.id ?? '');
        setStationsFetchFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedStationId('');
          setStationsFetchFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setStationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mounted, router, searchParams]);

  async function authenticate(
    userid: string,
    pwd: string,
    stationId: string,
  ): Promise<{ user: LoginResponseUser }> {
    const apiBase = getApiBase();
    let response: Response;
    try {
      response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid, password: pwd, stationId }),
      });
    } catch {
      throw new Error(GENERIC_LOGIN_ERROR);
    }

    let data: {
      success?: boolean;
      message?: string;
      user?: LoginResponseUser;
    };
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(GENERIC_LOGIN_ERROR);
    }

    if (!response.ok || !data.success || !data.user?.userid) {
      throw new Error(
        String(data.message ?? '').trim() || GENERIC_LOGIN_ERROR,
      );
    }

    return { user: data.user };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const userid = employeeId.trim();
    if (!userid) {
      setError('Enter your User ID.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    const effectiveStationId =
      resolvedStationId.trim() ||
      loginStation?.stationCode?.trim() ||
      searchParams.get('stationCode')?.trim() ||
      '';

    if (!loginStation?.stationCode && !effectiveStationId) {
      setError('Select a station on the map first, then open Billing from Apps.');
      return;
    }
    if (stationsLoading && !effectiveStationId) {
      setError('Loading station details. Try again in a moment.');
      return;
    }
    if (!effectiveStationId) {
      setError(
        stationsFetchFailed
          ? 'Cannot reach the server. Check your connection and try again.'
          : 'This station is not available yet. Choose another station on the map.',
      );
      return;
    }

    setIsLoading(true);
    try {
      prepareFrisLogin();
      const authResult = await authenticate(
        userid,
        password,
        effectiveStationId,
      );

      if (!isBillingPortalUserid(authResult.user.userid)) {
        clearFrisSession({ keepLoginStation: true });
        void logoutFrisSession({ keepLoginStation: true });
        setError(BILLING_PORTAL_DENIED_MESSAGE);
        setIsLoading(false);
        return;
      }

      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, userid);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* ignore */
      }

      if (loginStation) {
        persistLoginStationSelection(loginStation);
        persistLoginStationContext({
          stationCode: loginStation.stationCode,
          stationCity: loginStation.stationCity || loginStation.stationName,
        });
      } else if (effectiveStationId) {
        persistLoginStationContext({
          stationCode: effectiveStationId,
          stationCity: '',
        });
      }
      persistFrisSession(authResult.user);
      setBwmsEntryApp('billing');

      const rawFlags = authResult.user.flags;
      const flags: UserNavFlags | null =
        rawFlags && typeof rawFlags === 'object' && !Array.isArray(rawFlags)
          ? (rawFlags as UserNavFlags)
          : parseUserNavFlags(localStorage.getItem('userFlags'));

      const permissionScope = authResult.user.permissionScope as
        | FrisPermissionScope
        | undefined;
      const nextRaw = searchParams.get('next')?.trim() || BILLING_DESTINATION;
      const next = isSafeRelativeRedirect(nextRaw) ? nextRaw : BILLING_DESTINATION;

      let destination =
        String(authResult.user.landingPath ?? '').trim() ||
        getDefaultFrisLandingPath(flags, permissionScope ?? null);

      const appAccess = Array.isArray(authResult.user.appAccess)
        ? authResult.user.appAccess
        : undefined;
      const billingAllowed =
        next.startsWith('/billing') &&
        (isFrisAdminLikeSession() ||
          hasBillingAppAccess(appAccess) ||
          (flags != null &&
            Object.keys(flags).length > 0 &&
            isFrisPathAllowedFromUrl(next, flags, { appAccess })));

      if (billingAllowed) {
        destination = next.startsWith('/billing') ? next : BILLING_DESTINATION;
      } else if (
        next.startsWith('/billing') &&
        !isFrisAdminLikeSession() &&
        !hasBillingAppAccess(appAccess)
      ) {
        setError(
          'Billing access is not enabled for this station. Ask a superadmin to grant it in Admin → BWMS tools.',
        );
        setIsLoading(false);
        return;
      }

      window.location.assign(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERIC_LOGIN_ERROR);
      setIsLoading(false);
    }
  }

  const stationLabel =
    loginStation?.stationName ||
    loginStation?.stationCity ||
    loginStation?.stationCode ||
    '';

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      style={{ background: BILLING_SURFACE_DARK }}
    >
      <BillingLoginBurst />

      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-2 sm:px-6">
        <Link
          href={buildLandingMapSelectUrl()}
          className="inline-flex items-center gap-2 text-base text-white/80 transition hover:text-[#F1FF5E]"
        >
          <ArrowLeft className="size-5" aria-hidden />
          Stations
        </Link>
        <div className="inline-flex items-center gap-2 text-[#F1FF5E]">
          <Receipt className="size-6" aria-hidden />
          <span className="text-base font-semibold tracking-wide text-white">
            Billing
          </span>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-2">
        <ModuleGlassLoginCard
          compact
          theme={BILLING_GLASS_THEME}
          title="Billing Login"
          subtitle="Access your account securely"
          station={{
            loading: stationsLoading && !loginStation?.stationCode,
            code: loginStation?.stationCode,
            label: stationLabel,
            city: loginStation?.stationCity || loginStation?.stationName,
            missingHint:
              'No station — open from Apps after map select (IXC for now)',
          }}
          employeeId={employeeId}
          password={password}
          remember={remember}
          showPassword={showPassword}
          error={error}
          isLoading={isLoading}
          submitDisabled={!loginStation?.stationCode}
          submitLabel="Login"
          onEmployeeIdChange={setEmployeeId}
          onPasswordChange={setPassword}
          onRememberChange={setRemember}
          onShowPasswordChange={setShowPassword}
          onSubmit={(e) => void onSubmit(e)}
        />
      </main>
    </div>
  );
}
