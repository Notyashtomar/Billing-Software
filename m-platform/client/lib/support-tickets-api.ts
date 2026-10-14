/**
 * Client API for Nest `UserController` support-ticket routes under `/users/support-tickets`.
 * Keep in sync with server/src/user/controllers/user.controller.ts and support-ticket.service.ts.
 */

const DIRECT_API_DEFAULT = 'http://127.0.0.1:8080';
/** FRIS users raise/track/close tickets. */
const SUPPORT_TICKETS_PREFIX = '/users/support-tickets';

/** Admin panel reads/resolves Mongo collection `support_tickets`. */
const ADMIN_SUPPORT_TICKETS_PREFIX = '/admins/support-tickets';

function getApiBase(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      DIRECT_API_DEFAULT
    ).replace(/\/$/, '');
  }
  return '/api-backend';
}

export const SUPPORT_TICKET_URGENCY = ['urgent', 'non-urgent'] as const;
export type SupportTicketUrgency = (typeof SUPPORT_TICKET_URGENCY)[number];

export const SUPPORT_TICKET_ISSUE_TYPES = [
  'Cosmetic',
  'Minor',
  'Major',
  'Catastrophic',
  'Show stopper',
] as const;
export type SupportTicketIssueType = (typeof SUPPORT_TICKET_ISSUE_TYPES)[number];

export type SupportTicketStatus = 'open' | 'closed';

export type SupportTicketAttachmentPayload = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
};

/** POST /users/support-tickets body (CreateSupportTicketDto). */
export type CreateSupportTicketPayload = {
  navigationPageLabel: string;
  navigationPagePath: string;
  subPageLabel: string;
  subPagePath: string;
  issueReason: string;
  description: string;
  urgency: SupportTicketUrgency;
  issueType: SupportTicketIssueType;
  attachments?: SupportTicketAttachmentPayload[];
};

/** PATCH /users/support-tickets/:ticketNumber/close body (CloseSupportTicketDto). */
export type CloseSupportTicketPayload = {
  closeComment: string;
};

/** PATCH /users/support-tickets/admin/:ticketNumber/resolve body (ResolveSupportTicketDto). */
export type ResolveSupportTicketPayload = {
  resolutionNote: string;
};

export type SupportTicketSummary = {
  ticketNumber: string;
  status: SupportTicketStatus;
  raisedAt: string;
  closedAt: string | null;
  navigationPageLabel: string;
  subPageLabel: string;
  urgency: string;
  issueType: string;
  issueReason: string;
};

export type SupportTicketAttachmentView = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

export type SupportTicketDetail = SupportTicketSummary & {
  id: string;
  raisedByUserid: string;
  raisedByName: string;
  raisedByEmail: string;
  description: string;
  closeComment: string | null;
  adminResolutionNote: string | null;
  resolvedByAdminName: string | null;
  adminResolvedAt: string | null;
  attachments?: SupportTicketAttachmentView[];
};

export type AdminSupportTicketListItem = SupportTicketSummary & {
  raisedByName: string;
  raisedByEmail: string;
  raisedByUserid: string;
  adminResolutionNote: string;
  adminResolvedAt: string | null;
  resolvedByAdminName: string;
};

export type SupportTicketAdminContact = {
  name: string;
  email: string;
  role: string;
};

export type CreateSupportTicketResult = {
  success: boolean;
  message: string;
  data: {
    id: string;
    ticketNumber: string;
    raisedAt: string;
    raisedByUserid: string;
    raisedByName: string;
    raisedByEmail: string;
    status: SupportTicketStatus;
  };
};

type ApiListResponse<T> = {
  success: boolean;
  count: number;
  data: T[];
};

type ApiDetailResponse<T> = {
  success: boolean;
  data: T;
};

type ApiMutationResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

function apiRoot(): string {
  return getApiBase().replace(/\/$/, '');
}

/** Sentinel: FRIS httpOnly cookie auth (no Authorization header). */
export const SUPPORT_TICKET_COOKIE_SESSION = 'cookie-session';

const OPS_SESSION_KEYS = [
  'ams_auth_session',
  'chr_auth_session',
  'uld_auth_session',
  'gemm_auth_session',
] as const;



/** Email for Raise Ticket contact filtering (FRIS LS or ops module session). */
export function resolveSupportTicketUserEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fromFris = localStorage.getItem('userEmail')?.trim().toLowerCase();
    if (fromFris) return fromFris;
    for (const key of OPS_SESSION_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { email?: string };
      const email = String(parsed?.email ?? '')
        .trim()
        .toLowerCase();
      if (email) return email;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  
  if (typeof window !== 'undefined') {
    const frisJwt = localStorage.getItem('access_token')?.trim();
    if (frisJwt) {
      headers.Authorization = `Bearer ${frisJwt}`;
    }
  }

  return headers;
}

function parseApiError(data: unknown, status: number): string {
  if (!data || typeof data !== 'object') return `Request failed (${status})`;
  const row = data as Record<string, unknown>;
  if (typeof row.message === 'string') return row.message;
  if (Array.isArray(row.message)) return row.message.map(String).join(', ');
  return `Request failed (${status})`;
}

function encodeTicketNumber(ticketNumber: string): string {
  return encodeURIComponent(ticketNumber.trim().toUpperCase());
}

function toIsoString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  return toIsoString(value);
}

function normalizeSummary(row: Record<string, unknown>): SupportTicketSummary {
  return {
    ticketNumber: String(row.ticketNumber ?? ''),
    status: (row.status === 'closed' ? 'closed' : 'open') as SupportTicketStatus,
    raisedAt: toIsoString(row.raisedAt),
    closedAt: toIsoStringOrNull(row.closedAt),
    navigationPageLabel: String(row.navigationPageLabel ?? ''),
    subPageLabel: String(row.subPageLabel ?? ''),
    urgency: String(row.urgency ?? ''),
    issueType: String(row.issueType ?? ''),
    issueReason: String(row.issueReason ?? ''),
  };
}

function normalizeDetail(row: Record<string, unknown>): SupportTicketDetail {
  const base = normalizeSummary(row);
  const attachments = Array.isArray(row.attachments)
    ? row.attachments
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const a = item as Record<string, unknown>;
          const fileName = String(a.fileName ?? '').trim();
          const mimeType = String(a.mimeType ?? 'application/octet-stream').trim();
          const dataUrl = String(a.dataUrl ?? '').trim();
          if (!fileName || !dataUrl) return null;
          return {
            fileName,
            mimeType,
            sizeBytes: typeof a.sizeBytes === 'number' ? a.sizeBytes : Number(a.sizeBytes) || 0,
            dataUrl,
          };
        })
        .filter((x): x is SupportTicketAttachmentView => Boolean(x))
    : undefined;

  return {
    ...base,
    id: String(row.id ?? ''),
    raisedByUserid: String(row.raisedByUserid ?? ''),
    raisedByName: String(row.raisedByName ?? ''),
    raisedByEmail: String(row.raisedByEmail ?? ''),
    description: String(row.description ?? ''),
    closeComment: String(row.closeComment ?? '').trim() || null,
    adminResolutionNote: String(row.adminResolutionNote ?? '').trim() || null,
    resolvedByAdminName: String(row.resolvedByAdminName ?? '').trim() || null,
    adminResolvedAt: toIsoStringOrNull(row.adminResolvedAt),
    attachments: attachments?.length ? attachments : undefined,
  };
}

function normalizeAdminListItem(row: Record<string, unknown>): AdminSupportTicketListItem {
  const base = normalizeSummary(row);
  return {
    ...base,
    raisedByName: String(row.raisedByName ?? ''),
    raisedByEmail: String(row.raisedByEmail ?? ''),
    raisedByUserid: String(row.raisedByUserid ?? ''),
    adminResolutionNote: String(row.adminResolutionNote ?? ''),
    adminResolvedAt: toIsoStringOrNull(row.adminResolvedAt),
    resolvedByAdminName: String(row.resolvedByAdminName ?? ''),
  };
}

async function parseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

/** POST /users/support-tickets */
export async function submitSupportTicket(
  payload: CreateSupportTicketPayload,
): Promise<CreateSupportTicketResult> {
  const res = await fetch(`${apiRoot()}${SUPPORT_TICKETS_PREFIX}`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(parseApiError(data, res.status));
  const row = data as CreateSupportTicketResult;
  if (row.data?.raisedAt) {
    row.data.raisedAt = toIsoString(row.data.raisedAt);
  }
  return row;
}

/** GET /users/support-tickets/my */
export async function fetchMySupportTickets(): Promise<SupportTicketSummary[]> {
  const res = await fetch(`${apiRoot()}${SUPPORT_TICKETS_PREFIX}/my`, {
    credentials: 'include',
    headers: authHeaders(false),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(parseApiError(data, res.status));
  const body = data as ApiListResponse<Record<string, unknown>>;
  return Array.isArray(body.data) ? body.data.map(normalizeSummary) : [];
}

/** GET /users/support-tickets/admin-contacts */
export async function fetchSupportTicketAdminContacts(): Promise<SupportTicketAdminContact[]> {
  const res = await fetch(`${apiRoot()}${SUPPORT_TICKETS_PREFIX}/admin-contacts`, {
    credentials: 'include',
    headers: authHeaders(false),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(parseApiError(data, res.status));
  const body = data as ApiListResponse<SupportTicketAdminContact>;
  return Array.isArray(body.data) ? body.data : [];
}

/** GET /admins/support-tickets?status=open|closed — Mongo `support_tickets` collection. */
export async function fetchAdminSupportTickets(
  _accessToken?: string,
  status?: SupportTicketStatus,
): Promise<{ count: number; tickets: AdminSupportTicketListItem[] }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${apiRoot()}${ADMIN_SUPPORT_TICKETS_PREFIX}${qs}`, {
    credentials: 'include',
    headers: authHeaders(),
    cache: 'no-store',
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(parseApiError(data, res.status));
  const body = data as ApiListResponse<Record<string, unknown>>;
  const tickets = Array.isArray(body.data) ? body.data.map(normalizeAdminListItem) : [];
  return { count: typeof body.count === 'number' ? body.count : tickets.length, tickets };
}

/** GET /admins/support-tickets/:ticketNumber */
export async function fetchAdminSupportTicketDetail(
  ticketNumber: string,
): Promise<SupportTicketDetail> {
  const id = encodeTicketNumber(ticketNumber);
  const res = await fetch(`${apiRoot()}${ADMIN_SUPPORT_TICKETS_PREFIX}/${id}`, {
    credentials: 'include',
    headers: authHeaders(),
    cache: 'no-store',
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(parseApiError(data, res.status));
  const body = data as ApiDetailResponse<Record<string, unknown>>;
  return normalizeDetail(body.data ?? {});
}

/** PATCH /admins/support-tickets/:ticketNumber/resolve */
export async function resolveAdminSupportTicket(
  ticketNumber: string,
  payload: ResolveSupportTicketPayload,
): Promise<{ message: string; data: SupportTicketDetail }> {
  const id = encodeTicketNumber(ticketNumber);
  const res = await fetch(`${apiRoot()}${ADMIN_SUPPORT_TICKETS_PREFIX}/${id}/resolve`, {
    method: 'PATCH',
    credentials: 'include',
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(parseApiError(data, res.status));
  const body = data as ApiMutationResponse<Record<string, unknown>>;
  return {
    message: String(body.message ?? 'Ticket resolved'),
    data: normalizeDetail(body.data ?? {}),
  };
}

/** GET /users/support-tickets/:ticketNumber */
export async function trackSupportTicket(
  ticketNumber: string,
): Promise<SupportTicketDetail> {
  const id = encodeTicketNumber(ticketNumber);
  const res = await fetch(`${apiRoot()}${SUPPORT_TICKETS_PREFIX}/${id}`, {
    credentials: 'include',
    headers: authHeaders(false),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(parseApiError(data, res.status));
  const body = data as ApiDetailResponse<Record<string, unknown>>;
  return normalizeDetail(body.data ?? {});
}

/** PATCH /users/support-tickets/:ticketNumber/close */
export async function closeSupportTicket(
  ticketNumber: string,
  payload: CloseSupportTicketPayload,
): Promise<{ message: string; data: SupportTicketDetail }> {
  const id = encodeTicketNumber(ticketNumber);
  const res = await fetch(`${apiRoot()}${SUPPORT_TICKETS_PREFIX}/${id}/close`, {
    method: 'PATCH',
    credentials: 'include',
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(parseApiError(data, res.status));
  const body = data as ApiMutationResponse<Record<string, unknown>>;
  return {
    message: String(body.message ?? 'Ticket closed'),
    data: normalizeDetail(body.data ?? {}),
  };
}
