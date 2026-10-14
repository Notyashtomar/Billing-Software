import {
  advanceCreate,
  advanceDelete,
  advanceDocId,
  advanceList,
  advanceUpdate,
} from '@/lib/api';
import { getApiBase } from '@/lib/getApiBase';
import { readResponseJson } from '@/lib/session-fetch';
import type { NewStationFormInput, StationRecord } from '@/lib/stationAnalyticsMock';

export const ADMIN_STATIONS_PATH = 'admin-stations';

export function resolveStationTerminals(station: {
  terminals?: string[] | null;
  zone?: string | null;
}): string[] {
  if (Array.isArray(station.terminals) && station.terminals.length > 0) {
    return station.terminals.map((t) => String(t).trim()).filter(Boolean);
  }
  return String(station.zone ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function mapStationRecord(doc: unknown): StationRecord {
  const normalized = advanceDocId(doc as Record<string, unknown>);
  const terminals = resolveStationTerminals({
    terminals: Array.isArray(normalized.terminals)
      ? normalized.terminals.map((t) => String(t))
      : undefined,
    zone: normalized.zone != null ? String(normalized.zone) : undefined,
  });

  return {
    id: normalized.id,
    name: String(normalized.name ?? '').trim(),
    code: String(normalized.code ?? '').trim(),
    stationCode: normalized.stationCode
      ? String(normalized.stationCode).trim().toUpperCase()
      : undefined,
    company: String(normalized.company ?? '').trim(),
    region: normalized.region as StationRecord['region'],
    city: String(normalized.city ?? '').trim(),
    state: normalized.state ? String(normalized.state).trim() : undefined,
    street: normalized.street ? String(normalized.street).trim() : undefined,
    addressCity: normalized.addressCity
      ? String(normalized.addressCity).trim()
      : undefined,
    country: normalized.country ? String(normalized.country).trim() : undefined,
    pincode: normalized.pincode ? String(normalized.pincode).trim() : undefined,
    gstNumber: normalized.gstNumber
      ? String(normalized.gstNumber).trim().toUpperCase()
      : undefined,
    zone: String(normalized.zone ?? ''),
    terminals,
    photoUrl: normalized.photoUrl ? String(normalized.photoUrl) : undefined,
    departmentCount:
      normalized.departmentCount != null
        ? Number(normalized.departmentCount)
        : 0,
    type: (normalized.type as StationRecord['type']) ?? 'Airport',
    manager: String(normalized.manager ?? ''),
    capacity: Number(normalized.capacity ?? 0),
    status: (normalized.status as StationRecord['status']) ?? 'Active',
    notes: normalized.notes ? String(normalized.notes) : undefined,
    permissions: normalized.permissions as StationRecord['permissions'],
    dailyOps: Number(normalized.dailyOps ?? 0),
    activeStaff: Number(normalized.activeStaff ?? 0),
    efficiencyPct: Number(normalized.efficiencyPct ?? 0),
    delayedOps: Number(normalized.delayedOps ?? 0),
    weeklyPerf: Array.isArray(normalized.weeklyPerf)
      ? normalized.weeklyPerf.map((v) => Number(v))
      : [],
    throughputMonth: Array.isArray(normalized.throughputMonth)
      ? normalized.throughputMonth.map((v) => Number(v))
      : [],
    insight: String(normalized.insight ?? ''),
    updatedAt:
      typeof normalized.updatedAt === 'string'
        ? normalized.updatedAt
        : normalized.updatedAt instanceof Date
          ? normalized.updatedAt.toISOString()
          : new Date().toISOString(),
  };
}

export function stationFormToPayload(form: NewStationFormInput): Record<string, unknown> {
  const terminals = (form.terminals ?? []).map((t) => t.trim()).filter(Boolean);
  const zone =
    terminals.length > 0 ? terminals.join(', ') : form.zone.trim() || 'Terminal 1';

  return {
    name: form.name.trim(),
    code: form.code.trim(),
    company: form.company.trim(),
    region: form.region,
    city: form.city.trim(),
    state: form.state?.trim() || undefined,
    street: form.street?.trim() || undefined,
    addressCity: form.addressCity?.trim() || undefined,
    country: form.country?.trim() || undefined,
    pincode: form.pincode?.trim() || undefined,
    gstNumber: form.gstNumber?.trim() || undefined,
    zone,
    terminals: terminals.length > 0 ? terminals : undefined,
    photoUrl: form.photoUrl?.trim() || undefined,
    type: form.type,
    manager: form.manager.trim(),
    capacity: form.capacity,
    status: form.status,
    notes: form.notes?.trim() ?? '',
    activeStaff: form.activeStaff,
    departmentCount: form.departmentCount,
    permissions: form.permissions ?? { accessTabs: [], accessSubPages: {} },
  };
}

export async function fetchLoginStationOptions(): Promise<StationRecord[]> {
  const res = await fetch(`${getApiBase()}/admin-stations/login-options`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to load stations: ${res.status}`);
  }
  const data = await readResponseJson<unknown>(res);
  if (data == null) {
    throw new Error('Failed to load stations: empty response from server');
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapStationRecord(row));
}

export async function fetchAdminStations(filter?: string): Promise<StationRecord[]> {
  const rows = await advanceList(ADMIN_STATIONS_PATH, filter ? { filter } : undefined);
  const stations: StationRecord[] = [];
  for (const row of rows) {
    try {
      stations.push(mapStationRecord(row));
    } catch {
      // Skip malformed station rows instead of failing the whole list.
    }
  }
  return stations;
}

export async function createAdminStation(
  form: NewStationFormInput,
): Promise<StationRecord> {
  const created = await advanceCreate(ADMIN_STATIONS_PATH, stationFormToPayload(form));
  return mapStationRecord(created);
}

export async function updateAdminStation(
  id: string,
  form: NewStationFormInput,
): Promise<StationRecord> {
  const updated = await advanceUpdate(ADMIN_STATIONS_PATH, id, stationFormToPayload(form));
  return mapStationRecord(updated);
}

export async function deleteAdminStation(id: string): Promise<void> {
  await advanceDelete(ADMIN_STATIONS_PATH, id);
}
