'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { FrisNavbarLazy } from '@/components/fris/layout/FrisNavbarLazy';
import { BillingShell } from '@/components/billing/BillingShell';
import { BillingDesignRoot } from '@/components/billing/BillingDesignRoot';
import { FrisPermissionGuard } from '@/components/fris/layout/FrisPermissionGuard';
import { FrisRouteGuard } from '@/components/fris/layout/FrisRouteGuard';
import { FrisThemeLock } from '@/components/fris/layout/FrisThemeLock';
import { FrisScrollLock } from '@/components/fris/layout/FrisScrollLock';
import { AdminShotNotificationShell } from '@/components/fris/layout/UserNotificationCenterShell';
import { Toaster } from '@/components/ui/sonner';
import { setBwmsEntryApp } from '@/lib/bwms-app-tools';
import { BillingPageAccessGate } from '@/components/billing/BillingPageAccessGate';
import { BillingWorkspaceProvider } from '@/lib/billing-workspace/BillingWorkspaceProvider';

type Props = {
  children: ReactNode;
};

function isBillingLoginPath(pathname: string | null): boolean {
  return pathname === '/billing/login' || pathname?.startsWith('/billing/login/') === true;
}

function isBillingKycInvitePath(pathname: string | null): boolean {
  return pathname?.startsWith('/billing/kyc/invite/') === true;
}

/**
 * `/billing/login` and public KYC invite links skip FRIS shell.
 * All other billing routes keep FRIS session + permission gates.
 */
export function BillingLayoutGate({ children }: Props) {
  const pathname = usePathname();

  // Persist billing chrome so Advance / Flights / MIS keep a Billing return link.
  useEffect(() => {
    if (!isBillingLoginPath(pathname) && !isBillingKycInvitePath(pathname)) {
      setBwmsEntryApp('billing');
    }
  }, [pathname]);

  /* Login + airline invite keep minimal chrome — no .billing-app shell tokens. */
  if (isBillingLoginPath(pathname) || isBillingKycInvitePath(pathname)) {
    return <>{children}</>;
  }

  return (
    <FrisRouteGuard>
      <FrisThemeLock />
      <FrisScrollLock />
      <AdminShotNotificationShell>
        <BillingDesignRoot>
          <div className="flex h-[100dvh] min-h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[color:var(--billing-bg)] text-[color:var(--billing-text)]">
            <FrisNavbarLazy />
            <main className="billing-shell-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-auto touch-pan-y pt-[3.3rem] pb-[max(0.75rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
              <Suspense
                fallback={
                  <div className="mx-auto max-w-3xl px-6 py-16 text-center text-[color:var(--billing-text-muted)]">
                    <p className="text-lg font-medium">Loading permissions...</p>
                  </div>
                }
              >
                <FrisPermissionGuard>
                  <BillingWorkspaceProvider>
                    <BillingPageAccessGate>
                      <BillingShell>{children}</BillingShell>
                    </BillingPageAccessGate>
                  </BillingWorkspaceProvider>
                </FrisPermissionGuard>
              </Suspense>
            </main>
            <Toaster position="top-right" richColors />
          </div>
        </BillingDesignRoot>
      </AdminShotNotificationShell>
    </FrisRouteGuard>
  );
}
