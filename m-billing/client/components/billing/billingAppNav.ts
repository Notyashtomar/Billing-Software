/**
 * Canonical billing app nav links — keep Navbar billing chrome tabs in sync.
 */

export type BillingAppNavLink = {
  href: string;
  label: string;
};

export const BILLING_MASTER_NAV: readonly BillingAppNavLink[] = [
  { href: '/billing/settings', label: 'Airport Setup' },
  { href: '/billing/customers', label: 'Customers' },
  { href: '/billing/contracts', label: 'Contracts' },
  { href: '/billing/rate-cards', label: 'Rate cards' },
];

export const BILLING_WORKFLOW_NAV: readonly BillingAppNavLink[] = [
  { href: '/billing/preparation', label: 'Preparation' },
  { href: '/billing/invoice-drafts', label: 'Invoice drafts' },
  { href: '/billing/review', label: 'Review' },
  { href: '/billing/invoices', label: 'Invoices' },
];

export const BILLING_SOURCES_NAV: readonly BillingAppNavLink[] = [
  { href: '/billing/scheduled-flights', label: 'BHS' },
  { href: '/billing/ads', label: 'ADS' },
  { href: '/billing/raf', label: 'RAF' },
];

/** Hidden from the billing chrome. Pages stay reachable by URL. */
export const BILLING_OTHERS_NAV: readonly BillingAppNavLink[] = [];

/** Hidden from the billing chrome. Pages stay reachable by URL. */
export const BILLING_INSIGHTS_NAV: readonly BillingAppNavLink[] = [];
