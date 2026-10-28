'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isBillingPortalUserid } from '@/lib/billing-portal-users';
import {
  billingPageIdFromHref,
  clientMayUseBwmsApp,
  clientMayUseBwmsAppPage,
  pagesForApp,
} from '@/lib/bwms-app-page-catalog';
import { logoutFrisSession } from '@/lib/fris-session';

/**
 * Soft client gate: hide billing routes the user was not granted in admin BWMS tools.
 * Grandfather sessions (tile on, empty page map) still pass via clientMayUseBwmsAppPage.
 */
export function BillingPageAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const loginId =
      typeof window === 'undefined'
        ? ''
        : (localStorage.getItem('userid') ?? localStorage.getItem('userId') ?? '');
    if (!isBillingPortalUserid(loginId)) {
      void logoutFrisSession({ keepLoginStation: true });
      router.replace('/billing/login?reason=not-allowed');
      return;
    }
    if (!clientMayUseBwmsApp('billing-finance')) {
      router.replace('/billing/login');
      return;
    }
    const path = (pathname ?? '').split('?')[0] ?? '';
    const mayUsePath = (): boolean => {
      if (path === '/billing/prep-dashboard') {
        return (
          clientMayUseBwmsAppPage('billing-finance', 'preparation') ||
          clientMayUseBwmsAppPage('billing-finance', 'prep-dashboard') ||
          clientMayUseBwmsAppPage('billing-finance', 'dashboard')
        );
      }
      if (
        path === '/billing/billed-services' ||
        path === '/billing/raf' ||
        path === '/billing/uld' ||
        path === '/billing/ebc' ||
        path === '/billing/oth'
      ) {
        return (
          [
            'billed-services',
            'scheduled-flights',
            'ads',
            'equipment',
            'manpower',
            'raf',
            'uld',
            'ebc',
          ] as const
        ).some((id) => clientMayUseBwmsAppPage('billing-finance', id));
      }
      if (path.startsWith('/billing/insights/')) {
        const pageId = billingPageIdFromHref(path);
        return (
          (pageId != null &&
            clientMayUseBwmsAppPage('billing-finance', pageId)) ||
          clientMayUseBwmsAppPage('billing-finance', 'dashboard') ||
          clientMayUseBwmsAppPage('billing-finance', 'invoices') ||
          clientMayUseBwmsAppPage('billing-finance', 'prep-dashboard')
        );
      }
      if (
        path === '/billing/royalty-setup' ||
        path === '/billing/aircraft-master' ||
        path === '/billing/equipment-master'
      ) {
        const pageId = billingPageIdFromHref(path);
        return (
          (pageId != null && clientMayUseBwmsAppPage('billing-finance', pageId)) ||
          clientMayUseBwmsAppPage('billing-finance', 'settings')
        );
      }
      const pageId = billingPageIdFromHref(path);
      if (!pageId) {
        return pagesForApp('billing-finance').some((p) =>
          clientMayUseBwmsAppPage('billing-finance', p.id),
        );
      }
      return clientMayUseBwmsAppPage('billing-finance', pageId);
    };

    if (!mayUsePath()) {
      const first = pagesForApp('billing-finance').find((p) =>
        clientMayUseBwmsAppPage('billing-finance', p.id),
      );
      router.replace(first?.href ?? '/billing/login');
      return;
    }
    setAllowed(true);
  }, [pathname, router]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-[color:var(--billing-text-muted)]">
        <p className="text-lg font-medium">Checking billing access…</p>
      </div>
    );
  }

  return <>{children}</>;
}
