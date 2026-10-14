import { getApiBase } from '@/lib/api';

export type AuditKpiFilter =
  | 'total_today'
  | 'security'
  | 'user_actions'
  | 'config_changes'
  | 'failed'
  | 'critical'
  | 'unique_users'
  | 'stations_impacted';

export type AuditKpis = {
  totalToday: number;
  securityEvents: number;
  userActions: number;
  configChanges: number;
  failedOperations: number;
  criticalAlerts: number;
  uniqueUsers: number;
  stationsImpacted: number;
};

export type AuditEventRow = {
  id: string;
  eventId: string;
  timestamp: string;
  userId: string;
  userName: string;
  employeeId: string;
  station: string;
  department: string;
  module: string;
  action: string;
  actionLabel: string;
  entity: string;
  entityType: string;
  entityId: string;
  severity: string;
  result: string;
  ipAddress: string;
  requestId: string;
  riskScore: number;
};

export type AuditEventDetail = AuditEventRow & {
  role: string;
  userEmail: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  correlationId: string;
  device: string;
  browser: string;
  os: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  suspiciousActivity: boolean;
  metadata: Record<string, unknown> | null;
  rawPayload: Record<string, unknown> | null;
};

export type AuditEventsQuery = {
  datePreset?: string;
  fromDate?: string;
  toDate?: string;
  userSearch?: string;
  station?: string;
  department?: string;
  module?: string;
  eventType?: string;
  severity?: string;
  result?: string;
  ipAddress?: string;
  requestId?: string;
  kpiFilter?: AuditKpiFilter | '';
  cursor?: string;
  limit?: number;
};

export type AuditEventsResponse = {
  data: AuditEventRow[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
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

function normalizeAuditKpis(raw: unknown): AuditKpis {
  const row =
    raw && typeof raw === 'object' && 'data' in (raw as object)
      ? (raw as { data: Record<string, unknown> }).data
      : (raw as Record<string, unknown>);

  const n = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  return {
    totalToday: n(row?.totalToday ?? row?.total_today),
    securityEvents: n(row?.securityEvents ?? row?.security_events),
    userActions: n(row?.userActions ?? row?.user_actions),
    configChanges: n(row?.configChanges ?? row?.config_changes),
    failedOperations: n(row?.failedOperations ?? row?.failed_operations),
    criticalAlerts: n(row?.criticalAlerts ?? row?.critical_alerts),
    uniqueUsers: n(row?.uniqueUsers ?? row?.unique_users),
    stationsImpacted: n(row?.stationsImpacted ?? row?.stations_impacted),
  };
}

function apiBase() {
  return getApiBase().replace(/\/$/, '');
}

function buildParams(query: AuditEventsQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.datePreset) params.set('datePreset', query.datePreset);
  if (query.fromDate) params.set('fromDate', query.fromDate);
  if (query.toDate) params.set('toDate', query.toDate);
  if (query.userSearch?.trim()) params.set('userSearch', query.userSearch.trim());
  if (query.station?.trim()) params.set('station', query.station.trim());
  if (query.department?.trim()) params.set('department', query.department.trim());
  if (query.module?.trim()) params.set('module', query.module.trim());
  if (query.eventType?.trim()) params.set('eventType', query.eventType.trim());
  if (query.severity?.trim()) params.set('severity', query.severity.trim());
  if (query.result?.trim()) params.set('result', query.result.trim());
  if (query.ipAddress?.trim()) params.set('ipAddress', query.ipAddress.trim());
  if (query.requestId?.trim()) params.set('requestId', query.requestId.trim());
  if (query.kpiFilter) params.set('kpiFilter', query.kpiFilter);
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit) params.set('limit', String(query.limit));
  return params;
}

export async function fetchAuditKpis(query?: Pick<AuditEventsQuery, 'datePreset' | 'fromDate' | 'toDate'>): Promise<AuditKpis> {
  const params = new URLSearchParams();
  if (query?.datePreset) params.set('datePreset', query.datePreset);
  if (query?.fromDate) params.set('fromDate', query.fromDate);
  if (query?.toDate) params.set('toDate', query.toDate);
  const res = await fetch(`${apiBase()}/admin/audit/kpis?${params}`, { credentials: 'include' });
  const raw = await parseJson<unknown>(res);
  return normalizeAuditKpis(raw);
}

export async function fetchAuditEvents(query: AuditEventsQuery): Promise<AuditEventsResponse> {
  const res = await fetch(`${apiBase()}/admin/audit/events?${buildParams(query)}`, {
    credentials: 'include',
  });
  return parseJson<AuditEventsResponse>(res);
}

export async function fetchAuditEventDetail(eventId: string): Promise<AuditEventDetail> {
  const res = await fetch(`${apiBase()}/admin/audit/events/${encodeURIComponent(eventId)}`, {
    credentials: 'include',
  });
  return parseJson<AuditEventDetail>(res);
}

export async function fetchAuditRelatedEvents(
  eventId: string,
  scope: 'user' | 'station' | 'module',
): Promise<AuditEventRow[]> {
  const res = await fetch(
    `${apiBase()}/admin/audit/events/${encodeURIComponent(eventId)}/related?scope=${scope}`,
    { credentials: 'include' },
  );
  return parseJson<AuditEventRow[]>(res);
}

export function buildAuditExportUrl(query: AuditEventsQuery, format: 'csv' | 'xlsx' | 'pdf' = 'csv'): string {
  const params = buildParams(query);
  params.set('format', format);
  return `${apiBase()}/admin/audit/export?${params}`;
}
