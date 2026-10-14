import 'client-only';

import {
  SKIP_LANDING_INTRO_KEY,
  coalesceStationDisplay,
  parseLoginStationQuery,
  type LoginStationQuery,
} from '@/lib/login-station-constants';
import { preloadLandingScene } from '@/lib/landing-preload';

/** Map → /login station selection (before FRIS auth writes userStation*). */
export const LOGIN_STATION_SESSION_KEY = 'login.selectedStation';
const TRP_STATION_STORAGE_KEY = 'trp-station-context';

function warmLandingScene(): void {
  if (typeof window === 'undefined') return;
  // Static import — avoid a separate webpack chunk (ChunkLoadError on logout/HMR).
  try {
    preloadLandingScene();
  } catch {
    // Preload is best-effort; never block logout / skip-intro.
  }
}

export function persistLoginStationSelection(station: LoginStationQuery): void {
  if (typeof window === 'undefined') return;
  const normalized =
    coalesceStationDisplay(
      station.stationCode,
      station.stationName,
      station.stationCity,
    ) ?? station;
  const payload: LoginStationQuery = {
    stationCode: normalized.stationCode.trim(),
    stationName: normalized.stationName.trim() || normalized.stationCode.trim(),
    stationCity: normalized.stationCity.trim(),
  };
  if (!payload.stationCode) return;
  sessionStorage.setItem(LOGIN_STATION_SESSION_KEY, JSON.stringify(payload));
  // Seed TRP session so /trp/login sees station even without query params.
  sessionStorage.setItem(
    TRP_STATION_STORAGE_KEY,
    JSON.stringify({
      stationCode: payload.stationCode,
      stationName: payload.stationName || payload.stationCity || payload.stationCode,
      selectedAt: new Date().toISOString(),
    }),
  );
  // Keep FRIS map keys in sync so module login never falls back to a stale IXC.
  try {
    localStorage.setItem('userStationCode', payload.stationCode);
    localStorage.setItem('fris_selected_station', payload.stationCode);
    // Always resolve city from airport master so code/city stay paired.
    const city =
      payload.stationCity ||
      coalesceStationDisplay(payload.stationCode)?.stationCity ||
      '';
    if (city) {
      localStorage.setItem('userStationCity', city);
    }
    if (payload.stationName) {
      localStorage.setItem('userStationName', payload.stationName);
    }
    localStorage.setItem('trp_station_code', payload.stationCode);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readLoginStationSelection(): LoginStationQuery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LOGIN_STATION_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoginStationQuery;
    if (!parsed?.stationCode?.trim()) return null;
    return (
      coalesceStationDisplay(
        parsed.stationCode,
        parsed.stationName,
        parsed.stationCity,
      ) ?? {
        stationCode: parsed.stationCode.trim(),
        stationName: parsed.stationName?.trim() || parsed.stationCode.trim(),
        stationCity: parsed.stationCity?.trim() || '',
      }
    );
  } catch {
    return null;
  }
}

/** Session key: preserve post-login return path when sending user back to the map. */
export const LOGIN_RETURN_NEXT_KEY = 'login.returnNext';

/**
 * Best-effort station restore for `/login` when the URL lacks `stationCode`
 * (e.g. edge middleware redirect with only `next`). Never invent a station.
 */
export function resolveStoredLoginStation(): LoginStationQuery | null {
  if (typeof window === 'undefined') return null;

  const fromSession = readLoginStationSelection();
  if (fromSession?.stationCode) return fromSession;

  const code =
    localStorage.getItem('userStationCode')?.trim() ||
    localStorage.getItem('fris_selected_station')?.trim() ||
    '';
  if (!code) return null;

  const city = localStorage.getItem('userStationCity')?.trim() || '';
  const name = localStorage.getItem('userStationName')?.trim() || '';
  return (
    coalesceStationDisplay(code, name, city) ?? {
      stationCode: code.toUpperCase(),
      stationName: name || city || code.toUpperCase(),
      stationCity: city || name || code.toUpperCase(),
    }
  );
}

/** Append stored login return path (if any) to a station login URL. */
export function appendLoginReturnNext(
  loginUrl: string,
  nextPath?: string | null,
): string {
  const next =
    String(nextPath ?? '').trim() ||
    (typeof window !== 'undefined'
      ? sessionStorage.getItem(LOGIN_RETURN_NEXT_KEY)?.trim() || ''
      : '');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return loginUrl;
  const sep = loginUrl.includes('?') ? '&' : '?';
  return `${loginUrl}${sep}next=${encodeURIComponent(next)}`;
}

export function stashLoginReturnNext(nextPath: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const next = String(nextPath ?? '').trim();
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    sessionStorage.removeItem(LOGIN_RETURN_NEXT_KEY);
    return;
  }
  sessionStorage.setItem(LOGIN_RETURN_NEXT_KEY, next);
}

function resolveMapStationForModuleLogin(): {
  code: string;
  name: string;
  city: string;
} | null {
  if (typeof window === 'undefined') return null;

  // 1) URL wins (map → /login?stationCode=DEL → Apps click while still on that URL)
  const fromUrl = parseLoginStationQuery(
    new URLSearchParams(window.location.search),
  );
  if (fromUrl?.stationCode) {
    return {
      code: fromUrl.stationCode,
      name: fromUrl.stationName || fromUrl.stationCity || fromUrl.stationCode,
      city: fromUrl.stationCity || fromUrl.stationName || fromUrl.stationCode,
    };
  }

  // 2) FRIS/map localStorage is source of truth after station pick.
  //    Do NOT prefer stale trp-station-context / login.selectedStation (often IXC).
  const storedCode =
    localStorage.getItem('userStationCode')?.trim() ||
    localStorage.getItem('fris_selected_station')?.trim() ||
    '';
  if (storedCode) {
    const normalized = coalesceStationDisplay(
      storedCode,
      localStorage.getItem('userStationName'),
      localStorage.getItem('userStationCity'),
    );
    return {
      code: normalized?.stationCode || storedCode.toUpperCase(),
      name: normalized?.stationName || storedCode.toUpperCase(),
      city: normalized?.stationCity || storedCode.toUpperCase(),
    };
  }

  // 3) Session selection (Apps / module login without localStorage yet)
  const fromSession = readLoginStationSelection();
  if (fromSession?.stationCode) {
    return {
      code: fromSession.stationCode,
      name: fromSession.stationName || fromSession.stationCity || fromSession.stationCode,
      city: fromSession.stationCity || fromSession.stationName || fromSession.stationCode,
    };
  }

  // 4) Legacy TRP session blob
  try {
    const raw = sessionStorage.getItem(TRP_STATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        stationCode?: string;
        stationName?: string;
      };
      const normalized = coalesceStationDisplay(
        parsed?.stationCode,
        parsed?.stationName,
      );
      if (normalized?.stationCode) {
        return {
          code: normalized.stationCode,
          name: normalized.stationName,
          city: normalized.stationCity,
        };
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

/** Build `/trp/login?...` from current /login URL, session, or post-auth localStorage. */
export function buildTrpLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/trp/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/trp/login?${q.toString()}`;
}

/** Build `/bill-receivables/login?...` with map-selected station. */
export function buildBillReceivablesLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/bill-receivables/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/bill-receivables/login?${q.toString()}`;
}

/** Build `/safety-incident/login?...` with map-selected station (same source as TRP). */
export function buildSafetyLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/safety-incident/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/safety-incident/login?${q.toString()}`;
}

/** Build `/ams/login?...` with map-selected station (Aircraft Maintenance Support). */
export function buildAmsLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/ams/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/ams/login?${q.toString()}`;
}

/** Build `/cms/login?...` with map-selected station (Cab Management System). */
export function buildCmsLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/cms/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/cms/login?${q.toString()}`;
}

/** Build `/chr/login?...` with map-selected station (all stations; IXC primary dev). */
export function buildChrLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/chr/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/chr/login?${q.toString()}`;
}

/** Build `/batest/login?...` with map-selected station (BA Test / breath analyser). */
export function buildBatestLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/batest/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/batest/login?${q.toString()}`;
}

/** Build `/uld/login?...` with map-selected station (all stations; IXC primary dev). */
export function buildUldLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/uld/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/uld/login?${q.toString()}`;
}

/** Build `/gemm/login?...` with map-selected station. */
export function buildGemmLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/gemm/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/gemm/login?${q.toString()}`;
}

/** Build `/hr/login?...` with map-selected station. */
export function buildHrLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/hr/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/hr/login?${q.toString()}`;
}

/** Build `/compliance/login?...` with map-selected station. */
export function buildComplianceLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  if (!station) return '/compliance/login';
  const q = new URLSearchParams({
    stationCode: station.code,
    stationName: station.name,
    stationCity: station.city,
  });
  return `/compliance/login?${q.toString()}`;
}

/**
 * Build `/manuals/login?...` with map-selected station.
 * Optional `stationId` overrides the map station code when provided.
 */
export function buildManualsLoginHref(stationId?: string): string {
  const station = resolveMapStationForModuleLogin();
  const code = stationId?.trim().toUpperCase() || station?.code;
  if (!code) return '/manuals/login';
  const name =
    station && (!stationId || station.code === code) ? station.name : code;
  const city =
    station && (!stationId || station.code === code) ? station.city : code;
  const q = new URLSearchParams({
    stationCode: code,
    stationName: name,
    stationCity: city,
  });
  return `/manuals/login?${q.toString()}`;
}

/**
 * Apps Billing tile → dedicated Billing login with map station,
 * then `/billing/insights/payables` (Payables hosts command summary).
 */
export function buildBillingLoginHref(): string {
  const station = resolveMapStationForModuleLogin();
  const q = new URLSearchParams();
  if (station) {
    q.set('stationCode', station.code);
    q.set('stationName', station.name);
    const fromUrl = parseLoginStationQuery(
      new URLSearchParams(window.location.search),
    );
    const fromSession = readLoginStationSelection();
    const city =
      fromUrl?.stationCity?.trim() ||
      fromSession?.stationCity?.trim() ||
      localStorage.getItem('userStationCity')?.trim() ||
      '';
    if (city) q.set('stationCity', city);
  }
  const qs = q.toString();
  return qs ? `/billing/login?${qs}` : '/billing/login';
}

/** BWMS Apps tiles page (`/login?…&apps=1`) with current station context preserved.
 * Pass station explicitly. Do NOT fall back to sessionStorage here — that makes
 * SSR href (`/login?apps=1`) differ from the first client paint (hydration mismatch).
 * After mount, login pages set station from URL/storage and re-render with a full href.
 */
export function buildLoginAppsHref(
  station?: Pick<
    LoginStationQuery,
    'stationCode' | 'stationName' | 'stationCity'
  > | null,
): string {
  const code = station?.stationCode?.trim();
  if (!code || !station) return '/login?apps=1';

  const q = new URLSearchParams({
    stationCode: code,
    stationName:
      station.stationName?.trim() || station.stationCity?.trim() || code,
    apps: '1',
  });
  const city = station.stationCity?.trim();
  if (city) q.set('stationCity', city);
  return `/login?${q.toString()}`;
}

/**
 * Apps tiles href after module logout / Apps chrome.
 * Prefer module session stationCode; fall back to map selection.
 */
export function buildLoginAppsHrefForActiveStation(
  stationCode?: string | null,
): string {
  const stored = readLoginStationSelection();
  const code = (stationCode || stored?.stationCode || '').trim();
  if (!code) return buildLoginAppsHref(stored);
  return buildLoginAppsHref({
    stationCode: code,
    stationName:
      stored?.stationCode?.toUpperCase() === code.toUpperCase()
        ? stored.stationName || code
        : stored?.stationName || code,
    stationCity:
      stored?.stationCode?.toUpperCase() === code.toUpperCase()
        ? stored.stationCity || ''
        : '',
  });
}

export function markSkipLandingIntro(): void {
  if (typeof window === 'undefined') return;
  warmLandingScene();
  sessionStorage.setItem(SKIP_LANDING_INTRO_KEY, '1');
}

/** SSR-safe: read skip-intro flag before first paint (logout / back-from-login). */
export function readSkipLandingIntroFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(SKIP_LANDING_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Client-only: session flag + preload. URL param is applied via server prop;
 * call after mount when `skipIntroFromUrl` is already true or false.
 *
 * Session flag is **not** one-shot — after logout or "back to stations" the map
 * must stay interactive on every return visit in the same tab.
 */
export function applySkipLandingIntroClientEffects(
  skipIntroFromUrl: boolean,
): boolean {
  if (typeof window === 'undefined') return skipIntroFromUrl;

  if (skipIntroFromUrl) {
    // Keep ?skipLandingIntro=1 on the URL. Stripping it with history.replaceState
    // wiped Next's history.state and made the next station click a no-op.
    markSkipLandingIntro();
    return true;
  }

  const shouldSkip = readSkipLandingIntroFlag();
  if (shouldSkip) {
    warmLandingScene();
  }
  return shouldSkip;
}
