import { getApiBase } from '@/lib/api';

export type IncidentKpis = {
  openIncidents: number;
  criticalIncidents: number;
  underInvestigation: number;
  resolvedToday: number;
  averageResolutionTimeMinutes: number;
  slaBreaches: number;
  stationsImpacted: number;
  activeEscalations: number;
};

export type IncidentRow = {
  id: string;
  incidentId: string;
  title: string;
  station: string;
  category: string;
  severity: string;
  status: string;
  assignedTo: string;
  reportedBy: string;
  createdAt: string;
  updatedAt: string;
  priority: string;
};

export type IncidentDetail = IncidentRow & {
  description: string;
  department: string;
  affectedArea: string;
  affectedSystem: string;
  escalatedTo: string;
  approver: string;
  resolvedAt: string | null;
  rootCause: string;
  contributingFactors: string[];
  resolutionSummary: string;
  preventiveActions: string[];
  correctiveActions: string[];
  attachments: { fileName: string; mimeType: string; url?: string; kind?: string }[];
  timeline: { at: string; event: string; actor: string; detail: string }[];
  comments: { id: string; author: string; body: string; createdAt: string; mentions: string[] }[];
  sla: {
    targetResolutionTime: string;
    elapsedTimeMs: number;
    remainingTimeMs: number;
    status: string;
  };
  relatedEvents: {
    auditLogs: unknown[];
    userActions: { id: string; label: string }[];
    equipmentEvents: unknown[];
    systemAlerts: unknown[];
  };
  metadata: Record<string, unknown> | null;
};

export type IncidentsQuery = {
  datePreset?: string;
  fromDate?: string;
  toDate?: string;
  station?: string;
  category?: string;
  severity?: string;
  status?: string;
  assignedTo?: string;
  reportedBy?: string;
  incidentId?: string;
  keyword?: string;
  cursor?: string;
  limit?: number;
};

export type CreateIncidentPayload = {
  title: string;
  description: string;
  category: string;
  severity: string;
  station?: string;
  department?: string;
  affectedArea?: string;
  affectedSystem?: string;
  assignedTo?: string;
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

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function buildIncidentsExportUrl(query: IncidentsQuery, format: 'csv' | 'xlsx' | 'pdf') {
  return `${getApiBase()}/admin/incidents/export${buildQuery({ ...query, format })}`;
}

export async function fetchIncidentKpis(query: IncidentsQuery = {}) {
  return parseJson<IncidentKpis>(
    await fetch(`${getApiBase()}/admin/incidents/kpis${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchIncidentSeveritySummary() {
  return parseJson<{ severity: string; count: number }[]>(
    await fetch(`${getApiBase()}/admin/incidents/severity-summary`, {
      credentials: 'include',
    }),
  );
}

export async function fetchIncidents(query: IncidentsQuery) {
  return parseJson<{
    data: IncidentRow[];
    pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
  }>(await fetch(`${getApiBase()}/admin/incidents${buildQuery(query)}`, { credentials: 'include' }));
}

export async function fetchIncidentDetail(incidentId: string) {
  return parseJson<IncidentDetail>(
    await fetch(`${getApiBase()}/admin/incidents/${encodeURIComponent(incidentId)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchIncidentAnalytics(query: IncidentsQuery = {}) {
  return parseJson<{
    byStation: { label: string; value: number }[];
    byCategory: { label: string; value: number }[];
    bySeverity: { label: string; value: number }[];
    monthlyTrend: { label: string; value: number }[];
    resolutionTimeTrend: { label: string; value: number }[];
    topRecurring: { label: string; value: number }[];
  }>(
    await fetch(`${getApiBase()}/admin/incidents/analytics${buildQuery(query)}`, {
      credentials: 'include',
    }),
  );
}

export async function fetchIncidentStationImpact() {
  return parseJson<{
    stations: {
      station: string;
      total: number;
      open: number;
      resolved: number;
      critical: number;
    }[];
  }>(await fetch(`${getApiBase()}/admin/incidents/station-impact`, { credentials: 'include' }));
}

export async function fetchIncidentEscalations() {
  return parseJson<{
    pendingEscalations: IncidentRow[];
    escalatedCount: number;
    overdueInvestigations: IncidentRow[];
    slaViolations: number;
  }>(await fetch(`${getApiBase()}/admin/incidents/escalations`, { credentials: 'include' }));
}

export async function fetchIncidentAlerts() {
  return parseJson<{
    alerts: { id: string; severity: string; title: string; detail: string }[];
  }>(await fetch(`${getApiBase()}/admin/incidents/alerts`, { credentials: 'include' }));
}

export async function createIncident(payload: CreateIncidentPayload) {
  return parseJson<IncidentDetail>(
    await fetch(`${getApiBase()}/admin/incidents`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateIncident(
  incidentId: string,
  payload: Partial<{ status: string; assignedTo: string; escalatedTo: string; rootCause: string; resolutionSummary: string; severity: string }>,
) {
  return parseJson<IncidentDetail>(
    await fetch(`${getApiBase()}/admin/incidents/${encodeURIComponent(incidentId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function addIncidentComment(incidentId: string, body: string) {
  return parseJson<IncidentDetail>(
    await fetch(`${getApiBase()}/admin/incidents/${encodeURIComponent(incidentId)}/comments`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }),
  );
}
