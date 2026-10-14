/**
 * Shared API config and helpers for FRIS backend.
 * Single source of truth for API base URL: set NEXT_PUBLIC_API_URL in .env (see .env.example).
 */

import { processFlightData, type FlightData } from '@/utils/dataProcessor';
import { dedupeDbRowsBySerialSta } from '@/utils/performanceFlightsFromDb';
import type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';
import { frisFetch } from './fris-auth-fetch';
import { mergePanelAccounts } from './merge-panel-accounts';

const fetch = frisFetch;

const DIRECT_API_DEFAULT = 'http://127.0.0.1:8080';

/**
 * NestJS API base URL (no trailing slash).
 * - Set `NEXT_PUBLIC_API_URL` in production.
 * - In **development**, the browser uses same-origin `/api-backend`; `next.config.ts` rewrites that
 *   to the real Nest server so `fetch` avoids `localhost` IPv6/CORS issues that cause "Failed to fetch".
 * - During SSR / non-browser, uses `127.0.0.1:8080` (override with `API_BACKEND_URL` in next.config env if needed).
 */
export function getApiBase(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      DIRECT_API_DEFAULT
    ).replace(/\/$/, '');
  }

  // Browser requests should use the same-origin proxy so httpOnly auth cookies
  // stay first-party and can be enforced by Next before render.
  return '/api-backend';
}

export type PanelUserPermissions = {
  accessTabs: string[];
  accessSubPages: Record<string, string[]>;
};

export type CreatePanelUserPayload = {
  userid: string;
  name: string;
  email: string;
  companyEmail?: string;
  password: string;
  role: string;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  phone?: string;
  residence?: string;
  state?: string;
  country?: string;
  pincode?: string;
  joiningDate?: string;
  department: string;
  subDepartment?: string;
  designation?: string;
  company?: string;
  station?: string;
  assignedStationIds?: string[];
  stationPermissions?: Record<string, PanelUserPermissions>;
  stationAppAccess?: Record<string, string[]>;
  stationAppPageAccess?: Record<string, Record<string, string[]>>;
  locations?: string;
  status?: string;
  permissions: PanelUserPermissions;
  /**
   * Admin-panel tabs this account may access (only meaningful for
   * admin/superadmin roles). Each entry is an `AdminPanelSection` key.
   * Absent = unrestricted (legacy); present = restricted to the listed sections.
   */
  adminPanelSections?: string[];
};

export type PanelAccountKind = 'user' | 'admin';

export type PanelUserListItem = {
  id: string;
  accountKind?: PanelAccountKind;
  userid: string;
  employeeId: string;
  /** Numeric admin ID (100001, …) for Users page creations. */
  admNumber?: string;
  name: string;
  email: string;
  companyEmail?: string;
  /** Admin-viewable flag only — plaintext passwords are never returned. */
  hasPassword?: boolean;
  /** @deprecated Never populated by API; kept for older UI branches. */
  loginPassword?: string;
  role: string;
  authorizationRole?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  phone?: string;
  residence?: string;
  state?: string;
  country?: string;
  pincode?: string;
  department: string;
  subDepartment?: string;
  designation: string;
  status: string;
  station?: string;
  assignedStationIds?: string[];
  stationPermissions?: Record<string, PanelUserPermissions>;
  stationAppAccess?: Record<string, string[]>;
  stationAppPageAccess?: Record<string, Record<string, string[]>>;
  company?: string;
  locations?: string;
  joiningDate?: string;
  trainingTitle?: string;
  trainings?: Array<{ id: string; title?: string }>;
  permissions?: PanelUserPermissions;
  adminPanelSections?: string[];
  /** Present on panel users when the account has recorded activity. */
  lastActivityAt?: string;
  createdAt?: string;
};

export type UpdatePanelUserPayload = Partial<
  Omit<CreatePanelUserPayload, 'userid' | 'password' | 'employeeId'>
> & {
  password?: string;
};

export type StationCredentialEmployee = {
  id: string;
  name: string;
  userid: string;
  employeeId: string;
  email?: string;
  joiningDate?: string;
  /** True when account has a login hash — plaintext is never returned. */
  hasPassword?: boolean;
  /** @deprecated Never populated by API. */
  loginPassword?: string;
  accessTabs?: string[];
};

export type StationCredentialsGroup = {
  stationId: string;
  stationCode: string;
  stationName: string;
  employeeCount: number;
  employees: StationCredentialEmployee[];
};

/** GET /users/panel/credentials-by-station — station-scoped login credentials. */
export async function fetchStationCredentials(): Promise<StationCredentialsGroup[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/users/panel/credentials-by-station`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/** POST /users/panel/:id/shoot-credentials — email User ID & password to the employee. */
export async function shootEmployeeCredentials(userId: string): Promise<{
  success: boolean;
  message: string;
  data?: { email?: string; credentialsEmailSent?: boolean };
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/users/panel/${encodeURIComponent(userId)}/shoot-credentials`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return {
    success: Boolean(data?.success),
    message:
      typeof data?.message === 'string'
        ? data.message
        : data?.success
          ? 'Credentials sent.'
          : 'Could not send credentials.',
    data: data?.data,
  };
}

/** GET /users — list employees from Mongo `users` collection. */
export async function fetchPanelUsers(
  _accessToken?: string,
): Promise<PanelUserListItem[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/users`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/** GET /users/panel/:id — single panel user including admin-viewable login password. */
export async function fetchPanelUserById(id: string): Promise<PanelUserListItem> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/users/panel/${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  if (!data?.data || typeof data.data !== 'object') {
    throw new Error('Invalid user response');
  }
  return data.data as PanelUserListItem;
}

/** GET /users/station/:stationId/staff — employees assigned to an admin station. */
export async function fetchPanelUsersByStation(
  stationId: string,
): Promise<PanelUserListItem[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/users/station/${encodeURIComponent(stationId)}/staff`,
    {
      method: 'GET',
      credentials: 'include',
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/** GET /admins/panel — list admin accounts for admin panel. */
export async function fetchPanelAdmins(): Promise<PanelUserListItem[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/admins/panel`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/** GET /users — merged panel accounts (users + admins). */
export async function fetchAllPanelAccounts(): Promise<PanelUserListItem[]> {
  const [users, admins] = await Promise.all([
    fetchPanelUsers(),
    fetchPanelAdmins().catch(() => [] as PanelUserListItem[]),
  ]);
  return mergePanelAccounts(users, admins);
}

/** PATCH /users/:id — update panel user profile, credentials, permissions. */
export async function updatePanelUser(
  id: string,
  payload: UpdatePanelUserPayload,
): Promise<{ success: boolean; message: string; data?: PanelUserListItem }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/users/panel/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(', ')
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as { success: boolean; message: string };
}

/** DELETE /users/panel/:id */
export async function deletePanelUser(
  id: string,
): Promise<{ success: boolean; message: string }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/users/panel/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as { success: boolean; message: string };
}

/** POST /users — admin panel employee + permissions → Mongo `users` collection. */
export async function createPanelUser(
  payload: CreatePanelUserPayload,
  _accessToken?: string,
): Promise<{ success: boolean; message: string }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(', ')
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as { success: boolean; message: string };
}

export type UpdateAdminAccountPayload = {
  name?: string;
  email?: string;
  companyEmail?: string;
  password?: string;
  role?: 'manager' | 'superadmin';
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  phone?: string;
  residence?: string;
  state?: string;
  country?: string;
  pincode?: string;
  joiningDate?: string;
  department?: string;
  subDepartment?: string;
  designation?: string;
  company?: string;
  station?: string;
  assignedStationIds?: string[];
  stationPermissions?: Record<string, PanelUserPermissions>;
  stationAppAccess?: Record<string, string[]>;
  stationAppPageAccess?: Record<string, Record<string, string[]>>;
  locations?: string;
  status?: string;
  permissions?: {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  };
  adminPanelSections?: string[];
};

/** GET /admins/panel/:id — single admin account for panel editing. */
export async function fetchPanelAdminById(
  id: string,
): Promise<PanelUserListItem> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/admins/panel/${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return (data?.data ?? data) as PanelUserListItem;
}

/** PATCH /admins/panel/:id — update admin account + FRIS permissions. */
export async function updateAdminAccount(
  id: string,
  payload: UpdateAdminAccountPayload,
): Promise<{ success: boolean; message: string }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/admins/panel/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(', ')
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as { success: boolean; message: string };
}

/** DELETE /admins/panel/:id */
export async function deletePanelAdmin(
  id: string,
): Promise<{ success: boolean; message: string }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/admins/panel/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as { success: boolean; message: string };
}

export {
  SUPPORT_TICKET_ISSUE_TYPES,
  SUPPORT_TICKET_URGENCY,
  closeSupportTicket as closeSupportTicketApi,
  resolveAdminSupportTicket as resolveAdminSupportTicketApi,
  type AdminSupportTicketListItem,
  type CloseSupportTicketPayload,
  type CreateSupportTicketPayload,
  type CreateSupportTicketResult,
  type ResolveSupportTicketPayload,
  type SupportTicketAdminContact,
  type SupportTicketAttachmentPayload,
  type SupportTicketAttachmentView,
  type SupportTicketDetail,
  type SupportTicketIssueType,
  type SupportTicketStatus,
  type SupportTicketSummary,
  type SupportTicketUrgency,
} from '@/lib/support-tickets-api';

import {
  closeSupportTicket as closeSupportTicketApi,
  resolveAdminSupportTicket as resolveAdminSupportTicketApi,
  fetchAdminSupportTickets as fetchAdminSupportTicketsApi,
} from '@/lib/support-tickets-api';

/** Back-compat: returns ticket rows only (see fetchAdminSupportTicketsApi for count). */
export async function fetchAdminSupportTickets(
  status?: import('@/lib/support-tickets-api').SupportTicketStatus,
) {
  const { tickets } = await fetchAdminSupportTicketsApi(status);
  return tickets;
}

/** Back-compat: close comment as second argument. */
export async function closeSupportTicket(
  ticketNumber: string,
  closeComment: string,
) {
  return closeSupportTicketApi(ticketNumber, { closeComment });
}

/** Back-compat: resolution note as second argument. */
export async function resolveAdminSupportTicket(
  ticketNumber: string,
  resolutionNote: string,
) {
  return resolveAdminSupportTicketApi(
    ticketNumber,
    { resolutionNote },
  );
}

/** One day row for Bird month-summary chart (Mongo `sta-ata-daily/month-net`). */
export type StaAtaDailyRowFromApi = {
  date: string;
  ataOnOrBeforeSta: number;
  ataAfterSta: number;
  netStaDeviationMinutes: number;
  flightsPairedInDeviation: number;
};

export type StaAtaMonthNetResponse = {
  year: number;
  month: number;
  monthKey: string;
  sources: { ramp3Pairs: number; mainTerminalPairs: number };
  daily: StaAtaDailyRowFromApi[];
};

/** Aggregates STA/ATA from rampDetails3, mainDetails+terminalDetails, ns_raw_flight_data. */
export async function fetchStaAtaMonthNetFromDb(
  year: number,
  month: number,
): Promise<StaAtaMonthNetResponse | null> {
  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}/sta-ata-daily/month-net?year=${encodeURIComponent(String(year))}&month=${encodeURIComponent(String(month))}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as StaAtaMonthNetResponse;
  } catch {
    return null;
  }
}

/** Local calendar date as YYYY-MM-DD (avoids UTC shift from toISOString). */
export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** GET /scheduled-airline-pipeline/daily-from-advance — scheduled rows from `fhr_collection` by date range. */
export async function fetchScheduledFlightsForDashboard(
  fromYmd: string,
  toYmd: string,
): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const toDdMmYyyy = (ymd: string): string => {
    const [y, m, d] = ymd.split('-');
    if (!y || !m || !d) return ymd;
    return `${d}/${m}/${y}`;
  };
  const fromDdMmYyyy = toDdMmYyyy(fromYmd);
  const toDdMmYyyyValue = toDdMmYyyy(toYmd);
  const url = `${base}/scheduled-airline-pipeline/daily-from-advance?from=${encodeURIComponent(fromDdMmYyyy)}&to=${encodeURIComponent(toDdMmYyyyValue)}`;
  const res = await frisFetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export type QualityReportScheduledAirlineRow = {
  code: string;
  airline: string;
  flights: number;
  cancels: number;
  additional: number;
  firstBagPct: number;
  lastBagPct: number;
  holdClosedPct: number;
  arrivalPax: number;
  departPax: number;
  arrivalCargo: number;
  departCargo: number;
  arrivalMail: number;
  departMail: number;
  arrivalBaggage: number;
  departBaggage: number;
  qualityScore: number;
};

/** GET /reports/quality-scheduled-table — per-airline scheduled quality table from `fhr_collection`. */
export async function fetchQualityReportScheduledTable(
  fromYmd: string,
  toYmd: string,
  airline?: string,
  opts?: { signal?: AbortSignal },
): Promise<QualityReportScheduledAirlineRow[]> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromYmd.trim(),
    tillDate: toYmd.trim(),
  });
  if (airline && airline.trim()) params.set('airline', airline.trim());
  const res = await frisFetch(
    `${base}/reports/quality-scheduled-table?${params.toString()}`,
    { signal: opts?.signal },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.slice(0, 200) || `Quality report scheduled table failed: ${res.status}`,
    );
  }
  const data = await res.json();
  return Array.isArray(data) ? (data as QualityReportScheduledAirlineRow[]) : [];
}

export type QualityReportNonScheduledAirlineRow = {
  operator: string;
  flights: number;
  cancelNoOp: number;
  arrivalPax: number;
  departPax: number;
  arrivalCargo: number;
  departCargo: number;
  arrivalMail: number;
  departMail: number;
  arrivalBaggage: number;
  departBaggage: number;
};

/** GET /reports/quality-non-scheduled-table — per-operator NS quality from `ns_fhr_collection`. */
export async function fetchQualityReportNonScheduledTable(
  fromYmd: string,
  toYmd: string,
  airline?: string,
  opts?: { signal?: AbortSignal },
): Promise<QualityReportNonScheduledAirlineRow[]> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromYmd.trim(),
    tillDate: toYmd.trim(),
  });
  if (airline && airline.trim()) params.set('airline', airline.trim());
  const res = await frisFetch(
    `${base}/reports/quality-non-scheduled-table?${params.toString()}`,
    { signal: opts?.signal },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.slice(0, 200) ||
        `Quality report non-scheduled table failed: ${res.status}`,
    );
  }
  const data = await res.json();
  return Array.isArray(data)
    ? (data as QualityReportNonScheduledAirlineRow[])
    : [];
}

export type QualityFbLbHoldUpdateResult = {
  updated: number;
  flights: number;
  firstBagOnTime: number;
  lastBagOnTime: number;
  holdClosedOnTime: number;
};

/** PATCH /reports/quality-update — recalculate FB / LB / Hold KPIs for STA window. */
export async function updateQualityReportFbLbHold(
  fromYmd: string,
  toYmd: string,
): Promise<QualityFbLbHoldUpdateResult> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/reports/quality-update`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromDate: fromYmd.trim(), tillDate: toYmd.trim() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.slice(0, 200) || `Quality FB/LB/Hold update failed: ${res.status}`,
    );
  }
  return (await res.json()) as QualityFbLbHoldUpdateResult;
}

/**
 * Scheduled Airlines header tiles: counts from `fhr_collection` (STA day in range; same rules as daily list).
 * GET /reports/dashboard-fhr-handled-stats — `fromDate` / `tillDate` as yyyy-MM-dd or dd/MM/yyyy (inclusive).
 */
export async function fetchDashboardHandledStats(
  fromDateYmd: string,
  tillDateYmd: string,
): Promise<{ handled: number; cancelled: number; total?: number }> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
  });
  const res = await fetch(
    `${base}/reports/dashboard-fhr-handled-stats?${params.toString()}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    handled?: number;
    cancelled?: number;
    total?: number;
  };
  return {
    handled: Number(data.handled ?? 0) || 0,
    cancelled: Number(data.cancelled ?? 0) || 0,
    total: data.total != null ? Number(data.total) : undefined,
  };
}

/** Scheduled Airlines active-flights panel — dashboard FHR STA window + cancel rules. */
export type DashboardScheduledAirlinesActiveStatsResponse = {
  from: string;
  to: string;
  total: number;
  handled: number;
  cancelled: number;
  passengerFlight: number;
  freighters: number;
  additionalP: number;
  additionalF: number;
  pending: number;
  baseFlight: number;
  unSignedReport: number;
  exportedNav: number;
  notExportedNav: number;
  notExportedEqptNav: number;
  cancelledFlightData: number;
  totalNonSkd: number;
  totalRaf: number;
};

export async function fetchDashboardScheduledAirlinesActiveStats(
  fromDateYmd: string,
  tillDateYmd: string,
): Promise<DashboardScheduledAirlinesActiveStatsResponse> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
  });
  const res = await fetch(
    `${base}/reports/dashboard-scheduled-airlines-active-stats?${params.toString()}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as DashboardScheduledAirlinesActiveStatsResponse;
  return {
    from: String(data.from ?? fromDateYmd),
    to: String(data.to ?? tillDateYmd),
    total: Number(data.total ?? 0) || 0,
    handled: Number(data.handled ?? 0) || 0,
    cancelled: Number(data.cancelled ?? 0) || 0,
    passengerFlight: Number(data.passengerFlight ?? 0) || 0,
    freighters: Number(data.freighters ?? 0) || 0,
    additionalP: Number(data.additionalP ?? 0) || 0,
    additionalF: Number(data.additionalF ?? 0) || 0,
    pending: Number(data.pending ?? 0) || 0,
    baseFlight: Number(data.baseFlight ?? 0) || 0,
    unSignedReport: Number(data.unSignedReport ?? 0) || 0,
    exportedNav: Number(data.exportedNav ?? 0) || 0,
    notExportedNav: Number(data.notExportedNav ?? 0) || 0,
    notExportedEqptNav: Number(data.notExportedEqptNav ?? 0) || 0,
    cancelledFlightData: Number(data.cancelledFlightData ?? 0) || 0,
    totalNonSkd: Number(data.totalNonSkd ?? 0) || 0,
    totalRaf: Number(data.totalRaf ?? 0) || 0,
  };
}

type DashboardCardReadPerf = {
  totalMs: number;
  mongoWallMs: number;
  rowCount: number;
  staWindowCacheHit: boolean;
  aggregateMs: number;
  summaryCacheHit?: boolean;
  summaryStale?: true;
};

export type DashboardEquipmentUtilPayload = {
  slots: {
    label: string;
    motorisedCount: number;
    motorisedPct: number;
    nonMotorisedCount: number;
    nonMotorisedPct: number;
    towableCount: number;
    towablePct: number;
    motorisedEquipment: { equipmentName: string; count: number }[];
    nonMotorisedEquipment: { equipmentName: string; count: number }[];
    towableEquipment: { equipmentName: string; count: number }[];
  }[];
  totalRow: {
    motorisedCount: number;
    motorisedPct: number;
    nonMotorisedCount: number;
    nonMotorisedPct: number;
    towableCount: number;
    towablePct: number;
  };
  categoryTotals: {
    motorisedCount: number;
    nonMotorisedCount: number;
    towableCount: number;
  };
  entryCount: number;
  unclassifiedCount: number;
};

/** GET /reports/dashboard-airline-remarks-card */
export type DashboardAirlineRemarksCardResponse = {
  from: string;
  to: string;
  airlineRatings: {
    from: string;
    to: string;
    total: number;
    blanks: number;
    buckets: { rating: string; count: number }[];
  };
  _perf?: DashboardCardReadPerf;
};

/** GET /reports/dashboard-aircraft-analysis-card */
export type DashboardAircraftAnalysisCardResponse = {
  from: string;
  to: string;
  aircraftCategory: {
    scheduled: Record<string, number>;
    additional: Record<string, number>;
  };
  _perf?: DashboardCardReadPerf;
};

/** GET /reports/dashboard-equipment-utilization-card */
export type DashboardEquipmentUtilizationCardResponse = {
  from: string;
  to: string;
  equipmentMode: '4h' | '6h';
  equipmentUtil: DashboardEquipmentUtilPayload;
  _perf?: DashboardCardReadPerf;
};

export type DashboardFlightScope = 'scheduled' | 'nonScheduled';

async function fetchDashboardCardGet<T>(
  path: string,
  params: URLSearchParams,
  logTag: string,
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<T> {
  if (opts?.flightScope === 'nonScheduled') {
    params.set('flightScope', 'nonScheduled');
  }
  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}/reports/${path}?${params.toString()}`;
  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const res = await frisFetch(url, { signal: opts?.signal });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as T;
  const clientMs =
    (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()) - t0;
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug(logTag, { clientMs: Math.round(clientMs), serverPerf: (data as { _perf?: unknown })._perf ?? null });
  }
  return data;
}

export async function fetchDashboardAirlineRemarksCard(
  fromDateYmd: string,
  tillDateYmd: string,
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<DashboardAirlineRemarksCardResponse> {
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
  });
  return fetchDashboardCardGet<DashboardAirlineRemarksCardResponse>(
    'dashboard-airline-remarks-card',
    params,
    '[dash_airline_remarks_card] client fetch',
    opts,
  );
}

export async function fetchDashboardAircraftAnalysisCard(
  fromDateYmd: string,
  tillDateYmd: string,
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<DashboardAircraftAnalysisCardResponse> {
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
  });
  return fetchDashboardCardGet<DashboardAircraftAnalysisCardResponse>(
    'dashboard-aircraft-analysis-card',
    params,
    '[dash_aircraft_analysis_card] client fetch',
    opts,
  );
}

/** GET /reports/dashboard-aircraft-analysis-flights */
export type AircraftAnalysisFlightRow = {
  serialNo: number | null;
  flightNo: string;
  staYmd: string;
  carrierType: 'scheduled' | 'additional';
  /** `SCH-*` bucket key, or `'OTHER'` when the category can't be resolved. */
  mixCategory: string;
  typeofHandling: string;
  cateOfFlight: string;
  typeCraftRaw: string;
  airline: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
};

export type DashboardAircraftAnalysisFlightsResponse = {
  range: { fromYmd: string; toYmd: string };
  flights: AircraftAnalysisFlightRow[];
};

export async function fetchDashboardAircraftAnalysisFlights(
  fromDateYmd: string,
  tillDateYmd: string,
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<DashboardAircraftAnalysisFlightsResponse> {
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
  });
  return fetchDashboardCardGet<DashboardAircraftAnalysisFlightsResponse>(
    'dashboard-aircraft-analysis-flights',
    params,
    '[dash_aircraft_analysis_flights] client fetch',
    opts,
  );
}

export async function fetchDashboardEquipmentUtilizationCard(
  fromDateYmd: string,
  tillDateYmd: string,
  equipmentMode: '4h' | '6h',
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<DashboardEquipmentUtilizationCardResponse> {
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
    equipmentMode,
  });
  return fetchDashboardCardGet<DashboardEquipmentUtilizationCardResponse>(
    'dashboard-equipment-utilization-card',
    params,
    `[dash_equipment_util_card] client fetch mode=${equipmentMode}`,
    opts,
  );
}

export type DashboardPerformanceReportCardResponse = {
  from: string;
  to: string;
  performanceReport: DashboardPerformanceReportSnapshot;
  _perf?: DashboardCardReadPerf;
};

export async function fetchDashboardPerformanceReportCard(
  fromDateYmd: string,
  tillDateYmd: string,
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<DashboardPerformanceReportCardResponse> {
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
  });
  return fetchDashboardCardGet<DashboardPerformanceReportCardResponse>(
    'dashboard-performance-report-card',
    params,
    '[dash_performance_report_card] client fetch',
    opts,
  );
}

/** GET /reports/dashboard-secondary-cards — legacy bundle (prefer per-card routes). */
export type DashboardSecondaryCardsResponse = {
  from: string;
  to: string;
  equipmentMode: '4h' | '6h';
  airlineRatings: {
    from: string;
    to: string;
    total: number;
    blanks: number;
    buckets: { rating: string; count: number }[];
  };
  aircraftCategory: {
    scheduled: Record<string, number>;
    additional: Record<string, number>;
  };
  equipmentUtil: DashboardEquipmentUtilPayload;
  _perf?: DashboardCardReadPerf;
};

export async function fetchDashboardSecondaryCards(
  fromDateYmd: string,
  tillDateYmd: string,
  equipmentMode: '4h' | '6h',
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<DashboardSecondaryCardsResponse> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
    equipmentMode,
  });
  if (opts?.flightScope === 'nonScheduled') {
    params.set('flightScope', 'nonScheduled');
  }
  const url = `${base}/reports/dashboard-secondary-cards?${params.toString()}`;
  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const res = await frisFetch(url, { signal: opts?.signal });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as DashboardSecondaryCardsResponse;
  const clientMs =
    (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()) - t0;
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[dash_secondary] client fetch', {
      from: fromDateYmd,
      to: tillDateYmd,
      equipmentMode,
      flightScope: opts?.flightScope ?? 'scheduled',
      clientMs: Math.round(clientMs),
      serverPerf: data._perf ?? null,
    });
  }
  return data;
}

export type DashboardPerformanceReportSnapshot = {
  onTimeCount: number;
  cancelledCount: number;
  offSkdCount: number;
  aCount: number;
  bCount: number;
  cCount: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  ghaImprovement: number;
  totalFlights: number;
};

export type DashboardGhaImprovementCard = {
  ghaOverviewCodes: { code: number; count: number }[];
  chartRows: { code: string; count: number }[];
  flightsWithAnyGhaCode: number;
  totalAttributedIncrements: number;
  flightsMissingDelayDescription: {
    flightNo: string;
    serial: string;
    codes: number[];
  }[];
};

export type DashboardOnTimePerformanceCard = {
  matrix: number[][];
  greenSum: number;
  matrixGrandTotal: number;
  greenOverTotalFlightsPct: number;
  totalNonCancelled: number;
};

export type DashboardKpiStripSnapshot = {
  totalFlights: number;
  cancelledFlights: number;
  didFlyFlights: number;
  scheduledFlights: number;
  additionalFlights: number;
};

/** Compact performance drill modal row (matches `buildPerformanceDrilldownFromLeanRows`). */
export type DashboardPerformanceDrillFlightRow = {
  serialNo: number | null;
  flightNo: string;
  sta: string;
  ata: string;
  std: string;
  atd: string;
  delay: string;
  isCancelled: boolean;
  isOnTime: boolean;
  partition: 'A' | 'B' | 'C' | null;
  ghaCategory: 'improved' | 'notImproved';
  /** Present on drill schema v2+; server-derived. */
  hasStationGhaDelayCode?: boolean;
  /** Present on drill schema v2+; aligns with performance report row d. */
  inPerformanceReportGhaImprovementRow?: boolean;
  airline: string;
  typeCraft: string;
  /** Minutes (ATD−ATA); omitted in older shards. */
  agtMinutes?: number | null;
  /** Minutes (STD−STA); omitted in older shards. */
  sgtMinutes?: number | null;
};

export type DashboardPerformanceDrilldownPartitionMeta = {
  row3bCond1Count: number;
  row3bCond2Count: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  row3cTotalCount: number;
};

export type DashboardPerformanceDrilldownPayload = {
  schemaVersion?: number;
  flights: DashboardPerformanceDrillFlightRow[];
  partitionMeta: DashboardPerformanceDrilldownPartitionMeta;
};

export type DashboardPrimaryCardsResponse = {
  from: string;
  to: string;
  equipmentMode: '4h' | '6h';
  kpiStrip: DashboardKpiStripSnapshot;
  performanceReport: DashboardPerformanceReportSnapshot;
  ghaImprovement: DashboardGhaImprovementCard;
  onTimePerformance: DashboardOnTimePerformanceCard;
  drilldowns?: {
    performanceReport?: DashboardPerformanceDrilldownPayload;
  };
  _perf?: {
    totalMs: number;
    mongoWallMs: number;
    rowCount: number;
    staWindowCacheHit: boolean;
    aggregateMs: number;
    summaryCacheHit: boolean;
    summaryStale?: true;
  };
};

/** GET /reports/dashboard-performance-drilldown — modal flight lists (large; lazy-loaded). */
export async function fetchDashboardPerformanceDrilldown(
  fromDateYmd: string,
  tillDateYmd: string,
  equipmentMode: '4h' | '6h',
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<{ performanceReport?: DashboardPerformanceDrilldownPayload }> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
    equipmentMode,
  });
  if (opts?.flightScope === 'nonScheduled') {
    params.set('flightScope', 'nonScheduled');
  }
  const url = `${base}/reports/dashboard-performance-drilldown?${params.toString()}`;
  const res = await frisFetch(url, { signal: opts?.signal });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as {
    performanceReport?: DashboardPerformanceDrilldownPayload;
  };
}

export type DashboardAirlineRemarksDrilldownResponse = {
  from: string;
  to: string;
  equipmentMode: '4h' | '6h';
  ratingsSummary: {
    from: string;
    to: string;
    total: number;
    blanks: number;
    buckets: { rating: string; count: number }[];
  };
  chartTopAirlinesByRating: Record<string, { airline: string; count: number }[]>;
  rows: Array<{
    serialNo: number;
    airline: string;
    flightNo: string;
    ataDate: string;
    ataTime: string;
    airlineRemarksRating: string;
    remarkPreview: string;
  }>;
  totalRows: number;
  drillPaging?: { skip: number; limit: number; total: number };
  _perf?: Record<string, unknown>;
};

/** GET /reports/dashboard-airline-remarks-drilldown — composed daily `dashboard_summaries.drilldowns`. */
export async function fetchDashboardAirlineRemarksDrilldown(
  fromDateYmd: string,
  tillDateYmd: string,
  equipmentMode: '4h' | '6h',
  opts?: {
    skip?: number;
    limit?: number;
    signal?: AbortSignal;
    flightScope?: DashboardFlightScope;
  },
): Promise<DashboardAirlineRemarksDrilldownResponse> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
    equipmentMode,
  });
  if (opts?.flightScope === 'nonScheduled') {
    params.set('flightScope', 'nonScheduled');
  }
  if (opts?.skip != null && opts.skip > 0) {
    params.set('skip', String(Math.floor(opts.skip)));
  }
  if (opts?.limit != null && opts.limit > 0) {
    params.set('limit', String(Math.floor(opts.limit)));
  }
  const url = `${base}/reports/dashboard-airline-remarks-drilldown?${params.toString()}`;
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as DashboardAirlineRemarksDrilldownResponse;
}

/** GET /reports/dashboard-primary-cards — performance report, GHA, OTP (precomputed). */
export async function fetchDashboardPrimaryCards(
  fromDateYmd: string,
  tillDateYmd: string,
  equipmentMode: '4h' | '6h',
  opts?: { signal?: AbortSignal; flightScope?: DashboardFlightScope },
): Promise<DashboardPrimaryCardsResponse> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
    equipmentMode,
  });
  if (opts?.flightScope === 'nonScheduled') {
    params.set('flightScope', 'nonScheduled');
  }
  const url = `${base}/reports/dashboard-primary-cards?${params.toString()}`;
  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as DashboardPrimaryCardsResponse;
  const clientMs =
    (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()) - t0;
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[dash_primary] client fetch', {
      from: fromDateYmd,
      to: tillDateYmd,
      equipmentMode,
      flightScope: opts?.flightScope ?? 'scheduled',
      clientMs: Math.round(clientMs),
      serverPerf: data._perf ?? null,
    });
  }
  return data;
}

/** GET /reports/dashboard-fhr-performance-report — KPI buckets from `fhr_collection` only. */
export type DashboardFhrPerformanceReportBucket = {
  count: number;
  percentage: string;
};

export type DashboardFhrPerformanceReport = {
  range: { fromYmd: string; toYmd: string };
  onTime: DashboardFhrPerformanceReportBucket;
  cancelled: DashboardFhrPerformanceReportBucket;
  offSkd: DashboardFhrPerformanceReportBucket;
  groundTimeSaved: DashboardFhrPerformanceReportBucket;
  departedBeforeStd: DashboardFhrPerformanceReportBucket;
  agtGtSgt: DashboardFhrPerformanceReportBucket;
  totalFlights: DashboardFhrPerformanceReportBucket;
};

export async function fetchDashboardFhrPerformanceReport(
  fromDateYmd: string,
  tillDateYmd: string,
): Promise<DashboardFhrPerformanceReport> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
  });
  const res = await fetch(
    `${base}/reports/dashboard-fhr-performance-report?${params.toString()}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as DashboardFhrPerformanceReport;
}

export type DashboardOnTimeStaAtaExactMatch = {
  flightSerialNumber: number;
  airlineName: string;
  flightNo: string;
  staIso: string;
  ataIso: string;
};

/**
 * Performance report on-time: mainDetails ATA equals terminal/ramp STA (date + time).
 * GET /reports/dashboard-on-time-sta-ata-exact-count — `fromDate` / `tillDate` as yyyy-MM-dd (inclusive).
 */
export async function fetchDashboardOnTimeStaAtaExactCount(
  fromDateYmd: string,
  tillDateYmd: string,
): Promise<{ count: number; matches: DashboardOnTimeStaAtaExactMatch[] }> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDateYmd.trim(),
    tillDate: tillDateYmd.trim(),
  });
  const res = await fetch(
    `${base}/reports/dashboard-on-time-sta-ata-exact-count?${params.toString()}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    count?: number;
    matches?: DashboardOnTimeStaAtaExactMatch[];
  };
  return {
    count: Number(data.count ?? 0) || 0,
    matches: Array.isArray(data.matches) ? data.matches : [],
  };
}

/** Non-scheduled list API removed — returns empty (page uses static demo data). */
export async function fetchNonScheduledFlightsForDashboard(
  fromYmd: string,
  toYmd: string,
): Promise<unknown[]> {
  void fromYmd;
  void toYmd;
  return [];
}

/**
 * Scheduled + non-scheduled Mongo rows for the inclusive STA date range (dashboard performance report).
 */
export async function fetchFlightsFromDb(params: {
  startDate: string;
  endDate: string;
}): Promise<unknown[]> {
  const { startDate, endDate } = params;
  const [scheduled, nonScheduled] = await Promise.all([
    fetchScheduledFlightsForDashboard(startDate, endDate).catch(() => [] as unknown[]),
    fetchNonScheduledFlightsForDashboard(startDate, endDate).catch(() => [] as unknown[]),
  ]);
  return dedupeDbRowsBySerialSta([...scheduled, ...nonScheduled]);
}

export type PerformanceFlightLegPayload = {
  sta: string;
  ata: string;
  std: string;
  atd: string;
};

/** POST /performance-flights — upsert Bird-style `performanceFlights` legs in `performance_flights_snapshots`. */
export async function savePerformanceFlightsSnapshot(body: {
  reportKey: string;
  title?: string;
  flights: PerformanceFlightLegPayload[];
}): Promise<{ success: true; reportKey: string; legCount: number; updatedAt: string }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/performance-flights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : String(j.message);
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{
    success: true;
    reportKey: string;
    legCount: number;
    updatedAt: string;
  }>;
}

/** GET /performance-flights — list saved snapshots (metadata only). */
export async function fetchPerformanceFlightsSummaries(): Promise<
  { reportKey: string; title: string; legCount: number; updatedAt: string }[]
> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/performance-flights`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** GET /performance-flights/:reportKey — full snapshot including `flights[]`. */
export async function fetchPerformanceFlightsSnapshot(
  reportKey: string,
): Promise<{
  reportKey: string;
  title: string;
  flights: PerformanceFlightLegPayload[];
  createdAt?: string;
  updatedAt?: string;
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/performance-flights/${encodeURIComponent(reportKey)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<{
    reportKey: string;
    title: string;
    flights: PerformanceFlightLegPayload[];
    createdAt?: string;
    updatedAt?: string;
  }>;
}

/** GET schedule fields from `raw_flight_data` by Sl. No. (Advance Schedule Setup). */
export function getRawFlightScheduleBySerialUrl(serialNo: string | number): string {
  const base = getApiBase().replace(/\/$/, '');
  return `${base}/raw-flight-data/by-serial/${encodeURIComponent(String(serialNo))}`;
}

/** Flight sidebar forms (scheduled + non-scheduled) persist under this Nest prefix. */
const NS_RAW_BASE = 'ns-raw-flight-data';

/**
 * Insert one flight row into MongoDB `raw_flight_data` (stored as `{ data: payload }`).
 * POST /raw-flight-data
 */
export async function createRawFlightDataRow(
  payload: Record<string, unknown>
): Promise<{ success?: boolean; insertedCount?: number }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/raw-flight-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json();
}

export type NavisionExportErrorRow = {
  serialNo: string;
  airline: string;
  flightNo: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  errorMessage: string;
  errorDate: string;
  exportedStatus: string;
};

/** GET /raw-flight-data/navision-export-errors — export error rows by serial or date range. */
export async function fetchNavisionExportErrors(params: {
  serialNo?: string;
  fromDate?: string;
  tillDate?: string;
}): Promise<NavisionExportErrorRow[]> {
  const base = getApiBase().replace(/\/$/, '');
  const q = new URLSearchParams();
  if (params.serialNo?.trim()) q.set('serialNo', params.serialNo.trim());
  if (params.fromDate?.trim()) q.set('fromDate', params.fromDate.trim());
  if (params.tillDate?.trim()) q.set('tillDate', params.tillDate.trim());
  const res = await fetch(
    `${base}/raw-flight-data/navision-export-errors?${q.toString()}`,
    { cache: 'no-store', credentials: 'include' },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data as NavisionExportErrorRow[]) : [];
}

/** PATCH /raw-flight-data/navision-export/:serialNo — set Navision export Y/N on flight or equipment. */
export async function setNavisionDataExportStatus(
  serialNo: string,
  body: {
    status: 'Y' | 'N';
    recordType?: 'flight' | 'equipment';
    flightType?: 'scheduled' | 'non-scheduled' | '';
  },
): Promise<{ ok: boolean; serialNo: string; status: 'Y' | 'N'; recordType: string }> {
  const base = getApiBase().replace(/\/$/, '');
  const serial = String(serialNo ?? '').trim();
  const res = await fetch(
    `${base}/raw-flight-data/navision-export/${encodeURIComponent(serial)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = text?.slice(0, 200) || `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      /* use text */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{
    ok: boolean;
    serialNo: string;
    status: 'Y' | 'N';
    recordType: string;
  }>;
}

/**
 * Generate today's scheduled rows from schedule master:
 * POST /raw-flight-data/generate-daily-schedule
 * Optional date supports dd/MM/yyyy or yyyy-MM-dd.
 */
export async function generateDailyScheduledRows(
  date?: string,
): Promise<{
  success?: boolean;
  scheduleDate?: string;
  inserted?: number;
  skippedOutOfRange?: number;
  skippedDayOff?: number;
  skippedDuplicate?: number;
  scannedMasters?: number;
}> {
  const base = getApiBase().replace(/\/$/, '');
  const path = `${base}/raw-flight-data/generate-daily-schedule`;
  const qs = new URLSearchParams();
  if (date?.trim()) qs.set('date', date.trim());
  const href = qs.toString() ? `${path}?${qs}` : path;
  const res = await fetch(href, { method: 'POST' });
  if (!res.ok) {
    await pipelineError(res, 'Daily schedule generation failed');
  }
  return res.json();
}

const pipelineError = async (res: Response, fallback: string): Promise<never> => {
  const text = await res.text();
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = JSON.parse(text) as { message?: string | string[] };
    if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
  } catch {
    if (text) msg = text.slice(0, 200);
  }
  throw new Error(msg || fallback);
};

/**
 * Advance → Schedule Setup: saves to `advance_schedule_setup` and merges into `raw_flight_data`.
 * POST /scheduled-airline-pipeline/advance-schedule
 */
export async function saveAdvanceScheduleSetup(
  payload: Record<string, unknown>,
): Promise<{
  success?: boolean;
  serialNo?: string;
  mergedFrom?: string[];
  fhrStaDatesCount?: number;
  message?: string;
  season?: 'Summer' | 'Winter';
  seasonKey?: string;
  scheduleAction?: 'created' | 'updated';
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/scheduled-airline-pipeline/advance-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  if (!res.ok) {
    await pipelineError(res, 'Advance schedule save failed');
  }
  return res.json();
}

/**
 * Creation → Scheduled Airlines: saves to `scheduled_airlines_creation` and merges into `raw_flight_data`.
 * POST /scheduled-airline-pipeline/creation
 */
export async function saveScheduledAirlinesCreation(
  body: Record<string, unknown>,
): Promise<{
  success?: boolean;
  serialNo?: string;
  operationalSerial?: string;
  scheduleMasterSerial?: string;
  operationDate?: string;
  mergedFrom?: string[];
  message?: string;
  fhrStaDatesCount?: number;
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/scheduled-airline-pipeline/creation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    await pipelineError(res, 'Scheduled airlines creation save failed');
  }
  return res.json();
}

export type CreationRafRecord = {
  _id?: string;
  serialNo?: string;
  airlines?: string;
  flightNo?: string;
  acType?: string;
  aBody?: string;
  airlineCode?: string;
  routing?: string;
  staTime?: string;
  stdTime?: string;
  date?: string;
  date2?: string;
  operationDate?: string;
  scheduleId?: string;
  opsType?: string;
  skdNonSkd?: string;
  categoryOfFlight?: string;
  flightType?: string;
  isRafFlight?: boolean;
  scheduleSource?: string;
  stationCode?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Creation → RAF: saves one row to `creation-raf`.
 * POST /scheduled-airline-pipeline/creation-raf
 */
export async function saveCreationRaf(
  body: Record<string, unknown>,
): Promise<{
  success?: boolean;
  id?: string;
  serialNo?: string;
  record?: CreationRafRecord;
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/scheduled-airline-pipeline/creation-raf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    await pipelineError(res, 'RAF creation save failed');
  }
  return res.json();
}

/**
 * Creation → RAF: list rows for a date (dd/MM/yyyy).
 * GET /scheduled-airline-pipeline/creation-raf?date=
 */
export async function fetchCreationRafByDate(
  dateDdMmYyyy: string,
): Promise<{ success?: boolean; date?: string; rows?: CreationRafRecord[] }> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams({ date: dateDdMmYyyy.trim() });
  const res = await frisFetch(`${base}/scheduled-airline-pipeline/creation-raf?${qs}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    await pipelineError(res, 'Failed to load RAF flights');
  }
  return res.json();
}

export async function fetchCreationRafByDateRange(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
  serialNo?: string,
): Promise<{
  success?: boolean;
  fromDate?: string;
  toDate?: string;
  rows?: CreationRafRecord[];
}> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams({
    fromDate: fromDdMmYyyy.trim(),
    toDate: toDdMmYyyy.trim(),
  });
  const serial = String(serialNo ?? '').trim();
  if (serial) qs.set('serialNo', serial);
  const res = await frisFetch(`${base}/scheduled-airline-pipeline/creation-raf?${qs}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    await pipelineError(res, 'Failed to load RAF flights');
  }
  return res.json();
}

export type CreationAdditionalFlightRecord = {
  _id?: string;
  serialNo?: string;
  airlines?: string;
  flightNo?: string;
  acType?: string;
  aBody?: string;
  airlineCode?: string;
  routing?: string;
  staTime?: string;
  stdTime?: string;
  date?: string;
  date2?: string;
  operationDate?: string;
  scheduleId?: string;
  opsType?: string;
  skdNonSkd?: string;
  categoryOfFlight?: string;
  freighter?: string;
  flightType?: string;
  isAdditionalFlight?: boolean;
  createdBy?: string;
  modifiedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Creation → Additional Flights: one-time flight for a specific date.
 * Appears on Schedule Airlines; does not mutate Schedule Setup.
 * POST /scheduled-airline-pipeline/creation-additional-flights
 */
export async function saveCreationAdditionalFlight(
  body: Record<string, unknown>,
): Promise<{
  success?: boolean;
  id?: string;
  serialNo?: string;
  scheduleId?: string;
  operationDate?: string;
  scheduleSource?: string;
  message?: string;
  record?: CreationAdditionalFlightRecord;
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/scheduled-airline-pipeline/creation-additional-flights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    await pipelineError(res, 'Additional flight save failed');
  }
  return res.json();
}

/**
 * Creation → Additional Flights: bulk CSV import into `creation-additional-flights`.
 * POST /scheduled-airline-pipeline/creation-additional-flights/bulk
 */
export async function bulkSaveCreationAdditionalFlights(
  rows: Record<string, unknown>[],
): Promise<{
  success?: boolean;
  savedCount?: number;
  errorCount?: number;
  records?: CreationAdditionalFlightRecord[];
  errors?: { index: number; message: string }[];
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/scheduled-airline-pipeline/creation-additional-flights/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
    credentials: 'include',
  });
  if (!res.ok) {
    await pipelineError(res, 'Additional flights CSV import failed');
  }
  return res.json();
}

/**
 * Creation → Additional Flights: list rows for a date (dd/MM/yyyy).
 * GET /scheduled-airline-pipeline/creation-additional-flights?date=
 */
export async function fetchCreationAdditionalFlightsByDate(
  dateDdMmYyyy: string,
): Promise<{ success?: boolean; date?: string; rows?: CreationAdditionalFlightRecord[] }> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams({ date: dateDdMmYyyy.trim() });
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/creation-additional-flights?${qs}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    await pipelineError(res, 'Failed to load additional flights');
  }
  return res.json();
}

export async function fetchCreationAdditionalFlightsByDateRange(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
): Promise<{
  success?: boolean;
  fromDate?: string;
  toDate?: string;
  rows?: CreationAdditionalFlightRecord[];
}> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams({
    fromDate: fromDdMmYyyy.trim(),
    toDate: toDdMmYyyy.trim(),
  });
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/creation-additional-flights?${qs}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    await pipelineError(res, 'Failed to load additional flights');
  }
  return res.json();
}

export type FlightExcelImportError = {
  row: number;
  column: string;
  value?: unknown;
  message: string;
};

export type FlightExcelImportResult = {
  success?: boolean;
  message?: string;
  fileName?: string;
  importId?: string;
  totalRows?: number;
  validRows?: number;
  importedRows?: number;
  failedRows?: number;
  errors?: FlightExcelImportError[];
  missingHeaders?: string[];
  duplicateHeaders?: string[];
  errorFileUrl?: string;
  processingTimeMs?: number;
};

function parseNestImportErrorBody(data: unknown): FlightExcelImportResult {
  if (!data || typeof data !== 'object') {
    return { success: false, message: 'Import failed' };
  }

  const root = data as Record<string, unknown>;
  const nested =
    root.message && typeof root.message === 'object' && !Array.isArray(root.message)
      ? (root.message as Record<string, unknown>)
      : root;

  const message =
    typeof nested.message === 'string'
      ? nested.message
      : typeof root.message === 'string'
        ? root.message
        : 'Import failed';

  return {
    success: nested.success === true || root.success === true,
    message,
    fileName: typeof nested.fileName === 'string' ? nested.fileName : undefined,
    importId: typeof nested.importId === 'string' ? nested.importId : undefined,
    totalRows: typeof nested.totalRows === 'number' ? nested.totalRows : undefined,
    validRows: typeof nested.validRows === 'number' ? nested.validRows : undefined,
    importedRows:
      typeof nested.importedRows === 'number' ? nested.importedRows : undefined,
    failedRows: typeof nested.failedRows === 'number' ? nested.failedRows : undefined,
    errors: Array.isArray(nested.errors)
      ? (nested.errors as FlightExcelImportError[])
      : Array.isArray(root.errors)
        ? (root.errors as FlightExcelImportError[])
        : [],
    missingHeaders: Array.isArray(nested.missingHeaders)
      ? (nested.missingHeaders as string[])
      : Array.isArray(root.missingHeaders)
        ? (root.missingHeaders as string[])
        : undefined,
    duplicateHeaders: Array.isArray(nested.duplicateHeaders)
      ? (nested.duplicateHeaders as string[])
      : Array.isArray(root.duplicateHeaders)
        ? (root.duplicateHeaders as string[])
        : undefined,
    errorFileUrl:
      typeof nested.errorFileUrl === 'string' ? nested.errorFileUrl : undefined,
    processingTimeMs:
      typeof nested.processingTimeMs === 'number' ? nested.processingTimeMs : undefined,
  };
}

/** Resolve a server-relative import error file path to a downloadable URL. */
export function resolveImportErrorFileUrl(path: string): string {
  const base = getApiBase().replace(/\/$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Creation → Additional Flights: validated Excel import.
 * POST /import/flights/excel
 */
export async function importCreationAdditionalFlightsExcel(
  file: File,
): Promise<FlightExcelImportResult> {
  const base = getApiBase().replace(/\/$/, '');
  const form = new FormData();
  form.append('file', file);
  const res = await frisFetch(`${base}/import/flights/excel`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });

  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    return parseNestImportErrorBody(data);
  }

  return parseNestImportErrorBody(data);
}

/**
 * Download Excel import template for Additional Flights.
 * GET /import/flights/template
 */
export async function downloadCreationAdditionalFlightsExcelTemplate(): Promise<Blob> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/import/flights/template`, {
    credentials: 'include',
  });
  if (!res.ok) {
    await pipelineError(res, 'Failed to download Excel template');
  }
  return res.blob();
}

/**
 * Resolve Sl. No. from advance schedule for the given airline + flight number.
 * GET /scheduled-airline-pipeline/find-advance
 */
export type FindAdvanceScheduleResult = {
  serialNo: string;
  schedule?: Record<string, unknown>;
  flightStatus?: string;
  editable?: boolean;
  operationalSerial?: string;
  scheduleMasterSerial?: string;
  operationDate?: string;
  scheduleSource?: string;
  lastModified?: string;
  modifiedBy?: string;
  openFlights?: Array<{
    serialNo: string;
    operationalSerial?: string;
    scheduleMasterSerial?: string;
    schedule?: Record<string, unknown>;
    flightStatus?: string;
  }>;
};

export type FindScheduledFlightBySerialResult = {
  serialNo: string;
  searchedSerial: string;
  operationalSerial: string;
  scheduleMasterSerial?: string;
  operationDate?: string;
  flightStatus: string;
  editable: boolean;
  schedule: Record<string, unknown>;
  scheduleSource?: string;
  lastModified?: string;
  modifiedBy?: string;
};

/**
 * Creation → Scheduled Airlines: lookup by serial (instance, FHR, or schedule master).
 * GET /scheduled-airline-pipeline/find-by-serial/:serialNo
 */
export async function findScheduledFlightBySerial(
  serialNo: string,
): Promise<FindScheduledFlightBySerialResult | null> {
  const trimmed = String(serialNo ?? '').trim();
  if (!trimmed) return null;
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/find-by-serial/${encodeURIComponent(trimmed)}`,
    { credentials: 'include' },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    let message = `Find by serial failed: ${res.status}`;
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string | string[] };
        if (parsed?.message) {
          message = Array.isArray(parsed.message)
            ? parsed.message.join(', ')
            : parsed.message;
        } else {
          message = text;
        }
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as FindScheduledFlightBySerialResult;
  } catch {
    return null;
  }
}

export async function findAdvanceScheduleByFlight(
  airline: string,
  flightNo: string,
  options?: { openOnly?: boolean; date?: string; airlineCode?: string },
): Promise<FindAdvanceScheduleResult | null> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    airline: airline.trim(),
    flightNo: flightNo.trim(),
  });
  if (options?.openOnly) {
    params.set('openOnly', 'true');
  }
  if (options?.date?.trim()) {
    params.set('date', options.date.trim());
  }
  if (options?.airlineCode?.trim()) {
    params.set('airlineCode', options.airlineCode.trim());
  }
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/find-advance?${params.toString()}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    let message = `Find advance failed: ${res.status}`;
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string | string[] };
        if (parsed?.message) {
          message = Array.isArray(parsed.message)
            ? parsed.message.join(', ')
            : parsed.message;
        } else {
          message = text;
        }
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
  const text = await res.text();
  if (!text.trim()) return null;
  let data: FindAdvanceScheduleResult | null = null;
  try {
    data = JSON.parse(text) as FindAdvanceScheduleResult | null;
  } catch {
    return null;
  }
  return data;
}

/**
 * Prevent duplicate concurrent GETs for the same Scheduled Airlines daily window (StrictMode / rapid focus changes).
 */
const inflightDailyScheduledFromAdvance = new Map<string, Promise<unknown[]>>();

export type FetchDailyScheduledFromAdvanceOptions = {
  signal?: AbortSignal;
  /** Bypass the Nest list cache. Only after a save the server did not already drop. */
  bustCache?: boolean;
};

function parseDailyScheduledFromAdvancePayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const nested = (raw as { data?: unknown }).data;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

/**
 * Scheduled Airlines table: FHR-backed daily rows for the STA window.
 * GET /scheduled-airline-pipeline/daily-from-advance?from=dd/MM/yyyy&to=dd/MM/yyyy
 *
 * Always uses {@link frisFetch} (httpOnly cookie auth via `/api-backend` in the browser).
 */
export async function fetchDailyScheduledFromAdvance(
  from?: string,
  to?: string,
  opts?: FetchDailyScheduledFromAdvanceOptions,
): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (from?.trim()) params.set('from', from.trim());
  if (to?.trim()) params.set('to', to.trim());
  const bustCache = opts?.bustCache === true;
  if (bustCache) params.set('nocache', '1');
  const qs = params.toString();
  const dedupeKey = `${qs}|bust=${bustCache}`;

  const existing = inflightDailyScheduledFromAdvance.get(dedupeKey);
  if (existing) return existing;

  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}/scheduled-airline-pipeline/daily-from-advance${qs ? `?${qs}` : ''}`;

  const p = (async (): Promise<unknown[]> => {
    const res = await frisFetch(url, {
      signal: opts?.signal,
      cache: 'no-store',
      credentials: 'include',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Daily advance fetch failed: ${res.status}`);
    }
    const text = await res.text();
    if (!text.trim()) return [];
    try {
      return parseDailyScheduledFromAdvancePayload(JSON.parse(text) as unknown);
    } catch {
      return [];
    }
  })();

  inflightDailyScheduledFromAdvance.set(dedupeKey, p);
  try {
    return await p;
  } finally {
    inflightDailyScheduledFromAdvance.delete(dedupeKey);
  }
}

/**
 * List saved master rows from `advance_schedule_setup`.
 * GET /scheduled-airline-pipeline/advance-schedule-setup
 */
export async function fetchAdvanceScheduleSetupMasters(): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/scheduled-airline-pipeline/advance-schedule-setup`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Advance schedule setup list failed: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Stretch Valid To on this station's Schedule Setup masters (no new FHR days). */
export async function extendAdvanceScheduleValidity(validTo: string): Promise<{
  success?: boolean;
  validTo?: string;
  scanned?: number;
  updated?: number;
  skipped?: number;
  rawUpdated?: number;
}> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/advance-schedule-setup/extend-validity`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validTo }),
      credentials: 'include',
    },
  );
  if (!res.ok) {
    await pipelineError(res, 'Extend schedule validity failed');
  }
  return res.json();
}

/** Re-check current session password before a destructive action. */
export async function confirmFrisPassword(password: string): Promise<void> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(`${base}/auth/confirm-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Password confirmation failed: ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
}

/** DELETE one master row from `advance_schedule_setup`. */
export async function deleteAdvanceScheduleSetupMaster(id: string): Promise<void> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/advance-schedule-setup/${encodeURIComponent(id)}`,
    { method: 'DELETE', credentials: 'include' },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = `Delete failed: ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
}

/** Airline row from schedule-setup masters (`advance_schedule_setup`), for report filters. */
export type AdvanceScheduleSetupAirlineOption = {
  id: string;
  name: string;
  code: string;
};

/**
 * Distinct airline names (and optional code) from saved Schedule Setup rows (`advance_schedule_setup`).
 * GET /scheduled-airline-pipeline/advance-schedule-setup/airlines
 */
export async function fetchAdvanceScheduleSetupAirlines(): Promise<
  AdvanceScheduleSetupAirlineOption[]
> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/scheduled-airline-pipeline/advance-schedule-setup/airlines`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Advance schedule setup airlines failed: ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  const out: AdvanceScheduleSetupAirlineOption[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id ?? '').trim();
    const name = String(o.name ?? '').trim();
    const code = String(o.code ?? '').trim();
    if (!id && !name && !code) continue;
    out.push({
      id: id || name || code,
      name: name || id,
      code,
    });
  }
  return out;
}

/** Row from GET /flights/cancellations (date-scoped cancellations). */
export interface FlightCancellationRecord {
  _id: string;
  instanceSerial: string;
  cancelledDate: string;
  reason: string;
  airlineName: string;
  flightNo: string;
  route: string;
  source: string;
  destination: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  aircraft: string;
  /** Stored when cancel is recorded in FRIS (`flight_cancellations`). */
  intimationMode?: string;
  intimatedBy?: string;
  intimationPersonEmail?: string;
  intimationMedia?: string;
  intimationTime?: string;
  cancelledByUserId?: string;
  /** True when a proof file was uploaded and stored for this cancellation. */
  hasAttachment?: boolean;
  attachmentFileName?: string;
  attachmentMimeType?: string;
  /** `scheduled` (default) or `non-scheduled`. */
  flightKind?: string;
  /** Owning station for the cancellation record (empty for legacy rows). */
  stationCode?: string;
  createdAt?: string;
  /** Set when the row comes from `fhr_collection` (not `flight_cancellations`). */
  dataSource?: 'fhr_collection';
  /** ISO instant of last FHR document touch (server; optional). */
  fhrRecordUpdatedAtIso?: string;
}

export interface FlightCancellationStatus {
  flightId: string;
  isCancelled: boolean;
}

/**
 * GET /flights/cancellations?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns `flight_cancellations` rows whose cancellation date (`cancelledDate`) falls in range.
 */
export async function fetchFlightCancellations(params: {
  from: string;
  to: string;
}): Promise<FlightCancellationRecord[]> {
  const base = getApiBase().replace(/\/$/, '');
  const sp = new URLSearchParams();
  sp.set('from', params.from.trim());
  sp.set('to', params.to.trim());
  const qs = sp.toString();
  const url = `${base}/flights/cancellations?${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Cancellations fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as FlightCancellationRecord[]) : [];
}

/**
 * GET /reports/dashboard-fhr-cancelled-flights — cancelled flights from `fhr_collection`
 * (STA operating day in range; cancel = embed flags + CANC flight number).
 */
export async function fetchFhrCancelledFlights(params: {
  from: string;
  to: string;
}): Promise<FlightCancellationRecord[]> {
  const base = getApiBase().replace(/\/$/, '');
  const sp = new URLSearchParams();
  sp.set('fromDate', params.from.trim());
  sp.set('tillDate', params.to.trim());
  const res = await fetch(`${base}/reports/dashboard-fhr-cancelled-flights?${sp.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.slice(0, 200) || `FHR cancellations fetch failed: ${res.status}`,
    );
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as FlightCancellationRecord[]) : [];
}

/** GET /flights/cancellations/all — all rows from `flight_cancellations`. */
export async function fetchAllFlightCancellations(): Promise<FlightCancellationRecord[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/flights/cancellations/all`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `All cancellations fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as FlightCancellationRecord[]) : [];
}

/** POST /flights/cancellations/send-email-by-details — same template as id-based send, for FHR-only rows. */
export async function sendCancellationInfoEmailByDetails(
  payload: {
    instanceSerial: string;
    cancelledDate: string;
    flightNo?: string;
    airlineName?: string;
    staDate?: string;
    staTime?: string;
    stdDate?: string;
    stdTime?: string;
    route?: string;
    reason?: string;
    intimationMode?: string;
    intimatedBy?: string;
    intimationPersonEmail?: string;
    intimationMedia?: string;
    intimationTime?: string;
  },
  emails: string[],
): Promise<{ sent: true; toEmails: string[] }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/flights/cancellations/send-email-by-details`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instanceSerial: payload.instanceSerial.trim(),
      cancelledDate: payload.cancelledDate.trim(),
      flightNo: payload.flightNo?.trim() || undefined,
      airlineName: payload.airlineName?.trim() || undefined,
      staDate: payload.staDate?.trim() || undefined,
      staTime: payload.staTime?.trim() || undefined,
      stdDate: payload.stdDate?.trim() || undefined,
      stdTime: payload.stdTime?.trim() || undefined,
      route: payload.route?.trim() || undefined,
      reason: payload.reason?.trim() || undefined,
      intimationMode: payload.intimationMode?.trim() || undefined,
      intimatedBy: payload.intimatedBy?.trim() || undefined,
      intimationPersonEmail: payload.intimationPersonEmail?.trim() || undefined,
      intimationMedia: payload.intimationMedia?.trim() || undefined,
      intimationTime: payload.intimationTime?.trim() || undefined,
      emails,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Send email failed: ${res.status}`);
  }
  return res.json() as Promise<{ sent: true; toEmails: string[] }>;
}

/** POST /flights/cancellations/:id/send-email */
export async function sendCancellationInfoEmail(
  cancellationId: string,
  emails: string[],
): Promise<{ sent: true; toEmails: string[] }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/flights/cancellations/${encodeURIComponent(String(cancellationId ?? '').trim())}/send-email`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Send email failed: ${res.status}`);
  }
  return res.json() as Promise<{ sent: true; toEmails: string[] }>;
}

function parseContentDispositionFileName(header: string): string {
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* ignore */
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const bare = /filename\s*=\s*([^;]+)/i.exec(header);
  return (bare?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
}

/**
 * GET /flights/cancellations/:id/attachment — station-scoped proof file.
 */
export async function fetchCancellationAttachment(
  cancellationId: string,
): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  const id = String(cancellationId ?? '').trim();
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    throw new Error('This cancellation has no stored attachment.');
  }
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/flights/cancellations/${encodeURIComponent(id)}/attachment`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Attachment fetch failed: ${res.status}`);
  }
  const mimeType =
    (res.headers.get('content-type') ?? 'application/octet-stream')
      .split(';')[0]
      .trim() || 'application/octet-stream';
  const fileName =
    parseContentDispositionFileName(res.headers.get('content-disposition') ?? '') ||
    'attachment';
  const blob = await res.blob();
  return { blob, fileName, mimeType };
}

/**
 * GET /flights/cancel/status/:flightId
 * True when this serial exists in `flight_cancellations`.
 */
export async function fetchFlightCancellationStatus(
  flightId: string,
  kind?: 'scheduled' | 'non-scheduled',
): Promise<FlightCancellationStatus> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const res = await fetch(
    `${base}/flights/cancel/status/${encodeURIComponent(String(flightId ?? '').trim())}${qs}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Cancellation status fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as Partial<FlightCancellationStatus> | null;
  return {
    flightId: String(data?.flightId ?? '').trim(),
    isCancelled: Boolean(data?.isCancelled),
  };
}

/**
 * POST /flights/cancel — insert date-scoped cancellation (does not mutate schedule masters).
 */
export async function postDateScopedFlightCancel(body: {
  flightId: string;
  date: string;
  reason?: string;
  airlineName?: string;
  flightNo?: string;
  route?: string;
  source?: string;
  destination?: string;
  staDate?: string;
  staTime?: string;
  stdDate?: string;
  stdTime?: string;
  aircraft?: string;
  intimationMode?: string;
  intimatedBy?: string;
  intimationPersonEmail?: string;
  intimationMedia?: string;
  intimationTime?: string;
  cancelledByUserId?: string;
}): Promise<FlightCancellationRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/flights/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json() as Promise<FlightCancellationRecord>;
}

/**
 * DELETE /flights/cancel — reopen (remove cancellation mapping for that instance + date).
 */
export async function deleteDateScopedFlightCancel(
  flightId: string,
  date: string,
): Promise<{ deleted: boolean }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/flights/cancel`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flightId, date }),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ deleted: boolean }>;
}

/** Path segments after /ns-raw-flight-data/ — must match Nest @Controller paths. */
export const FORM_PATHS = {
  mainDetails: 'main-details',
  /** Server collection: remarks-details */
  remarks: 'remarks-details',
  terminalDetails: 'terminal-details',
  /** Legacy label; server uses equipment-manpower-details */
  equipmentManpower: 'equipment-manpower-details',
  loadControlDetails: 'load-control-details',
  /** Server ramp module 1 is mounted at ramp-details (not ramp-details-1). */
  rampDetails1: 'ramp-details',
  attachmentsDetails: 'attachments-details',
} as const;

/**
 * Equipment-manpower API by flight serial (one document per flight).
 * Server: GET/POST/PATCH/DELETE /ns-raw-flight-data/equipment-manpower-details/:serialNo
 */
export const equipmentManpowerByFlight = (flightSerialNumber: string | number) => {
  const base = getApiBase().replace(/\/$/, '');
  const serial = String(flightSerialNumber);
  const path = `${base}/${NS_RAW_BASE}/${FORM_PATHS.equipmentManpower}/${serial}`;
  return {
    get: () => path,
    post: () => path,
    patch: () => path,
    delete: () => path,
  };
};

export type ScheduledAirlineEquipmentTemplateRow = {
  equipmentName: string;
  equipmentCode: string;
  timeRequired?: boolean;
  option1Basis?: string;
  option1Sign?: string;
  option1Minutes?: number;
  option2Basis?: string;
  option2Sign?: string;
  option2Minutes?: number;
  /** Advance → Schedule Equipment remarks (e.g. Arrival / Departure). */
  remarks?: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
};

/** Templates from Advance → Schedule Equipment (computed From/To on server). */
export async function fetchScheduledAirlineEquipmentTemplates(args: {
  airlineCode?: string;
  airlineName?: string;
  aircraftBody: 'NB' | 'WB';
  splitOperation: boolean;
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
  defaultDate: string;
}): Promise<ScheduledAirlineEquipmentTemplateRow[]> {
  const code = (args.airlineCode ?? '').trim();
  const name = (args.airlineName ?? '').trim();
  if (!code && !name) return [];

  const qs = new URLSearchParams();
  if (code) qs.set('airlineCode', code);
  if (name) qs.set('airlineName', name);
  qs.set('aircraftBody', args.aircraftBody);
  qs.set('splitOperation', args.splitOperation ? 'true' : 'false');
  if (args.ataDate) qs.set('ataDate', args.ataDate);
  if (args.ataTime) qs.set('ataTime', args.ataTime);
  if (args.atdDate) qs.set('atdDate', args.atdDate);
  if (args.atdTime) qs.set('atdTime', args.atdTime);
  if (args.defaultDate) qs.set('defaultDate', args.defaultDate);

  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}/${NS_RAW_BASE}/${FORM_PATHS.equipmentManpower}/scheduled-airline-equipment?${qs}`;
  try {
    const res = await frisFetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data as ScheduledAirlineEquipmentTemplateRow[];
  } catch {
    return [];
  }
}

/** Master catalog: `abbr` matches FHR `equipment_name`; UI/PDF shows `description`. */
export async function fetchEquipmentManpowerMasterCatalog(): Promise<
  { abbr: string; description: string; unit_type: string; category?: string }[]
> {
  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}/${NS_RAW_BASE}/${FORM_PATHS.equipmentManpower}/master-catalog`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data as {
      abbr: string;
      description: string;
      unit_type: string;
      category?: string;
    }[];
  } catch {
    return [];
  }
}

/**
 * Batch FHR doc lookup — one POST for many candidate serials instead of one
 * `GET /fhr-collection/flight/:id` per flight. Returns a map keyed by every
 * numeric serial the server matched (primary `SerialNo` or `flightSerialNumber`).
 * Used by the Scheduled data export page so large date ranges resolve in one
 * round trip instead of hundreds of sequential per-flight probes.
 */
export async function fetchFhrDocsBatch(
  serials: number[],
): Promise<Map<number, Record<string, unknown>>> {
  const unique = Array.from(new Set(serials.filter((n) => Number.isFinite(n))));
  const out = new Map<number, Record<string, unknown>>();
  if (unique.length === 0) return out;
  const base = getApiBase().replace(/\/$/, '');
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const res = await fetch(`${base}/fhr-collection/flights-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serials: chunk }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      if (data && typeof data === 'object') {
        for (const [key, doc] of Object.entries(data as Record<string, unknown>)) {
          const n = Number(key);
          if (Number.isFinite(n) && doc && typeof doc === 'object') {
            out.set(n, doc as Record<string, unknown>);
          }
        }
      }
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Batch flight-report lookup — one POST for many serials instead of one
 * `GET /reports/flight-report/:id` per flight. Returns a map keyed by serial number.
 */
export async function fetchFlightReportBatch(
  serialNos: number[],
): Promise<Map<number, Record<string, unknown>>> {
  const unique = Array.from(new Set(serialNos.filter((n) => Number.isFinite(n))));
  const out = new Map<number, Record<string, unknown>>();
  if (unique.length === 0) return out;
  const base = getApiBase().replace(/\/$/, '');
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const res = await fetch(`${base}/reports/flight-report-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNos: chunk }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      if (data && typeof data === 'object') {
        for (const [key, report] of Object.entries(data as Record<string, unknown>)) {
          const n = Number(key);
          if (Number.isFinite(n) && report && typeof report === 'object') {
            out.set(n, report as Record<string, unknown>);
          }
        }
      }
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Operational serial for `fhr_collection` URLs (same rules as server `validateSerial`).
 */
export function operationalSerialFromFlightKey(serialKey: string): number | null {
  const cleaned = String(serialKey ?? '').trim().replace(/^FL-/i, '');
  if (!cleaned) return null;
  const digits = cleaned.replace(/[^\d]/g, '');
  const n = Number(digits || cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * GET /fhr-collection/flight/:serial — one merged FHR row or null (404 / network).
 * Accepts instance or legacy serial strings; path uses numeric SerialNo.
 */
export async function fetchFhrCollectionFlightLean(
  serialKey: string,
): Promise<Record<string, unknown> | null> {
  const n = operationalSerialFromFlightKey(serialKey);
  if (!n) return null;
  const base = getApiBase().replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/fhr-collection/flight/${encodeURIComponent(String(n))}`);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type CleaningServicesReportApiRow = {
  id: string;
  serialNo: number;
  flightSerialNo: string;
  flightNo: string;
  staYmd: string;
  customer: string;
  airlineCode: string;
  category: string;
  typeOfHandling: string;
  aircraftBody: string;
  typeOfFlight: 'Cargo' | 'Passenger';
  clFromDate: string;
  clFromTime: string;
  clEndDate: string;
  clEndTime: string;
  duration: string;
  supervisor: string;
  remarks: string;
};

/**
 * GET /fhr-collection/cleaning-services?fromDate=&tillDate=
 * Read-only cleaning-services rows sourced from FHR embeds.
 */
export async function fetchCleaningServicesReportRows(
  fromDate: string,
  tillDate: string,
): Promise<CleaningServicesReportApiRow[]> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate,
    tillDate,
  });
  const res = await fetch(`${base}/fhr-collection/cleaning-services?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 300) || `${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as CleaningServicesReportApiRow[]) : [];
}

/** Fired on `window` after a successful `PUT /fhr-collection/flight/:serial` (client-only). */
export const FHR_COLLECTION_UPDATED_EVENT = 'fris:fhr-collection-updated';

export type FhrCollectionUpdatedDetail = { serial: number };

/**
 * PUT /fhr-collection/flight/:serial — merge DTO slices into `fhr_collection` (upsert).
 */
export async function putFhrCollectionFlightMerge(
  serialKey: string,
  body: Record<string, unknown>,
  reason = 'scheduled_main_details_form',
): Promise<Record<string, unknown>> {
  const n = operationalSerialFromFlightKey(serialKey);
  if (!n) throw new Error('Invalid flight serial number');
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams();
  const r = String(reason ?? '').trim();
  if (r) params.set('reason', r);
  const q = params.toString();
  const url = `${base}/fhr-collection/flight/${encodeURIComponent(String(n))}${q ? `?${q}` : ''}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(j.message)) msg = j.message.join(', ');
      else if (j.message) msg = String(j.message);
    } catch {
      if (text) msg = text.slice(0, 300);
    }
    throw new Error(msg);
  }
  const doc = (await res.json()) as Record<string, unknown>;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<FhrCollectionUpdatedDetail>(FHR_COLLECTION_UPDATED_EVENT, {
        detail: { serial: n },
      }),
    );
  }
  return doc;
}

// ---------------------------------------------------------------------------
// FHR digital signatures (Main Details → Representative Signatures section)
// ---------------------------------------------------------------------------

export type FhrSignatureParty = 'gh' | 'airline';

export interface FhrSignaturesData {
  ghRepresentativeName: string;
  ghSignatureUrl: string;
  ghSignedAt: string | null;
  ghSignedByUserId: string;
  airlineRepresentativeName: string;
  airlineSignatureUrl: string;
  airlineSignedAt: string | null;
  airlineSignedByUserId: string;
}

export interface FhrSignatureView {
  signatures: FhrSignaturesData;
  status: 'DRAFT' | 'FINALIZED';
  finalizedAt: string | null;
  isFinalized: boolean;
}

async function parseFhrError(res: Response): Promise<string> {
  const text = await res.text();
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(j.message)) msg = j.message.join(', ');
    else if (j.message) msg = String(j.message);
  } catch {
    if (text) msg = text.slice(0, 300);
  }
  return msg;
}

export async function fetchFhrSignatures(
  serialKey: string,
): Promise<FhrSignatureView | null> {
  const n = operationalSerialFromFlightKey(serialKey);
  if (!n) return null;
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/fhr-collection/flight/${encodeURIComponent(String(n))}/signatures`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as FhrSignatureView;
}

export async function saveFhrSignature(
  serialKey: string,
  body: {
    party: FhrSignatureParty;
    signatureUrl: string;
    representativeName?: string;
  },
): Promise<FhrSignatureView> {
  const n = operationalSerialFromFlightKey(serialKey);
  if (!n) throw new Error('Invalid flight serial number');
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/fhr-collection/flight/${encodeURIComponent(String(n))}/signature`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as FhrSignatureView;
}

export async function finalizeFhr(serialKey: string): Promise<FhrSignatureView> {
  const n = operationalSerialFromFlightKey(serialKey);
  if (!n) throw new Error('Invalid flight serial number');
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/fhr-collection/flight/${encodeURIComponent(String(n))}/finalize`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as FhrSignatureView;
}

// ---------------------------------------------------------------------------
// Reusable representative signature repository
// ---------------------------------------------------------------------------

export type RepresentativeType = 'GH_REPRESENTATIVE' | 'AIRLINE_REPRESENTATIVE';

export interface RepresentativeSignatureRecord {
  id: string;
  representativeName: string;
  representativeType: RepresentativeType;
  signatureUrl: string;
  station: string;
  active: boolean;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ResolvedSignatureParty {
  name: string;
  signatureUrl: string;
  signatureId: string;
  signedAt: string | null;
}

export interface ResolvedFhrSignatures {
  gh: ResolvedSignatureParty;
  airline: ResolvedSignatureParty;
  status: 'DRAFT' | 'FINALIZED';
  finalizedAt: string | null;
  isFinalized: boolean;
}

/** Auto-fetch an existing reusable signature by representative name + type. */
export async function lookupRepresentativeSignature(
  name: string,
  type: RepresentativeType,
): Promise<RepresentativeSignatureRecord | null> {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams({ name: trimmed, type });
  const res = await fetch(`${base}/representative-signatures/lookup?${qs.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseFhrError(res));
  const data = await res.json();
  return (data as RepresentativeSignatureRecord | null) ?? null;
}

/** Assign an existing repository signature to an FHR ("Use Existing Signature"). */
export async function assignFhrSignature(
  serialKey: string,
  party: FhrSignatureParty,
  signatureId: string,
): Promise<FhrSignatureView> {
  const n = operationalSerialFromFlightKey(serialKey);
  if (!n) throw new Error('Invalid flight serial number');
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/fhr-collection/flight/${encodeURIComponent(String(n))}/signature/assign`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ party, signatureId }),
    },
  );
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as FhrSignatureView;
}

/** Resolve render-ready signatures for PDF generation (FHR / GSE / Team). */
export async function fetchResolvedFhrSignatures(
  serialKey: string,
  report?: 'fhr' | 'gse' | 'team',
): Promise<ResolvedFhrSignatures | null> {
  const n = operationalSerialFromFlightKey(serialKey);
  if (!n) return null;
  const base = getApiBase().replace(/\/$/, '');
  const qs = report ? `?report=${report}` : '';
  const res = await fetch(
    `${base}/fhr-collection/flight/${encodeURIComponent(String(n))}/resolved-signatures${qs}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as ResolvedFhrSignatures;
}

// ---- Admin: signature repository management ----

export async function listRepresentativeSignatures(opts?: {
  search?: string;
  type?: RepresentativeType;
  includeInactive?: boolean;
}): Promise<RepresentativeSignatureRecord[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (opts?.search) qs.set('search', opts.search);
  if (opts?.type) qs.set('type', opts.type);
  if (opts?.includeInactive) qs.set('includeInactive', 'true');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${base}/representative-signatures${suffix}`);
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as RepresentativeSignatureRecord[];
}

export async function updateRepresentativeSignature(
  id: string,
  body: { signatureUrl?: string; representativeName?: string; station?: string },
): Promise<RepresentativeSignatureRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/representative-signatures/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as RepresentativeSignatureRecord;
}

export async function deactivateRepresentativeSignature(
  id: string,
): Promise<RepresentativeSignatureRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/representative-signatures/${encodeURIComponent(id)}/deactivate`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' } },
  );
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as RepresentativeSignatureRecord;
}

export interface SignatureAuditEntry {
  eventId: string;
  timestamp: string | null;
  action: string;
  auditEvent: string;
  userName: string;
  userId: string;
  ipAddress?: string;
}

export async function fetchSignatureAuditHistory(
  id: string,
): Promise<SignatureAuditEntry[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/representative-signatures/${encodeURIComponent(id)}/audit`,
  );
  if (!res.ok) throw new Error(await parseFhrError(res));
  return (await res.json()) as SignatureAuditEntry[];
}

const EQUIPMENT_MANPOWER_ADMIN_DOCUMENTS = `${NS_RAW_BASE}/${FORM_PATHS.equipmentManpower}/admin/documents`;
const EQUIPMENT_MANPOWER_ADMIN_CATALOG = `${NS_RAW_BASE}/${FORM_PATHS.equipmentManpower}/admin/catalog`;

export function equipmentManpowerAdminDocumentsUrl(): string {
  const base = getApiBase().replace(/\/$/, '');
  return `${base}/${EQUIPMENT_MANPOWER_ADMIN_DOCUMENTS}`;
}

export async function fetchEquipmentManpowerAdminDocuments(): Promise<
  Record<string, unknown>[]
> {
  const res = await fetch(equipmentManpowerAdminDocumentsUrl());
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<Record<string, unknown>[]>;
}

/**
 * Create-or-replace the equipment/manpower master catalog straight from the
 * frontend (no seed step). Sends the full `catalogItems` array; the server
 * upserts the station-scoped master doc.
 */
export async function upsertEquipmentManpowerAdminCatalog(
  items: Array<{
    abbr: string;
    description: string;
    unit_type: string;
    category: string;
  }>,
): Promise<{ serialNo: number; itemCount: number }> {
  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}/${EQUIPMENT_MANPOWER_ADMIN_CATALOG}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogItems: items }),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(j.message)) msg = j.message.join(', ');
      else if (j.message) msg = String(j.message);
    } catch {
      if (text) msg = text.slice(0, 300);
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ serialNo: number; itemCount: number }>;
}

export async function patchEquipmentManpowerAdminDocument(
  mongoId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}/${EQUIPMENT_MANPOWER_ADMIN_DOCUMENTS}/${encodeURIComponent(mongoId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(j.message)) msg = j.message.join(', ');
      else if (j.message) msg = String(j.message);
    } catch {
      if (text) msg = text.slice(0, 300);
    }
    throw new Error(msg);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Build URL for saved flight subdocuments under ns-raw-flight-data.
 * Example: getFormApiUrl(12345, 'remarks-details') => .../ns-raw-flight-data/remarks-details/12345
 */
export const getFormApiUrl = (
  flightSerialNumber: string | number,
  pathSegment: string
): string => {
  const base = getApiBase().replace(/\/$/, '');
  const serial = String(flightSerialNumber);
  return `${base}/${NS_RAW_BASE}/${pathSegment}/${serial}`;
};

export type NonScheduledAirlinesFilterBy =
  | 'SerialNo'
  | 'ChallanNo'
  | 'BookingNo'
  | 'AirlineDate';

/** GET /non-scheduled-booking/airline-flights — challan-ready NS list + Open serials. */
export async function fetchNonScheduledAirlineFlights(params: {
  filterBy: NonScheduledAirlinesFilterBy;
  serialNo?: string;
  challanNo?: string;
  bookingNo?: string;
  airline?: string;
  fromDate?: string;
  tillDate?: string;
}): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (params.filterBy === 'SerialNo' && params.serialNo?.trim()) {
    qs.set('serialNo', params.serialNo.trim());
  }
  if (params.filterBy === 'ChallanNo' && params.challanNo?.trim()) {
    qs.set('challanNo', params.challanNo.trim());
  }
  if (params.filterBy === 'BookingNo' && params.bookingNo?.trim()) {
    qs.set('bookingNo', params.bookingNo.trim());
  }
  if (params.filterBy === 'AirlineDate') {
    if (params.airline?.trim()) qs.set('airline', params.airline.trim());
    if (params.fromDate?.trim()) qs.set('fromDate', params.fromDate.trim());
    if (params.tillDate?.trim()) qs.set('tillDate', params.tillDate.trim());
  }

  const res = await fetch(
    `${base}/non-scheduled-booking/airline-flights?${qs.toString()}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.slice(0, 200) || `Non-scheduled flights fetch failed: ${res.status}`,
    );
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch scheduled flights from the reports/flights endpoint (fromDate, tillDate).
 * Returns raw array; use processFlightData() or mapRawFlightDocsToFlightData() to get FlightData[].
 */
export const fetchScheduledFlights = async (
  fromDate: string,
  toDate: string
): Promise<unknown[]> => {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate,
    tillDate: toDate,
  });
  const url = `${base}/reports/flights?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Scheduled flights fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

/**
 * Top delay reasons from saved main details (arrival + departure delay rows).
 * GET /reports/delay-reasons-top?fromDate=dd/MM/yyyy&tillDate=dd/MM/yyyy&limit=5
 */
export type DelayAnalyticsFlightRow = {
  flightNo: string;
  airline: string;
  station: string;
  aircraft: string;
  delayMinutes: number;
  arrival: string;
  departure: string;
  date: string;
  serialNo: number;
};

export type DelayCodeSummary = {
  code: string;
  flightCount: number;
  totalMinutes: number;
  avgMinutes: number;
  pctContribution: number;
};

export type DelayAnalyticsPayload = {
  kpis: {
    totalDelayedFlights: number;
    totalDelayMinutes: number;
    avgDelayPerFlight: number;
    topCodeByFlights: { code: string; flightCount: number } | null;
    worstAirline: { name: string; flightCount: number } | null;
    worstStation: { code: string; flightCount: number } | null;
  };
  codes: DelayCodeSummary[];
  monthlyTrend: { month: string; label: string; flights: number; minutes: number }[];
  airlineComparison: { airline: string; flights: number; minutes: number }[];
  stationComparison: { station: string; flights: number; minutes: number }[];
  hourDistribution: { hour: number; label: string; count: number }[];
  insights: {
    paretoCodesPct: number;
    paretoDelayPct: number;
    peakHour: number | null;
    repeatOffenderFlights: DelayAnalyticsFlightRow[];
  };
  meta: { fromYmd: string; toYmd: string; rowCount: number };
};

export type DelayDrilldownPayload = {
  code: string;
  flightCount: number;
  totalMinutes: number;
  avgMinutes: number;
  flights: DelayAnalyticsFlightRow[];
};

export type DelayReportTopCardsPayload = {
  kpis: {
    totalDelayedFlights: number;
    totalDelayMinutes: number;
    avgDelayPerFlight: number;
    topCodeByFlights: {
      code: string;
      flightCount: number;
      totalMinutes: number;
    } | null;
    worstAirline: {
      name: string;
      flightCount: number;
      totalMinutes: number;
    } | null;
    worstStation: {
      name: string;
      flightCount: number;
      totalMinutes: number;
    } | null;
  };
  meta: {
    fromYmd: string;
    toYmd: string;
    airline: string;
    station: string;
    shardCount: number;
    latestGeneratedAt: string | null;
  };
  _perf?: {
    totalMs: number;
    materializedDays: number;
    recomputedDays: number;
  };
  panels: {
    monthlyTrend: Array<{
      month: string;
      label: string;
      delayedFlights: number;
      avgDuration: number;
      trendFlights: number;
    }>;
    allCodes: Array<{
      code: string;
      flightCount: number;
      totalMinutes: number;
      avgMinutes: number;
      pctOfDelay: number;
      severity: 'High' | 'Watch' | 'Alert';
    }>;
    topCodes: Array<{
      code: string;
      flightCount: number;
      totalMinutes: number;
      avgMinutes: number;
      pctOfDelay: number;
      severity: 'High' | 'Watch' | 'Alert';
    }>;
    severitySplit: {
      high: number;
      low: number;
    };
    hourlyDistribution: Array<{
      hour: string;
      delays: number;
    }>;
    weeklyDistribution: Array<{
      week: string;
      rotation: number;
      atfm: number;
      operational: number;
    }>;
  };
};

function delayReportQueryParams(
  fromYmd: string,
  toYmd: string,
  airline?: string,
  station?: string,
  code?: string,
): URLSearchParams {
  const params = new URLSearchParams({
    fromDate: fromYmd,
    tillDate: toYmd,
  });
  const al = String(airline ?? '').trim();
  const st = String(station ?? '').trim();
  if (al) params.set('airline', al);
  if (st) params.set('station', st);
  if (code?.trim()) params.set('code', code.trim());
  return params;
}

/** GET /reports/delay-analytics — FHR delay code dashboard aggregate. */
export async function fetchDelayAnalytics(
  fromYmd: string,
  toYmd: string,
  airline?: string,
  station?: string,
): Promise<DelayAnalyticsPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const params = delayReportQueryParams(fromYmd, toYmd, airline, station);
  const res = await fetch(`${base}/reports/delay-analytics?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Delay analytics failed: ${res.status}`);
  }
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error));
  return data as DelayAnalyticsPayload;
}

/** GET /reports/delay-analytics?code=NN — flight drilldown for one delay code. */
export async function fetchDelayAnalyticsDrilldown(
  fromYmd: string,
  toYmd: string,
  code: string,
  airline?: string,
  station?: string,
): Promise<DelayDrilldownPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const params = delayReportQueryParams(fromYmd, toYmd, airline, station, code);
  const res = await fetch(`${base}/reports/delay-analytics?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Delay drilldown failed: ${res.status}`);
  }
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error));
  return data as DelayDrilldownPayload;
}

/** GET /reports/delay-report-top-cards — materialized delay KPI strip. */
export async function fetchDelayReportTopCards(
  fromYmd: string,
  toYmd: string,
  airline?: string,
  station?: string,
  opts?: { signal?: AbortSignal },
): Promise<DelayReportTopCardsPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const params = delayReportQueryParams(fromYmd, toYmd, airline, station);
  const res = await frisFetch(
    `${base}/reports/delay-report-top-cards?${params.toString()}`,
    { signal: opts?.signal },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Delay report top cards failed: ${res.status}`);
  }
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error));
  return data as DelayReportTopCardsPayload;
}

export type RampShiftReportListItem = {
  reportId: string;
  shift: 'day' | 'night';
  reportDateYmd: string;
  createdBy: string;
  modifiedBy: string;
  mailSent: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type RampShiftReportPayload = {
  reportId: string;
  shift: 'day' | 'night';
  reportDateYmd: string;
  manager: string;
  reportBy: string;
  operationalIndicators: {
    totalArrivals: string;
    totalDepartures: string;
    paxFlts: string;
    cargoFlts: string;
    unschedPax: string;
    unschedCargo: string;
    delayAccountable: string;
    delayUnAccountable: string;
    otpTarget: string;
    otpActual: string;
  };
  resourceValues: string[][];
  scheduledRows: RampScheduledAirlineRow[];
  nonScheduledRows: Record<string, unknown>[];
  operationalNotes: string;
  irregularitiesNotes: string;
  createdBy: string;
  modifiedBy: string;
  mailSent: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchRampShiftNewReportId(): Promise<string> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/reports-ramp-shift-report/new-id`);
  if (!res.ok) throw new Error(`Failed to create report id: ${res.status}`);
  const data = (await res.json()) as { reportId?: string };
  return String(data.reportId ?? '').trim();
}

export async function fetchRampShiftScheduledFlights(
  reportDateYmd: string,
  shift: 'day' | 'night',
): Promise<RampScheduledAirlineRow[]> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    reportDate: reportDateYmd,
    shift,
  });
  const res = await fetch(
    `${base}/reports-ramp-shift-report/scheduled-flights?${params.toString()}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Scheduled flights failed: ${res.status}`);
  }
  const data = (await res.json()) as { flights?: RampScheduledAirlineRow[] };
  return Array.isArray(data.flights) ? data.flights : [];
}

export async function listRampShiftReports(
  reportDateYmd: string,
  shift: 'day' | 'night',
): Promise<RampShiftReportListItem[]> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({ reportDate: reportDateYmd, shift });
  const res = await fetch(`${base}/reports-ramp-shift-report?${params.toString()}`);
  if (!res.ok) throw new Error(`List ramp reports failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as RampShiftReportListItem[]) : [];
}

export async function getRampShiftReport(
  reportId: string,
): Promise<RampShiftReportPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/reports-ramp-shift-report/${encodeURIComponent(reportId)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `Load ramp report failed: ${res.status}`);
  }
  return (await res.json()) as RampShiftReportPayload;
}

export async function upsertRampShiftReport(body: {
  reportId: string;
  reportDateYmd: string;
  shift: 'day' | 'night';
  manager: string;
  reportBy: string;
  operationalIndicators: RampShiftReportPayload['operationalIndicators'];
  resourceValues: string[][];
  scheduledRows: RampScheduledAirlineRow[];
  nonScheduledRows: Record<string, unknown>[];
  operationalNotes?: string;
  irregularitiesNotes?: string;
  savedBy: string;
  mailSent?: boolean;
}): Promise<RampShiftReportPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/reports-ramp-shift-report`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 300) || `Save ramp report failed: ${res.status}`);
  }
  return (await res.json()) as RampShiftReportPayload;
}

export async function fetchTopDelayReasonsFromMainDetails(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
  limit = 5,
): Promise<Array<{ reason: string; count: number }>> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDdMmYyyy.trim(),
    tillDate: toDdMmYyyy.trim(),
    limit: String(limit),
  });
  const url = `${base}/reports/delay-reasons-top?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.slice(0, 200) || `Delay reasons fetch failed: ${res.status}`,
    );
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (row: unknown): row is { reason: string; count: number } =>
        row != null &&
        typeof row === 'object' &&
        'reason' in row &&
        'count' in row,
    )
    .map((row) => ({
      reason: String(row.reason),
      count: Number(row.count) || 0,
    }));
}

export async function fetchDashboardFlightTypeCounts(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
): Promise<{ turnaround: number; cargo: number }> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams({
    fromDate: fromDdMmYyyy.trim(),
    tillDate: toDdMmYyyy.trim(),
  });
  const url = `${base}/reports/dashboard-flight-types?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.slice(0, 200) || `Dashboard flight types failed: ${res.status}`,
    );
  }
  const data = (await res.json()) as {
    turnaround?: unknown;
    cargo?: unknown;
  };
  return {
    turnaround: Number(data.turnaround) || 0,
    cargo: Number(data.cargo) || 0,
  };
}

export type NonScheduledCancellationRow = {
  serialNo: number;
  airline: string;
  arrivalFlightNo: string;
  departureFlightNo: string;
  route: string;
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
  aircraft: string;
  updatedAt?: string;
};

/** GET /reports/non-scheduled-cancellations — main-details rows with `flightCancelled`. */
export async function fetchNonScheduledCancellations(params: {
  fromDate: string;
  tillDate: string;
}): Promise<NonScheduledCancellationRow[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams({
    fromDate: params.fromDate.trim(),
    tillDate: params.tillDate.trim(),
  });
  const res = await fetch(`${base}/reports/non-scheduled-cancellations?${qs}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text?.slice(0, 200) || `Non-scheduled cancellations fetch failed: ${res.status}`,
    );
  }
  const data = await res.json();
  return Array.isArray(data) ? (data as NonScheduledCancellationRow[]) : [];
}

/**
 * Map raw flight docs (API list or docs with .data) to FlightData[].
 * Use when the API returns either a direct array or an array of { data: flight }.
 */
export const mapRawFlightDocsToFlightData = (raw: unknown[]): FlightData[] => {
  if (!Array.isArray(raw)) return [];
  const list = raw.map((doc) => {
    if (doc && typeof doc === 'object' && 'data' in doc) {
      const record = doc as { data?: unknown };
      return record.data ?? doc;
    }
    return doc;
  });
  return processFlightData(list);
};

/**
 * GET saved main details for a non-scheduled flight by serial number.
 * Returns 404 when no main details have been saved yet.
 * URL: GET /ns-raw-flight-data/main-details/:serialNo
 */
export function getNsRawMainDetailsUrl(serialNo: string | number): string {
  const base = getApiBase().replace(/\/$/, '');
  return `${base}/${NS_RAW_BASE}/main-details/${serialNo}`;
}

/**
 * GET default (raw) main details from ns-raw-flight-data for form pre-fill.
 * Use when no saved main details exist (e.g. after 404 from getNsRawMainDetailsUrl).
 * URL: GET /ns-raw-flight-data/raw/main-details/:serialNo
 */
export function getNsRawMainDetailsDefaultUrl(serialNo: string | number): string {
  const base = getApiBase().replace(/\/$/, '');
  return `${base}/${NS_RAW_BASE}/raw/main-details/${serialNo}`;
}

/**
 * GET saved form data for non-scheduled flight by path and serial.
 * e.g. getNsRawFormSavedUrl('terminal-details', 1) => .../ns-raw-flight-data/terminal-details/1
 */
export function getNsRawFormSavedUrl(
  pathSegment: string,
  serialNo: string | number
): string {
  const base = getApiBase().replace(/\/$/, '');
  return `${base}/${NS_RAW_BASE}/${pathSegment}/${serialNo}`;
}

/**
 * GET saved form data from DB and return parsed JSON.
 * URL format: GET http://localhost:8080/ns-raw-flight-data/:pathSegment/:serialNo
 * e.g. GET http://localhost:8080/ns-raw-flight-data/main-details/434
 * Returns null on 404, non-ok, or empty body (no saved record).
 */
export async function fetchNsRawFormData(
  pathSegment: string,
  serialNo: string | number
): Promise<unknown> {
  const url = getNsRawFormSavedUrl(pathSegment, serialNo);
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * GET default (raw) form data from ns-raw-flight-data for form pre-fill.
 * e.g. getNsRawFormDefaultUrl('terminal-details', 1) => .../ns-raw-flight-data/raw/terminal-details/1
 */
export function getNsRawFormDefaultUrl(
  pathSegment: string,
  serialNo: string | number
): string {
  const base = getApiBase().replace(/\/$/, '');
  return `${base}/${NS_RAW_BASE}/raw/${pathSegment}/${serialNo}`;
}

/**
 * POST (save) form data for non-scheduled flight.
 * Same URL as GET saved: POST /ns-raw-flight-data/:pathSegment/:serialNo
 * Returns the response JSON; throws on non-ok status.
 */
export async function saveNsRawForm(
  pathSegment: string,
  serialNo: string | number,
  body: Record<string, unknown>
): Promise<unknown> {
  const url = getNsRawFormSavedUrl(pathSegment, serialNo);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const data = await res.json();
  // Same browser bridge as scheduled FHR merge — open dashboard refetches KPIs.
  if (typeof window !== 'undefined') {
    const n = Number(serialNo);
    window.dispatchEvent(
      new CustomEvent<FhrCollectionUpdatedDetail>(FHR_COLLECTION_UPDATED_EVENT, {
        detail: { serial: Number.isFinite(n) ? n : 0 },
      }),
    );
  }
  return data;
}

// ——— Advance Gateway sub-forms API ———
// Paths match server controllers: advance-raf-airline, advance-contact, advance-manpower, etc.

/** Normalize API doc: use id from _id for client row types. Handles _id as string or object (e.g. Mongo ObjectId). */
export function advanceDocId<T extends Record<string, unknown>>(doc: T): T & { id: string } {
  const raw = doc._id ?? doc.id;
  let id: string;
  if (raw == null || raw === '') {
    id = '';
  } else if (typeof raw === 'string') {
    id = raw;
  } else if (typeof raw === 'object' && raw !== null && 'toString' in raw) {
    id = (raw as { toString(): string }).toString();
  } else if (typeof raw === 'object' && raw !== null && '$oid' in raw) {
    id = String((raw as { $oid: string }).$oid);
  } else {
    id = String(raw);
  }
  return { ...doc, id } as T & { id: string };
}

function advanceBase(path: string): string {
  const base = getApiBase().replace(/\/$/, '');
  return `${base}/${path}`;
}

/** GET list. Optional query param: { filter: string } or { search: string } per endpoint. */
export async function advanceList(
  path: string,
  params?: { filter?: string; search?: string }
): Promise<unknown[]> {
  const qs = new URLSearchParams();
  if (params?.filter?.trim()) qs.set('filter', params.filter.trim());
  if (params?.search?.trim()) qs.set('search', params.search.trim());
  const q = qs.toString();
  const href = q ? `${advanceBase(path)}?${q}` : advanceBase(path);
  const res = await frisFetch(href, { cache: 'no-store', credentials: 'include' });
  const text = await res.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      })()
    : null;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message?: unknown }).message)
        : text || `${res.status} ${res.statusText}`;
    throw new Error(`List failed: ${message}`);
  }
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
  }
  return [];
}

/** Creation → Scheduled Airlines: airline master (no Advance tab permission required). */
export async function fetchCreationReferenceAirlines(
  filter?: string,
): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = filter?.trim() ? `?${new URLSearchParams({ filter: filter.trim() })}` : '';
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/creation-reference/airlines${qs}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    await pipelineError(res, 'Failed to load airlines for Creation');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Creation → Scheduled Airlines: flight numbers for selected airline
 * (from Advance → Schedule Setup masters).
 */
export async function fetchCreationReferenceFlights(opts: {
  airline: string;
  airlineCode?: string;
}): Promise<{ flightNo: string }[]> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams();
  if (opts.airline.trim()) params.set('airline', opts.airline.trim());
  if (opts.airlineCode?.trim()) params.set('airlineCode', opts.airlineCode.trim());
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/creation-reference/flights?${params.toString()}`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) {
    await pipelineError(res, 'Failed to load flights for airline');
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      if (typeof row === 'string') return { flightNo: row.trim() };
      if (row && typeof row === 'object' && 'flightNo' in row) {
        return { flightNo: String((row as { flightNo?: unknown }).flightNo ?? '').trim() };
      }
      return { flightNo: '' };
    })
    .filter((r) => r.flightNo);
}

/** Creation → Scheduled Airlines: aircraft master (no Advance tab permission required). */
export async function fetchCreationReferenceAircraft(
  search?: string,
): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = search?.trim() ? `?${new URLSearchParams({ search: search.trim() })}` : '';
  const res = await frisFetch(
    `${base}/scheduled-airline-pipeline/creation-reference/aircraft${qs}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    await pipelineError(res, 'Failed to load aircraft for Creation');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchStationScopedReferenceList(
  path: string,
  errorLabel: string,
  query?: { filter?: string; search?: string },
): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const params = new URLSearchParams();
  if (query?.filter?.trim()) params.set('filter', query.filter.trim());
  if (query?.search?.trim()) params.set('search', query.search.trim());
  const qs = params.toString() ? `?${params}` : '';
  const res = await frisFetch(`${base}/${path}${qs}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    await pipelineError(res, errorLabel);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Advance → Schedule Setup: station-scoped airline dropdown options. */
export function fetchScheduleSetupReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'scheduled-airline-pipeline/advance-schedule-setup/reference/airlines',
    'Failed to load airlines for Schedule Setup',
    { filter },
  );
}

/** Advance → Schedule Setup: aircraft dropdown options. */
export function fetchScheduleSetupReferenceAircraft(search?: string) {
  return fetchStationScopedReferenceList(
    'scheduled-airline-pipeline/advance-schedule-setup/reference/aircraft',
    'Failed to load aircraft for Schedule Setup',
    { search },
  );
}

/** Advance → Schedule Equipment Setup: station-scoped airline options. */
export function fetchScheduleEquipmentReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'advance-schedule-equipment/reference/airlines',
    'Failed to load airlines for Schedule Equipment Setup',
    { filter },
  );
}

/** Advance → Schedule Equipment Setup: station-scoped equipment options. */
export function fetchScheduleEquipmentReferenceEquipment(filter?: string) {
  return fetchStationScopedReferenceList(
    'advance-schedule-equipment/reference/equipment',
    'Failed to load equipment for Schedule Equipment Setup',
    { filter },
  );
}

/** Advance → Aircraft Registration: station-scoped airline options. */
export function fetchAircraftRegistrationReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'advance-aircraft-registration/reference/airlines',
    'Failed to load airlines for Aircraft Registration',
    { filter },
  );
}

/** Advance → Aircraft Registration: aircraft options. */
export function fetchAircraftRegistrationReferenceAircraft(search?: string) {
  return fetchStationScopedReferenceList(
    'advance-aircraft-registration/reference/aircraft',
    'Failed to load aircraft for Aircraft Registration',
    { search },
  );
}

/** Creation → RAF: station-scoped Non-Scheduled airline options. */
export function fetchCreationRafReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'scheduled-airline-pipeline/creation-reference/raf/airlines',
    'Failed to load non-scheduled airlines for RAF',
    { filter },
  );
}

/** Creation → Additional Flights: station-scoped airline options. */
export function fetchAdditionalFlightsReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'scheduled-airline-pipeline/creation-reference/additional-flights/airlines',
    'Failed to load airlines for Additional Flights',
    { filter },
  );
}

/** Creation → Additional Flights: aircraft options. */
export function fetchAdditionalFlightsReferenceAircraft(search?: string) {
  return fetchStationScopedReferenceList(
    'scheduled-airline-pipeline/creation-reference/additional-flights/aircraft',
    'Failed to load aircraft for Additional Flights',
    { search },
  );
}

/** Advance → Cargo: station-scoped airline options. */
export function fetchCargoReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'advance-cargo/reference/airlines',
    'Failed to load airlines for Cargo',
    { filter },
  );
}

/** Advance → Cargo: aircraft options. */
export function fetchCargoReferenceAircraft(search?: string) {
  return fetchStationScopedReferenceList(
    'advance-cargo/reference/aircraft',
    'Failed to load aircraft for Cargo',
    { search },
  );
}

/** Flights / Reports screens: station-scoped airline master for filters. */
export function fetchFlightsReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'flights-reference/airlines',
    'Failed to load airlines',
    { filter },
  );
}

/** Flights / Reports screens: aircraft master for filters. */
export function fetchFlightsReferenceAircraft(search?: string) {
  return fetchStationScopedReferenceList(
    'flights-reference/aircraft',
    'Failed to load aircraft',
    { search },
  );
}

/** Flights screens: station-scoped equipment master. */
export function fetchFlightsReferenceEquipment(filter?: string) {
  return fetchStationScopedReferenceList(
    'flights-reference/equipment',
    'Failed to load equipment',
    { filter },
  );
}

/** Flights screens: terminal codes for Open forms (no Advance → Terminal required). */
export function fetchFlightsReferenceTerminals(filter?: string) {
  return fetchStationScopedReferenceList(
    'flights-reference/terminals',
    'Failed to load terminals',
    { filter },
  );
}

/** Advance → Airline Contact: station-scoped airline options. */
export function fetchContactReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'advance-contact/reference/airlines',
    'Failed to load airlines for Contact',
    { filter },
  );
}

/** Advance → Logo of Airline: station-scoped airline options. */
export function fetchAirlineLogoReferenceAirlines(filter?: string) {
  return fetchStationScopedReferenceList(
    'advance-airline-logo/reference/airlines',
    'Failed to load airlines for Logo',
    { filter },
  );
}

/** GET one by id. */
export async function advanceGet(path: string, id: string): Promise<unknown> {
  const res = await fetch(`${advanceBase(path)}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Get failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/** POST create. */
export async function advanceCreate(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(advanceBase(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json();
}

/** PATCH update by id. */
export async function advanceUpdate(
  path: string,
  id: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${advanceBase(path)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json();
}

/** DELETE by id. */
export async function advanceDelete(path: string, id: string): Promise<void> {
  const res = await fetch(`${advanceBase(path)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed: ${res.status} ${res.statusText}`);
}

/** DELETE all documents for an advance collection (e.g. advance-equipment/all). */
export async function advanceDeleteAll(path: string): Promise<{ deletedCount: number }> {
  const res = await fetch(`${advanceBase(path)}/all`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { deletedCount?: number };
  return { deletedCount: data.deletedCount ?? 0 };
}

export type FhrContactRepresentativeUsage = {
  airlineRepresentative: string;
  airline: string;
  usageCount: number;
};

export type FhrContactRepresentativesResponse = {
  master: Array<{
    id: string;
    email: string;
    contact: string;
    airline: string;
    airlineRepresentative: string;
    mobileNo: string;
    companyName: string;
    signatureUrl: string;
  }>;
  usedInFhrOnly: FhrContactRepresentativeUsage[];
};

/** GET /advance-contact/representatives — same pool as FHR Main Details Airline Rep. */
export async function fetchAdvanceContactFhrRepresentatives(): Promise<FhrContactRepresentativesResponse> {
  const res = await fetch(`${advanceBase(ADVANCE_PATHS.contact)}/representatives`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FhrContactRepresentativesResponse;
}

/** POST bulk create (e.g. advance-aircraft-registration/bulk). Body: array or { rows: array }. */
export async function advanceBulkCreate(
  path: string,
  body: { rows?: Record<string, unknown>[] } | Record<string, unknown>[]
): Promise<unknown> {
  const url = `${advanceBase(path)}/bulk`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json();
}

/** Advance gateway path constants (match server controllers). */
export const ADVANCE_PATHS = {
  trainingMatrix: 'training-matrix',
  adminDepartments: 'admin-departments',
  adminStations: 'admin-stations',
  airline: 'advance-airline',
  airlineLogo: 'advance-airline-logo',
  rafAirline: 'advance-raf-airline',
  contact: 'advance-contact',
  nsContact: 'advance-ns-contact',
  manpower: 'advance-manpower',
  nonScheduledAirline: 'advance-non-scheduled-airline',
  amsServices: 'advance-ams-services',
  aircraftRegistration: 'advance-aircraft-registration',
  terminal: 'advance-terminal',
  otherServices: 'advance-other-services',
  dcsMaster: 'advance-dcs-master',
  gatewayScheduledAirline: 'advance-gateway-scheduled-airline',
  aircraft: 'advance-aircraft',
  equipment: 'advance-equipment',
  /** Single GH representative master — Scheduled and Non-Scheduled share it. */
  ghrep: 'advance-ghrep',
  scheduleEquipment: 'advance-schedule-equipment',
  staff: 'advance-staff',
} as const;

/** Non-scheduled booking (By Mail / Direct) — Mongo `ns-non-scheduled-booking`. */
export type NonScheduledBookingChannel = 'mail' | 'direct';

export type NonScheduledBookingPayload = {
  channel: NonScheduledBookingChannel;
  operator: string;
  mailReceivedFrom?: string;
  mailReceivedBy?: string;
  mailSubject?: string;
  bookingDate?: string;
  airlineBillTo: string;
  companyName?: string;
  airlineCode?: string;
  flightNo: string;
  registrationNo?: string;
  routing?: string;
  staDate?: string;
  staTime?: string;
  stdDate?: string;
  stdTime?: string;
  aircraftType?: string;
  aircraftBody?: 'NB' | 'WB';
  mtow?: string;
  terminalCode?: string;
  opsType?: string;
  categoryOfFlight?: string;
  advance?: 'yes' | 'no';
  amount?: string;
  attachmentName?: string;
};

export type NonScheduledPassengerRow = {
  name: string;
  addedAt?: string;
};

export type NonScheduledBookingRecord = NonScheduledBookingPayload & {
  _id: string;
  bookingNo: string;
  /** URL-safe bookingNo (`/` → `_`). Prefer this in path params. */
  bookingKey?: string;
  documentSerial?: number;
  flightSerialNo?: number;
  flightType: string;
  serviceType: string;
  status: string;
  challanNo: string;
  challanDate?: string;
  bayNo?: string;
  noOfFerryIssued?: string;
  noOfPax?: string;
  ghRepresentative?: string;
  airlineRepresentative?: string;
  remarks?: string;
  passengers?: NonScheduledPassengerRow[];
  stationCode?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SaveNonScheduledChallanPayload = {
  challanDate?: string;
  bayNo?: string;
  noOfFerryIssued?: string;
  noOfPax?: string;
  ghRepresentative?: string;
  airlineRepresentative?: string;
  remarks?: string;
};

export type SaveNonScheduledPassengersPayload = {
  passengers: Array<{ name: string }>;
  append?: boolean;
};

/** Convert display bookingNo (`MAA/BKG/...`) to path-safe bookingKey. */
export function toNonScheduledBookingKey(bookingNoOrKey: string): string {
  const raw = String(bookingNoOrKey ?? '').trim();
  if (!raw) return '';
  if (raw.includes('/')) return raw.replace(/\//g, '_').toUpperCase();
  return raw.toUpperCase();
}

function parseApiErrorMessage(res: Response, text: string): string {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(j.message)) msg = j.message.join(', ');
    else if (j.message) msg = String(j.message);
  } catch {
    if (text) msg = text.slice(0, 200);
  }
  return msg;
}

/** POST /non-scheduled-booking — create By Mail or Direct booking. */
export async function createNonScheduledBooking(
  body: NonScheduledBookingPayload,
): Promise<NonScheduledBookingRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/non-scheduled-booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(parseApiErrorMessage(res, await res.text()));
  }
  return res.json() as Promise<NonScheduledBookingRecord>;
}

/**
 * Booking / Non-Scheduled Airlines airline master — same as Advance → Non Scheduled Airline,
 * allowed with Flights → Non scheduled Booking **or** Non-Scheduled Airlines.
 * GET /non-scheduled-booking/reference/airlines
 */
export async function fetchNonScheduledBookingReferenceAirlines(
  filter?: string,
): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = filter?.trim()
    ? `?${new URLSearchParams({ filter: filter.trim() })}`
    : '';
  const res = await frisFetch(
    `${base}/non-scheduled-booking/reference/airlines${qs}`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorMessage(res, text) || 'Failed to load airlines');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Booking form aircraft types — Advance aircraft master without Advance page permission.
 * GET /non-scheduled-booking/reference/aircraft
 */
export async function fetchNonScheduledBookingReferenceAircraft(
  search?: string,
): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = search?.trim()
    ? `?${new URLSearchParams({ search: search.trim() })}`
    : '';
  const res = await frisFetch(
    `${base}/non-scheduled-booking/reference/aircraft${qs}`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorMessage(res, text) || 'Failed to load aircraft');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** GET /non-scheduled-booking — list bookings (optional filters). */
export type UpdateNonScheduledBookingPayload = Partial<
  Omit<NonScheduledBookingPayload, 'channel'>
>;

export async function listNonScheduledBookings(params?: {
  filter?: string;
  channel?: NonScheduledBookingChannel;
  status?: string;
  pendingChallan?: boolean;
  challanNo?: string;
  challanDate?: string;
  flightNo?: string;
  bookingNo?: string;
  fromDate?: string;
  flightReady?: boolean;
}): Promise<NonScheduledBookingRecord[]> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (params?.filter?.trim()) qs.set('filter', params.filter.trim());
  if (params?.channel) qs.set('channel', params.channel);
  if (params?.status?.trim()) qs.set('status', params.status.trim());
  if (params?.pendingChallan) qs.set('pendingChallan', '1');
  if (params?.challanNo?.trim()) qs.set('challanNo', params.challanNo.trim());
  if (params?.challanDate?.trim()) qs.set('challanDate', params.challanDate.trim());
  if (params?.flightNo?.trim()) qs.set('flightNo', params.flightNo.trim());
  if (params?.bookingNo?.trim()) qs.set('bookingNo', params.bookingNo.trim());
  if (params?.fromDate?.trim()) qs.set('fromDate', params.fromDate.trim());
  if (params?.flightReady) qs.set('flightReady', '1');
  const url = qs.toString()
    ? `${base}/non-scheduled-booking?${qs}`
    : `${base}/non-scheduled-booking`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(parseApiErrorMessage(res, await res.text()));
  }
  return res.json() as Promise<NonScheduledBookingRecord[]>;
}

/** GET /non-scheduled-booking/:bookingKey — bookingKey = bookingNo with `/` → `_`. */
export async function getNonScheduledBooking(
  bookingNoOrKey: string,
): Promise<NonScheduledBookingRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const key = toNonScheduledBookingKey(bookingNoOrKey);
  const encoded = encodeURIComponent(key);
  const res = await fetch(`${base}/non-scheduled-booking/${encoded}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(parseApiErrorMessage(res, await res.text()));
  }
  return res.json() as Promise<NonScheduledBookingRecord>;
}

/** GET /non-scheduled-booking/by-challan?challanNo= */
export async function getNonScheduledBookingByChallan(
  challanNo: string,
): Promise<NonScheduledBookingRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const qs = new URLSearchParams({ challanNo: challanNo.trim() });
  const res = await fetch(`${base}/non-scheduled-booking/by-challan?${qs}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(parseApiErrorMessage(res, await res.text()));
  }
  return res.json() as Promise<NonScheduledBookingRecord>;
}

/** POST /non-scheduled-booking/:bookingKey/challan — allocates challan number. */
export async function saveNonScheduledChallan(
  bookingNoOrKey: string,
  body: SaveNonScheduledChallanPayload,
): Promise<NonScheduledBookingRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const key = toNonScheduledBookingKey(bookingNoOrKey);
  const encoded = encodeURIComponent(key);
  const res = await fetch(`${base}/non-scheduled-booking/${encoded}/challan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(parseApiErrorMessage(res, await res.text()));
  }
  return res.json() as Promise<NonScheduledBookingRecord>;
}

/** POST /non-scheduled-booking/:bookingKey/passengers — save pax + promote flight. */
export async function saveNonScheduledPassengers(
  bookingNoOrKey: string,
  body: SaveNonScheduledPassengersPayload,
): Promise<NonScheduledBookingRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const key = toNonScheduledBookingKey(bookingNoOrKey);
  const encoded = encodeURIComponent(key);
  const res = await fetch(
    `${base}/non-scheduled-booking/${encoded}/passengers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(parseApiErrorMessage(res, await res.text()));
  }
  return res.json() as Promise<NonScheduledBookingRecord>;
}

/** PATCH /non-scheduled-booking/:bookingKey — update before challan. */
export async function updateNonScheduledBooking(
  bookingNoOrKey: string,
  body: UpdateNonScheduledBookingPayload,
): Promise<NonScheduledBookingRecord> {
  const base = getApiBase().replace(/\/$/, '');
  const key = toNonScheduledBookingKey(bookingNoOrKey);
  const encoded = encodeURIComponent(key);
  const res = await fetch(`${base}/non-scheduled-booking/${encoded}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(parseApiErrorMessage(res, await res.text()));
  }
  return res.json() as Promise<NonScheduledBookingRecord>;
}

/** DELETE /non-scheduled-booking/:bookingKey */
export async function deleteNonScheduledBooking(
  bookingNoOrKey: string,
): Promise<{ deleted: boolean; bookingNo: string }> {
  const base = getApiBase().replace(/\/$/, '');
  const key = toNonScheduledBookingKey(bookingNoOrKey);
  const encoded = encodeURIComponent(key);
  const res = await fetch(`${base}/non-scheduled-booking/${encoded}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(parseApiErrorMessage(res, await res.text()));
  }
  return res.json() as Promise<{ deleted: boolean; bookingNo: string }>;
}

/** Compatibility row shape — maps Gateway Staff for reports / comboboxes. */
export type AdvanceStaffDataRow = {
  id: string;
  employeeCode: string;
  name: string;
  designation: string;
};

function isAdvanceStaffAccessDenied(error: unknown): boolean {
  const msg =
    error instanceof Error ? error.message : String(error ?? '');
  const normalized = msg.toLowerCase();
  return (
    normalized.includes('permission') &&
    normalized.includes('staff')
  );
}

/** Bare "Operator" is a gateway manpower role / legacy placeholder — not a job title. */
function isBareOperatorDesignation(value?: string): boolean {
  return /^operator$/i.test(String(value ?? '').trim());
}

/**
 * Map employeeCode → job designation.
 * Prefers Advance → Gateway → Staff (`designation`), then panel users.
 * Never uses bare "Operator" as a job title.
 */
export async function fetchEmployeeDesignationLookup(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  try {
    const staff = await fetchAdvanceGatewayStaff();
    for (const row of staff) {
      const code = row.employeeCode.trim().toLowerCase();
      const designation = row.designation.trim();
      if (code && designation && !isBareOperatorDesignation(designation)) {
        map.set(code, designation);
      }
    }
  } catch {
    /* soft-fail */
  }

  try {
    const users = await fetchPanelUsers();
    for (const user of users) {
      const code = String(user.employeeId ?? '').trim().toLowerCase();
      const designation = String(user.designation ?? '').trim();
      if (
        code &&
        designation &&
        !isBareOperatorDesignation(designation) &&
        !map.has(code)
      ) {
        map.set(code, designation);
      }
    }
  } catch {
    /* soft-fail — operational users may not list panel accounts */
  }

  return map;
}

/** Resolve designation for one employee code using a preloaded lookup (+ optional fallbacks). */
export function resolveEmployeeDesignation(
  employeeCode: string | undefined,
  lookup: Map<string, string>,
  ...fallbacks: Array<string | undefined>
): string {
  const code = String(employeeCode ?? '').trim().toLowerCase();
  if (code) {
    const fromMaster = lookup.get(code)?.trim() || '';
    if (fromMaster && !isBareOperatorDesignation(fromMaster)) return fromMaster;
  }
  for (const raw of fallbacks) {
    const value = String(raw ?? '').trim();
    if (value && !isBareOperatorDesignation(value)) return value;
  }
  return '';
}

/**
 * Staff options for reports / comboboxes — sourced from Gateway Staff
 * (`advance-staff`), not the removed Excel `advance-staff-data` collection.
 */
export async function fetchAdvanceStaffData(
  filter?: string,
): Promise<AdvanceStaffDataRow[]> {
  const gateway = await fetchAdvanceGatewayStaff(filter);
  return gateway.map((row) => ({
    id: row.id,
    employeeCode: row.employeeCode,
    name: row.employeeName,
    designation: row.designation,
  }));
}

export type AdvanceGatewayStaffRow = {
  id: string;
  employeeCode: string;
  employeeName: string;
  /** Manpower role label from Advance → Gateway → Staff (not job designation). */
  manpower: string;
  manpowerCode: string;
  /** Job designation stored on Gateway Staff (optional panel-user enrich). */
  designation: string;
  gseAssigned: { code: string; name: string }[];
};

/** GET /advance-staff — gateway staff master (Advance → Gateway → Staff). */
export async function fetchAdvanceGatewayStaff(
  filter?: string,
): Promise<AdvanceGatewayStaffRow[]> {
  let list: Record<string, unknown>[] = [];
  try {
    list = (await advanceList(
      ADVANCE_PATHS.staff,
      filter?.trim() ? { filter: filter.trim() } : undefined,
    )) as Record<string, unknown>[];
  } catch (error) {
    if (isAdvanceStaffAccessDenied(error)) {
      return [];
    }
    throw error;
  }

  const seenCodes = new Set<string>();
  const rows: AdvanceGatewayStaffRow[] = [];
  for (const doc of list) {
    const d = advanceDocId(doc);
    const employeeCode = String(doc.employeeCode ?? '').trim();
    const employeeName = String(doc.employeeName ?? doc.name ?? '').trim();
    if (!employeeCode && !employeeName) continue;
    const dedupeKey = employeeCode.toLowerCase() || employeeName.toLowerCase();
    if (seenCodes.has(dedupeKey)) continue;
    seenCodes.add(dedupeKey);

    const rawGse = Array.isArray(doc.gseAssigned) ? doc.gseAssigned : [];
    const gseAssigned = rawGse
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const code = String(row.code ?? '').trim();
        const name = String(row.name ?? '').trim();
        if (!code && !name) return null;
        return { code, name };
      })
      .filter((item): item is { code: string; name: string } => item !== null);

    const manpower = String(doc.manpower ?? '').trim();
    const manpowerCode = String(doc.manpowerCode ?? '').trim();
    const apiDesignation = String(doc.designation ?? '').trim();
    const designation = resolveEmployeeDesignation(
      employeeCode,
      new Map(),
      apiDesignation,
      !isBareOperatorDesignation(manpower) ? manpower : undefined,
      !isBareOperatorDesignation(manpowerCode) ? manpowerCode : undefined,
    );

    rows.push({
      id: d.id || `${employeeCode}|${employeeName}`,
      employeeCode,
      employeeName,
      manpower,
      manpowerCode,
      designation,
      gseAssigned,
    });
  }
  return rows;
}

/**
 * Terminal codes for flight Open forms.
 * Prefers flights-reference (Scheduled / Non-Scheduled Airlines page access).
 * Falls back to Advance → Terminal, then to provided defaults.
 */
export async function fetchAdvanceTerminalCodes(
  fallback: string[] = []
): Promise<string[]> {
  const extractCodes = (rows: unknown[]): string[] =>
    Array.from(
      new Set(
        rows
          .map((r) => {
            if (!r || typeof r !== 'object') return '';
            const code = (r as { terminalCode?: unknown }).terminalCode;
            return String(code ?? '').trim();
          })
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

  try {
    const refRows = await fetchFlightsReferenceTerminals();
    const codes = extractCodes(refRows);
    if (codes.length > 0) return codes;
  } catch {
    /* try Advance master next */
  }

  try {
    const rows = await advanceList(ADVANCE_PATHS.terminal);
    const codes = extractCodes(rows);
    if (codes.length > 0) return codes;
  } catch {
    // Ignore and use fallback.
  }
  return Array.from(new Set(fallback.map((v) => v.trim()).filter(Boolean)));
}

/** Pax shift — short shipped bag rows in MongoDB `reports-pax-shift-report` (`short_shipped_bags`). */
export type ShippedBagRowPayload = {
  id: string;
  optionSection: string;
  remarks: string;
};

export type ShippedBagsFlightSnapshot = {
  airline: string;
  flightNo: string;
  aircraft: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
};

export type ShippedBagsFlightPayload = {
  flightSerial: string;
  /** Non-negative integer stored in MongoDB. */
  noOfBags: number;
  rows: ShippedBagRowPayload[];
  flightSnapshot?: ShippedBagsFlightSnapshot;
};

function parseShippedBagRows(rowsRaw: unknown): ShippedBagRowPayload[] {
  const rows: ShippedBagRowPayload[] = [];
  if (!Array.isArray(rowsRaw)) return rows;
  for (const item of rowsRaw) {
    if (item && typeof item === 'object' && 'id' in item) {
      const r = item as Record<string, unknown>;
      rows.push({
        id: String(r.id),
        optionSection: String(r.optionSection ?? '').trim(),
        remarks: String(r.remarks ?? '').trim(),
      });
    }
  }
  return rows;
}

function parseShippedBagsNoOfBags(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.trunc(raw));
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseShippedBagsJson(
  data: unknown,
  fallbackFlightSerial = '',
): ShippedBagsFlightPayload {
  if (!data || typeof data !== 'object') {
    return { flightSerial: fallbackFlightSerial, noOfBags: 0, rows: [] };
  }
  const o = data as Record<string, unknown>;
  const nested = o.shortShippedBags;
  let noOfBags = parseShippedBagsNoOfBags(o.noOfBags);
  let rowsRaw: unknown = o.rows;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const bag = nested as Record<string, unknown>;
    noOfBags = parseShippedBagsNoOfBags(bag.noOfBags ?? noOfBags);
    rowsRaw = bag.rows ?? rowsRaw;
  }
  const snapRaw = o.flightSnapshot;
  let flightSnapshot: ShippedBagsFlightSnapshot | undefined;
  if (snapRaw && typeof snapRaw === 'object' && !Array.isArray(snapRaw)) {
    const s = snapRaw as Record<string, unknown>;
    flightSnapshot = {
      airline: String(s.airline ?? '').trim(),
      flightNo: String(s.flightNo ?? '').trim(),
      aircraft: String(s.aircraft ?? '').trim(),
      staDate: String(s.staDate ?? '').trim(),
      staTime: String(s.staTime ?? '').trim(),
      stdDate: String(s.stdDate ?? '').trim(),
      stdTime: String(s.stdTime ?? '').trim(),
    };
    const hasAny = Object.values(flightSnapshot).some((v) => v !== '');
    if (!hasAny) flightSnapshot = undefined;
  }

  return {
    flightSerial: String(o.flightSerial ?? fallbackFlightSerial).trim(),
    noOfBags,
    rows: parseShippedBagRows(rowsRaw),
    flightSnapshot,
  };
}

async function fetchShippedBagsLegacy(
  base: string,
  flightSerial: string,
): Promise<ShippedBagsFlightPayload> {
  const res = await fetch(
    `${base}/pax-shift/shipped-bags?flightSerial=${encodeURIComponent(flightSerial)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  return parseShippedBagsJson(data, flightSerial);
}

/** GET /pax-shift/operation-employees — MongoDB `operation_employees` (name + code). */
export type OperationEmployeeRow = {
  code: string;
  employeeName: string;
};

export async function fetchOperationEmployees(): Promise<OperationEmployeeRow[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/pax-shift/operation-employees`);
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((raw) => {
      const o = raw as Record<string, unknown>;
      return {
        code: String(o.code ?? '').trim(),
        employeeName: String(o.employeeName ?? '').trim(),
      };
    })
    .filter((e) => e.code.length > 0 || e.employeeName.length > 0);
}

export type PsrSickLeaveRowPayload = {
  id: string;
  employeeCode: string;
  employeeName: string;
};

export type PsrSickLeavePayload = {
  flightSerial: string;
  rows: PsrSickLeaveRowPayload[];
};

export type PsrEmployeeSectionRowPayload = {
  id: string;
  employeeCode: string;
  employeeName: string;
  trainingName?: string;
  trainingDate?: string;
};

export type PsrEmployeeSectionPayload = {
  flightSerial: string;
  section: string;
  rows: PsrEmployeeSectionRowPayload[];
};

export type PsrFlightDetailsPayload = {
  flightSerial: string;
  /** Count fields are `number`; text/times/dates are `string`. */
  data: Record<string, string | number>;
};

function parsePsrSickLeaveJson(raw: unknown): PsrSickLeavePayload {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rowsRaw = o.rows;
  const rows: PsrSickLeaveRowPayload[] = [];
  if (Array.isArray(rowsRaw)) {
    for (const item of rowsRaw) {
      if (item && typeof item === 'object' && 'id' in item) {
        const r = item as Record<string, unknown>;
        rows.push({
          id: String(r.id ?? '').trim(),
          employeeCode: String(r.employeeCode ?? '').trim(),
          employeeName: String(r.employeeName ?? '').trim(),
        });
      }
    }
  }
  return {
    flightSerial: String(o.flightSerial ?? '').trim(),
    rows,
  };
}

function parsePsrEmployeeSectionJson(
  raw: unknown,
  fallback: { flightSerial?: string; section?: string } = {},
): PsrEmployeeSectionPayload {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rowsRaw = o.rows;
  const rows: PsrEmployeeSectionRowPayload[] = [];
  if (Array.isArray(rowsRaw)) {
    for (const item of rowsRaw) {
      if (item && typeof item === 'object' && 'id' in item) {
        const r = item as Record<string, unknown>;
        rows.push({
          id: String(r.id ?? '').trim(),
          employeeCode: String(r.employeeCode ?? '').trim(),
          employeeName: String(r.employeeName ?? '').trim(),
          trainingName: String(r.trainingName ?? '').trim(),
          trainingDate: String(r.trainingDate ?? '').trim(),
        });
      }
    }
  }
  return {
    flightSerial: String(o.flightSerial ?? fallback.flightSerial ?? '').trim(),
    section: String(o.section ?? fallback.section ?? '').trim(),
    rows,
  };
}

function parseFlightDetailsData(raw: unknown): Record<string, string | number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') {
      const s = v.trim();
      if (s) out[k] = s;
    }
  }
  return out;
}

function parsePsrFlightDetailsJson(
  raw: unknown,
  fallbackFlightSerial = '',
): PsrFlightDetailsPayload {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    flightSerial: String(o.flightSerial ?? fallbackFlightSerial ?? '').trim(),
    data: parseFlightDetailsData(o.data),
  };
}

/** Parse `flightDetails` from unified `reports-pax-shift-report` flight_report GET/PUT. */
function parseFlightReportFlightDetails(
  raw: unknown,
  flightSerial: string,
): PsrFlightDetailsPayload {
  const o = (raw ?? {}) as Record<string, unknown>;
  const detailsRaw = o.flightDetails ?? o.data;
  return {
    flightSerial: String(o.flightSerial ?? flightSerial).trim(),
    data: parseFlightDetailsData(detailsRaw),
  };
}

function flightDetailsHasData(payload: PsrFlightDetailsPayload): boolean {
  return Object.keys(payload.data).some((k) => {
    const v = payload.data[k];
    if (typeof v === 'number') return Number.isFinite(v);
    return String(v ?? '').trim() !== '';
  });
}

async function fetchPsrFlightDetailsLegacy(
  base: string,
  flightSerial: string,
): Promise<PsrFlightDetailsPayload> {
  const res = await fetch(
    `${base}/pax-shift/psr-flight-details?flightSerial=${encodeURIComponent(flightSerial)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  return parsePsrFlightDetailsJson(data, flightSerial);
}

/** GET /pax-shift/psr-sick-leave?flightSerial= */
export async function fetchPsrSickLeaveByFlightSerial(
  flightSerial: string,
): Promise<PsrSickLeavePayload> {
  const base = getApiBase().replace(/\/$/, '');
  const fs = String(flightSerial ?? '').trim();
  const res = await fetch(
    `${base}/pax-shift/psr-sick-leave?flightSerial=${encodeURIComponent(fs)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  return parsePsrSickLeaveJson(data);
}

/** PUT /pax-shift/psr-sick-leave — upsert one document keyed by flight serial. */
export async function upsertPsrSickLeaveForFlight(
  flightSerial: string,
  rows: PsrSickLeaveRowPayload[],
): Promise<PsrSickLeavePayload> {
  const base = getApiBase().replace(/\/$/, '');
  const fs = String(flightSerial ?? '').trim();
  const res = await fetch(`${base}/pax-shift/psr-sick-leave`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flightSerial: fs,
      rows: rows ?? [],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const data: unknown = await res.json();
  return parsePsrSickLeaveJson(data);
}

function parseFlightReportSectionPayload(
  raw: unknown,
  flightSerial: string,
  section: string,
): PsrEmployeeSectionPayload {
  const o = (raw ?? {}) as Record<string, unknown>;
  const sections = o.sections;
  let rowsRaw: unknown = o.rows;
  if (sections && typeof sections === 'object' && !Array.isArray(sections)) {
    const block = (sections as Record<string, unknown>)[section];
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      rowsRaw = (block as Record<string, unknown>).rows;
    }
  }
  const rows: PsrEmployeeSectionRowPayload[] = [];
  if (Array.isArray(rowsRaw)) {
    for (const item of rowsRaw) {
      if (item && typeof item === 'object' && 'id' in item) {
        const r = item as Record<string, unknown>;
        rows.push({
          id: String(r.id ?? '').trim(),
          employeeCode: String(r.employeeCode ?? '').trim(),
          employeeName: String(r.employeeName ?? '').trim(),
          trainingName: String(r.trainingName ?? '').trim(),
          trainingDate: String(r.trainingDate ?? '').trim(),
        });
      }
    }
  }
  return {
    flightSerial: String(o.flightSerial ?? flightSerial).trim(),
    section: String(o.section ?? section).trim(),
    rows,
  };
}

async function fetchPsrEmployeeSectionLegacy(
  base: string,
  flightSerial: string,
  section: string,
): Promise<PsrEmployeeSectionPayload> {
  const res = await fetch(
    `${base}/pax-shift/psr-employee-sections?flightSerial=${encodeURIComponent(flightSerial)}&section=${encodeURIComponent(section)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  return parsePsrEmployeeSectionJson(data, { flightSerial, section });
}

/** GET unified flight report section from `reports-pax-shift-report` (falls back to legacy collection). */
export async function fetchPsrEmployeeSectionByFlightSerial(
  flightSerial: string,
  section: string,
): Promise<PsrEmployeeSectionPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const fs = String(flightSerial ?? '').trim();
  const sec = String(section ?? '').trim();
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/flight-report?flightSerial=${encodeURIComponent(fs)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  const parsed = parseFlightReportSectionPayload(data, fs, sec);
  if (parsed.rows.length > 0) return parsed;
  try {
    const legacy = await fetchPsrEmployeeSectionLegacy(base, fs, sec);
    if (legacy.rows.length > 0) return legacy;
  } catch {
    /* no legacy rows */
  }
  return parsed;
}

/** POST fetch batch flight reports */
export async function fetchBatchFlightReports(flightSerials: string[]): Promise<any> {
  if (flightSerials.length === 0) return {};
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(`${base}/pax-shift/reports-pax-shift-report/flight-reports-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flightSerials }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** PUT unified `reports-pax-shift-report` flight section (employee rows for Open sidebar). */
export async function upsertPsrEmployeeSectionForFlight(
  flightSerial: string,
  section: string,
  rows: PsrEmployeeSectionRowPayload[],
): Promise<PsrEmployeeSectionPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const fs = String(flightSerial ?? '').trim();
  const sec = String(section ?? '').trim();
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/flight-report/section`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flightSerial: fs,
        section: sec,
        rows: rows ?? [],
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const data: unknown = await res.json();
  return parseFlightReportSectionPayload(data, fs, sec);
}

/** POST /pax-shift/reports-pax-shift-report/flight-report/send-email — PDF attachment via SMTP. */
export async function sendPaxShiftReportEmail(payload: {
  flightSerial: string;
  airline?: string;
  flightNo?: string;
  emails: string[];
  pdfBase64: string;
  pdfFilename?: string;
  emailBody?: string;
}): Promise<{ sent: true; toEmails: string[] }> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/flight-report/send-email`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 300) || `Send email failed: ${res.status}`);
  }
  return res.json() as Promise<{ sent: true; toEmails: string[] }>;
}

/** GET unified flight report `flightDetails` from `reports-pax-shift-report` (falls back to legacy collection). */
export async function fetchPsrFlightDetailsByFlightSerial(
  flightSerial: string,
): Promise<PsrFlightDetailsPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const fs = String(flightSerial ?? '').trim();
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/flight-report?flightSerial=${encodeURIComponent(fs)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  const parsed = parseFlightReportFlightDetails(data, fs);
  if (flightDetailsHasData(parsed)) return parsed;
  try {
    const legacy = await fetchPsrFlightDetailsLegacy(base, fs);
    if (flightDetailsHasData(legacy)) return legacy;
  } catch {
    /* no legacy data */
  }
  return parsed;
}

/** PUT unified `reports-pax-shift-report` flight details (Open sidebar Flight Details form). */
export async function upsertPsrFlightDetailsForFlight(
  flightSerial: string,
  data: Record<string, unknown>,
  options?: { flightSnapshot?: Partial<ShippedBagsFlightSnapshot> },
): Promise<PsrFlightDetailsPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const fs = String(flightSerial ?? '').trim();
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/flight-report/flight-details`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flightSerial: fs,
        data: data ?? {},
        ...(options?.flightSnapshot ? { flightSnapshot: options.flightSnapshot } : {}),
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const raw: unknown = await res.json();
  return parseFlightReportFlightDetails(raw, fs);
}

/** GET `reports-pax-shift-report` — all `short_shipped_bags` documents (newest first). */
export async function fetchAllShippedBags(): Promise<ShippedBagsFlightPayload[]> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/short-shipped-bags/all`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((item) => parseShippedBagsJson(item));
}

/** GET `reports-pax-shift-report` short shipped bags for one flight serial. */
export async function fetchShippedBagsByFlightSerial(
  flightSerial: string,
): Promise<ShippedBagsFlightPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const fs = String(flightSerial ?? '').trim();
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/short-shipped-bags?flightSerial=${encodeURIComponent(fs)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text?.slice(0, 200) || `${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  const parsed = parseShippedBagsJson(data, fs);
  if (parsed.rows.length > 0 || parsed.noOfBags > 0) return parsed;
  try {
    const legacy = await fetchShippedBagsLegacy(base, fs);
    if (legacy.rows.length > 0 || legacy.noOfBags > 0) return legacy;
  } catch {
    /* no legacy data */
  }
  return parsed;
}

/** PUT `reports-pax-shift-report` — upsert short shipped bags for one flight serial. */
export async function upsertShippedBagsForFlight(
  flightSerial: string,
  payload: {
    noOfBags?: string | number;
    rows: ShippedBagRowPayload[];
    flightSnapshot?: Partial<ShippedBagsFlightSnapshot>;
  },
): Promise<ShippedBagsFlightPayload> {
  const base = getApiBase().replace(/\/$/, '');
  const fs = String(flightSerial ?? '').trim();
  const bagCount =
    typeof payload.noOfBags === 'number'
      ? Math.max(0, Math.trunc(payload.noOfBags))
      : parseShippedBagsNoOfBags(payload.noOfBags);
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/short-shipped-bags`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flightSerial: fs,
        ...(bagCount > 0 ? { noOfBags: bagCount } : {}),
        rows: payload.rows ?? [],
        ...(payload.flightSnapshot ? { flightSnapshot: payload.flightSnapshot } : {}),
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const data: unknown = await res.json();
  return parseShippedBagsJson(data, fs);
}

/** POST `reports-pax-shift-report` — batch GET by flight serials. */
export async function fetchShippedBagsMapForSerials(
  flightSerials: string[],
): Promise<Record<string, ShippedBagsFlightPayload>> {
  const base = getApiBase().replace(/\/$/, '');
  const cleaned = [...new Set(flightSerials.map((s) => String(s ?? '').trim()).filter(Boolean))];
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/short-shipped-bags/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flightSerials: cleaned }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const data = await res.json();
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, ShippedBagsFlightPayload> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const key = String(k).trim();
    if (!key) continue;
    const parsed = parseShippedBagsJson(v, key);
    out[key] = {
      ...parsed,
      flightSerial: parsed.flightSerial || key,
    };
  }
  return out;
}

/** Pax duty allocation — singleton in MongoDB `reports-pax-shift-report` (`dutyAllocationEntries`). */
export type PaxDutyStaffAssignmentPayload = {
  staff: string;
  employeeCode: string;
  employeeName: string;
  dutyAllocations: string[];
};

export type PaxDutyAllocationPayload = {
  date: string;
  shift: string;
  flight: string;
  flightNo: string;
  staffAssignments: PaxDutyStaffAssignmentPayload[];
};

function parseErrorMessage(res: Response, text: string): string {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = JSON.parse(text) as { message?: string | string[] };
    if (j.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
  } catch {
    if (text) msg = text.slice(0, 200);
  }
  return msg;
}

export async function createPaxDutyAllocation(payload: PaxDutyAllocationPayload): Promise<unknown> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/duty-allocation`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(parseErrorMessage(res, await res.text()));
  return res.json();
}

export async function listPaxDutyAllocations(fromYmd: string, toYmd: string): Promise<unknown[]> {
  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}/pax-shift/reports-pax-shift-report/duty-allocation?from=${encodeURIComponent(fromYmd)}&to=${encodeURIComponent(toYmd)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(parseErrorMessage(res, await res.text()));
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getPaxDutyAllocation(id: string): Promise<unknown> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/duty-allocation/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(parseErrorMessage(res, await res.text()));
  return res.json();
}

export async function updatePaxDutyAllocation(
  id: string,
  payload: PaxDutyAllocationPayload,
): Promise<unknown> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/duty-allocation/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(parseErrorMessage(res, await res.text()));
  return res.json();
}

export async function deletePaxDutyAllocation(id: string): Promise<void> {
  const base = getApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${base}/pax-shift/reports-pax-shift-report/duty-allocation/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(parseErrorMessage(res, await res.text()));
}