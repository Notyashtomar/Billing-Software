import { getApiBase } from '@/lib/api';
import { markSkipLandingIntro } from '@/lib/login-station';
import {
  classifySessionHttpStatus,
  fetchWithTimeout,
  isSessionTimeoutError,
  type SessionFailureReason,
} from '@/lib/session-fetch';

/** Dispatched after login/session refresh writes flags to localStorage. */
export const FRIS_SESSION_UPDATED_EVENT = 'fris-session-updated';

/**
 * Rebind the FRIS cookie and local station keys to the station named on the
 * billing Flights link (`?stationCode=`). Caller reloads after this resolves.
 */
export async function switchFrisStation(input: {
  stationCode: string;
  stationId?: string;
  stationName?: string;
  stationCity?: string;
}): Promise<void> {
  const stationCode = input.stationCode.trim().toUpperCase();
  if (!stationCode) throw new Error('Choose a station.');

  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/auth/switch-station`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stationCode }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    stationId?: string;
    stationCode?: string;
  };
  if (!res.ok) {
    const msg = Array.isArray(data.message)
      ? data.message.join(', ')
      : data.message;
    throw new Error(msg || `Could not change station (${res.status}).`);
  }

  const nextCode = String(data.stationCode || stationCode).trim().toUpperCase();
  const nextId = String(data.stationId || input.stationId || '').trim();
  if (nextId) localStorage.setItem('userStationId', nextId);
  localStorage.setItem('userStationCode', nextCode);
  if (input.stationCity?.trim()) {
    localStorage.setItem('userStationCity', input.stationCity.trim());
  }
  if (input.stationName?.trim()) {
    localStorage.setItem('userStationName', input.stationName.trim());
  }
  localStorage.setItem('fris_selected_station', nextCode);
  window.dispatchEvent(new Event(FRIS_SESSION_UPDATED_EVENT));
}

const LEGACY_TOKEN_KEYS = [
  'access_token',
  'accessToken',
  'admin_access_token',
] as const;
const FRIS_PROFILE_KEYS = [
  'user',
  'userId',
  'userid',
  'userName',
  'username',
  'userEmail',
  'userRole',
  'userDepartment',
  'userFlags',
  'userPermissionScope',
  'userLandingPath',
  'userAppAccess',
  'userAppPageAccess',
  'bwmsEntryApp',
  'userStationId',
  'userStationCode',
  'userStationCity',
  'userGender',
  'userJoiningDate',
  'userDesignation',
  'userEmployeeId',
  'userPhone',
  'userCompany',
  'userLocation',
  'userAirport',
  'userDepartmentLabel',
  'userSubDepartment',
  'isAuthenticated',
  'user_role',
] as const;

export type FrisPermissionScope = {
  accessTabs?: string[];
  accessSubPages?: Record<string, string[]>;
};

export type FrisSessionUser = {
  userid: string;
  name: string;
  email: string;
  role?: string;
  department?: unknown;
  flags?: unknown;
  /** Station-scoped admin assignments for the active login station. */
  permissionScope?: FrisPermissionScope;
  /** Server-resolved first allowed FRIS route after login. */
  landingPath?: string;
  /** Enabled BWMS login-tile ids for the active station. */
  appAccess?: string[];
  /** Resolved BWMS tool page grants: appId → page ids. */
  appPageAccess?: Record<string, string[]>;
  stationId?: string;
  stationCode?: string;
  gender?: string;
  joiningDate?: string;
  designation?: string;
  employeeId?: string;
  phone?: string;
  company?: string;
  station?: string;
  locations?: string;
  city?: string;
  departmentLabel?: string;
  subDepartment?: string;
};

export type FrisSessionValidation = {
  ok: boolean;
  user?: FrisSessionUser;
  reason?: SessionFailureReason;
};

/** Tile grant keys kept after map logout so the Apps launcher can stay filtered. */
const APP_ACCESS_PROFILE_KEYS = new Set([
  'userAppAccess',
  'userAppPageAccess',
]);

export type ClearFrisSessionOptions = {
  /** Keep last station tile/page grants for Apps menu filtering after map logout. */
  keepAppAccess?: boolean;
};

/** Clear stale FRIS client storage before a new FRIS login (cookie is httpOnly). */
export function prepareFrisLogin(): void {
  clearFrisSession();
}

export function clearFrisSession(options?: ClearFrisSessionOptions) {
  if (typeof window === 'undefined') return;

  for (const key of LEGACY_TOKEN_KEYS) {
    localStorage.removeItem(key);
  }
  for (const key of FRIS_PROFILE_KEYS) {
    if (options?.keepAppAccess && APP_ACCESS_PROFILE_KEYS.has(key)) continue;
    localStorage.removeItem(key);
  }
}

export async function logoutFrisSession(
  options?: ClearFrisSessionOptions,
): Promise<void> {
  const base = getApiBase().replace(/\/$/, '');
  try {
    await fetch(`${base}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Clear local state even if the network request fails.
  } finally {
    clearFrisSession(options);
  }
}

/** Sign out and return to the station map (skips landing intro). */
export async function logoutFrisToStationMap(): Promise<void> {
  // Keep tile grants so Apps on the map only shows tools this user may open.
  await logoutFrisSession({ keepAppAccess: true });
  markSkipLandingIntro();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(FRIS_SESSION_UPDATED_EVENT));
  }
}

export function persistFrisSession(user: FrisSessionUser) {
  if (typeof window === 'undefined') return;

  const userid = String(user.userid ?? '').trim();
  const name = String(user.name ?? '').trim();
  const email = String(user.email ?? '').trim().toLowerCase();
  const role = String(user.role ?? '').trim();

  const setOrClear = (key: string, value: string | undefined) => {
    const v = String(value ?? '').trim();
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  };

  if (userid) {
    localStorage.setItem('userId', userid);
    localStorage.setItem('userid', userid);
  }
  if (name) {
    localStorage.setItem('userName', name);
    localStorage.setItem('username', name);
  }
  if (email) {
    localStorage.setItem('userEmail', email);
  }

  if (role) {
    localStorage.setItem('userRole', role);
    localStorage.removeItem('userDepartment');
  } else {
    localStorage.removeItem('userRole');
    if (
      typeof user.department === 'string' ||
      (user.department &&
        typeof user.department === 'object' &&
        !Array.isArray(user.department))
    ) {
      localStorage.setItem('userDepartment', JSON.stringify(user.department));
    } else {
      localStorage.removeItem('userDepartment');
    }
  }

  const hasFlags =
    user.flags &&
    typeof user.flags === 'object' &&
    !Array.isArray(user.flags) &&
    Object.keys(user.flags as Record<string, unknown>).length > 0;
  const hasFlagsField = Object.prototype.hasOwnProperty.call(user, 'flags');

  if (hasFlags) {
    localStorage.setItem('userFlags', JSON.stringify(user.flags));
  } else if (hasFlagsField) {
    // Explicit empty/null flags from server means clear stored assignment.
    localStorage.removeItem('userFlags');
  }

  const scope = user.permissionScope;
  const hasScopeField = Object.prototype.hasOwnProperty.call(user, 'permissionScope');
  if (
    scope &&
    typeof scope === 'object' &&
    !Array.isArray(scope) &&
    scope.accessSubPages &&
    typeof scope.accessSubPages === 'object'
  ) {
    localStorage.setItem('userPermissionScope', JSON.stringify(scope));
  } else if (hasScopeField) {
    // Only clear when server explicitly responds without usable scope.
    localStorage.removeItem('userPermissionScope');
  }

  const landingPath = String(user.landingPath ?? '').trim();
  if (landingPath.startsWith('/') && !landingPath.startsWith('//')) {
    localStorage.setItem('userLandingPath', landingPath);
  } else {
    localStorage.removeItem('userLandingPath');
  }

  // Always persist tile grants after a successful identity login so the apps
  // launcher can filter (missing key = pre-login; present = enforce).
  if (Array.isArray(user.appAccess)) {
    localStorage.setItem('userAppAccess', JSON.stringify(user.appAccess));
  } else if (userid) {
    localStorage.setItem('userAppAccess', '[]');
  } else {
    localStorage.removeItem('userAppAccess');
  }

  if (
    user.appPageAccess &&
    typeof user.appPageAccess === 'object' &&
    !Array.isArray(user.appPageAccess)
  ) {
    localStorage.setItem('userAppPageAccess', JSON.stringify(user.appPageAccess));
  } else if (userid) {
    localStorage.setItem('userAppPageAccess', '{}');
  } else {
    localStorage.removeItem('userAppPageAccess');
  }

  const stationId = String(user.stationId ?? '').trim();
  if (stationId) {
    localStorage.setItem('userStationId', stationId);
  } else {
    localStorage.removeItem('userStationId');
  }

  const stationCode = String(user.stationCode ?? '').trim().toUpperCase();
  if (stationCode) {
    localStorage.setItem('userStationCode', stationCode);
  }

  const departmentLabel = String(user.departmentLabel ?? '').trim();
  const subDepartment = String(user.subDepartment ?? '').trim();
  const city = String(user.city ?? '').trim();
  const locations = String(user.locations ?? '').trim();
  const station = String(user.station ?? '').trim();
  const location =
    city || locations || station || localStorage.getItem('userStationCity') || '';

  setOrClear('userGender', user.gender);
  setOrClear('userJoiningDate', user.joiningDate);
  setOrClear('userDesignation', user.designation);
  setOrClear('userEmployeeId', user.employeeId);
  setOrClear('userPhone', user.phone);
  setOrClear('userCompany', user.company);
  setOrClear('userDepartmentLabel', departmentLabel);
  setOrClear('userSubDepartment', subDepartment);
  setOrClear('userLocation', location);
  setOrClear(
    'userAirport',
    station ||
      (stationCode
        ? stationCode
        : undefined),
  );

  localStorage.setItem(
    'user',
    JSON.stringify({
      userid,
      name,
      email,
      role: role || undefined,
      department: user.department,
      flags: user.flags,
      stationId: stationId || undefined,
      stationCode: stationCode || undefined,
      gender: String(user.gender ?? '').trim() || undefined,
      joiningDate: String(user.joiningDate ?? '').trim() || undefined,
      designation: String(user.designation ?? '').trim() || undefined,
      employeeId: String(user.employeeId ?? '').trim() || undefined,
      phone: String(user.phone ?? '').trim() || undefined,
      company: String(user.company ?? '').trim() || undefined,
      station: station || undefined,
      locations: locations || undefined,
      city: city || undefined,
      departmentLabel: departmentLabel || undefined,
      subDepartment: subDepartment || undefined,
    }),
  );
  localStorage.setItem('isAuthenticated', 'true');

  window.dispatchEvent(new Event(FRIS_SESSION_UPDATED_EVENT));
}

/** True when this browser already has a FRIS login profile (cookie may still be valid). */
export function hasCachedFrisSession(): boolean {
  if (typeof window === 'undefined') return false;
  const id = String(
    localStorage.getItem('userid') ?? localStorage.getItem('userId') ?? '',
  ).trim();
  return id.length > 0 && localStorage.getItem('isAuthenticated') === 'true';
}

export type FrisUserRole = 'superadmin' | 'manager' | 'employee';

/** FRIS panel authorization role (legacy `admin` maps to manager). */
export function normalizeFrisUserRole(raw?: string | null): FrisUserRole {
  const role = String(raw ?? '').trim().toLowerCase();
  if (role === 'superadmin') return 'superadmin';
  if (role === 'manager' || role === 'admin' || role === 'operations') return 'manager';
  return 'employee';
}

export function isFrisElevatedRole(raw?: string | null): boolean {
  const role = normalizeFrisUserRole(raw);
  return role === 'manager' || role === 'superadmin';
}

/** True when admin-panel permissions were stored for this FRIS session. */
export function hasAssignedFrisFlags(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem('userFlags');
  if (!raw?.trim()) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return (
      !!parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed as Record<string, unknown>).length > 0
    );
  } catch {
    return false;
  }
}

/** Unrestricted FRIS session — full page visibility and edit access. */
export function isFrisAdminLikeSession(): boolean {
  if (typeof window === 'undefined') return false;
  const role = normalizeFrisUserRole(localStorage.getItem('userRole'));
  // Superadmins always see and edit every FRIS page on every station,
  // including pages added after their account was created.
  if (role === 'superadmin') return true;
  // Legacy elevated logins without panel-assigned flags stay unrestricted.
  if (hasAssignedFrisFlags()) return false;
  return role === 'manager';
}

/** Exchange a billing handoff (URL hash) for the FRIS cookie on this host. */
export async function redeemFrisHandoffFromHash(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const match = /(?:^#|&)handoff=([^&]+)/.exec(window.location.hash);
  if (!match?.[1]) return false;
  const code = decodeURIComponent(match[1]);
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/auth/fris-handoff/redeem`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Scope': 'fris' },
    body: JSON.stringify({ code }),
  }).catch(() => null);
  const path = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', path);
  return Boolean(res?.ok);
}

export async function validateFrisSession(): Promise<FrisSessionValidation> {
  const base = getApiBase().replace(/\/$/, '');
  try {
    const res = await fetchWithTimeout(`${base}/auth/fris-session`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'X-Auth-Scope': 'fris' },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        clearFrisSession({ keepAppAccess: true });
      }
      return { ok: false, reason: classifySessionHttpStatus(res.status) };
    }

    const json = await res.json();
    const user = json?.user as FrisSessionUser | undefined;
    if (!user?.userid) {
      clearFrisSession({ keepAppAccess: true });
      return { ok: false, reason: 'invalid' };
    }

    persistFrisSession(user);
    return { ok: true, user };
  } catch (err: unknown) {
    if (isSessionTimeoutError(err)) {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: 'network' };
  }
}
