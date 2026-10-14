import * as XLSX from 'xlsx';

/**
 * Column mapping for the "Scheduled equipment data" seed workbook (`maa-equipment-april-june.xlsx`,
 * `Sheet1`) — mirrors what the Scheduled data export page's GSE/equipment tab produces:
 *
 * | Excel header         | Canonical field    | Written to (fhr_collection)                                    |
 * |-----------------------|--------------------|------------------------------------------------------------------|
 * | Serial Number          | serialNo           | `SerialNo` — match key, identifies the flight document            |
 * | Customer Name          | customerName       | `mainDetails.Airline` — match/verify key only                     |
 * | Customer Code          | customerCode       | `mainDetails.Arline_Code` — match/verify key only                 |
 * | Flight No              | flightNo           | `terminalDetails.FlightNo` — match/verify key only                |
 * | STD Date               | stdDate            | `terminalDetails.STDDate` / `rampDetails1.STDDate` — match key    |
 * | ATD Date               | atdDate            | `mainDetails.ATDDate` — match/verify key only                     |
 * | Equipment No           | equipmentNo        | `equipmentDetails[].equipment_name` — **written as billing full form** |
 * | Quantity               | quantity           | `equipmentDetails[].equipment_quantity` — **written**             |
 * | Route                  | route              | `mainDetails.Route` / `rampDetails1.Route` — match key only       |
 * | Usages Time            | usageTime          | `equipmentDetails[].usage_time` — **written**                     |
 * | From Date              | fromDateRaw        | `equipmentDetails[].from_date` + `from_time` — **written**        |
 * | To date                | toDateRaw          | `equipmentDetails[].to_date` + `to_time` — **written**            |
 * | Remarks                | remarks            | `equipmentDetails[].remarks` — **written**                        |
 * | Type Craft             | typeCraft          | `mainDetails.TypeCraft` — match/verify key only                   |
 * | Category Of Flight     | categoryOfFlight   | `mainDetails.Cate_of_Flight` — match/verify key only               |
 *
 * `Unit Type` and `Weight` were removed from the workbook — there is no field for either on
 * `FhrEquipmentDetailItem`; `unit_type` resolves at read-time from the shared
 * `equipmentManpower.catalogItems[]` master list keyed by `equipment_name` (Equipment No).
 */
export type ScheduledEquipmentCanonicalField =
  | 'serialNo'
  | 'customerName'
  | 'customerCode'
  | 'flightNo'
  | 'stdDate'
  | 'atdDate'
  | 'equipmentNo'
  | 'quantity'
  | 'route'
  | 'usageTime'
  | 'fromDateRaw'
  | 'toDateRaw'
  | 'remarks'
  | 'typeCraft'
  | 'categoryOfFlight';

/** Raw per-row values keyed by canonical field — kept unstringified so numeric Excel date/time serials parse correctly. */
export type ScheduledEquipmentCanonicalRow = Record<
  ScheduledEquipmentCanonicalField,
  unknown
>;

/** Header text -> canonical field, tolerant of case/spacing/punctuation differences. */
const HEADER_ALIASES: Record<string, ScheduledEquipmentCanonicalField> = {
  serialnumber: 'serialNo',
  serialno: 'serialNo',
  slno: 'serialNo',
  customername: 'customerName',
  customercode: 'customerCode',
  flightno: 'flightNo',
  stddate: 'stdDate',
  atddate: 'atdDate',
  equipmentno: 'equipmentNo',
  equipmentnumber: 'equipmentNo',
  quantity: 'quantity',
  qty: 'quantity',
  route: 'route',
  usagestime: 'usageTime',
  usagetime: 'usageTime',
  fromdate: 'fromDateRaw',
  todate: 'toDateRaw',
  remarks: 'remarks',
  typecraft: 'typeCraft',
  categoryofflight: 'categoryOfFlight',
};

function canonicalHeaderKey(header: string): string {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Excel header (as it literally appears in row 1) -> canonical field. */
export function scheduledEquipmentHeaderMap(
  headers: string[],
): Map<string, ScheduledEquipmentCanonicalField> {
  const map = new Map<string, ScheduledEquipmentCanonicalField>();
  for (const h of headers) {
    const field = HEADER_ALIASES[canonicalHeaderKey(h)];
    if (field) map.set(h, field);
  }
  return map;
}

/** Headers present in the workbook that don't map to any known column (surfaced for visibility). */
export function unmappedScheduledEquipmentHeaders(headers: string[]): string[] {
  return headers.filter((h) => !HEADER_ALIASES[canonicalHeaderKey(h)]);
}

export function normalizeScheduledEquipmentRow(
  rowObj: Record<string, unknown>,
  headerMap: Map<string, ScheduledEquipmentCanonicalField>,
): ScheduledEquipmentCanonicalRow {
  const out: Partial<ScheduledEquipmentCanonicalRow> = {};
  for (const [header, value] of Object.entries(rowObj)) {
    const field = headerMap.get(header.trim());
    if (!field) continue;
    out[field] = value;
  }
  return {
    serialNo: out.serialNo ?? '',
    customerName: out.customerName ?? '',
    customerCode: out.customerCode ?? '',
    flightNo: out.flightNo ?? '',
    stdDate: out.stdDate ?? '',
    atdDate: out.atdDate ?? '',
    equipmentNo: out.equipmentNo ?? '',
    quantity: out.quantity ?? '',
    route: out.route ?? '',
    usageTime: out.usageTime ?? '',
    fromDateRaw: out.fromDateRaw ?? '',
    toDateRaw: out.toDateRaw ?? '',
    remarks: out.remarks ?? '',
    typeCraft: out.typeCraft ?? '',
    categoryOfFlight: out.categoryOfFlight ?? '',
  };
}

/** Plain-text cell (Customer Name, Flight No, Remarks, …) regardless of underlying type. */
export function textCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Splits a single Excel cell (numeric date-time serial, `Date`, or a date/date-time string)
 * into stored `dd/MM/yyyy` date + `HH:mm` time — matches the format already used across
 * `equipmentDetails[]` (see `equipment-manpower-to-fhr-details.util.ts`). Pure time-of-day
 * serials (Excel day counter `0`, e.g. from a duration-only cell) yield an empty `date`.
 */
export function parseExcelDateTimeCell(v: unknown): { date: string; time: string } {
  if (v === null || v === undefined || v === '') return { date: '', time: '' };

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const date = `${pad2(v.getDate())}/${pad2(v.getMonth() + 1)}/${v.getFullYear()}`;
    const hasTime = v.getHours() !== 0 || v.getMinutes() !== 0;
    const time = hasTime ? `${pad2(v.getHours())}:${pad2(v.getMinutes())}` : '';
    return { date, time };
  }

  if (typeof v === 'number' && Number.isFinite(v)) {
    return excelSerialToDateTime(v);
  }

  const raw = String(v).trim();
  if (!raw) return { date: '', time: '' };

  // A stringified pure number (e.g. a canonical-row value round-tripped through JSON) is
  // still an Excel serial — re-parse it numerically instead of falling into date-string regex.
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return excelSerialToDateTime(Number(raw));
  }

  const m = raw.match(
    /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})[\sT]*(\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:am|pm)?)?/i,
  );
  if (!m) return { date: raw, time: '' };

  const datePart = m[1];
  const timePart = m[2] ?? '';

  let date = '';
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
  if (iso) {
    date = `${pad2(Number(iso[3]))}/${pad2(Number(iso[2]))}/${iso[1]}`;
  } else {
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(datePart);
    if (dmy) {
      const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
      date = `${pad2(Number(dmy[1]))}/${pad2(Number(dmy[2]))}/${year}`;
    } else {
      date = datePart;
    }
  }

  const time = parseTimeToken(timePart);
  return { date, time };
}

function excelSerialToDateTime(v: number): { date: string; time: string } {
  try {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      // `d.d === 0` (Excel day counter 0) means this serial carries only a time-of-day
      // fraction, not a real calendar date (e.g. a duration cell like `Usages Time`).
      const hasDate = (d.d ?? 0) > 0;
      const date = hasDate ? `${pad2(d.d)}/${pad2(d.m)}/${d.y}` : '';
      const hasTime = (d.H ?? 0) !== 0 || (d.M ?? 0) !== 0;
      const time = hasTime ? `${pad2(d.H ?? 0)}:${pad2(d.M ?? 0)}` : '';
      return { date, time };
    }
  } catch {
    /* fall through */
  }
  return { date: '', time: '' };
}

function parseTimeToken(timePart: string): string {
  if (!timePart) return '';
  const tm = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(timePart.trim());
  if (!tm) return '';
  let hour = Number(tm[1]);
  const minute = Number(tm[2]);
  const ampm = (tm[3] ?? '').toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Date-only token (`dd/MM/yyyy`) from any supported cell shape — used for match-key comparisons. */
export function excelCellToDdMmYyyy(v: unknown): string {
  return parseExcelDateTimeCell(v).date;
}

/**
 * `Usages Time` is a duration/time-of-day value (e.g. Excel `16:10` stored as a day-fraction
 * serial `0.673611...`, or already a `HH:mm` string) — never a calendar date.
 */
export function parseExcelTimeOnlyCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return excelSerialToDateTime(v).time;
  }
  const raw = String(v).trim();
  if (!raw) return '';
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return excelSerialToDateTime(Number(raw)).time;
  }
  const parsed = parseTimeToken(raw);
  return parsed || raw;
}

function parseSerialNumber(v: unknown): number {
  const raw = String(v ?? '').replace(/,/g, '').trim();
  return Number(raw);
}

function normalizeQuantity(v: unknown): number {
  const raw = String(v ?? '').replace(/,/g, '').trim();
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}

/** Extracts + validates the `Serial Number` cell; `NaN` when missing/invalid. */
export function scheduledEquipmentRowSerialNo(row: ScheduledEquipmentCanonicalRow): number {
  return parseSerialNumber(row.serialNo);
}

/**
 * Builds one `equipmentDetails[]` line from a canonical row. No column is required — every
 * field on `FhrEquipmentDetailItem` defaults to `''` in the schema, so a row with a blank
 * `Equipment No` (e.g. a flight-level summary/total row) still gets written, just with an
 * empty `equipment_name`.
 */
export function buildFhrEquipmentDetailItem(
  row: ScheduledEquipmentCanonicalRow,
): Record<string, string | number> {
  const equipment_name = textCell(row.equipmentNo);

  const from = parseExcelDateTimeCell(row.fromDateRaw);
  const to = parseExcelDateTimeCell(row.toDateRaw);

  return {
    equipment_name,
    equipment_quantity: normalizeQuantity(row.quantity),
    from_date: from.date,
    from_time: from.time,
    to_date: to.date,
    to_time: to.time,
    usage_time: parseExcelTimeOnlyCell(row.usageTime),
    remarks: textCell(row.remarks),
  };
}

/** De-dupes equipment lines (used in `--append` mode) on the full identity of a line. */
export function dedupeEquipmentDetailItems(
  items: Record<string, unknown>[],
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const item of items) {
    const key = ['equipment_name', 'from_date', 'from_time', 'to_date', 'to_time']
      .map((k) => String((item as Record<string, unknown>)[k] ?? '').trim().toLowerCase())
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Case/space-insensitive comparison for match-key sanity checks (not written to the DB). */
export function valuesLooselyMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true;
  return na === nb;
}
