/**
 * Resolve the Nest API base URL for server-side proxies and operational-module
 * identity checks (admin login, Safety, ULD, etc.).
 *
 * Rules:
 * - `next dev` (NODE_ENV=development) → always local Nest on 127.0.0.1:8080
 *   (ignores deploy .env that points at Railway so local credentials work).
 * - Cloudflare Workers / production → never loopback (CF error 1003); use
 *   Worker vars or Railway production default.
 */

export const LOCAL_NEST_API_URL = 'http://127.0.0.1:8080';
export const RAILWAY_NEST_API_URL = 'https://fris-production.up.railway.app';

export function isLoopbackNestApiUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(url);
}

function trimUrl(value: unknown): string {
  return String(value ?? '').trim().replace(/\/$/, '');
}

function readCloudflareBinding(key: string): string {
  try {
    const sym = Symbol.for('__cloudflare-context__');
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, sym);
    const store = descriptor?.get?.call(globalThis) as
      | { env?: Record<string, unknown> }
      | undefined;
    return trimUrl(store?.env?.[key]);
  } catch {
    return '';
  }
}

function readConfiguredNestUrl(env?: Record<string, unknown>): string {
  const candidates = [
    env?.API_BACKEND_URL,
    env?.NEXT_PUBLIC_API_URL,
    readCloudflareBinding('API_BACKEND_URL'),
    readCloudflareBinding('NEXT_PUBLIC_API_URL'),
    process.env.API_BACKEND_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ];

  for (const candidate of candidates) {
    const url = trimUrl(candidate);
    if (url) return url;
  }

  return '';
}

/**
 * Nest upstream for App Router proxies, edge middleware, and ops-module login.
 */
export function resolveNestBackendUrl(env?: Record<string, unknown>): string {
  if (process.env.NODE_ENV === 'development') {
    return LOCAL_NEST_API_URL;
  }

  const configured = readConfiguredNestUrl(env);
  if (configured && !isLoopbackNestApiUrl(configured)) {
    return configured;
  }

  // Workers cannot fetch loopback — rewrite to Railway.
  return RAILWAY_NEST_API_URL;
}
