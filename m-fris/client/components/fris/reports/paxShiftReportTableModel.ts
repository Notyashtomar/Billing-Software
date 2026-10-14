import type { PsrEmployeeSectionRowPayload } from '@/lib/api';
import type { FlightData } from '@/utils/dataProcessor';
import { PAX_SHIFT_EMPLOYEE_SECTIONS, type PaxShiftReportGathered } from '@/components/fris/reports/paxShiftReportData';

/** Leave / absence rows under "Staff rostered/Duty". */
export const PAX_SHIFT_ROSTER_LEAVE_ROWS: { storageSectionId: string; detailLabel: string }[] = [
  { storageSectionId: 'sick-leave', detailLabel: 'Sick leave' },
  { storageSectionId: 'casual-leave', detailLabel: 'Casual leave' },
  { storageSectionId: 'comp-off', detailLabel: 'Comp off' },
  { storageSectionId: 'annual-leave', detailLabel: 'Annual Leave' },
  { storageSectionId: 'absence', detailLabel: 'Absent' },
];

/** Role rows under "Staff Details". */
export const PAX_SHIFT_STAFF_DETAIL_ROWS: { storageSectionId: string; detailLabel: string }[] = [
  { storageSectionId: 'chk-in-staff-d', detailLabel: 'Chk in staff-D' },
  { storageSectionId: 'chk-in-staff-n', detailLabel: 'Chk-in staff-N' },
  { storageSectionId: 'csh-in-staff-d', detailLabel: 'CSH staff-D' },
  { storageSectionId: 'csh-in-staff-n', detailLabel: 'CSH staff-N' },
  { storageSectionId: 'mhb-staff-d', detailLabel: 'MHB staff-D' },
  { storageSectionId: 'mhb-staff-n', detailLabel: 'MHB Staff-N' },
];

export function rowsForStorageSection(
  gathered: PaxShiftReportGathered,
  storageSectionId: string,
): PsrEmployeeSectionRowPayload[] {
  const def = PAX_SHIFT_EMPLOYEE_SECTIONS.find((d) => d.storageSectionId === storageSectionId);
  if (!def) return [];
  const sec = gathered.employeeSections.find((s) => s.label === def.label);
  return sec?.rows ?? [];
}

export function formatStaffNamesAlphabetical(rows: PsrEmployeeSectionRowPayload[]): string {
  const names = rows.map((r) => String(r.employeeName ?? '').trim()).filter(Boolean);
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return names.length ? names.join(', ') : '—';
}

export function staffCount(rows: PsrEmployeeSectionRowPayload[]): string {
  const n = rows.filter((r) => String(r.employeeName ?? '').trim() || String(r.employeeCode ?? '').trim()).length;
  return String(n);
}

/** Flight handling snapshot: read known keys with simple case-insensitive fallback. */
export function flightHandlingField(
  fh: Record<string, string | number> | null | undefined,
  ...keys: string[]
): string {
  if (!fh) return '';
  for (const k of keys) {
    const raw = fh[k];
    if (raw == null) continue;
    const v = typeof raw === 'number' ? String(raw) : String(raw).trim();
    if (v) return v;
  }
  const entries = Object.entries(fh);
  for (const want of keys) {
    const wl = want.toLowerCase();
    const hit = entries.find(([k]) => k.toLowerCase() === wl);
    if (hit) {
      const raw = hit[1];
      const v = typeof raw === 'number' ? String(raw) : String(raw).trim();
      if (v) return v;
    }
  }
  return '';
}

/** Report date: saved flight date first, then STA, then STD. */
export function paxShiftReportFlightDate(
  flight: FlightData,
  fh: Record<string, string | number> | null | undefined,
): string {
  const fromFh = flightHandlingField(fh, 'flightDate');
  if (fromFh) return fromFh;
  return String(flight.staDate ?? '').trim() || String(flight.stdDate ?? '').trim() || '—';
}

/**
 * Flight lock display (business rules TBD). Interim: surface schedule pax lock when present.
 */
export function paxShiftReportFlightLockDisplay(flight: FlightData): string {
  const p = String(flight.paxLocked ?? '').trim();
  if (p) return p;
  return '—';
}

export type PaxShiftThreeColumnRow = { detail: string; count: string; names: string };

export function buildSupTlOnDutyRow(gathered: PaxShiftReportGathered): PaxShiftThreeColumnRow {
  const rows = rowsForStorageSection(gathered, 'staff-on-duty');
  return {
    detail: 'SUP / TL on duty',
    count: staffCount(rows),
    names: formatStaffNamesAlphabetical(rows),
  };
}

export function buildRosterLeaveTableBody(gathered: PaxShiftReportGathered): PaxShiftThreeColumnRow[] {
  return PAX_SHIFT_ROSTER_LEAVE_ROWS.map(({ storageSectionId, detailLabel }) => {
    const rows = rowsForStorageSection(gathered, storageSectionId);
    return {
      detail: detailLabel,
      count: staffCount(rows),
      names: formatStaffNamesAlphabetical(rows),
    };
  });
}

export function buildStaffDetailsTableBody(gathered: PaxShiftReportGathered): PaxShiftThreeColumnRow[] {
  return PAX_SHIFT_STAFF_DETAIL_ROWS.map(({ storageSectionId, detailLabel }) => {
    const rows = rowsForStorageSection(gathered, storageSectionId);
    return {
      detail: detailLabel,
      count: staffCount(rows),
      names: formatStaffNamesAlphabetical(rows),
    };
  });
}
