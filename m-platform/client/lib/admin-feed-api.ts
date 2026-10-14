import { getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';

export type AdminNotificationFeedItem = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  actorName: string;
  entityType: string;
  entityId: string;
  ticketNumber: string;
  eventDate: string;
  createdAt: string;
  shootableToUsers: boolean;
  userBroadcastSent: boolean;
  read: boolean;
};

export type AdminNotificationFeedResponse = {
  rows: AdminNotificationFeedItem[];
  total: number;
  unreadCount: number;
};

export async function fetchAdminNotificationFeed(params?: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<AdminNotificationFeedResponse> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (params?.fromDate) qs.set('fromDate', params.fromDate);
  if (params?.toDate) qs.set('toDate', params.toDate);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await frisFetch(`${base}/admins/notifications/feed${suffix}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || 'Failed to load notifications');
  }
  return res.json();
}

export async function shootAdminNotificationToFrisUsers(eventId: string): Promise<{
  alreadySent: boolean;
  recipientCount?: number;
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(
    `${base}/admins/notifications/shoot-event/${encodeURIComponent(eventId)}`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || 'Failed to shoot notification');
  }
  return res.json();
}

export async function sendUniversalNotification(input: {
  title: string;
  message: string;
  audience?: 'all' | 'custom';
  userIds?: string[];
}): Promise<{
  alreadySent: boolean;
  recipientCount?: number;
  event?: { id: string; kind: string; title: string; subtitle: string };
}> {
  const base = getApiBase().replace(/\/$/, '');
  const audience = input.audience === 'custom' ? 'custom' : 'all';
  const res = await frisFetch(`${base}/admins/notifications/universal`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      message: input.message,
      audience,
      ...(audience === 'custom' ? { userIds: input.userIds ?? [] } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || 'Failed to send universal notification');
  }
  return res.json();
}

export async function markAllAdminNotificationsRead(params?: {
  fromDate?: string;
  toDate?: string;
}): Promise<{ success: boolean; modifiedCount: number }> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (params?.fromDate) qs.set('fromDate', params.fromDate);
  if (params?.toDate) qs.set('toDate', params.toDate);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await frisFetch(`${base}/admins/notifications/mark-all-read${suffix}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || 'Failed to mark notifications as read');
  }
  return res.json();
}

export function adminNotificationFeedHref(item: AdminNotificationFeedItem): string {
  if (item.kind === 'ticket_raised' && item.ticketNumber) {
    return `/admin/tickets?ticket=${encodeURIComponent(item.ticketNumber)}`;
  }
  if (
    (item.kind === 'registration_submitted' ||
      item.kind === 'registration_approved' ||
      item.kind === 'invite_sent') &&
    item.entityId
  ) {
    return `/admin/users?approveUserId=${encodeURIComponent(item.entityId)}`;
  }
  if (item.kind === 'station_created') {
    return '/admin/stations';
  }
  if (item.kind === 'department_created') {
    return '/admin/departments';
  }
  if (item.kind.startsWith('creation_')) {
    if (item.kind === 'creation_raf') {
      return '/fris/creation?section=raf';
    }
    if (item.kind === 'creation_additional_flight') {
      return '/fris/creation?section=additional-flights';
    }
    return '/fris/creation?section=scheduled-airlines';
  }
  if (item.kind.startsWith('advance_')) {
    return '/fris/advance?tab=gateway';
  }
  return '/admin/notifications';
}

export function isShootableNotification(item: AdminNotificationFeedItem): boolean {
  return Boolean(item.shootableToUsers);
}
