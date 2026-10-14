'use client';
import {
  Suspense,
  useState,
  useRef,
  useEffect,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  Zap,
  User,
  UserCheck,
  ArrowLeft,
  MapPin,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getApiBase } from '@/services/api';
import { fetchLoginStationOptions } from '@/lib/admin-stations-api';
import {
  buildLandingMapSelectUrl,
  findAdminStationForAirportCode,
  hasLoginPageContext,
  markSkipLandingIntro,
  isTestingStationCode,
  parseLoginStationQuery,
  persistLoginStationSelection,
  resolveStoredLoginStation,
  SKIP_LANDING_INTRO_PARAM,
  type LoginStationQuery,
} from '@/lib/login-station';
import {
  isFrisAdminLikeSession,
  logoutFrisToStationMap,
  persistFrisSession,
  prepareFrisLogin,
} from '@/lib/fris-session';
import { hasBillingAppAccess, setBwmsEntryApp } from '@/lib/bwms-app-tools';
import { persistLoginStationContext } from '@/lib/station-company-logo';
import {
  getDefaultFrisLandingPath,
  isFrisPathAllowedFromUrl,
  isSafeRelativeRedirect,
} from '@/lib/fris-route-permissions';
import type { FrisPermissionScope } from '@/lib/fris-session';
import { parseUserNavFlags, type UserNavFlags } from '@/lib/nav-permissions';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  required,
  email,
  minLength,
  normalizeText,
  runValidators,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import { parseJsonText } from '@/lib/session-fetch';
import LoginBackground from '@/components/login/LoginBackgroundVideo';
import LoginAppsLauncher from '@/components/login/LoginAppsLauncher';
import ForgotPasswordForm from './ForgotPasswordForm';

const SidebarMenu = dynamic(() => import('@/components/login/SidebarMenu'), {
  ssr: false,
});

const RunningAirlineLogos = dynamic(
  () => import('@/components/RunningAirlineLogos'),
  { ssr: false, loading: () => null },
);

const LOGIN_FIELD_ORDER = ['identifier', 'password', 'station'] as const;
type LoginField = (typeof LOGIN_FIELD_ORDER)[number];

/** Non-sensitive device preference only — never stores passwords or tokens. */
const REMEMBER_DEVICE_KEY = 'fris.rememberDevice';

type RememberedDevice = {
  identifier: string;
  stationCode?: string;
};

function readRememberedDevice(): RememberedDevice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(REMEMBER_DEVICE_KEY);
    if (!raw) return null;
    // Legacy: plain identifier string from early builds / ops-module pattern
    if (raw[0] !== '{') {
      const identifier = raw.trim();
      return identifier ? { identifier } : null;
    }
    const parsed = JSON.parse(raw) as Partial<RememberedDevice>;
    const identifier =
      typeof parsed.identifier === 'string' ? parsed.identifier.trim() : '';
    if (!identifier) return null;
    const stationCode =
      typeof parsed.stationCode === 'string'
        ? parsed.stationCode.trim().toUpperCase()
        : undefined;
    return stationCode ? { identifier, stationCode } : { identifier };
  } catch {
    return null;
  }
}

function writeRememberedDevice(value: RememberedDevice | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!value?.identifier.trim()) {
      localStorage.removeItem(REMEMBER_DEVICE_KEY);
      return;
    }
    const payload: RememberedDevice = {
      identifier: value.identifier.trim(),
    };
    const code = value.stationCode?.trim().toUpperCase();
    if (code) payload.stationCode = code;
    localStorage.setItem(REMEMBER_DEVICE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

function validateLoginIdentifier(value: string): string | null {
  return runValidators(
    required(value, 'User ID'),
    minLength(value, 3, 'User ID'),
    value.includes('@') ? email(value, 'Email') : null,
  );
}

function validateLoginPassword(value: string): string | null {
  if (!value) return 'Password is required.';
  return null;
}

/** Shape of `user` from `/auth/login` when `success` is true. */
type LoginResponseUser = {
  userid: string;
  name: string;
  email: string;
  role?: string;
  department?: unknown;
  flags?: unknown;
  permissionScope?: FrisPermissionScope;
  landingPath?: string;
  /** Enabled BWMS login-tile ids for the active station. */
  appAccess?: string[];
  stationId?: string;
  /** IATA / station code for the active login station (e.g. DEL). */
  stationCode?: string;
  city?: string;
  station?: string;
  locations?: string;
};

const PRIMARY_COLOR = '#10b981';
const BUTTON_COLOR = '#00ffb2';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'forgot'>('login');
  const [stationsLoading, setStationsLoading] = useState(false);
  const [resolvedStationId, setResolvedStationId] = useState('');
  const [loginStation, setLoginStation] = useState<LoginStationQuery | null>(null);
  const [isClient, setIsClient] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const loginRequestRef = useRef<AbortController | null>(null);
  const loginAttemptRef = useRef(0);
  const { errors, clearField, clearAll, applyAndFocus } =
    useFieldErrors<LoginField>(LOGIN_FIELD_ORDER);

  useEffect(() => {
    return () => {
      loginAttemptRef.current += 1;
      loginRequestRef.current?.abort();
      loginRequestRef.current = null;
    };
  }, []);

  // Set client flag - prevents hydration mismatch; restore remembered device prefs
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setIsClient(true);
      const remembered = readRememberedDevice();
      if (remembered) {
        setIdentifier(remembered.identifier);
        setRememberDevice(true);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Legacy logout URL: clear auth and send user back to the station map.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const logout = searchParams.get('logout');
    if (logout === '1') {
      void (async () => {
        await logoutFrisToStationMap();
        router.replace(`/?${SKIP_LANDING_INTRO_PARAM}=1`, { scroll: false });
      })();
    }
  }, [searchParams, router]);

  // Bare /login redirect lives in middleware only (see apps/web/middleware.ts).

  // Mobile: hamburger drives SidebarMenu. Desktop/tablet: sidebar's own chevron.
  useEffect(() => {
    if (!isClient) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [isClient]);

  useEffect(() => {
    const station =
      parseLoginStationQuery(searchParams) ?? resolveStoredLoginStation();
    setLoginStation(station);
    if (station) {
      persistLoginStationSelection(station);
      persistLoginStationContext({
        stationCode: station.stationCode,
        stationCity: station.stationCity || station.stationName,
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (loginStation && resolvedStationId.trim() && !stationsLoading) {
      clearField('station');
    }
  }, [loginStation, resolvedStationId, stationsLoading, clearField]);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'expired') {
      setLoginError('Your FRIS session expired. Please sign in again to continue.');
    } else if (reason === 'forbidden') {
      setLoginError(
        'This account cannot access FRIS from here. Contact your administrator.',
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isClient) return;
    const stationCode =
      loginStation?.stationCode ?? searchParams.get('stationCode')?.trim() ?? '';
    const legacyStationId = searchParams.get('stationId')?.trim();
    const stationName =
      loginStation?.stationName ?? searchParams.get('stationName')?.trim() ?? '';
    const stationCity =
      loginStation?.stationCity ?? searchParams.get('stationCity')?.trim() ?? '';

    if (!stationCode && !legacyStationId) {
      setResolvedStationId('');
      setStationsLoading(false);
      return;
    }

    let cancelled = false;
    setStationsLoading(true);

    void fetchLoginStationOptions()
      .then((rows) => {
        if (cancelled) return;
        if (legacyStationId && rows.some((row) => row.id === legacyStationId)) {
          setResolvedStationId(legacyStationId);
          return;
        }
        if (stationCode) {
          const match = findAdminStationForAirportCode(rows, stationCode, {
            stationName,
            stationCity,
          });
          setResolvedStationId(match?.id ?? '');
          return;
        }
        setResolvedStationId('');
      })
      .catch(() => {
        if (!cancelled) setResolvedStationId('');
      })
      .finally(() => {
        if (!cancelled) setStationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isClient, loginStation, searchParams]);

  const NETWORK_LOGIN_ERROR =
    'Server unreachable. Please check your network connection and try again.';
  const SERVER_LOGIN_ERROR =
    'Server error. Please try again in a moment.';
  const GENERIC_LOGIN_ERROR =
    'Something went wrong. Please try again.';

  const authenticateUser = async (
    userid: string,
    password: string,
    stationId: string,
    signal?: AbortSignal,
  ) => {
    const apiBase = getApiBase();
    try {
      await fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
    }
    let response: Response;
    try {
      response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userid,
          password,
          stationId,
        }),
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new Error(NETWORK_LOGIN_ERROR);
    }

    let data: {
      success?: boolean;
      message?: string;
      user?: LoginResponseUser;
    };
    try {
      const text = await response.text();
      const parsed = parseJsonText<typeof data>(text, null);
      if (parsed == null && text.trim()) {
        throw new SyntaxError('Invalid JSON body');
      }
      data = parsed ?? {};
    } catch {
      throw new Error(
        'Unexpected response from server. Please try again.',
      );
    }

    if (response.status >= 500) {
      throw new Error(SERVER_LOGIN_ERROR);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(data.message || 'Invalid credentials');
      }
      if (response.status === 408 || response.status === 504) {
        throw new Error(
          'Request timed out. Please try again.',
        );
      }
      throw new Error(data.message || GENERIC_LOGIN_ERROR);
    }

    if (!data.success) {
      throw new Error(data.message || 'Invalid credentials');
    }

    if (!data.user) {
      throw new Error(data.message || GENERIC_LOGIN_ERROR);
    }

    return {
      success: true as const,
      user: data.user,
      message: data.message,
    };
  };

  const finishLoginAttempt = (attemptId: number) => {
    if (attemptId !== loginAttemptRef.current) return;
    setIsLoading(false);
    loginRequestRef.current = null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const next: FieldErrors<LoginField> = {};
    const identifierErr = validateLoginIdentifier(identifier);
    if (identifierErr) next.identifier = identifierErr;
    const passwordErr = validateLoginPassword(password);
    if (passwordErr) next.password = passwordErr;

    const effectiveStationId =
      resolvedStationId.trim() ||
      loginStation?.stationCode?.trim() ||
      searchParams.get('stationCode')?.trim() ||
      searchParams.get('stationId')?.trim() ||
      '';

    if (!loginStation && !effectiveStationId) {
      next.station = 'Select a station on the India map before signing in.';
    } else if (stationsLoading && !effectiveStationId) {
      next.station = 'Loading station details. Please try again.';
    } else if (!effectiveStationId) {
      next.station =
        'This station is not available yet. Choose another station on the map.';
    }

    if (applyAndFocus(next)) return;

    loginRequestRef.current?.abort();
    const attemptId = ++loginAttemptRef.current;
    const controller = new AbortController();
    loginRequestRef.current = controller;

    setLoginError(null);
    clearAll();
    setIsLoading(true);

    try {
      prepareFrisLogin();
      const authResult = await authenticateUser(
        normalizeText(identifier) || identifier.trim(),
        password,
        effectiveStationId,
        controller.signal,
      );

      if (attemptId !== loginAttemptRef.current) return;

      persistLoginStationContext({
        stationCode:
          loginStation?.stationCode?.trim() ||
          String(authResult.user.stationCode ?? '').trim() ||
          searchParams.get('stationCode')?.trim() ||
          (/^[A-Za-z]{3,4}$/.test(resolvedStationId.trim())
            ? resolvedStationId.trim()
            : ''),
        stationCity:
          loginStation?.stationCity?.trim() ||
          loginStation?.stationName?.trim() ||
          searchParams.get('stationCity')?.trim() ||
          searchParams.get('stationName')?.trim() ||
          String(authResult.user.city ?? '').trim() ||
          '',
      });
      writeRememberedDevice(
        rememberDevice
          ? {
              identifier: normalizeText(identifier) || identifier.trim(),
              stationCode:
                loginStation?.stationCode?.trim() ||
                String(authResult.user.stationCode ?? '').trim() ||
                searchParams.get('stationCode')?.trim() ||
                undefined,
            }
          : null,
      );
      persistFrisSession(authResult.user);
      setBwmsEntryApp('fris');

      const rawFlags = authResult.user.flags;
      const flags: UserNavFlags | null =
        rawFlags &&
        typeof rawFlags === 'object' &&
        !Array.isArray(rawFlags)
          ? (rawFlags as UserNavFlags)
          : parseUserNavFlags(localStorage.getItem('userFlags'));

      const permissionScope = authResult.user.permissionScope as
        | FrisPermissionScope
        | undefined;
      const next = searchParams.get('next');
      let destination =
        String(authResult.user.landingPath ?? '').trim() ||
        getDefaultFrisLandingPath(flags, permissionScope ?? null);

      if (next && isSafeRelativeRedirect(next)) {
        const appAccess = Array.isArray(authResult.user.appAccess)
          ? authResult.user.appAccess
          : undefined;
        const billingNext =
          next.startsWith('/billing') && hasBillingAppAccess(appAccess);
        const flagsAllow =
          flags &&
          Object.keys(flags).length > 0 &&
          isFrisPathAllowedFromUrl(next, flags, { appAccess });

        if (isFrisAdminLikeSession() || flagsAllow || billingNext) {
          destination = next;
        }
      }

      window.location.assign(destination);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (attemptId !== loginAttemptRef.current) return;
      const msg =
        err instanceof Error ? err.message : GENERIC_LOGIN_ERROR;
      const isNetwork =
        msg === 'Failed to fetch' ||
        msg === NETWORK_LOGIN_ERROR ||
        (err instanceof TypeError && msg.toLowerCase().includes('fetch'));
      setLoginError(isNetwork ? NETWORK_LOGIN_ERROR : msg || GENERIC_LOGIN_ERROR);
    } finally {
      finishLoginAttempt(attemptId);
    }
  };

  const showLoginForm = hasLoginPageContext(searchParams);
  if (!showLoginForm) {
    return <div className="min-h-screen bg-[#03050d]" aria-hidden />;
  }

  const stationDisplayName =
    loginStation?.stationName?.trim() ||
    searchParams.get('stationName')?.trim() ||
    loginStation?.stationCode?.trim() ||
    searchParams.get('stationCode')?.trim() ||
    '';
  const stationDisplayCode =
    loginStation?.stationCode?.trim() || searchParams.get('stationCode')?.trim() || '';
  const stationDisplayCity =
    loginStation?.stationCity?.trim() || searchParams.get('stationCity')?.trim() || '';

  return (
    <div className="fixed inset-0 min-h-dvh overflow-hidden bg-[#03050d]">
      {/* Right chrome: 9-dot apps / tiles launcher */}
      {isClient && <LoginAppsLauncher />}

      {/* Mobile hamburger for SidebarMenu (desktop uses sidebar's own trigger) */}
      {isClient && isMobile && (
        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          data-sidebar-toggle
          aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isSidebarOpen}
          className="fixed bottom-6 right-6 z-[60] rounded-full p-3 shadow-lg active:opacity-90"
          style={{ backgroundColor: PRIMARY_COLOR }}
        >
          <div className="flex h-6 w-6 flex-col items-center justify-center gap-1">
            <div
              className={`h-0.5 w-5 bg-white transition-all duration-300 ${
                isSidebarOpen ? 'translate-y-1.5 rotate-45' : ''
              }`}
            />
            <div
              className={`h-0.5 w-5 bg-white transition-all duration-300 ${
                isSidebarOpen ? 'opacity-0' : ''
              }`}
            />
            <div
              className={`h-0.5 w-5 bg-white transition-all duration-300 ${
                isSidebarOpen ? '-translate-y-1.5 -rotate-45' : ''
              }`}
            />
          </div>
        </motion.button>
      )}

      {/* Left chrome: back + station */}
      <div className="fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-40 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-2 sm:left-6 sm:top-5 sm:w-[min(20rem,calc(100vw-3rem))]">
        <Link
          href={buildLandingMapSelectUrl()}
          onClick={markSkipLandingIntro}
          aria-label="Back to Stations"
          className="group inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-2.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[border-color,background-color,transform] duration-200 hover:border-emerald-400/45 hover:bg-black/65 active:scale-[0.97] sm:px-4"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-400/25">
            <ArrowLeft className="h-4 w-4 text-emerald-400 transition-transform duration-200 group-hover:-translate-x-0.5" />
          </span>
          <span className="sm:hidden">Back</span>
          <span className="hidden sm:inline">Back to Stations</span>
        </Link>

        {stationDisplayName ? (
          isTestingStationCode(stationDisplayCode) ? (
            <div
              id="field-station"
              className="min-w-0 rounded-xl border px-3.5 py-2.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md sm:px-4 sm:py-3"
              style={{
                borderColor: errors.station ? '#ef4444' : 'rgba(251, 191, 36, 0.45)',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
              }}
              aria-invalid={!!errors.station}
              aria-describedby={errors.station ? 'field-station-error' : undefined}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/90">
                Testing station
              </p>
              <p className="mt-1 truncate text-sm font-semibold tracking-tight text-white sm:text-base">
                {stationDisplayName}
              </p>
              <p className="mt-1 text-xs text-gray-300">
                Superadmin only. Not linked to any airport. Use Back to Stations for a live station.
              </p>
            </div>
          ) : (
          <Link
            id="field-station"
            href={buildLandingMapSelectUrl()}
            onClick={markSkipLandingIntro}
            className="min-w-0 rounded-xl border px-3.5 py-2.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md outline-none transition-[border-color,background-color,transform] duration-200 hover:border-emerald-400/45 hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-emerald-400/50 active:scale-[0.99] sm:px-4 sm:py-3"
            style={{
              borderColor: errors.station ? '#ef4444' : `${PRIMARY_COLOR}40`,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
            }}
            aria-label={`Change station: ${stationDisplayName}. Opens station map.`}
            aria-invalid={!!errors.station}
            aria-describedby={errors.station ? 'field-station-error' : undefined}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
              Airport / Station
            </p>
            <p className="mt-1 truncate text-sm font-semibold tracking-tight text-white sm:text-base">
              {stationDisplayName}
            </p>
            {(stationDisplayCode || stationDisplayCity) && (
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-gray-300">
                <MapPin className="h-3 w-3 shrink-0 text-emerald-400/80" aria-hidden />
                <span className="truncate">
                  {[stationDisplayCode, stationDisplayCity].filter(Boolean).join(' · ')}
                </span>
              </p>
            )}
            <p className="mt-1.5 text-[11px] font-medium text-emerald-400/70">
              Tap to change station
            </p>
          </Link>
          )
        ) : null}
      </div>

      {/* Auth alerts — stay until dismissed (WCAG 2.2.1 Timing Adjustable) */}
      <AnimatePresence>
        {loginError && (
          <motion.div
            key={`err-${loginError}`}
            role="alert"
            aria-live="assertive"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto fixed left-1/2 top-[8.5rem] z-[100] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-red-500/50 bg-red-950/90 px-3 py-3 text-sm text-red-100 shadow-lg backdrop-blur-md sm:top-[9rem] sm:px-4"
          >
            <div className="flex items-start gap-2">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500"
                aria-hidden
              />
              <span className="min-w-0 flex-1 select-text">{loginError}</span>
              <button
                type="button"
                onClick={() => setLoginError(null)}
                className="shrink-0 rounded-md p-1 text-red-200/80 transition hover:bg-red-500/20 hover:text-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
        {!loginError && loginSuccess && (
          <motion.div
            key={`ok-${loginSuccess}`}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto fixed left-1/2 top-[4.75rem] z-[100] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-emerald-500/50 bg-emerald-950/90 px-3 py-3 text-sm text-emerald-100 shadow-lg backdrop-blur-md sm:px-4"
          >
            <div className="flex items-start gap-2">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                aria-hidden
              />
              <span className="min-w-0 flex-1 select-text">{loginSuccess}</span>
              <button
                type="button"
                onClick={() => setLoginSuccess(null)}
                className="shrink-0 rounded-md p-1 text-emerald-200/80 transition hover:bg-emerald-500/20 hover:text-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen background (static on mobile / reduced-motion) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <LoginBackground />
      </div>

      {/* Sidebar — mobile: hamburger-controlled; tablet/desktop: floating chevron */}
      {isClient && (
        <SidebarMenu
          open={isMobile ? isSidebarOpen : undefined}
          onOpenChange={isMobile ? setIsSidebarOpen : undefined}
          showTrigger={!isMobile}
        />
      )}

      {/* Login form — bottom padding clears the airline logo marquee */}
      <div className="relative z-20 flex h-full min-h-0 items-start justify-center overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+14.5rem)] lg:items-center lg:pt-40">
        <div className="relative z-20 w-full max-w-md md:max-w-lg">
          <div className="relative w-full">
            <div
              className={cn(
                'relative rounded-xl border p-4 backdrop-blur-2xl sm:p-5 md:p-6',
                authMode === 'forgot'
                  ? 'max-h-[calc(100dvh-7.5rem)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
                  : 'overflow-hidden',
              )}
              style={{
                borderColor: `${PRIMARY_COLOR}40`,
                boxShadow: `
                  0 25px 100px rgba(0, 0, 0, 0.7),
                  0 0 60px ${PRIMARY_COLOR}15
                `,
              }}
            >
              {/* Subtle border glow */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                <div
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    boxShadow: `inset 0 0 0 1px ${PRIMARY_COLOR}20`,
                  }}
                />
              </div>

              <div className="relative z-10">
                <AnimatePresence mode="wait" initial={false}>
                  {authMode === 'forgot' ? (
                    <ForgotPasswordForm
                      key="forgot"
                      onBackToLogin={() => {
                        setAuthMode('login');
                        setLoginError(null);
                      }}
                      onError={(message) => {
                        setLoginSuccess(null);
                        setLoginError(message);
                      }}
                      onSuccess={(message) => {
                        setLoginError(null);
                        setLoginSuccess(message);
                      }}
                    />
                  ) : (
                <LoginMotionForm
                  ready={isClient}
                  key="login"
                  ref={formRef}
                  onSubmit={handleSubmit}
                  noValidate
                  className="space-y-4 sm:space-y-5 md:space-y-8"
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: { staggerChildren: 0.03 },
                    },
                  }}
                >
                  <motion.div
                    className="mb-5 text-center sm:mb-6"
                    variants={{
                      hidden: { opacity: 0, y: -20 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <h1 className="text-2xl font-bold tracking-wide text-emerald-500 sm:text-3xl md:text-4xl">
                      {isTestingStationCode(stationDisplayCode) ? 'Testing FRIS' : 'FRIS Login'}
                    </h1>
                    <p className="mt-2 text-base text-gray-300 sm:text-lg">
                      {isTestingStationCode(stationDisplayCode)
                        ? 'Superadmin only. Same FRIS tabs, isolated from airport stations'
                        : 'Access your account securely'}
                    </p>
                  </motion.div>

                  {/* Station validation — next to form actions (not only top-left chip) */}
                  {errors.station ? (
                    <motion.div
                      className="rounded-xl border border-red-500/45 bg-red-950/70 px-3.5 py-3"
                      variants={{
                        hidden: { opacity: 0, y: -8 },
                        visible: { opacity: 1, y: 0 },
                      }}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-300/90">
                        Station required
                      </p>
                      <p
                        id="field-station-error"
                        role="alert"
                        className="mt-1.5 text-sm leading-snug text-red-100"
                      >
                        {errors.station}
                      </p>
                      <Link
                        href={buildLandingMapSelectUrl()}
                        onClick={markSkipLandingIntro}
                        className="mt-2 inline-flex text-sm font-medium text-emerald-300 underline-offset-2 hover:underline"
                      >
                        Open station map
                      </Link>
                    </motion.div>
                  ) : null}

                  {/* User ID */}
                  <motion.div
                    className="group space-y-2"
                    variants={{
                      hidden: { opacity: 0, x: -20 },
                      visible: { opacity: 1, x: 0 },
                    }}
                  >
                    <label
                      htmlFor="field-identifier"
                      className="flex items-center gap-2 text-base font-medium text-white"
                    >
                      <User className="h-5 w-5 shrink-0" aria-hidden />
                      <span>User ID</span>
                      <span
                        className="ml-auto text-xs font-medium"
                        style={{ color: PRIMARY_COLOR }}
                      >
                        Required
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        id="field-identifier"
                        name="identifier"
                        type="text"
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          clearField('identifier');
                        }}
                        onFocus={() => setFocusedField('identifier')}
                        onBlur={() => setFocusedField(null)}
                        autoFocus
                        aria-invalid={!!errors.identifier}
                        aria-describedby={
                          errors.identifier ? 'field-identifier-error' : undefined
                        }
                        className={cn(
                          'w-full rounded-xl border bg-black/50 px-4 py-3 text-base text-white placeholder-gray-400 transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none',
                          errors.identifier && FRIS_INVALID_CONTROL,
                        )}
                        style={{
                          borderColor: errors.identifier
                            ? undefined
                            : `${PRIMARY_COLOR}40`,
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        }}
                        placeholder="Employee ID or email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                      <AnimatePresence>
                        {focusedField === 'identifier' && (
                          <motion.div
                            initial={{ opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 2 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className="absolute right-4 top-1/2 -translate-y-1/2"
                          >
                            <Zap
                              className="h-5 w-5"
                              style={{ color: PRIMARY_COLOR }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <FormFieldError
                      id="field-identifier-error"
                      message={errors.identifier}
                    />
                  </motion.div>

                  {/* Password */}
                  <motion.div
                    className="group space-y-2"
                    variants={{
                      hidden: { opacity: 0, x: -20 },
                      visible: { opacity: 1, x: 0 },
                    }}
                  >
                    <label
                      htmlFor="field-password"
                      className="flex items-center gap-2 text-base font-medium text-white"
                    >
                      <Lock className="h-5 w-5 shrink-0" aria-hidden />
                      <span>Password</span>
                      <span
                        className="ml-auto text-xs font-medium"
                        style={{ color: PRIMARY_COLOR }}
                      >
                        Required
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        id="field-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearField('password');
                        }}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        aria-invalid={!!errors.password}
                        aria-describedby={
                          errors.password ? 'field-password-error' : undefined
                        }
                        className={cn(
                          'w-full rounded-xl border bg-black/50 px-4 py-3 pr-14 text-base text-white placeholder-gray-400 transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none',
                          errors.password && FRIS_INVALID_CONTROL,
                        )}
                        style={{
                          borderColor: errors.password
                            ? undefined
                            : `${PRIMARY_COLOR}40`,
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 opacity-90 transition-opacity hover:opacity-100"
                        style={{ color: PRIMARY_COLOR }}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    <FormFieldError
                      id="field-password-error"
                      message={errors.password}
                    />
                  </motion.div>

                  {/* Checkbox & Forgot Password */}
                  <motion.div
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-1 gap-3"
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <label
                      htmlFor="rememberDevice"
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className="relative">
                        <input
                          id="rememberDevice"
                          name="rememberDevice"
                          type="checkbox"
                          checked={rememberDevice}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRememberDevice(checked);
                            if (!checked) writeRememberedDevice(null);
                          }}
                          className="w-5 h-5 rounded bg-black/50 focus:ring-2"
                          style={{
                            borderColor: `${PRIMARY_COLOR}50`,
                            color: PRIMARY_COLOR,
                            accentColor: PRIMARY_COLOR,
                          }}
                        />
                      </div>
                      <span
                        className="text-base"
                        style={{ color: PRIMARY_COLOR }}
                      >
                        Remember this device
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginError(null);
                        setLoginSuccess(null);
                        setAuthMode('forgot');
                      }}
                      className="text-base underline-offset-2 hover:underline"
                      style={{ color: PRIMARY_COLOR }}
                    >
                      <span>Forgot Password?</span>
                    </button>
                  </motion.div>

                  {/* Submit */}
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    aria-busy={isLoading}
                    className="relative w-full rounded-xl px-6 py-3.5 text-base font-medium tracking-wide text-black transition-[filter,box-shadow,background-color] duration-200 hover:brightness-105 hover:shadow-[0_0_20px_rgba(255,208,0,0.55)] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:brightness-100 disabled:hover:shadow-none"
                    style={{ backgroundColor: BUTTON_COLOR }}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-3">
                      {isLoading ? (
                        <>
                          <motion.div
                            className="h-6 w-6 rounded-full border-2 border-black/25 border-t-slate-900"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: 'linear',
                            }}
                          />
                          <span>Signing in…</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-5 w-5" />
                          <span>Sign In</span>
                        </>
                      )}
                    </span>
                  </motion.button>
                </LoginMotionForm>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isClient && <RunningAirlineLogos />}
    </div>
  );
}

type LoginMotionFormProps = Omit<ComponentProps<typeof motion.form>, 'children'> & {
  ready: boolean;
  children?: ReactNode;
};

function LoginMotionForm({ ready, children, ...props }: LoginMotionFormProps) {
  if (!ready) {
    const {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      variants: _variants,
      style: _style,
      ...formProps
    } = props;
    return (
      <form {...(formProps as ComponentProps<'form'>)}>{children}</form>
    );
  }
  return <motion.form {...props}>{children}</motion.form>;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <LoginPageContent />
    </Suspense>
  );
}
