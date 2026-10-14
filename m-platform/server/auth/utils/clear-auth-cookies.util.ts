import type { Response } from 'express';
import {
  getAdminAuthCookieName,
  getAuthCookieClearOptions,
  getAuthCookieName,
  getAuthCookieOptions,
} from './auth-cookie.util';

/** Remove every auth httpOnly cookie (FRIS + admin panel). */
export function clearAllAuthCookies(res: Response): void {
  const options = getAuthCookieClearOptions();
  res.clearCookie(getAuthCookieName(), options);
  res.clearCookie(getAdminAuthCookieName(), options);
}

export function clearFrisAuthCookie(res: Response): void {
  res.clearCookie(getAuthCookieName(), getAuthCookieClearOptions());
}

export function clearAdminAuthCookie(res: Response): void {
  res.clearCookie(getAdminAuthCookieName(), getAuthCookieClearOptions());
}

/** FRIS login — sets FRIS cookie only (admin panel session may stay active). */
export function setFrisLoginCookie(res: Response, token: string): void {
  res.cookie(getAuthCookieName(), token, getAuthCookieOptions());
}

/** Admin panel login — sets admin cookie only (FRIS session may stay active). */
export function setAdminLoginCookie(res: Response, token: string): void {
  res.cookie(getAdminAuthCookieName(), token, getAuthCookieOptions());
}
