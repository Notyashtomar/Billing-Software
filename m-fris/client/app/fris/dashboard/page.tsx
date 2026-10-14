'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { DashboardNotificationShell } from '@/components/fris/dashboard/DashboardNotificationShell';
import { DashboardThemeProvider } from '@/components/fris/dashboard/DashboardThemeProvider';
import { DashboardQueryProvider } from '@/providers/DashboardQueryProvider';
import { PageLoading } from '@/components/ui/PageLoading';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { DASH_PAGE_SHELL_CLASS } from '@/lib/dashboard-mobile';

const BirdFlightDelhiDashboardDynamic = dynamic(
  () =>
    import('@/components/fris/dashboard/BirdFlightDelhiDashboard').then((m) => ({
      default: m.BirdFlightDelhiDashboard,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function DashboardPage() {
  return (
    <DashboardQueryProvider>
      <DashboardThemeProvider>
        <div
          className={`${DASH_PAGE_SHELL_CLASS} bg-[var(--dash-bg-primary)] font-sans text-[var(--dash-text)] transition-[background-color,color] duration-200 ease-out`}
        >
          <DashboardNotificationShell>
            <div className="flex w-full flex-col">
              <div className="flex-1">
                <ErrorBoundary featureName="Flight dashboard">
                  <Suspense fallback={<PageLoading />}>
                    <BirdFlightDelhiDashboardDynamic />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          </DashboardNotificationShell>
        </div>
      </DashboardThemeProvider>
    </DashboardQueryProvider>
  );
}
