/** Login ids allowed to open Billing. Keep in sync with client `lib/billing-portal-users.ts`. */
export const BILLING_PORTAL_USERIDS = ['DELX0001', 'DELR1443'] as const;

const ALLOWED = new Set(
  BILLING_PORTAL_USERIDS.map((id) => id.toUpperCase()),
);

export function isBillingPortalUserid(
  userid: string | null | undefined,
): boolean {
  return ALLOWED.has(String(userid ?? '').trim().toUpperCase());
}
