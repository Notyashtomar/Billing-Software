/**
 * Authenticated fetch for FRIS Nest API using httpOnly cookie auth.
 * Applies a default AbortController deadline so pages do not wait indefinitely.
 */

import {
  DEFAULT_API_TIMEOUT_MS,
  fetchWithAbort,
  type FetchWithAbortOptions,
} from '@/lib/fetch-with-abort';

export function getFrisAccessToken(): string | null {
  return null;
}

export function getFrisAuthHeaders(
  extra?: HeadersInit,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (extra && typeof extra === 'object' && !(extra instanceof Headers)) {
    Object.assign(headers, extra as Record<string, string>);
  }
  return headers;
}

export type FrisFetchInit = RequestInit & {
  /**
   * Client-side deadline (ms). Default {@link DEFAULT_API_TIMEOUT_MS}.
   * Pass `null` to disable (caller must provide `signal` or accept unbounded wait).
   */
  timeoutMs?: number | null;
};

export { DEFAULT_API_TIMEOUT_MS, LONG_API_TIMEOUT_MS } from '@/lib/fetch-with-abort';

export async function frisFetch(
  input: RequestInfo | URL,
  init?: FrisFetchInit,
): Promise<Response> {
  const { timeoutMs, signal, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);

  const abortOpts: FetchWithAbortOptions = {
    timeoutMs: timeoutMs === undefined ? DEFAULT_API_TIMEOUT_MS : timeoutMs,
    signal,
  };

  return fetchWithAbort(
    input,
    {
      ...rest,
      headers,
      credentials: 'include',
      // Prefer caller override; default blocks browser HTTP caching of API JSON.
      cache: rest.cache ?? 'no-store',
    },
    abortOpts,
  );
}
