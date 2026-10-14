import type { NextRequest } from 'next/server';
import { resolveNestBackendUrl } from '@/lib/nest-backend-url';

export const QUERY_ALLOWLIST = new Map<string, readonly string[]>([
  [
    '/fris/flights/scheduledairlines/fhr-report',
    ['flightSlNo', 'instanceSlNo', 'tableSerial'],
  ],
  [
    '/fris/flights/scheduledairlines/equipment-report',
    [
      'flightSlNo',
      'instanceSlNo',
      'tableSerial',
      'reportType',
      'flightNo',
      'airline',
      'aircraft',
      'staDate',
      'stdDate',
      'staTime',
      'stdTime',
    ],
  ],
  ['/fris/flights/scheduledairlines/ramp-duty-report', ['slNo']],
]);

export const ADMIN_PUBLIC_PATHS = new Set([
  '/admin/login',
  '/admin/SuperAdminLogin',
]);

const ADMIN_AUTH_COOKIE_NAME =
  process.env.ADMIN_AUTH_COOKIE_NAME?.trim() || 'fris_admin_session';
export const FRIS_AUTH_COOKIE_NAME =
  process.env.AUTH_COOKIE_NAME?.trim() || 'fris_session';

/** Edge middleware must call Nest directly — same-origin /api-backend self-fetch fails on Workers. */
export function railwayBackendUrl(): string {
  return resolveNestBackendUrl();
}

export function hasAdminPanelCookie(request: NextRequest): boolean {
  const value = request.cookies.get(ADMIN_AUTH_COOKIE_NAME)?.value?.trim();
  return Boolean(value);
}

export function hasFrisSessionCookie(request: NextRequest): boolean {
  const value = request.cookies.get(FRIS_AUTH_COOKIE_NAME)?.value?.trim();
  return Boolean(value);
}

const EDGE_SESSION_VERIFY_TIMEOUT_MS = 8_000;

export type EdgeSessionVerdict =
  | 'ok'
  | 'missing'
  | 'unauthorized'
  | 'unreachable';

/**
 * Edge session check.
 * - missing / unauthorized → redirect to login
 * - unreachable (timeout / network) → allow through; client FrisRouteGuard validates
 *   (avoids bounce-to-login loops that look like an infinite loader on /login)
 */
export async function verifySession(
  request: NextRequest,
  endpointPath: string,
  scope?: 'fris' | 'admin',
): Promise<EdgeSessionVerdict> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader?.trim()) {
    return 'missing';
  }

  const headers: Record<string, string> = { cookie: cookieHeader };
  if (scope) {
    headers['X-Auth-Scope'] = scope;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EDGE_SESSION_VERIFY_TIMEOUT_MS);

  try {
    const res = await fetch(`${railwayBackendUrl()}${endpointPath}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'unauthorized';
    // 5xx / unexpected — treat like unreachable so a brief API blip does not
    // kick a freshly logged-in user back to /login during cold compile.
    return 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timeout);
  }
}

export function buildSanitizedUrl(
  request: NextRequest,
  allowedKeys: readonly string[],
): URL | null {
  const nextUrl = request.nextUrl;
  const sanitized = new URLSearchParams();

  for (const key of allowedKeys) {
    const values = nextUrl.searchParams.getAll(key);
    for (const value of values) {
      sanitized.append(key, value);
    }
  }

  const sanitizedSearch = sanitized.toString();
  const currentSearch = nextUrl.searchParams.toString();
  if (sanitizedSearch === currentSearch) {
    return null;
  }

  const targetUrl = new URL(nextUrl.pathname, request.url);
  if (sanitizedSearch) {
    targetUrl.search = `?${sanitizedSearch}`;
  }
  return targetUrl;
}
