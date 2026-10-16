export enum AccessControlRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  MANAGER = 'MANAGER',
  STATION_STAFF = 'STATION_STAFF',
}

export const ACCESS_CONTROL_ROLE_ORDER: AccessControlRole[] = [
  AccessControlRole.SUPER_ADMIN,
  AccessControlRole.MANAGER,
  AccessControlRole.STATION_STAFF,
];

export const ACCESS_CONTROL_ROLE_LABELS: Record<AccessControlRole, string> = {
  [AccessControlRole.SUPER_ADMIN]: 'Super Admin',
  [AccessControlRole.MANAGER]: 'Manager',
  [AccessControlRole.STATION_STAFF]: 'Employee',
};
