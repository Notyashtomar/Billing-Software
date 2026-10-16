/** Login ids allowed to open Billing. Keep in sync with server `user/utils/billing-portal-users.util.ts`. */
export const BILLING_PORTAL_USERIDS = ['DELX0001', 'DELR1443', 'DELG0317'] as const;

const ALLOWED = new Set(
  BILLING_PORTAL_USERIDS.map((id) => id.toUpperCase()),
);

export const BILLING_PORTAL_DENIED_MESSAGE = 'User not Allowed to login';

export function isBillingPortalUserid(
  userid: string | null | undefined,
): boolean {
  return ALLOWED.has(String(userid ?? '').trim().toUpperCase());
}

/**
 * Billing portal accounts stay off other admins' user lists and credential pages.
 * The signed-in account can still see its own row.
 */
export function viewerMaySeeBillingPortalUser(
  subjectUserid: string | null | undefined,
  viewerUserid: string | null | undefined,
): boolean {
  const subject = String(subjectUserid ?? '').trim().toUpperCase();
  if (!ALLOWED.has(subject)) return true;
  return subject === String(viewerUserid ?? '').trim().toUpperCase();
}

export function viewerMaySeeBillingPortalAccount(
  ids: Array<string | null | undefined>,
  viewerUserid: string | null | undefined,
): boolean {
  const hidden = ids
    .map((id) => String(id ?? '').trim().toUpperCase())
    .find((id) => ALLOWED.has(id));
  if (!hidden) return true;
  return hidden === String(viewerUserid ?? '').trim().toUpperCase();
}
