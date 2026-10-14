import {
  DEFAULT_API_TIMEOUT_MS,
  fetchWithAbort,
  isAbortError,
} from '@/lib/fetch-with-abort';

/** Default timeout for session validation (avoid infinite spinners). */
export const SESSION_FETCH_TIMEOUT_MS = 15_000;

export type SessionFailureReason =
  | 'timeout'
  | 'network'
  | 'expired'
  | 'invalid'
  | 'forbidden';

export type SessionFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: SessionFailureReason; status?: number };

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = SESSION_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetchWithAbort(input, init, {
    timeoutMs,
    signal: init.signal,
  });
}

export function classifySessionHttpStatus(status: number): SessionFailureReason {
  if (status === 401) return 'expired';
  if (status === 403) return 'forbidden';
  return 'invalid';
}

export function sessionFailureMessage(reason: SessionFailureReason): string {
  switch (reason) {
    case 'timeout':
      return 'The server is taking too long to respond. Check your connection and try again.';
    case 'network':
      return 'Cannot reach the server. Check your internet connection or VPN, then try again.';
    case 'expired':
      return 'Your session expired or was ended. Please sign in again.';
    case 'forbidden':
      return 'You do not have access to this application with the current account.';
    default:
      return 'We could not verify your session. Please sign in again.';
  }
}

export function isSessionTimeoutError(err: unknown): boolean {
  if (isAbortError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /timed out|timeout/i.test(msg);
}

/** Parse JSON text safely — treats blank/invalid payloads as null (never throws). */
export function parseJsonText<T = unknown>(
  text: string,
  fallback: T | null = null,
): T | null {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

/** Read a fetch body as JSON without throwing on empty or malformed payloads. */
export async function readResponseJson<T = unknown>(
  res: Response,
): Promise<T | null> {
  try {
    const text = await res.text();
    return parseJsonText<T>(text, null);
  } catch {
    return null;
  }
}

/** Re-export for callers that need the shared default API deadline. */
export { DEFAULT_API_TIMEOUT_MS };
