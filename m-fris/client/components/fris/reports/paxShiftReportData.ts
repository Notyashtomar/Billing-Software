import {
  fetchPsrEmployeeSectionByFlightSerial,
  fetchPsrFlightDetailsByFlightSerial,
  fetchShippedBagsByFlightSerial,
  fetchBatchFlightReports,
  type PsrEmployeeSectionRowPayload,
} from '@/lib/api';
import { noOfBagsForDisplay } from '@/lib/paxShiftFieldCoercion';
import type { FlightHandlingFieldMap } from '@/components/fris/reports/paxShiftReportFlightDetailsLayout';
import { paxShiftFlightHandlingStorageKey } from '@/components/fris/reports/paxShiftReportStorageKeys';

export type PaxShiftEmployeeSectionDef = {
  label: string;
  apiSection: string;
  storageSectionId: string;
};

/** Same section keys as `PaxShiftOpenSidebar` → `toPsrSectionKey`, with human labels. */
export const PAX_SHIFT_EMPLOYEE_SECTIONS: PaxShiftEmployeeSectionDef[] = [
  { label: 'Staff on duty (SUP/TL)', apiSection: 'psr-staff-on-duty', storageSectionId: 'staff-on-duty' },
  { label: 'Sick Leave', apiSection: 'psr-sick-leave', storageSectionId: 'sick-leave' },
  { label: 'Casual Leave', apiSection: 'psr-casual-leave', storageSectionId: 'casual-leave' },
  { label: 'Comp off', apiSection: 'psr-comp-off', storageSectionId: 'comp-off' },
  { label: 'Annual leave', apiSection: 'psr-annual-leave', storageSectionId: 'annual-leave' },
  { label: 'Absence', apiSection: 'psr-absence', storageSectionId: 'absence' },
  { label: 'CHK-in-staff-D', apiSection: 'psr-chk-in-staff-d', storageSectionId: 'chk-in-staff-d' },
  { label: 'CHK-in-staff-N', apiSection: 'psr-chk-in-staff-n', storageSectionId: 'chk-in-staff-n' },
  { label: 'CSH-in-staff-D', apiSection: 'psr-csh-in-staff-d', storageSectionId: 'csh-in-staff-d' },
  { label: 'CSH-in-staff-N', apiSection: 'psr-csh-in-staff-n', storageSectionId: 'csh-in-staff-n' },
  { label: 'MHB staff-D', apiSection: 'psr-mhb-staff-d', storageSectionId: 'mhb-staff-d' },
  { label: 'MHB staff-N', apiSection: 'psr-mhb-staff-n', storageSectionId: 'mhb-staff-n' },
];

function employeeSectionSessionKey(flightSerial: string, storageSectionId: string): string {
  const serial = String(flightSerial ?? '').trim() || 'unknown';
  return `fris-pax-shift-emp-${serial}-${storageSectionId}`;
}

function shortShippedSessionKey(flightSerial: string): string {
  const serial = String(flightSerial ?? '').trim() || 'unknown';
  return `fris-pax-shift-ssb-${serial}`;
}

function readSessionJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseEmployeeRowsFromSession(raw: unknown): PsrEmployeeSectionRowPayload[] {
  if (!Array.isArray(raw)) return [];
  const out: PsrEmployeeSectionRowPayload[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && 'id' in item) {
      const o = item as Record<string, unknown>;
      out.push({
        id: String(o.id ?? '').trim(),
        employeeCode: String(o.employeeCode ?? '').trim(),
        employeeName: String(o.employeeName ?? '').trim(),
        trainingName: String(o.trainingName ?? '').trim(),
        trainingDate: String(o.trainingDate ?? '').trim(),
      });
    }
  }
  return out;
}

export async function loadEmployeeSectionRowsForReport(
  flightSerial: string,
  def: PaxShiftEmployeeSectionDef,
): Promise<PsrEmployeeSectionRowPayload[]> {
  const fs = String(flightSerial ?? '').trim();
  if (!fs) return [];
  try {
    const data = await fetchPsrEmployeeSectionByFlightSerial(fs, def.apiSection);
    const fromApi = (data.rows ?? []).map((r) => ({
      id: String(r.id ?? '').trim(),
      employeeCode: String(r.employeeCode ?? '').trim(),
      employeeName: String(r.employeeName ?? '').trim(),
      trainingName: String(r.trainingName ?? '').trim(),
      trainingDate: String(r.trainingDate ?? '').trim(),
    }));
    if (fromApi.length > 0) return fromApi;
  } catch {
    /* session */
  }
  const local = readSessionJson<unknown>(employeeSectionSessionKey(fs, def.storageSectionId));
  return parseEmployeeRowsFromSession(local);
}

export type PaxShiftShippedBagRow = { id: string; optionSection: string; remarks: string };

export async function loadShortShippedBagsForReport(
  flightSerial: string,
): Promise<{ noOfBags: string; rows: PaxShiftShippedBagRow[] }> {
  const fs = String(flightSerial ?? '').trim();
  if (!fs) return { noOfBags: '', rows: [] };
  try {
    const data = await fetchShippedBagsByFlightSerial(fs);
    const rows = (data.rows ?? []).map((r) => ({
      id: String(r.id),
      optionSection: String(r.optionSection ?? '').trim(),
      remarks: String(r.remarks ?? '').trim(),
    }));
    if (rows.length > 0 || (data.noOfBags ?? 0) > 0) {
      return { noOfBags: noOfBagsForDisplay(data.noOfBags), rows };
    }
  } catch {
    /* session */
  }
  const raw = readSessionJson<{ noOfBags?: string; rows?: unknown }>(shortShippedSessionKey(fs));
  const rows: PaxShiftShippedBagRow[] = [];
  if (raw && Array.isArray(raw.rows)) {
    for (const item of raw.rows) {
      if (item && typeof item === 'object' && 'id' in item) {
        const o = item as Record<string, unknown>;
        rows.push({
          id: String(o.id),
          optionSection: String(o.optionSection ?? '').trim(),
          remarks: String(o.remarks ?? '').trim(),
        });
      }
    }
  }
  return { noOfBags: String(raw?.noOfBags ?? '').replace(/\D/g, ''), rows };
}

export function readFlightHandlingSnapshotForReport(flightSerial: string): FlightHandlingFieldMap {
  const key = paxShiftFlightHandlingStorageKey(flightSerial);
  const raw = readSessionJson<unknown>(key);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') {
      const s = v.trim();
      if (s) out[k] = s;
    } else if (typeof v === 'boolean') out[k] = v ? '1' : '0';
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function loadFlightHandlingForReport(
  flightSerial: string,
): Promise<FlightHandlingFieldMap> {
  const fs = String(flightSerial ?? '').trim();
  if (!fs) return null;
  try {
    const payload = await fetchPsrFlightDetailsByFlightSerial(fs);
    const data = payload.data ?? {};
    if (Object.keys(data).length > 0) return data;
  } catch {
    /* session fallback */
  }
  return readFlightHandlingSnapshotForReport(fs);
}

export type PaxShiftReportGathered = {
  employeeSections: { label: string; rows: PsrEmployeeSectionRowPayload[] }[];
  shortShipped: { noOfBags: string; rows: PaxShiftShippedBagRow[] };
  flightHandling: FlightHandlingFieldMap;
};

export async function gatherPaxShiftReportData(flightSerial: string): Promise<PaxShiftReportGathered> {
  const fs = String(flightSerial ?? '').trim();
  const employeeSections = await Promise.all(
    PAX_SHIFT_EMPLOYEE_SECTIONS.map(async (def) => ({
      label: def.label,
      rows: await loadEmployeeSectionRowsForReport(fs, def),
    })),
  );
  const shortShipped = await loadShortShippedBagsForReport(fs);
  const flightHandling = await loadFlightHandlingForReport(fs);
  return { employeeSections, shortShipped, flightHandling };
}

export async function gatherPaxShiftReportDataBatch(
  flightSerials: string[],
): Promise<Record<string, PaxShiftReportGathered>> {
  const serials = [...new Set(flightSerials.map((s) => String(s ?? '').trim()).filter(Boolean))];
  if (serials.length === 0) return {};

  let apiData: Record<string, any> = {};
  try {
    apiData = await fetchBatchFlightReports(serials);
  } catch (err) {
    console.error('Failed to fetch batch flight reports:', err);
    // fallback to single fetching below or just return empty?
    // In this optimized path, if batch fails, we can fall back to sequential gathering for robustness
    const out: Record<string, PaxShiftReportGathered> = {};
    for (const fs of serials) {
      out[fs] = await gatherPaxShiftReportData(fs);
    }
    return out;
  }

  const out: Record<string, PaxShiftReportGathered> = {};
  for (const fs of serials) {
    const data = apiData[fs] || {};
    const report = data.flightReport || {};
    const sections = report.sections || {};
    const flightDetails = report.flightDetails || {};
    const shortShippedBags = data.shortShippedBags?.shortShippedBags || {};

    const employeeSections = PAX_SHIFT_EMPLOYEE_SECTIONS.map((def) => {
      let rows: PsrEmployeeSectionRowPayload[] = [];
      const sectionData = sections[def.apiSection];
      if (sectionData && Array.isArray(sectionData.rows)) {
        rows = sectionData.rows.map((r: any) => ({
          id: String(r.id ?? '').trim(),
          employeeCode: String(r.employeeCode ?? '').trim(),
          employeeName: String(r.employeeName ?? '').trim(),
          trainingName: String(r.trainingName ?? '').trim(),
          trainingDate: String(r.trainingDate ?? '').trim(),
        }));
      }
      if (rows.length === 0) {
        // Fallback to session
        rows = parseEmployeeRowsFromSession(readSessionJson(employeeSectionSessionKey(fs, def.storageSectionId)));
      }
      return { label: def.label, rows };
    });

    let shortShippedRows: PaxShiftShippedBagRow[] = [];
    let noOfBags = shortShippedBags.noOfBags;
    if (Array.isArray(shortShippedBags.rows)) {
      shortShippedRows = shortShippedBags.rows.map((r: any) => ({
        id: String(r.id),
        optionSection: String(r.optionSection ?? '').trim(),
        remarks: String(r.remarks ?? '').trim(),
      }));
    }
    if (shortShippedRows.length === 0 && !noOfBags) {
      // Fallback to session
      const raw = readSessionJson<{ noOfBags?: string; rows?: unknown }>(shortShippedSessionKey(fs));
      if (raw && Array.isArray(raw.rows)) {
        for (const item of raw.rows) {
          if (item && typeof item === 'object' && 'id' in item) {
            const o = item as Record<string, unknown>;
            shortShippedRows.push({
              id: String(o.id),
              optionSection: String(o.optionSection ?? '').trim(),
              remarks: String(o.remarks ?? '').trim(),
            });
          }
        }
      }
      noOfBags = String(raw?.noOfBags ?? '').replace(/\D/g, '');
    }

    let flightHandling = Object.keys(flightDetails).length > 0 ? flightDetails : null;
    if (!flightHandling) {
      flightHandling = readFlightHandlingSnapshotForReport(fs);
    }

    out[fs] = {
      employeeSections,
      shortShipped: {
        noOfBags: noOfBags ? noOfBagsForDisplay(noOfBags) : '',
        rows: shortShippedRows,
      },
      flightHandling: flightHandling || {},
    };
  }

  return out;
}
