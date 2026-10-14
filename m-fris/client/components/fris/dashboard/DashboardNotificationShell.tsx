'use client';

import { DashboardNotificationProvider } from '@/contexts/DashboardNotificationContext';
import { NotificationStack } from '@/components/ui/NotificationStack';

function ShellInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-0 flex-1">
      {children}
      <NotificationStack />
    </div>
  );
}

/** Notifications stack for the Bird dashboard route. */
export function DashboardNotificationShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardNotificationProvider>
      <ShellInner>{children}</ShellInner>
    </DashboardNotificationProvider>
  );
}
