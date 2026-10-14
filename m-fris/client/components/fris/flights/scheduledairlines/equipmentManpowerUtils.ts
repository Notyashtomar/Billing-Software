import type { EquipmentEntry } from './fhrEquipmentDetailsMapping';
import { splitEquipmentDateTimeForDisplay } from './reportPdfUtils';

/** Manpower table row (designation with place: Terminal, Ramp, or GSE). */
export interface ManpowerEntryForPdf {
  employeeName: string;
  employeeId?: string;
  designation?: string;
  place?: 'terminal' | 'ramp' | 'gse';
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  /**
   * Number of staff on the line when the source is a headcount row rather than a
   * named employee (spreadsheet-seeded rows record e.g. `"09:30 13staffs"`).
   */
  headcount?: number;
  /** Free-text placement left on a headcount row, e.g. `BMA`, `COUNTERS`. */
  note?: string;
  /** Pre-computed engaged time from the source row (`usage_time`). */
  engagedTime?: string;
}

const DESIGNATION_TO_ABBREV: Record<string, string> = {
  'account admin hr &': 'AHR',
  'account admin hr': 'AHR',
  'airport manager': 'AM',
  'asstt team leader': 'ATL',
  'asstt. team leader': 'ATL',
  'asstt duty manager': 'ADM',
  'asstt. duty manager': 'ADM',
  'chief security officer': 'CSO',
  csa: 'CSA',
  csh: 'CSH',
  'customer service host': 'CSH',
  'customer service agent': 'CSA',
  'duty manager': 'DM',
  marshaller: 'MR',
  loader: 'LD',
  'office assistant': 'OA',
  operator: 'OP',
  'sr csa': 'SCSA',
  'sr. csa': 'SCSA',
  'sr customer service agent': 'SCSA',
  'sr. customer service agent': 'SCSA',
  supervisor: 'SVP',
  'team leader': 'TL',
  technician: 'TCH',
};

/**
 * Staff codes that appear as a line label (rather than a designation on a named
 * employee) on spreadsheet-seeded rows. Complements {@link DESIGNATION_TO_ABBREV},
 * which is keyed by full titles.
 */
const STAFF_LINE_CODES = new Set([
  'adm',
  'ahr',
  'am',
  'atl',
  'csa',
  'csh',
  'cso',
  'dm',
  'do',
  'ld',
  'mr',
  'oa',
  'scsa',
  'sr csa',
  'sup',
  'svp',
  'tch',
  'tl',
  'uh',
]);

function normalizeDesignationKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s*-\s*(t|uh|gse)\s*$/i, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a label names a staff role — either a full designation title or one of
 * the short codes used on headcount lines (`CSA`, `Sup`, `UH`, …).
 */
export function isStaffDesignationLabel(label?: string): boolean {
  const key = normalizeDesignationKey(String(label ?? ''));
  if (!key) return false;
  if (STAFF_LINE_CODES.has(key)) return true;
  if (DESIGNATION_TO_ABBREV[key]) return true;
  return Object.values(DESIGNATION_TO_ABBREV).some(
    (abbr) => abbr.toLowerCase() === key,
  );
}

export function getDesignationAbbreviation(designation?: string): string {
  if (!designation?.trim()) return '';
  const key = normalizeDesignationKey(designation);
  if (DESIGNATION_TO_ABBREV[key]) return DESIGNATION_TO_ABBREV[key];
  const withDots = designation
    .trim()
    .toLowerCase()
    .replace(/\s*-\s*(t|uh|gse)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (DESIGNATION_TO_ABBREV[withDots]) return DESIGNATION_TO_ABBREV[withDots];
  return designation.trim();
}

const EQ_PREFIX = 'EQ:';
const MP_PREFIX = 'MP:';
const ENC_SEP = '|';

/** Parse equipment-manpower API entries into equipment and manpower rows. */
export function parseEquipmentManpowerFromApi(
  rawEntries: {
    name?: string;
    entryType?: string;
    equipmentName?: string;
    equipmentSerialNo?: string;
    employeeName?: string;
    employeeId?: string;
    designation?: string;
    place?: string;
    fromDate?: string;
    fromTime?: string;
    toDate?: string;
    toTime?: string;
    remarks?: string;
  }[],
): { equipment: EquipmentEntry[]; manpower: ManpowerEntryForPdf[] } {
  const equipment: EquipmentEntry[] = [];
  const manpower: ManpowerEntryForPdf[] = [];
  (rawEntries || []).forEach((entry) => {
    const from = splitEquipmentDateTimeForDisplay(entry.fromDate, entry.fromTime);
    const to = splitEquipmentDateTimeForDisplay(entry.toDate, entry.toTime);
    const n = (entry.name || '').trim();
    const type = (entry.entryType || '').trim().toLowerCase();
    const eqParts = n.startsWith(EQ_PREFIX) ? n.slice(EQ_PREFIX.length).split(ENC_SEP) : [];
    const mpParts = n.startsWith(MP_PREFIX) ? n.slice(MP_PREFIX.length).split(ENC_SEP) : [];
    const isEquipment = type === 'equipment' || (!type && n.startsWith(EQ_PREFIX));
    const isManpower = type === 'manpower' || (!type && n.startsWith(MP_PREFIX));
    const freeRemarks = (() => {
      const s = String(entry.remarks ?? '').trim();
      if (
        !s ||
        s === '–' ||
        s === '-' ||
        /^\d{1,2}:\d{2}$/.test(s) ||
        /^[+-]?(?:\d+\.\d+|\.\d+)$/.test(s)
      ) {
        return undefined;
      }
      return s;
    })();
    if (isEquipment) {
      equipment.push({
        equipmentName: entry.equipmentName ?? eqParts[0] ?? '',
        equipmentId: entry.equipmentSerialNo ?? eqParts[1] ?? '',
        employeeName: entry.employeeName ?? eqParts[2] ?? '',
        employeeId: entry.employeeId ?? eqParts[3] ?? '',
        designation: entry.designation || eqParts[4] || '',
        fromDate: from.date,
        fromTime: from.time,
        toDate: to.date,
        toTime: to.time,
        storedRemarks: freeRemarks,
      });
    } else if (isManpower) {
      const place = (entry.place ?? mpParts[3] ?? '').trim().toLowerCase();
      manpower.push({
        employeeName: entry.employeeName ?? mpParts[0] ?? '',
        employeeId: entry.employeeId ?? mpParts[1] ?? '',
        designation: entry.designation ?? mpParts[2] ?? '',
        place:
          place === 'ramp' ? 'ramp' : place === 'gse' ? 'gse' : 'terminal',
        fromDate: from.date,
        fromTime: from.time,
        toDate: to.date,
        toTime: to.time,
      });
    } else if (n) {
      equipment.push({
        equipmentName: n,
        equipmentId: '',
        employeeName: '',
        employeeId: '',
        designation: '',
        fromDate: from.date,
        fromTime: from.time,
        toDate: to.date,
        toTime: to.time,
        storedRemarks: freeRemarks,
      });
    }
  });
  return { equipment, manpower };
}
