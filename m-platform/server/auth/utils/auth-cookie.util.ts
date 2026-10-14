import type { CookieOptions, Request } from 'express';

const DEFAULT_COOKIE_NAME = 'fris_session';
const DEFAULT_ADMIN_COOKIE_NAME = 'fris_admin_session';
/** Logged-in session TTL — keep in sync with JWT_EXPIRES_IN default (1 day). */
const DEFAULT_COOKIE_EXPIRES_IN = '1d';
const DEFAULT_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function parseDurationToMs(raw: string): number | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }

  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
}

export function getAuthCookieName(): string {
  return String(process.env.AUTH_COOKIE_NAME ?? DEFAULT_COOKIE_NAME).trim() ||
    DEFAULT_COOKIE_NAME;
}

/** Admin panel session — kept separate from FRIS so employee login cannot overwrite it. */
export function getAdminAuthCookieName(): string {
  return (
    String(process.env.ADMIN_AUTH_COOKIE_NAME ?? DEFAULT_ADMIN_COOKIE_NAME).trim() ||
    DEFAULT_ADMIN_COOKIE_NAME
  );
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.cookies?.[name];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function getSameSite(): CookieOptions['sameSite'] {
  const raw = String(process.env.AUTH_COOKIE_SAME_SITE ?? 'lax')
    .trim()
    .toLowerCase();
  if (raw === 'strict') return 'strict';
  if (raw === 'none') return 'none';
  return 'lax';
}

function getCookieDomain(): string | undefined {
  const value = String(process.env.AUTH_COOKIE_DOMAIN ?? '').trim();
  return value || undefined;
}

export function getAuthCookieOptions(): CookieOptions {
  const sameSite = getSameSite();
  const secure =
    process.env.AUTH_COOKIE_SECURE?.trim() === 'true' ||
    process.env.NODE_ENV === 'production' ||
    sameSite === 'none';
  const maxAge =
    parseDurationToMs(
      String(
        process.env.AUTH_COOKIE_MAX_AGE ??
          process.env.JWT_EXPIRES_IN ??
          DEFAULT_COOKIE_EXPIRES_IN,
      ),
    ) ?? DEFAULT_COOKIE_MAX_AGE_MS;

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge,
    domain: getCookieDomain(),
  };
}

export function getAuthCookieClearOptions(): CookieOptions {
  const { secure, sameSite, path, domain } = getAuthCookieOptions();
  return {
    httpOnly: true,
    secure,
    sameSite,
    path,
    domain,
  };
}

/**
 * Resolve JWT from httpOnly cookies. When both FRIS and admin sessions exist,
 * honour `X-Auth-Scope: fris|admin` (set by the Next proxy from the page context).
 */
export function extractAuthCookieToken(req: Request): string | null {
  const fris = readCookie(req, getAuthCookieName());
  const admin = readCookie(req, getAdminAuthCookieName());
  const scope = String(req.headers['x-auth-scope'] ?? '')
    .trim()
    .toLowerCase();

  if (scope === 'fris') return fris;
  if (scope === 'admin') return admin;

  if (fris && !admin) return fris;
  if (admin && !fris) return admin;
  if (fris && admin) return fris;

  return null;
}

export function extractFrisAuthCookieToken(req: Request): string | null {
  return readCookie(req, getAuthCookieName());
}

export function extractAdminAuthCookieToken(req: Request): string | null {
  return readCookie(req, getAdminAuthCookieName());
}
