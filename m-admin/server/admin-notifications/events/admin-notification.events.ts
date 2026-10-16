export const ADMIN_NOTIFICATION_EVENT = 'admin.notification';

export const ADMIN_NOTIFICATION_KINDS = [
  'ticket_raised',
  'registration_submitted',
  'invite_sent',
  'registration_approved',
  'station_created',
  'department_created',
  'creation_scheduled_airline',
  'creation_raf',
  'creation_additional_flight',
  'advance_airline',
  'advance_aircraft',
  'advance_equipment',
  'advance_manpower',
  'advance_raf_airline',
  'advance_ns_airline',
  'advance_terminal',
  'advance_gateway_airline',
  'advance_equipment_catalog',
] as const;

export type AdminNotificationKind = (typeof ADMIN_NOTIFICATION_KINDS)[number];

export type AdminNotificationPayload = {
  kind: AdminNotificationKind | string;
  title: string;
  subtitle: string;
  actorName?: string;
  entityType?: string;
  entityId?: string;
  ticketNumber?: string;
  metadata?: Record<string, unknown>;
};
