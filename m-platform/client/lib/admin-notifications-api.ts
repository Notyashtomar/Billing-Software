import { fetchPanelAdmins, getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { fetchUserRegistrationWorkspace } from '@/lib/user-registration-api';

export type AuditFieldChange = {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
};

export type BillingActivityFlight = {
  id?: string;
  serial?: string | number;
  flightNumber?: string;
  flightDateTime?: string;
  dateFlight?: string;
  airline?: string;
  airlineCustomer?: string;
  customer?: string;
  date?: string;
  origin?: string;
  destination?: string;
  sourceType?: string;
  priorStatus?: string;
  status?: string;
  outcome?: string;
  message?: string;
  [key: string]: unknown;
};

export type BillingActivityFailure = {
  id?: string;
  flightNumber?: string;
  field?: string;
  message?: string;
  reason?: string;
  code?: string;
  [key: string]: unknown;
};

export type BillingActivityMetadata = {
  outcome?: string;
  status?: string;
  requestId?: string;
  correlationId?: string;
  page?: string;
  tab?: string;
  scope?: string | Record<string, unknown>;
  filters?: Record<string, unknown> | unknown[];
  counts?: Record<string, unknown>;
  affectedFlights?: BillingActivityFlight[];
  sample?: BillingActivityFlight[];
  flights?: BillingActivityFlight[];
  remainingCount?: number;
  partialFailures?: BillingActivityFailure[];
  failures?: BillingActivityFailure[];
  changes?: AuditFieldChange[];
  [key: string]: unknown;
};

export type AdminUserActionLog = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  accountType: 'admin' | 'user';
  action: string;
  /** Self-explanatory description of exactly what happened. */
  summary?: string;
  actorRole?: string;
  stationId?: string;
  stationName?: string;
  module?: string;
  page?: string;
  tab?: string;
  section?: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  changes?: AuditFieldChange[];
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  method: string;
  path: string;
  actionDate: string;
  createdAt: string;
  metadata?: BillingActivityMetadata | Record<string, unknown> | null;
  notificationSent: boolean;
  notificationId: string | null;
};

export type AdminActivityFilterUser = {
  id: string;
  name: string;
  employeeId: string;
  accountType: 'admin' | 'user';
  /** Admin-station document ids this user is assigned to. */
  stationIds: string[];
};

function toStationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id ?? '').trim()).filter(Boolean);
}

function parseFilterUsersPayload(data: unknown): AdminActivityFilterUser[] {
  if (Array.isArray(data)) {
    return data
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row && typeof row === 'object' && 'id' in row && 'name' in row),
      )
      .map((row) => ({
        id: String(row.id ?? '').trim(),
        name: String(row.name ?? '').trim() || 'User',
        employeeId: String(row.employeeId ?? '').trim(),
        accountType: row.accountType === 'admin' ? 'admin' : 'user',
        stationIds: toStationIds(row.stationIds),
      }));
  }
  if (data && typeof data === 'object') {
    const record = data as { data?: unknown; rows?: unknown };
    if (Array.isArray(record.data)) return parseFilterUsersPayload(record.data);
    if (Array.isArray(record.rows)) return parseFilterUsersPayload(record.rows);
  }
  return [];
}

function sortFilterUsers(
  rows: AdminActivityFilterUser[],
): AdminActivityFilterUser[] {
  return [...rows].sort((a, b) => {
    const codeCmp = (a.employeeId || '').localeCompare(b.employeeId || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (codeCmp !== 0) return codeCmp;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function mergeFilterUsers(
  ...groups: AdminActivityFilterUser[][]
): AdminActivityFilterUser[] {
  const byId = new Map<string, AdminActivityFilterUser>();
  for (const group of groups) {
    for (const row of group) {
      const id = String(row.id ?? '').trim();
      if (!id) continue;
      byId.set(id, {
        id,
        name: String(row.name ?? '').trim() || 'User',
        employeeId: String(row.employeeId ?? '').trim(),
        accountType: row.accountType === 'admin' ? 'admin' : 'user',
        stationIds: toStationIds(row.stationIds),
      });
    }
  }
  return sortFilterUsers([...byId.values()]);
}

async function loadFilterUsersFallback(): Promise<AdminActivityFilterUser[]> {
  const [admins, workspace] = await Promise.all([
    fetchPanelAdmins().catch(() => []),
    fetchUserRegistrationWorkspace().catch(() => null),
  ]);

  const fromAdmins: AdminActivityFilterUser[] = admins.map((admin) => ({
    id: String(admin.id ?? '').trim(),
    name: String(admin.name ?? '').trim() || 'Admin',
    employeeId: String(admin.userid ?? admin.employeeId ?? '').trim(),
    accountType: 'admin' as const,
    stationIds: [],
  }));

  const workspaceUsers = workspace
    ? [...workspace.users, ...workspace.pendingApprovals]
    : [];
  const fromWorkspace: AdminActivityFilterUser[] = workspaceUsers
    .filter((user) => user.accountStatus !== 'invited')
    .map((user) => ({
      id: String(user.id ?? '').trim(),
      name: String(user.name ?? '').trim() || 'User',
      employeeId: String(user.employeeId ?? user.userid ?? '').trim(),
      accountType: 'user' as const,
      stationIds: [],
    }));

  return mergeFilterUsers(fromAdmins, fromWorkspace);
}

export async function fetchAdminActivityFilterUsers(): Promise<AdminActivityFilterUser[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/admins/user-action-logs/filter-users`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || 'Failed to load users');
  }
  const data = await res.json();
  return parseFilterUsersPayload(data);
}

/** Load filter users with workspace/admin fallback when the dedicated endpoint is empty or fails. */
export async function loadAdminActivityFilterUsers(): Promise<AdminActivityFilterUser[]> {
  try {
    const rows = await fetchAdminActivityFilterUsers();
    if (rows.length > 0) return rows;
  } catch {
    // Fall through to workspace/admin sources.
  }
  return loadFilterUsersFallback();
}

export async function fetchAdminUserActionLogs(params?: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
  userId?: string;
  stationId?: string;
}): Promise<AdminUserActionLog[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (params?.fromDate) qs.set('fromDate', params.fromDate);
  if (params?.toDate) qs.set('toDate', params.toDate);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.stationId) qs.set('stationId', params.stationId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await frisFetch(`${base}/admins/user-action-logs${suffix}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || 'Failed to load activity logs');
  }
  const data = (await res.json()) as AdminUserActionLog[] | { rows?: AdminUserActionLog[] };
  if (Array.isArray(data)) return data;
  return Array.isArray(data.rows) ? data.rows : [];
}

export type StationLoginStatRow = {
  userId: string;
  userName: string;
  employeeId: string;
  accountType: string;
  loginCount: number;
  lastLoginAt: string;
  lastLoginDate: string;
  todayLoginCount?: number;
  isLive?: boolean;
  lastActivityAt?: string;
  currentPage?: string;
  currentModule?: string;
  currentTab?: string;
  currentPath?: string;
  currentAction?: string;
  currentPageAt?: string;
  currentPageLabel?: string;
  currentSystemId?: string;
  currentSystem?: string;
};

export type StationLiveLoginRow = {
  userId: string;
  userName: string;
  employeeId: string;
  accountType: string;
  loginCount: number;
  lastLoginAt: string;
  lastLoginDate: string;
  lastActivityAt: string;
  sessionAgeMinutes: number;
  currentPage?: string;
  currentModule?: string;
  currentTab?: string;
  currentPath?: string;
  currentAction?: string;
  currentPageAt?: string;
  currentPageLabel?: string;
  currentSystemId?: string;
  currentSystem?: string;
};

export type StationTodayLoginRow = {
  userId: string;
  userName: string;
  employeeId: string;
  accountType: string;
  loginCount: number;
  lastLoginAt: string;
  lastLoginDate: string;
  isLive: boolean;
  lastActivityAt: string;
  currentPage?: string;
  currentModule?: string;
  currentTab?: string;
  currentPath?: string;
  currentAction?: string;
  currentPageAt?: string;
  currentPageLabel?: string;
  currentSystemId?: string;
  currentSystem?: string;
};

export type StationLoginStatsResponse = {
  stationId: string;
  stationLabel: string;
  fromDate: string;
  toDate: string;
  todayDate: string;
  totalLogins: number;
  uniqueStaff: number;
  todayTotalLogins: number;
  todayUniqueStaff: number;
  liveCount: number;
  rows: StationLoginStatRow[];
  todayRows: StationTodayLoginRow[];
  liveRows: StationLiveLoginRow[];
};

/** Aggregated staff login counts at a station (dashboard heatmap drill-down). */
export async function fetchStationLoginStats(params: {
  stationId?: string;
  stationCode?: string;
  stationName?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<StationLoginStatsResponse> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (params.stationId) qs.set('stationId', params.stationId);
  if (params.stationCode) qs.set('stationCode', params.stationCode);
  if (params.stationName) qs.set('stationName', params.stationName);
  if (params.fromDate) qs.set('fromDate', params.fromDate);
  if (params.toDate) qs.set('toDate', params.toDate);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await frisFetch(
    `${base}/admins/user-action-logs/station-login-stats${suffix}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || 'Failed to load station login stats');
  }
  return res.json() as Promise<StationLoginStatsResponse>;
}

export async function shootNotificationForLog(logId: string): Promise<{
  alreadySent: boolean;
  recipientCount?: number;
  log: AdminUserActionLog;
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(
    `${base}/admins/notifications/shoot/${encodeURIComponent(logId)}`,
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
