import { getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';

export type UserNotificationCenterItem = {
  id: string;
  userId: string;
  userName: string;
  title: string;
  message: string;
  notificationDate: string;
  delivered: boolean;
  deliveredAt: string | null;
  popupShowCount?: number;
  maxPopupShows?: number;
  readAt: string | null;
  sourceLogId: string | null;
  shotByAdminName: string;
  createdAt: string;
};

export type UserNotificationCenterResponse = {
  rows: UserNotificationCenterItem[];
  groupedByDate: Record<string, UserNotificationCenterItem[]>;
};

export async function fetchUserNotificationCenter(params?: {
  undeliveredOnly?: boolean;
  popupOnly?: boolean;
  fromDate?: string;
  toDate?: string;
}): Promise<UserNotificationCenterResponse> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (params?.undeliveredOnly) qs.set('undeliveredOnly', 'true');
  if (params?.popupOnly) qs.set('popupOnly', 'true');
  if (params?.fromDate) qs.set('fromDate', params.fromDate);
  if (params?.toDate) qs.set('toDate', params.toDate);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await frisFetch(`${base}/users/notification-center${suffix}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || 'Failed to load notifications');
  }
  return res.json();
}

export async function markUserNotificationDelivered(
  notificationId: string,
): Promise<{
  id: string;
  delivered: boolean;
  popupShowCount?: number;
  maxPopupShows?: number;
} | null> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(
    `${base}/users/notification-center/${encodeURIComponent(notificationId)}/delivered`,
    { method: 'PATCH', credentials: 'include' },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function markUserNotificationRead(
  notificationId: string,
): Promise<{ id: string; readAt: string | null } | null> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(
    `${base}/users/notification-center/${encodeURIComponent(notificationId)}/read`,
    { method: 'PATCH', credentials: 'include' },
  );
  if (!res.ok) return null;
  return res.json();
}
