'use client';

/**
 * Global dashboard notification state + actions.
 *
 * @example
 * const { addNotification } = useNotifications();
 * addNotification({ type: 'flight_cancelled', title: 'Flight Cancelled', message: 'AI203 has been cancelled' });
 *
 * @see contexts/DashboardNotificationContext.tsx
 */
export {
  useDashboardNotifications as useNotifications,
  dispatchDashboardNotification,
  type NotificationType,
  type DashboardNotificationInput as NotificationInput,
} from '@/contexts/DashboardNotificationContext';
