import { AccessControlRole } from '../constants/access-control-role.enum';

export type AccountKind = 'user' | 'admin';

export function normalizeStatusLabel(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return 'Active';
  const lower = value.toLowerCase();
  if (lower.includes('suspend')) return 'Suspended';
  if (lower === 'inactive' || lower === 'disabled') return 'Inactive';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function isAccountActive(doc: {
  status?: unknown;
  isActive?: unknown;
  accountStatus?: unknown;
}): boolean {
  const status = String(doc.status ?? '').trim().toLowerCase();
  const accountStatus = String(doc.accountStatus ?? 'active').trim().toLowerCase();
  if (status.includes('suspend')) return false;
  if (status === 'inactive' || accountStatus === 'inactive') return false;
  if (doc.isActive === false) return false;
  return accountStatus === 'active' || accountStatus === 'approved' || !accountStatus;
}

export function resolveUserAccessRole(doc: {
  authorizationRole?: unknown;
  role?: unknown;
  station?: unknown;
  assignedStationIds?: unknown;
  designation?: unknown;
}): AccessControlRole {
  const auth = String(doc.authorizationRole ?? doc.role ?? 'employee')
    .trim()
    .toLowerCase();
  if (auth === 'superadmin') return AccessControlRole.SUPER_ADMIN;
  if (auth === 'manager' || auth === 'admin' || auth === 'operations') {
    return AccessControlRole.MANAGER;
  }

  return AccessControlRole.STATION_STAFF;
}

export function resolveAdminAccessRole(role: unknown): AccessControlRole {
  const normalized = String(role ?? '').trim().toLowerCase();
  if (normalized === 'superadmin') return AccessControlRole.SUPER_ADMIN;
  return AccessControlRole.MANAGER;
}

export function roleFilterForUsers(role: AccessControlRole): Record<string, unknown> {
  switch (role) {
    case AccessControlRole.SUPER_ADMIN:
      return { authorizationRole: 'superadmin' };
    case AccessControlRole.MANAGER:
      return { authorizationRole: { $in: ['manager', 'admin', 'operations'] } };
    case AccessControlRole.STATION_STAFF:
      return { authorizationRole: { $in: ['employee', null, ''] } };
    default:
      return {};
  }
}

export function roleFilterForAdmins(role: AccessControlRole): Record<string, unknown> | null {
  switch (role) {
    case AccessControlRole.SUPER_ADMIN:
      return { role: 'superadmin' };
    case AccessControlRole.MANAGER:
      return { role: { $in: ['manager', 'admin', 'operations'] } };
    default:
      return null;
  }
}
