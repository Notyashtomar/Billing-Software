import { getApiBase } from '@/lib/api';
import { clearFrisSession } from '@/lib/fris-session';
import {
  classifySessionHttpStatus,
  fetchWithTimeout,
  isSessionTimeoutError,
  type SessionFailureReason,
} from '@/lib/session-fetch';

export function isAdminPanelRole(role?: string | null): boolean {
  const r = role?.trim().toLowerCase();
  return r === 'superadmin' || r === 'manager' || r === 'admin' || r === 'operations';
}

const ADMIN_PANEL_SECTIONS_KEY = 'adminPanelSections';

const ADMIN_PROFILE_KEYS = [
  'admin_access_token',
  'adminUserName',
  'adminUserEmail',
  'adminUserRole',
  'adminUserid',
  ADMIN_PANEL_SECTIONS_KEY,
] as const;

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  for (const key of ADMIN_PROFILE_KEYS) {
    localStorage.removeItem(key);
  }
}

/** Wipe every client-side auth artifact (admin + FRIS + legacy tokens). */
export function clearAllClientAuthStorage(): void {
  clearFrisSession();
  clearAdminSession();
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
}

export type AdminSessionUser = {
  id: string;
  userid: string;
  name: string;
  email: string;
  role: string;
  adminPanelSections?: string[];
};

export type AdminSessionValidation = {
  ok: boolean;
  user?: AdminSessionUser;
  reason?: SessionFailureReason;
};

export function persistAdminProfile(user: {
  name?: string;
  email?: string;
  role?: string;
  userid?: string;
  adminPanelSections?: string[];
}): void {
  if (typeof window === 'undefined') return;
  const name = user.name?.trim();
  if (name) {
    localStorage.setItem('adminUserName', name);
    localStorage.setItem('userName', name);
    localStorage.setItem('username', name);
  }
  if (user.email?.trim()) {
    localStorage.setItem('adminUserEmail', user.email.trim());
    localStorage.setItem('userEmail', user.email.trim());
  }
  if (user.role?.trim()) {
    localStorage.setItem('adminUserRole', user.role.trim());
    localStorage.setItem('userRole', user.role.trim());
  }
  if (user.userid?.trim()) {
    localStorage.setItem('adminUserid', user.userid.trim());
    localStorage.setItem('userid', user.userid.trim());
    localStorage.setItem('userId', user.userid.trim());
  }
  if (Array.isArray(user.adminPanelSections)) {
    localStorage.setItem(
      ADMIN_PANEL_SECTIONS_KEY,
      JSON.stringify(user.adminPanelSections),
    );
  } else {
    localStorage.removeItem(ADMIN_PANEL_SECTIONS_KEY);
  }
  localStorage.setItem('isAuthenticated', 'true');
}

export function getStoredAdminPanelSections(): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_PANEL_SECTIONS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(String);
  } catch {
    return null;
  }
}

export function getAdminDisplayName(): string {
  if (typeof window === 'undefined') return 'Admin';
  return (
    localStorage.getItem('adminUserName')?.trim() ||
    localStorage.getItem('userName')?.trim() ||
    localStorage.getItem('adminUserEmail')?.split('@')[0]?.trim() ||
    localStorage.getItem('userEmail')?.split('@')[0]?.trim() ||
    'Admin'
  );
}

export function getAdminInitials(name?: string): string {
  const label = (name ?? getAdminDisplayName()).trim();
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase() || 'AD';
}

export function formatAdminRoleLabel(role?: string | null): string {
  const r = role?.trim().toLowerCase();
  if (r === 'superadmin') return 'Super Admin';
  if (r === 'employee') return 'Employee';
  return 'Manager';
}

async function postAdminLogout(): Promise<void> {
  const base = getApiBase().replace(/\/$/, '');
  await fetch(`${base}/auth/admin-logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

/** Clears admin httpOnly cookie and admin client profile (FRIS session unchanged). */
export async function logoutAdminSession(): Promise<void> {
  try {
    await postAdminLogout();
  } catch {
    // Always clear client state on logout.
  } finally {
    clearAdminSession();
  }
}

/** Prepare client storage before admin login (does not sign out of FRIS). */
export function prepareAdminLogin(): void {
  clearAdminSession();
}

/** After successful admin-login: cache display profile (auth is cookie-only). */
export function establishAdminSession(profile: {
  name?: string;
  email?: string;
  role?: string;
  userid?: string;
  adminPanelSections?: string[];
}): void {
  clearAdminSession();
  persistAdminProfile(profile);
}

export async function validateAdminSession(
  opts?: { retries?: number },
): Promise<AdminSessionValidation> {
  const base = getApiBase().replace(/\/$/, '');
  const retries = opts?.retries ?? 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 120 * attempt));
    }
    try {
      const res = await fetchWithTimeout(`${base}/admins/me`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'X-Auth-Scope': 'admin' },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          if (attempt < retries) continue;
          clearAdminSession();
        }
        return { ok: false, reason: classifySessionHttpStatus(res.status) };
      }

      const json = await res.json();
      const user = json?.data as AdminSessionUser | undefined;
      if (!user?.userid) {
        if (attempt < retries) continue;
        clearAdminSession();
        return { ok: false, reason: 'invalid' };
      }

      if (!isAdminPanelRole(user.role)) {
        await logoutAdminSession();
        return { ok: false, reason: 'forbidden' };
      }

      persistAdminProfile({
        name: user.name,
        email: user.email,
        role: user.role,
        userid: user.userid,
        adminPanelSections: user.adminPanelSections,
      });

      return { ok: true, user };
    } catch (err: unknown) {
      if (attempt < retries) continue;
      if (isSessionTimeoutError(err)) {
        return { ok: false, reason: 'timeout' };
      }
      return { ok: false, reason: 'network' };
    }
  }

  return { ok: false, reason: 'expired' };
}

export const ADMIN_PUBLIC_PATHS = [
  '/admin/login',
  '/admin/SuperAdminLogin',
] as const;

export function isAdminPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return ADMIN_PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
