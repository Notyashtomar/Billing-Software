/** Applied to `<html>` so OS/browser dark preference does not restyle FRIS pages. */
export const FRIS_LIGHT_LOCK_ATTR = 'data-fris-light-lock';

const DASHBOARD_PATH_PREFIX = '/fris/dashboard';

/** Routes that should stay on the designed light palette (dashboard excluded — has its own toggle). */
export function shouldLockFrisLight(pathname: string | null | undefined): boolean {
  // Keep the beforeInteractive script lock until Next provides a pathname.
  if (!pathname) return true;
  if (pathname.startsWith(DASHBOARD_PATH_PREFIX)) return false;
  if (pathname === '/login') return true;
  if (pathname.startsWith('/others')) return true;
  if (pathname.startsWith('/fris')) return true;
  return false;
}
