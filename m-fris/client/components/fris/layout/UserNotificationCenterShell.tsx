'use client';

import dynamic from 'next/dynamic';
import { AdminShotNotificationProvider } from '@/contexts/UserNotificationCenterContext';

/** Client-only overlay — keeps framer-motion out of the OpenNext Worker SSR graph. */
const UserNotificationCenterOverlay = dynamic(
  () =>
    import('@/components/fris/layout/UserNotificationCenterOverlay').then(
      (m) => m.UserNotificationCenterOverlay,
    ),
  { ssr: false },
);

/** Admin “shoot notification” popups only — dashboard notification center is unchanged. */
export function AdminShotNotificationShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminShotNotificationProvider>
      {children}
      <UserNotificationCenterOverlay />
    </AdminShotNotificationProvider>
  );
}
