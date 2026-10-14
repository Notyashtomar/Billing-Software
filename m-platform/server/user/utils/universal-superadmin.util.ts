/**
 * Canonical universal BWMS / FRIS superadmin login id.
 * Always receives every tile + page grant (current and future catalog entries).
 * Keep in sync with client `lib/universal-superadmin.ts`.
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
