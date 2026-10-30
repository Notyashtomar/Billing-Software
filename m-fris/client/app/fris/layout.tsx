import { Suspense } from 'react';
import { ApplyStationFromQuery } from '@/components/fris/layout/ApplyStationFromQuery';
import { FrisNavbarLazy } from '@/components/fris/layout/FrisNavbarLazy';
import { FrisPermissionGuard } from '@/components/fris/layout/FrisPermissionGuard';
import { FrisRouteGuard } from '@/components/fris/layout/FrisRouteGuard';
import { FrisThemeLock } from '@/components/fris/layout/FrisThemeLock';
import { FrisScrollLock } from '@/components/fris/layout/FrisScrollLock';
import { AdminShotNotificationShell } from '@/components/fris/layout/UserNotificationCenterShell';
import { Toaster } from '@/components/ui/sonner';
import { FrisQueryProvider } from '@/providers/FrisQueryProvider';

export default function FrisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FrisRouteGuard>
      <FrisThemeLock />
      <FrisScrollLock />
      <FrisQueryProvider>
        <AdminShotNotificationShell>
        <div className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-[#f7f8fa] text-gray-900">
          <FrisNavbarLazy />
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pt-12 [-webkit-overflow-scrolling:touch]">
            <Suspense
              fallback={
                <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-600">
                  <p className="text-lg font-medium">Loading permissions...</p>
                </div>
              }
            >
              <ApplyStationFromQuery />
              <FrisPermissionGuard>{children}</FrisPermissionGuard>
            </Suspense>
          </main>
          <Toaster position="top-right" richColors />
        </div>
      </AdminShotNotificationShell>
      </FrisQueryProvider>
    </FrisRouteGuard>
  );
}
