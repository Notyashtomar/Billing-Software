import { getApiBase } from '@/lib/api';

export type AccessControlRoleKey = 'SUPER_ADMIN' | 'MANAGER' | 'STATION_STAFF';

export const ACCESS_CONTROL_ROLE_LABELS: Record<AccessControlRoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Manager',
  STATION_STAFF: 'Employee',
};

export const ACCESS_CONTROL_ROLE_ORDER: AccessControlRoleKey[] = [
  'SUPER_ADMIN',
  'MANAGER',
  'STATION_STAFF',
];

export type AccessControlRoleSummary = {
  role: AccessControlRoleKey;
  userCount: number;
  activeCount: number;
  inactiveCount: number;
};

export type AccessControlUserRow = {
  id: string;
  accountKind: 'user' | 'admin';
  accessRole: AccessControlRoleKey;
  userid?: string;
  employeeId: string;
  name: string;
  email: string;
  station: string;
  department: string;
  status: string;
  lastLogin: string;
};

export type AccessControlUserDetail = AccessControlUserRow & {
  userid: string;
  phone: string;
  designation: string;
  company: string;
  permissions: { accessTabs: string[]; accessSubPages: Record<string, string[]> };
  stationPermissions: Record<string, { accessTabs: string[]; accessSubPages: Record<string, string[]> }>;
  assignedStationIds: string[];
  authorizationRole: string;
  isActive: boolean;
  accountStatus: string;
  createdAt?: string;
};

export type AccessControlUsersQuery = {
  role: AccessControlRoleKey;
  page?: number;
  limit?: number;
  search?: string;
  station?: string;
  department?: string;
  status?: string;
};

export type AccessControlUsersResponse = {
  data: AccessControlUserRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { message?: unknown })?.message === 'string'
        ? (data as { message: string }).message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function apiBase() {
  return getApiBase().replace(/\/$/, '');
}

export async function fetchAccessControlRoleSummary(): Promise<AccessControlRoleSummary[]> {
  const res = await fetch(`${apiBase()}/admin/access-control/role-summary`, {
    credentials: 'include',
  });
  return parseJson<AccessControlRoleSummary[]>(res);
}

export async function fetchAccessControlUsers(
  query: AccessControlUsersQuery,
): Promise<AccessControlUsersResponse> {
  const params = new URLSearchParams();
  params.set('role', query.role);
  params.set('page', String(query.page ?? 1));
  params.set('limit', String(query.limit ?? 25));
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.station?.trim()) params.set('station', query.station.trim());
  if (query.department?.trim()) params.set('department', query.department.trim());
  if (query.status?.trim()) params.set('status', query.status.trim());

  const res = await fetch(`${apiBase()}/admin/access-control/users?${params}`, {
    credentials: 'include',
  });
  return parseJson<AccessControlUsersResponse>(res);
}

export async function fetchAccessControlUserDetail(
  id: string,
  accountKind?: 'user' | 'admin',
): Promise<AccessControlUserDetail> {
  const params = accountKind ? `?accountKind=${encodeURIComponent(accountKind)}` : '';
  const res = await fetch(
    `${apiBase()}/admin/access-control/users/${encodeURIComponent(id)}${params}`,
    { credentials: 'include' },
  );
  return parseJson<AccessControlUserDetail>(res);
}
