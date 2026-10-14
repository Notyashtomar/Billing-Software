'use client';

import { useDashboardNotifications } from '@/contexts/DashboardNotificationContext';
import { NotificationCard } from '@/components/ui/NotificationCard';

/** Compact toast stack — top-right, does not cover the dashboard. */
export function NotificationStack() {
  const { notifications, removeNotification } = useDashboardNotifications();

  if (!notifications.length) return null;

  return (
    <div
      className="pointer-events-none fixed top-[4.25rem] right-3 z-[9997] flex max-h-[min(70vh,calc(100vh-5rem))] flex-col items-end gap-2 overflow-y-auto overflow-x-hidden sm:right-4 sm:top-[4.75rem]"
      aria-live="polite"
      aria-label="Dashboard notifications"
    >
      <ul className="m-0 flex w-[min(calc(100vw-1.5rem),300px)] list-none flex-col gap-2 p-0 sm:w-[280px]">
        {notifications.map((n, index) => (
          <li key={n.id} className="pointer-events-auto">
            <NotificationCard
              notification={n}
              onDismiss={removeNotification}
              styleIndex={index}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
