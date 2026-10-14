import { NextRequest, NextResponse } from 'next/server';
import { resolveNestBackendUrl } from '@/lib/nest-backend-url';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function filterRequestHeaders(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      out.append(key, value);
    }
  });
  return out;
}

/**
 * Fetch implementations may expose multiple Set-Cookie values as one
 * comma-joined header. Split only at commas that begin another cookie so a
 * comma inside Expires=... remains part of its original cookie.
 */
function splitSetCookieHeader(header: string): string[] {
  return header
    .split(/,\s*(?=[^=;, \t]+(?:\s*)=)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function effectiveSetCookies(cookies: string[]): string[] {
  const nonEmpty = new Map<string, string>();
  const empty = new Map<string, string>();

  for (const header of cookies) {
    for (const raw of splitSetCookieHeader(header)) {
      const eq = raw.indexOf('=');
      if (eq < 0) continue;
      const name = raw.slice(0, eq).trim();
      const value = raw.slice(eq + 1).split(';')[0]?.trim() ?? '';
      if (value) nonEmpty.set(name, raw);
      else empty.set(name, raw);
    }
  }

  const out: string[] = [];
  for (const name of new Set([...nonEmpty.keys(), ...empty.keys()])) {
    out.push(nonEmpty.get(name) ?? empty.get(name)!);
  }
  return out;
}

/**
 * Railway may set `Domain=` for its host — browsers reject that on Workers.
 * Strip Domain so cookies bind to the page origin (e.g. *.workers.dev).
 */
function rewriteSetCookieForBrowser(setCookie: string): string {
  const parts = setCookie.split(';').map((part) => part.trim());
  const nameValue = parts[0];
  if (!nameValue) return setCookie;
  const attrs = parts.slice(1).filter((part) => !/^domain=/i.test(part));
  return [nameValue, ...attrs].join('; ');
}

/** Collect every Set-Cookie from upstream (Nest sends clear + session cookies). */
function readSetCookieHeaders(upstream: Response): string[] {
  if (typeof upstream.headers.getSetCookie === 'function') {
    const all = upstream.headers.getSetCookie();
    if (all.length > 0) return all;
  }

  const headersWithGetAll = upstream.headers as Headers & {
    getAll?: (name: string) => string[];
  };
  if (typeof headersWithGetAll.getAll === 'function') {
    const all = headersWithGetAll.getAll('set-cookie');
    if (all.length > 0) return all;
  }

  const single = upstream.headers.get('set-cookie');
  return single ? [single] : [];
}

function buildPassthroughHeaders(upstream: Response): Headers {
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === 'set-cookie') return;
    out.set(key, value);
  });
  return out;
}

function formatProxyFetchError(err: unknown, baseUrl: string): string {
  const proxyError = err instanceof Error ? err.message : 'upstream fetch failed';
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? err.cause.message
      : '';
  const combined = `${proxyError} ${cause}`.toLowerCase();

  if (
    combined.includes('econnrefused') ||
    combined.includes('fetch failed') ||
    combined.includes('enotfound') ||
    combined.includes('econnreset') ||
    combined.includes('socket hang up') ||
    combined.includes('etimedout')
  ) {
    return `Cannot reach the API at ${baseUrl}. Ensure the Nest server is running (from repo root: npm run dev:api).`;
  }

  return proxyError;
}

function isTransientUpstreamConnectError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return false;
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? err.cause.message
      : '';
  const combined = `${err instanceof Error ? err.message : String(err)} ${cause}`.toLowerCase();
  return (
    combined.includes('econnrefused') ||
    combined.includes('econnreset') ||
    combined.includes('fetch failed') ||
    combined.includes('socket hang up') ||
    combined.includes('etimedout') ||
    combined.includes('network')
  );
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Nest `start:dev --watch` drops :8080 for tens of seconds while recompiling.
 * Retry connect failures inside the proxy so pages don't flash 502s.
 */
async function fetchUpstreamWithRetry(
  target: string,
  init: RequestInit,
  maxAttempts = 16,
): Promise<Response> {
  let lastErr: unknown;
  const baseBody = init.body;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (init.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const attemptInit: RequestInit = { ...init };
      if (baseBody instanceof ArrayBuffer) {
        attemptInit.body = baseBody.slice(0);
      }
      return await fetch(target, attemptInit);
    } catch (err) {
      lastErr = err;
      if (init.signal?.aborted) throw err;
      if (!isTransientUpstreamConnectError(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      const delay = Math.min(400 * 1.45 ** attempt, 3500);
      await sleepMs(delay, init.signal ?? undefined);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function inferAuthScope(request: NextRequest): 'fris' | 'admin' | undefined {
  const explicit = request.headers.get('x-auth-scope')?.trim().toLowerCase();
  if (explicit === 'fris' || explicit === 'admin') {
    return explicit;
  }

  const referer = request.headers.get('referer') ?? '';
  if (referer.includes('/admin')) return 'admin';
  if (
    referer.includes('/fris') ||
    referer.includes('/billing') ||
    referer.includes('/login') ||
    referer.includes('/others') ||
    referer.includes('/trp') ||
    referer.includes('/chr') ||
    referer.includes('/grooming') ||
    referer.includes('/maas') ||
    referer.includes('/uld') ||
    referer.includes('/log-data') ||
    referer.includes('/safety-incident')
  ) {
    return 'fris';
  }

  const pathSuffix = request.nextUrl.pathname.replace(/^\/api-backend\/?/, '');
  if (
    pathSuffix.startsWith('admins/') ||
    pathSuffix.startsWith('admin-') ||
    pathSuffix.startsWith('auth/admin')
  ) {
    return 'admin';
  }

  if (
    pathSuffix.startsWith('billing/') ||
    pathSuffix.startsWith('fris/') ||
    pathSuffix.startsWith('reports/') ||
    pathSuffix.startsWith('sources/') ||
    pathSuffix.startsWith('invoices/')
  ) {
    return 'fris';
  }

  return undefined;
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[] | undefined,
): Promise<NextResponse> {
  const suffix = (pathSegments ?? []).join('/');
  const target = `${resolveNestBackendUrl()}/${suffix}${request.nextUrl.search}`;

  const upstreamHeaders = filterRequestHeaders(request.headers);
  // Avoid gzip mismatch: Node fetch may decompress the body while leaving
  // Content-Encoding: gzip on the response, which breaks browser JSON parsing.
  upstreamHeaders.delete('accept-encoding');
  // Recompute length from the body we actually send (stale Content-Length
  // / Expect: 100-continue from the browser can reset the Nest socket).
  upstreamHeaders.delete('content-length');
  upstreamHeaders.delete('expect');

  const authScope = inferAuthScope(request);
  if (authScope) {
    upstreamHeaders.set('X-Auth-Scope', authScope);
  }

  const init: RequestInit = {
    method: request.method,
    headers: upstreamHeaders,
    redirect: 'manual',
    cache: 'no-store',
    // When the browser aborts (client AbortController deadline), stop waiting on Railway.
    signal: request.signal,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  // Nest `start:dev --watch` drops :8080 for tens of seconds. Retry both
  // reads and mutations (admin-login POST was 502'ing after ~2s / 4 tries).
  const maxAttempts = 16;

  let upstream: Response;
  try {
    upstream = await fetchUpstreamWithRetry(target, init, maxAttempts);
  } catch (err) {
    // Client (or route) aborted — do not mask as a 502 backend outage.
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 408 });
    }
    const baseUrl = resolveNestBackendUrl();
    const proxyError = formatProxyFetchError(err, baseUrl);
    return NextResponse.json(
      { message: `API proxy error: ${proxyError}` },
      {
        status: 502,
        headers: {
          'X-Fris-Proxy-Error': proxyError.slice(0, 200),
          'Retry-After': '5',
        },
      },
    );
  }

  const rawSetCookies = readSetCookieHeaders(upstream);
  const setCookies = effectiveSetCookies(rawSetCookies);

  const responseHeaders = buildPassthroughHeaders(upstream);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  // Auth JSON must never sit in the browser HTTP cache (stale/broken UI in prod).
  responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  responseHeaders.set('Pragma', 'no-cache');

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });

  for (const cookie of setCookies) {
    response.headers.append('Set-Cookie', rewriteSetCookieForBrowser(cookie));
  }

  return response;
}

type RouteContext = { params: Promise<{ path?: string[] }> };

async function handle(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export const dynamic = 'force-dynamic';

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
