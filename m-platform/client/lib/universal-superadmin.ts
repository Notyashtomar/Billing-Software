/**
 * Canonical universal BWMS / FRIS superadmin login id.
 * Always receives every tile + page grant (current and future catalog entries).
 * Keep in sync with server `user/utils/universal-superadmin.util.ts`.
 */
export const UNIVERSAL_SUPERADMIN_USERID = 'supadm123';

export function isUniversalSuperadminUserid(
  userid: string | null | undefined,
): boolean {
  return (
    String(userid ?? '')
      .trim()
      .toLowerCase() === UNIVERSAL_SUPERADMIN_USERID
  );
}

/** Session userid from localStorage (post-login). */
export function readSessionUserid(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(
      localStorage.getItem('userid') ?? localStorage.getItem('userId') ?? '',
    ).trim();
  } catch {
    return '';
  }
}

export function isUniversalSuperadminSession(): boolean {
  return isUniversalSuperadminUserid(readSessionUserid());
}
