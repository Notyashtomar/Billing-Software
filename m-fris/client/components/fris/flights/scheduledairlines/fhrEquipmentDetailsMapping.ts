/**
 * Maps `fhr_collection.equipmentDetails[]` to UI/PDF equipment rows (no jsPDF dependency).
 */

import { resolveGseDisplayNameFromCatalog } from './gseCatalogLookup';
import { splitEquipmentDateTimeForDisplay } from './reportPdfUtils';

export interface EquipmentEntry {
  equipmentName: string;
  equipmentId?: string;
  employeeName?: string;
  employeeId?: string;
  designation?: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  storedRemarks?: string;
  engagedTime?: string;
}

function normKey(raw?: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Legacy hard-coded default — prefer a real staff designation when available. */
function isLegacyOperatorPlaceholder(designation?: string): boolean {
  return /^operator$/i.test(String(designation ?? '').trim());
}

/** Prefer non-placeholder designation; keep genuine "Operator" when that is all we have. */
function pickDesignation(preferred?: string, fallback?: string): string {
  const a = String(preferred ?? '').trim();
  const b = String(fallback ?? '').trim();
  if (a && !isLegacyOperatorPlaceholder(a)) return a;
  if (b && !isLegacyOperatorPlaceholder(b)) return b;
  return a || b || '';
}

/**
 * Overlay employee fields (and free-text remarks) from equipment-manpower form rows
 * onto FHR-mapped rows. Matches by equipment serial / name (FHR `equipment_name` is serial-first).
 * Used so GSE/Team preview + PDF show staff designation and remarks even when older FHR
 * lines lack them.
 */
export function mergeEmployeeFieldsFromManpowerEquipment(
  fhrRows: EquipmentEntry[],
  formRows: EquipmentEntry[],
): EquipmentEntry[] {
  if (!fhrRows.length) return fhrRows;
  if (!formRows.length) return fhrRows;

  const bySerial = new Map<string, EquipmentEntry>();
  const byName = new Map<string, EquipmentEntry>();
  for (const row of formRows) {
    const serial = normKey(row.equipmentId);
    const name = normKey(row.equipmentName);
    if (serial && !bySerial.has(serial)) bySerial.set(serial, row);
    if (name && !byName.has(name)) byName.set(name, row);
  }

  return fhrRows.map((row, idx) => {
    const serial = normKey(row.equipmentId);
    const name = normKey(row.equipmentName);
    const match =
      (serial && bySerial.get(serial)) ||
      (name && byName.get(name)) ||
      formRows[idx] ||
      undefined;
    if (!match) return row;

    const needsEmployee =
      !String(row.employeeName ?? '').trim() ||
      !String(row.employeeId ?? '').trim() ||
      !String(row.designation ?? '').trim() ||
      isLegacyOperatorPlaceholder(row.designation);

    const formRemarks = normalizeStoredRemarks(match.storedRemarks);
    const rowRemarks = normalizeStoredRemarks(row.storedRemarks);
    const mergedRemarks = formRemarks || rowRemarks || undefined;
    const remarksChanged =
      String(mergedRemarks ?? '') !== String(row.storedRemarks ?? '').trim();

    if (!needsEmployee && !remarksChanged) return row;

    return {
      ...row,
      ...(needsEmployee
        ? {
            employeeName:
              String(match.employeeName ?? '').trim() || row.employeeName || '',
            employeeId:
              String(match.employeeId ?? '').trim() || row.employeeId || '',
            designation: pickDesignation(match.designation, row.designation),
          }
        : {}),
      storedRemarks: mergedRemarks,
    };
  });
}

/** Older equipment-manpower rows stored engagement duration in `remarks`. */
function isLegacyDurationRemarks(raw?: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s || s === '–' || s === '-') return true;
  return /^\d{1,2}:\d{2}$/.test(s);
}

/** Pure decimal values (e.g. 1.5, 0.25) stay hidden on GSE Remarks; text / whole numbers stay. */
function isDecimalNumberRemarks(raw?: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  return /^[+-]?(?:\d+\.\d+|\.\d+)$/.test(s);
}

function normalizeStoredRemarks(raw?: string): string {
  const s = String(raw ?? '').trim();
  if (!s || isLegacyDurationRemarks(s) || isDecimalNumberRemarks(s)) return '';
  return s;
}

/** Map `fhr_collection.equipmentDetails` (seeded GSE rows) to equipment entries. */
export function fhrEquipmentDetailsToEquipmentEntries(
  rows: unknown[] | null | undefined,
  /** When set, FHR `equipment_name` matching catalog `abbr` is replaced by catalog `description`. */
  abbrDescriptionLookup?: Map<string, string>,
): EquipmentEntry[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const from = splitEquipmentDateTimeForDisplay(
      String(r.from_date ?? ''),
      String(r.from_time ?? ''),
    );
    const to = splitEquipmentDateTimeForDisplay(
      String(r.to_date ?? ''),
      String(r.to_time ?? ''),
    );
    const rawEquipmentName = String(r.equipment_name ?? '').trim();
    let equipmentName = rawEquipmentName;
    if (abbrDescriptionLookup?.size) {
      equipmentName = resolveGseDisplayNameFromCatalog(
        equipmentName,
        abbrDescriptionLookup,
      );
    }
    const qty = r.equipment_quantity;
    if (
      typeof qty === 'number' &&
      Number.isFinite(qty) &&
      qty > 1 &&
      equipmentName
    ) {
      equipmentName = `${equipmentName} (×${qty})`;
    }
    const remarksRaw = normalizeStoredRemarks(
      String(r.remarks ?? r.Remarks ?? ''),
    );
    const usageRaw = String(r.usage_time ?? '').trim();
    const employeeName = String(r.employee_name ?? r.employeeName ?? '').trim();
    const employeeId = String(r.employee_id ?? r.employeeId ?? '').trim();
    const designationRaw = String(r.designation ?? '').trim();
    const hasEmployeeFields = Boolean(
      employeeName || employeeId || designationRaw,
    );
    // Older FHR lines had no staff fields; callers used to invent "Operator".
    // Only keep designation when the line actually stored staff data.
    return {
      equipmentName,
      equipmentId: rawEquipmentName,
      employeeName,
      employeeId,
      designation: hasEmployeeFields ? designationRaw : '',
      fromDate: from.date,
      fromTime: from.time,
      toDate: to.date,
      toTime: to.time,
      storedRemarks: remarksRaw || undefined,
      engagedTime: usageRaw || undefined,
    };
  });
}
