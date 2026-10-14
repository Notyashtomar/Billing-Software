/**
 * Split `fhr_collection.equipmentDetails[]` into ground support equipment (GSE) and
 * manpower.
 *
 * Spreadsheet-seeded stations record both kinds of line in the same array: a GSE line
 * carries an equipment code (`EBT`, `PBNB`, `LDL`, …) while a manpower line carries a
 * staff code (`CSA`, `CSH`, `Sup`, `UH`, …) and a headcount in its remarks
 * (`"09:30 13staffs"`). Reports must show the two in separate tables, so the split has
 * to happen at read time.
 */

import type { EquipmentEntry } from './fhrEquipmentDetailsMapping';
import {
  isStaffDesignationLabel,
  type ManpowerEntryForPdf,
} from './equipmentManpowerUtils';
import { isManpowerUnitType, resolveUnitTypeFromCatalog } from './gseCatalogLookup';

/** `"03:30 03staffs BMA"` → `{ headcount: 3, note: 'BMA' }`. */
export function parseStaffHeadcountRemarks(remarks?: string): {
  headcount: number | null;
  note: string;
} {
  const raw = String(remarks ?? '').trim();
  if (!raw) return { headcount: null, note: '' };
  const match = /(\d{1,3})\s*staffs?\b/i.exec(raw);
  if (!match) return { headcount: null, note: '' };
  const headcount = Number(match[1]);
  const note = raw
    .replace(match[0], ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    headcount: Number.isFinite(headcount) && headcount > 0 ? headcount : null,
    note,
  };
}

/** Line label used for classification — the raw FHR code, before catalog name resolution. */
function lineCode(entry: EquipmentEntry): string {
  return String(entry.equipmentId ?? entry.equipmentName ?? '').trim();
}

/**
 * Manpower when the catalog flags the code as manpower, or the code names a staff role,
 * or `staffCodes` saw a headcount on that code. A code the station's catalog knows as
 * equipment is always GSE, so `TS` (Toilet service) or `C` (Cones) can never be misread
 * as staff.
 */
export function isManpowerEquipmentLine(
  entry: EquipmentEntry,
  unitTypeLookup: Map<string, string>,
  equipmentCodes: Set<string>,
  staffCodes: Set<string> = new Set(),
): boolean {
  const code = lineCode(entry);
  const unitType = resolveUnitTypeFromCatalog(code, unitTypeLookup);
  if (isManpowerUnitType(unitType)) return true;
  if (code && equipmentCodes.has(code.toLowerCase())) return false;
  if (isStaffDesignationLabel(code)) return true;
  return code ? staffCodes.has(code.toLowerCase()) : false;
}

/**
 * Codes that carry a staff headcount somewhere in this set of lines. Collected up front
 * so a code lands in one table for the whole report: Chennai records `WC` (wheelchair
 * staff) with a headcount on most lines but not all, and splitting it per line would
 * scatter the same code across both tables.
 */
export function collectStaffHeadcountCodes(
  entries: EquipmentEntry[],
  equipmentCodes: Set<string>,
): Set<string> {
  const codes = new Set<string>();
  for (const entry of entries) {
    const code = lineCode(entry).toLowerCase();
    if (!code || equipmentCodes.has(code)) continue;
    if (parseStaffHeadcountRemarks(entry.storedRemarks).headcount != null) {
      codes.add(code);
    }
  }
  return codes;
}

/** Codes the catalog defines as equipment, by `abbr` and by `description`. */
export function buildKnownEquipmentCodeSet(
  items: { abbr?: string; description?: string; unit_type?: string }[],
): Set<string> {
  const codes = new Set<string>();
  for (const item of items) {
    if (isManpowerUnitType(item.unit_type)) continue;
    const abbr = String(item.abbr ?? '').trim().toLowerCase();
    const desc = String(item.description ?? '').trim().toLowerCase();
    if (abbr) codes.add(abbr);
    if (desc) codes.add(desc);
  }
  return codes;
}

/** Turn a manpower-classified equipment line into a manpower row. */
function toManpowerEntry(entry: EquipmentEntry): ManpowerEntryForPdf {
  const { headcount, note } = parseStaffHeadcountRemarks(entry.storedRemarks);
  const designation =
    String(entry.designation ?? '').trim() ||
    String(entry.equipmentId ?? '').trim() ||
    String(entry.equipmentName ?? '').trim();
  return {
    employeeName: String(entry.employeeName ?? '').trim(),
    employeeId: String(entry.employeeId ?? '').trim(),
    designation,
    fromDate: entry.fromDate,
    fromTime: entry.fromTime,
    toDate: entry.toDate,
    toTime: entry.toTime,
    headcount: headcount ?? undefined,
    note: note || undefined,
    engagedTime: entry.engagedTime,
  };
}

/** Split mapped FHR equipment rows into the GSE table and the manpower table. */
export function splitEquipmentEntriesByKind(
  entries: EquipmentEntry[],
  unitTypeLookup: Map<string, string>,
  equipmentCodes: Set<string>,
): { equipment: EquipmentEntry[]; manpower: ManpowerEntryForPdf[] } {
  const equipment: EquipmentEntry[] = [];
  const manpower: ManpowerEntryForPdf[] = [];
  const staffCodes = collectStaffHeadcountCodes(entries, equipmentCodes);
  for (const entry of entries) {
    if (isManpowerEquipmentLine(entry, unitTypeLookup, equipmentCodes, staffCodes)) {
      manpower.push(toManpowerEntry(entry));
    } else {
      equipment.push(entry);
    }
  }
  return { equipment, manpower };
}

function isBareOperatorDesignation(value?: string): boolean {
  return /^operator$/i.test(String(value ?? '').trim());
}

function designationKey(value?: string): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Team PDF manpower merge: keep named form rows, backfill empty designations from
 * spreadsheet/FHR staff-code lines, and append headcount-only staff rows the form
 * did not record (so CSA/Sup/… still appear when Staff Data lookup misses).
 */
export function mergeTeamManpowerForPdf(
  formRows: ManpowerEntryForPdf[],
  detailsRows: ManpowerEntryForPdf[],
): ManpowerEntryForPdf[] {
  if (!formRows.length) return detailsRows;
  if (!detailsRows.length) return formRows;

  const byEmpId = new Map<string, ManpowerEntryForPdf>();
  const byName = new Map<string, ManpowerEntryForPdf>();
  for (const row of detailsRows) {
    const id = String(row.employeeId ?? '').trim().toLowerCase();
    const name = String(row.employeeName ?? '').trim().toLowerCase();
    if (id && !byEmpId.has(id)) byEmpId.set(id, row);
    if (name && !byName.has(name)) byName.set(name, row);
  }

  const filled = formRows.map((row) => {
    const saved = String(row.designation ?? '').trim();
    if (saved && !isBareOperatorDesignation(saved)) return row;
    const id = String(row.employeeId ?? '').trim().toLowerCase();
    const name = String(row.employeeName ?? '').trim().toLowerCase();
    const match =
      (id ? byEmpId.get(id) : undefined) ||
      (name ? byName.get(name) : undefined);
    const fromDetails = String(match?.designation ?? '').trim();
    if (fromDetails && !isBareOperatorDesignation(fromDetails)) {
      return {
        ...row,
        designation: fromDetails,
        headcount: row.headcount ?? match?.headcount,
        note: row.note || match?.note,
        engagedTime: row.engagedTime || match?.engagedTime,
      };
    }
    return row;
  });

  const formEmpIds = new Set(
    filled
      .map((r) => String(r.employeeId ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const formDesigKeys = new Set(
    filled.map((r) => designationKey(r.designation)).filter(Boolean),
  );

  const extras: ManpowerEntryForPdf[] = [];
  for (const detail of detailsRows) {
    const desig = String(detail.designation ?? '').trim();
    if (!desig || isBareOperatorDesignation(desig)) continue;
    const id = String(detail.employeeId ?? '').trim().toLowerCase();
    if (id && formEmpIds.has(id)) continue;
    const isHeadcountOnly =
      !String(detail.employeeName ?? '').trim() && detail.headcount != null;
    if (!isHeadcountOnly && id) continue;
    if (!isHeadcountOnly && String(detail.employeeName ?? '').trim()) continue;
    const key = designationKey(desig);
    if (key && formDesigKeys.has(key) && isHeadcountOnly) {
      // Same staff code already on a form row — skip duplicate headcount line.
      continue;
    }
    if (!isHeadcountOnly) continue;
    if (key) formDesigKeys.add(key);
    extras.push(detail);
  }

  return extras.length > 0 ? [...filled, ...extras] : filled;
}
