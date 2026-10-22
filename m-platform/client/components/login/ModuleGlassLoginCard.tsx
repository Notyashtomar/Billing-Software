'use client';

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MapPin,
  User,
  UserCheck,
} from 'lucide-react';
import { INDIA_AIRPORTS } from '@/data/india-airports';
import {
  resolveStationCompanyBrand,
  resolveStationLogoPath,
} from '@/lib/station-company-logo';

export type ModuleGlassLoginTheme = {
  /** Neon accent (CHR lime / ULD maroon) */
  accent: string;
  /** Text / icon color on filled accent button */
  accentFg: string;
  /** Soft accent glow / focus ring */
  accentMuted: string;
  /** Border glow around glass card */
  cardBorder: string;
};

type StationSlot = {
  loading: boolean;
  code?: string;
  /** Display label (airport / city name). */
  label?: string;
  /** City used for company-logo resolution (preferred over label). */
  city?: string;
  /** Optional company name from admin / airport master. */
  company?: string;
  missingHint: string;
};

export type ModuleGlassLoginCardProps = {
  theme: ModuleGlassLoginTheme;
  title: string;
  subtitle?: string;
  station: StationSlot;
  employeeId: string;
  password: string;
  remember: boolean;
  showPassword: boolean;
  error: string;
  isLoading: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  loadingLabel?: string;
  forgotHint?: string;
  onEmployeeIdChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onRememberChange: (v: boolean) => void;
  onShowPasswordChange: (v: boolean) => void;
  onSubmit: (e: FormEvent) => void;
  onForgotPassword?: () => void;
  headerExtra?: ReactNode;
  /** Shrink spacing so the card fits a laptop viewport without scrolling. */
  compact?: boolean;
  /** Quieter billing card. Other module logins stay on the default glass. */
  refined?: boolean;
};

function resolveLoginCompanyLogo(station: StationSlot): {
  src: string;
  brand: string;
} | null {
  const code = station.code?.trim().toUpperCase();
  if (!code && !station.city?.trim() && !station.company?.trim()) return null;

  const airport = code
    ? INDIA_AIRPORTS.find((a) => a.stationCode.trim().toUpperCase() === code)
    : undefined;

  const input = {
    stationCode: code,
    city: station.city?.trim() || airport?.city || undefined,
    company: station.company?.trim() || airport?.company || undefined,
  };

  return {
    src: resolveStationLogoPath(input),
    brand: resolveStationCompanyBrand(input),
  };
}

/**
 * Glassmorphism module login card (dark glass + neon accent).
 * Used by CHR / ULD — light inputs avoided; card stays frosted dark.
 */
export default function ModuleGlassLoginCard({
  theme,
  title,
  subtitle = 'Access your account securely',
  station,
  employeeId,
  password,
  remember,
  showPassword,
  error,
  isLoading,
  submitDisabled,
  submitLabel,
  loadingLabel = 'Signing in…',
  forgotHint = 'Contact your station admin to reset credentials.',
  onEmployeeIdChange,
  onPasswordChange,
  onRememberChange,
  onShowPasswordChange,
  onSubmit,
  onForgotPassword,
  compact = false,
  refined = false,
}: ModuleGlassLoginCardProps) {
  const employeeIdField = useId();
  const passwordField = useId();
  const rememberField = useId();
  const [forgotMsg, setForgotMsg] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);

  const companyLogo = useMemo(
    () => resolveLoginCompanyLogo(station),
    [station.code, station.city, station.company],
  );

  const displayLabel = useMemo(() => {
    const code = station.code?.trim().toUpperCase();
    if (!code) return station.label?.trim() || '';
    const airport = INDIA_AIRPORTS.find(
      (a) => a.stationCode.trim().toUpperCase() === code,
    );
    // Always prefer airport-master city for known codes (fixes IXC + "New Delhi").
    if (airport) return airport.city.trim() || airport.airport.trim();
    return station.label?.trim() || station.city?.trim() || '';
  }, [station.code, station.label, station.city]);

  useEffect(() => {
    setLogoFailed(false);
  }, [companyLogo?.src]);

  function handleForgot() {
    if (onForgotPassword) {
      onForgotPassword();
      return;
    }
    setForgotMsg(forgotHint);
  }

  return (
    <div
      className={`w-full border ${
        refined ? 'w-[min(100%,340px)] max-w-[340px] rounded-2xl bg-[rgba(10,14,24,0.42)] p-4 backdrop-blur-md sm:p-5' : `max-w-[460px] rounded-[1.35rem] bg-[rgba(8,12,28,0.72)] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl ${compact ? 'p-4 sm:p-5' : 'p-6 sm:p-8'}`
      }`}
      style={{
        borderColor: refined ? 'rgba(255,255,255,0.12)' : theme.cardBorder,
        boxShadow: refined
          ? '0 24px 60px rgba(0,0,0,0.45)'
          : `0 0 0 1px ${theme.cardBorder}, 0 0 40px ${theme.accentMuted}, 0 24px 80px rgba(0,0,0,0.45)`,
      }}
    >
      <div className="text-center">
        {companyLogo && !logoFailed ? (
          <div className={`flex justify-center ${compact ? 'mb-2' : 'mb-4'}`}>
            <div
              className="billing-logo-plate inline-flex max-h-14 items-center justify-center rounded-xl border border-white/15 !bg-[#ffffff] px-4 py-2 shadow-sm"
              style={{ backgroundColor: '#ffffff' }}
            >
              <img
                key={companyLogo.src}
                src={companyLogo.src}
                alt={`${companyLogo.brand} company logo`}
                className={`w-auto object-contain ${refined ? 'h-7 max-w-[150px]' : `max-w-[200px] ${compact ? 'h-8' : 'h-10 sm:h-11'}`}`}
                onError={() => setLogoFailed(true)}
              />
            </div>
          </div>
        ) : null}
        <h1
          className={`font-semibold ${
            refined
              ? 'text-xl tracking-tight text-white'
              : `font-bold uppercase tracking-[0.12em] ${compact ? 'text-xl sm:text-2xl' : 'text-[1.75rem] sm:text-[2rem]'}`
          }`}
          style={refined ? undefined : { color: theme.accent }}
        >
          {title}
        </h1>
        <p className={`text-white/55 ${refined || compact ? 'mt-1 text-sm' : 'mt-2 text-base'}`}>{subtitle}</p>
      </div>

      <div
        className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-white/85 ${
          refined || compact ? 'mt-3 py-2 text-sm' : 'mt-5 py-3 text-base'
        }`}
      >
        <MapPin
          className="size-5 shrink-0"
          style={{ color: theme.accent }}
          aria-hidden
        />
        {station.loading ? (
          <span className="text-white/60">Resolving station…</span>
        ) : station.code ? (
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 text-white">
            <strong className="text-base" style={{ color: theme.accent }}>
              {station.code}
            </strong>
            {displayLabel ? (
              <>
                <span
                  className="inline-block size-1.5 shrink-0 rounded-full bg-white/90"
                  aria-hidden
                />
                <span className="min-w-0 text-base text-white/95">
                  {displayLabel}
                </span>
              </>
            ) : null}
          </span>
        ) : (
          <span className="text-amber-300/90">{station.missingHint}</span>
        )}
      </div>

      <form className={refined || compact ? 'mt-3 space-y-2.5' : 'mt-6 space-y-5'} onSubmit={onSubmit}>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor={employeeIdField}
              className={refined ? 'inline-flex items-center gap-1.5 text-[13px] font-medium text-white/85' : 'inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-white'}
            >
              <User className="size-4 opacity-80" aria-hidden />
              Employee ID
            </label>
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: theme.accent }}
            >
              Required
            </span>
          </div>
          <input
            id={employeeIdField}
            autoComplete="username"
            placeholder="Enter your employee ID"
            className={`w-full rounded-xl border border-white/15 bg-[rgba(0,0,0,0.35)] px-3.5 text-white outline-none placeholder:text-white/35 transition focus:border-transparent ${
              compact || refined ? 'py-2 text-sm' : 'py-3.5 text-base'
            }`}
            style={
              {
                ['--tw-ring-color' as string]: theme.accent,
              } as CSSProperties
            }
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.accentMuted}`;
              e.currentTarget.style.borderColor = theme.accent;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
            value={employeeId}
            onChange={(e) => onEmployeeIdChange(e.target.value)}
            required
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor={passwordField}
              className={refined ? 'inline-flex items-center gap-1.5 text-[13px] font-medium text-white/85' : 'inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-white'}
            >
              <Lock className="size-4 opacity-80" aria-hidden />
              Password
            </label>
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: theme.accent }}
            >
              Encrypted
            </span>
          </div>
          <div className="relative">
            <input
              id={passwordField}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              className={`w-full rounded-xl border border-white/15 bg-[rgba(0,0,0,0.35)] pl-3.5 pr-12 text-white outline-none placeholder:text-white/35 transition ${
                compact || refined ? 'py-2 text-sm' : 'py-3.5 text-base'
              }`}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.accentMuted}`;
                e.currentTarget.style.borderColor = theme.accent;
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
              }}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition hover:opacity-80 active:scale-[0.97]"
              style={{ color: theme.accent }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => onShowPasswordChange(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="size-5" aria-hidden />
              ) : (
                <Eye className="size-5" aria-hidden />
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-base">
          <label
            htmlFor={rememberField}
            className="inline-flex cursor-pointer items-center gap-2.5 text-white transition hover:text-white"
          >
            <input
              id={rememberField}
              type="checkbox"
              checked={remember}
              onChange={(e) => onRememberChange(e.target.checked)}
              className="size-4 rounded border-white/40"
              style={{ accentColor: theme.accent }}
            />
            <span className="text-sm font-medium text-white sm:text-base">
              Remember this device
            </span>
          </label>
          <button
            type="button"
            onClick={handleForgot}
            className="text-sm font-medium text-white transition sm:text-base"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = theme.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#ffffff';
            }}
          >
            Forgot Password?
          </button>
        </div>

        {forgotMsg ? (
          <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
            {forgotMsg}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2.5 text-base text-red-200"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading || submitDisabled}
          className={`inline-flex w-full items-center justify-center gap-2 px-4 font-semibold transition active:scale-[0.99] disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            refined ? 'rounded-xl py-3 text-sm tracking-wide' : `rounded-full font-bold uppercase tracking-[0.14em] ${compact ? 'py-2.5 text-sm' : 'py-4 text-base'}`
          }`}
          style={{
            background: theme.accent,
            color: theme.accentFg,
            outlineColor: theme.accent,
          }}
        >
          {isLoading ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden />
              {loadingLabel}
            </>
          ) : (
            <>
              <UserCheck className="size-5" aria-hidden />
              {submitLabel}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
