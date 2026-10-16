export const SHOOTABLE_ADMIN_NOTIFICATION_KINDS = new Set([
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
]);

export function isShootableAdminNotificationKind(kind: string): boolean {
  return SHOOTABLE_ADMIN_NOTIFICATION_KINDS.has(kind);
}
