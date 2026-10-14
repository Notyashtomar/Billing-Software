import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_PUBLIC_PATHS,
  FRIS_AUTH_COOKIE_NAME,
  QUERY_ALLOWLIST,
  buildSanitizedUrl,
  hasAdminPanelCookie,
  hasFrisSessionCookie,
  verifySession,
} from '@/lib/edge-proxy';

/** App Router folder is `Non-Scheduled-Airlines`; nav and links use lowercase. */
const NS_AIRLINES_ROUTE_LOWER = '/fris/flights/non-scheduled-airlines';
const NS_AIRLINES_ROUTE_CANONICAL = '/fris/flights/Non-Scheduled-Airlines';

/**
 * Keep in sync with `hasLoginPageContext` in login-station-constants.ts.
 * Inlined so middleware stays edge-light (no India airports / station mock graph).
 */
function loginHasPageContext(searchParams: URLSearchParams): boolean {
  if (searchParams.get('logout') === '1') return true;
  if (searchParams.get('stationCode')?.trim()) return true;
  if (searchParams.get('stationId')?.trim()) return true;
  if (searchParams.get('next')?.trim()) return true;
  const reason = searchParams.get('reason')?.trim().toLowerCase() ?? '';
  return reason === 'expired' || reason === 'forbidden';
}

function rewriteNonScheduledAirlinesPath(pathname: string): string | null {
  if (
    pathname === NS_AIRLINES_ROUTE_LOWER ||
    pathname.startsWith(`${NS_AIRLINES_ROUTE_LOWER}/`)
  ) {
    return pathname.replace(NS_AIRLINES_ROUTE_LOWER, NS_AIRLINES_ROUTE_CANONICAL);
  }
  return null;
}

function redirectToLogin(
  request: NextRequest,
  pathname: string,
  reason?: 'session' | 'expired',
) {
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  url.searchParams.set('next', returnTo);
  if (reason === 'session') {
    url.searchParams.set('reason', reason);
  }
  if (reason === 'expired') {
    url.searchParams.set('reason', 'expired');
  }
  const response = NextResponse.redirect(url);
  if (reason === 'expired') {
    response.cookies.set(FRIS_AUTH_COOKIE_NAME, '', {
      path: '/',
      maxAge: 0,
    });
  }
  return response;
}

/** Dev: cookie-only gate — skip upstream session fetch while webpack compiles (FrisRouteGuard re-validates client-side). */
const DEV_COOKIE_ONLY_AUTH =
  process.env.NODE_ENV === 'development' &&
  process.env.FRIS_DEV_EDGE_SESSION_VERIFY !== '1';

/**
 * Edge middleware for Cloudflare Workers (OpenNext does not support Node proxy.ts).
 * Query sanitization + session redirects before routes render.
 */
export async function middleware(request: NextRequest) {
  const rewrittenPath = rewriteNonScheduledAirlinesPath(request.nextUrl.pathname);

  // Bare /login (no station / next / session reason) → station map.
  // Single owner for this redirect — do not also soft/hard redirect in LoginPageShell or LoginScreen.
  if (request.nextUrl.pathname === '/login') {
    if (!loginHasPageContext(request.nextUrl.searchParams)) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const allowedKeys = QUERY_ALLOWLIST.get(request.nextUrl.pathname);
  if (allowedKeys) {
    const sanitizedUrl = buildSanitizedUrl(request, allowedKeys);
    if (sanitizedUrl) {
      return NextResponse.redirect(sanitizedUrl);
    }
  }

  if (request.nextUrl.pathname.startsWith('/fris')) {
    if (!hasFrisSessionCookie(request)) {
      return redirectToLogin(request, '/login');
    }
    if (!DEV_COOKIE_ONLY_AUTH) {
      const verdict = await verifySession(request, '/auth/fris-session', 'fris');
      if (verdict === 'missing') {
        return redirectToLogin(request, '/login');
      }
      if (verdict === 'unauthorized') {
        return redirectToLogin(request, '/login', 'expired');
      }
    }
    // unreachable → pass through; FrisRouteGuard re-checks in the browser
    if (rewrittenPath) {
      const url = request.nextUrl.clone();
      url.pathname = rewrittenPath;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/others')) {
    if (!hasFrisSessionCookie(request)) {
      return redirectToLogin(request, '/login');
    }
    if (!DEV_COOKIE_ONLY_AUTH) {
      const verdict = await verifySession(request, '/auth/fris-session', 'fris');
      if (verdict === 'missing') {
        return redirectToLogin(request, '/login');
      }
      if (verdict === 'unauthorized') {
        return redirectToLogin(request, '/login', 'expired');
      }
    }
    return NextResponse.next();
  }

  if (
    request.nextUrl.pathname.startsWith('/admin') &&
    !ADMIN_PUBLIC_PATHS.has(request.nextUrl.pathname)
  ) {
    if (!hasAdminPanelCookie(request)) {
      return redirectToLogin(request, '/admin/login');
    }
    if (!DEV_COOKIE_ONLY_AUTH) {
      const verdict = await verifySession(request, '/admins/me', 'admin');
      if (verdict === 'missing' || verdict === 'unauthorized') {
        return redirectToLogin(request, '/admin/login', 'session');
      }
    }
  }

  if (request.nextUrl.pathname.startsWith('/trp')) {
    const isTrpLogin = request.nextUrl.pathname === '/trp/login';
    if (!isTrpLogin) {
      if (!hasFrisSessionCookie(request)) {
        return redirectToLogin(request, '/login');
      }
      if (!DEV_COOKIE_ONLY_AUTH) {
        const verdict = await verifySession(request, '/auth/fris-session', 'fris');
        if (verdict === 'missing') {
          return redirectToLogin(request, '/login');
        }
        if (verdict === 'unauthorized') {
          return redirectToLogin(request, '/login', 'expired');
        }
      }
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/fris/:path*',
    '/others/:path*',
    '/trp/:path*',
    '/admin',
    '/admin/:path*',
  ],
};
