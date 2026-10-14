import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';

const FRIS_AUTH_COOKIE = process.env.AUTH_COOKIE_NAME?.trim() || 'fris_session';

function isNonProd() {
  const env = process.env.NODE_ENV?.trim() || 'development';
  return env !== 'production';
}

export type FetchSessionFn = (cookieHeader: string | undefined) => Promise<any>;

/**
 * Creates an ops auth middleware that fetches the Nest session using the provided fetcher.
 */
export function createOpsAuthMiddleware(fetchNestSession: FetchSessionFn) {
  return async function opsAuthMiddleware(c: Context, next: Next) {
    if (process.env.OPS_API_SKIP_AUTH === '1' || process.env.TRP_API_SKIP_AUTH === '1') {
      if (process.env.NODE_ENV === 'production') {
        return c.json({ error: 'Auth skip is not allowed in production' }, 500);
      }
      await next();
      return;
    }

    const cookieHeader = c.req.header('cookie');
    const sessionCookie = getCookie(c, FRIS_AUTH_COOKIE);

    if (cookieHeader?.trim()) {
      const user = await fetchNestSession(cookieHeader);
      if (user) {
        c.set('userId', user.userid);
        c.set('userName', user.name);
        if (user.stationCode) c.set('sessionStationCode', user.stationCode);
        await next();
        return;
      }
      if (sessionCookie?.trim() && !isNonProd()) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }

    if (!isNonProd() && !sessionCookie?.trim()) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
  };
}

export async function opsStationMiddleware(c: Context, next: Next) {
  const fromHeader = (
    c.req.header('x-ops-station-code') ||
    c.req.header('x-trp-station-code') ||
    c.req.header('x-station-code') ||
    c.req.header('X-Ops-Station-Code') ||
    c.req.header('X-TRP-Station-Code') ||
    c.req.header('X-Station-Code')
  )?.trim().toUpperCase();
  const fromQuery = c.req.query('stationCode')?.trim().toUpperCase();
  const fromSession = String(c.get('sessionStationCode') ?? '')
    .trim()
    .toUpperCase();
  const requested = fromHeader || fromQuery || '';

  // Nest/FRIS session station is authoritative. Stale TRP map station in the
  // client header must not 403 — that blocked all localhost reads/writes.
  if (fromSession) {
    c.set('stationCode', fromSession);
    await next();
    return;
  }
  if (!requested) {
    return c.json({ error: 'Missing station code' }, 400);
  }
  c.set('stationCode', requested);
  await next();
}
