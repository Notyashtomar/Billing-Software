'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  CalendarClock,
  Table2,
  ChevronDown,
  Search,
} from 'lucide-react';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  fetchDailyScheduledFromAdvance,
  fetchEquipmentManpowerMasterCatalog,
  fetchFhrDocsBatch,
  fetchFlightReportBatch,
  fetchFlightsReferenceAircraft,
  fetchNonScheduledAirlineFlights,
  getApiBase,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  processFlightData,
  FlightData,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
  nsRawSerialCandidatesForLockFetch,
  shouldHideScheduledAirlinesTableRow,
} from '@/utils/dataProcessor';
import { toast } from 'sonner';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getExcelJSModule } from '@/lib/dynamic-imports';

const fetch = frisFetch;
import {
  buildEquipmentCatalogLookups,
  buildAircraftBodyLookupMap,
  EQUIPMENT_TABLE_COLUMNS,
  fetchEquipmentLinesForFlightsBatch,
  normalizeAircraftTypeForBodyLookup,
  type EquipmentFlatRow,
} from './scheduledEquipmentExport';

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

/**
 * Default range on the scheduled data export page: the last complete calendar month,
 * clamped to today. A rolling window means every month seeded into `fhr_collection` —
 * for any station — is in view when the page opens, instead of a fixed range that goes
 * stale as soon as newer flights are saved.
 */
function defaultDataExportRange(d = new Date()): { fromYmd: string; toYmd: string } {
  const monthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth(), 0);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = monthEnd.getTime() <= today.getTime() ? monthEnd : today;
  return { fromYmd: localCalendarYmd(monthStart), toYmd: localCalendarYmd(end) };
}
type FlightDateFilterType = 'sta' | 'std' | 'ata' | 'atd';
const DATE_FILTER_OPTIONS: Array<{ id: FlightDateFilterType; label: string }> = [
  { id: 'sta', label: 'STA Date' },
  { id: 'std', label: 'STD Date' },
  { id: 'ata', label: 'ATA Date' },
  { id: 'atd', label: 'ATD Date' },
];
const DEFAULT_DATE_FILTERS: FlightDateFilterType[] = ['sta'];

function yyyyMmDdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function scheduleLabelToYmd(label: string): string | null {
  const raw = String(label ?? '').trim();
  if (!raw) return null;
  const withDatePrefix = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (withDatePrefix) return withDatePrefix[1];
  const withDatePrefixDmy = /^(\d{1,2}[/-]\d{1,2}[/-]\d{4})/.exec(raw);
  if (withDatePrefixDmy) {
    const dmyParts = withDatePrefixDmy[1].split(/[/-]/).map((p) => p.trim());
    if (dmyParts.length !== 3) return null;
    const d = Number(dmyParts[0]);
    const m = Number(dmyParts[1]);
    const y = Number(dmyParts[2]);
    if (!d || !m || !y) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function filterFlightsToDateWindow(
  flights: FlightData[],
  fromYmd: string,
  toYmd: string,
  dateFilters: FlightDateFilterType[],
): FlightData[] {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return flights;
  const activeFilters =
    dateFilters.length > 0 ? dateFilters : DEFAULT_DATE_FILTERS;
  const pickDateValue = (f: FlightData, filterType: FlightDateFilterType): string => {
    if (filterType === 'sta') return String(f.staDate ?? '').trim();
    if (filterType === 'std') return String(f.stdDate ?? '').trim();
    if (filterType === 'ata') return String(f.ataDate ?? '').trim();
    return String(f.atdDate ?? '').trim();
  };
  return flights.filter((f) => {
    // Include flight when any selected date type matches the date range (inclusive).
    return activeFilters.some((filterType) => {
      const ymd = scheduleLabelToYmd(pickDateValue(f, filterType));
      if (!ymd) return false;
      return ymd >= fromYmd && ymd <= toYmd;
    });
  });
}


/** Serial variants used to match `fhrReportsBySerial` (table Sl.No vs ops serial). */
function fhrSerialCandidates(f: FlightData): string[] {
  const raw = [
    String(f.slNo ?? '').trim(),
    String(nsFormSerialForFlight(f) ?? '').trim(),
    String(f.legacySlNo ?? '').trim().replace(/^FL-/i, ''),
  ].filter(Boolean);
  return [...new Set(raw)];
}

function fhrReportForFlight(
  f: FlightData,
  map: Record<string, FhrReportRow>,
): FhrReportRow | null {
  for (const k of fhrSerialCandidates(f)) {
    const r = map[k];
    if (r) return r;
  }
  return null;
}

function formatLoadError(error: unknown, fallback: string): string {
  const errMsg = error instanceof Error ? error.message : '';
  if (
    error instanceof TypeError &&
    (errMsg === 'Failed to fetch' || errMsg.includes('fetch'))
  ) {
    const base = getApiBase().replace(/\/$/, '');
    return `Cannot reach the API at ${base || 'server'}.`;
  }
  return error instanceof Error ? error.message : fallback;
}

/**
 * Resolve FHR for export against `fhr_collection` for many flights at once: two
 * requests total (candidate existence batch + flight-report batch) instead of up
 * to ~6 sequential per-flight round trips each, which is what made large date
 * ranges on this page time out. Tries instance + legacy serial variants (same
 * strategy as scheduled table lock refresh) to avoid empty Excel rows when data
 * lives under a different operational id than the table Sl.No.
 */
async function fetchResolvedFlightReportRowsBatch(
  flights: FlightData[],
  baseUrl: string,
): Promise<Map<FlightData, FhrReportRow | null>> {
  const result = new Map<FlightData, FhrReportRow | null>();
  if (flights.length === 0) return result;

  const candidateNumbersByFlight = new Map<FlightData, number[]>();
  const allCandidates = new Set<number>();
  flights.forEach((f) => {
    const nums = nsRawSerialCandidatesForLockFetch(f)
      .map((c) => Number(c))
      .filter((n) => Number.isFinite(n));
    candidateNumbersByFlight.set(f, nums);
    nums.forEach((n) => allCandidates.add(n));
  });

  let existsMap: Map<number, Record<string, unknown>>;
  try {
    existsMap = await fetchFhrDocsBatch(Array.from(allCandidates));
  } catch {
    existsMap = new Map();
  }

  const resolvedSerialByFlight = new Map<FlightData, number | null>();
  const reportSerials = new Set<number>();
  flights.forEach((f) => {
    const nums = candidateNumbersByFlight.get(f) ?? [];
    const winner = nums.find((n) => existsMap.has(n));
    const primary = Number(nsFormSerialForFlight(f));
    const resolved = winner ?? (Number.isFinite(primary) ? primary : null);
    resolvedSerialByFlight.set(f, resolved);
    if (resolved != null) reportSerials.add(resolved);
  });

  let reportMap: Map<number, Record<string, unknown>>;
  try {
    reportMap = await fetchFlightReportBatch(Array.from(reportSerials));
  } catch {
    reportMap = new Map();
  }

  flights.forEach((f) => {
    const resolved = resolvedSerialByFlight.get(f);
    const report = resolved != null ? (reportMap.get(resolved) ?? null) : null;
    result.set(f, report as FhrReportRow | null);
  });

  return result;
}

function csvEscape(s: string): string {
  return `"${String(s ?? '').replace(/"/g, '""')}"`;
}

type ColumnDef = {
  id: string;
  label: string;
  header: string;
  get: (f: FlightData, report?: FhrReportRow | null) => string;
};

type FhrReportRow = Record<string, unknown>;

type FhrExportColumn = {
  header: string;
  get: (report: FhrReportRow | null, flight: FlightData) => unknown;
};

const EXPORT_COLUMNS: ColumnDef[] = [
  { id: 'slNo', label: 'Sl. No.', header: 'Sl. No.', get: (f) => displayScheduledAirlinesTableSerial(f) },
  { id: 'airline', label: 'Airline', header: 'Airline', get: (f) => f.airline },
  { id: 'flightNo', label: 'Flight No', header: 'Flight No', get: (f) => f.flightNo },
  { id: 'aircraft', label: 'Aircraft', header: 'Aircraft', get: (f) => f.aircraft },
  { id: 'flightType', label: 'Flight type', header: 'Type', get: (f) => f.flightType },
  { id: 'staDate', label: 'STA Date', header: 'STA Date', get: (f) => f.staDate },
  { id: 'staTime', label: 'STA Time', header: 'STA Time', get: (f) => f.staTime },
  { id: 'stdDate', label: 'STD Date', header: 'STD Date', get: (f) => f.stdDate },
  { id: 'stdTime', label: 'STD Time', header: 'STD Time', get: (f) => f.stdTime },
  { id: 'destination', label: 'Destination', header: 'Destination', get: (f) => String(f.destination ?? '') },
  { id: 'route', label: 'Route', header: 'Route', get: (f) => String(f.route ?? '') },
  { id: 'rampLocked', label: 'Ramp locked', header: 'Ramp', get: (f) => f.rampLocked },
  { id: 'paxLocked', label: 'Pax locked', header: 'Pax', get: (f) => f.paxLocked },
  { id: 'gsdLocked', label: 'GSD locked', header: 'GSD', get: (f) => f.gsdLocked },
  { id: 'exportedNAV', label: 'Exported NAV', header: 'Exp. NAV', get: (f) => f.exportedNAV },
  { id: 'hClose', label: 'H Close', header: 'H Close', get: (f) => f.hClose },
  { id: 'fBag', label: 'F Bag', header: 'F Bag', get: (f) => f.fBag },
  { id: 'lBag', label: 'L Bag', header: 'L Bag', get: (f) => f.lBag },
  { id: 'serialLabel', label: 'Serial label', header: 'Serial label', get: (f) => String(f.serialLabel ?? '') },
  { id: 'scheduleId', label: 'Schedule ID', header: 'Sched. ID', get: (f) => String(f.scheduleId ?? '') },
  // Legacy column ids now hydrated from fetched FHR details.
  { id: 'arrivalpax', label: 'arrivalpax', header: 'arrivalpax', get: (_f, r) => fhrByColumnId('arrivalpax', r ?? null) },
  { id: 'deppax', label: 'deppax', header: 'deppax', get: (_f, r) => fhrByColumnId('deppax', r ?? null) },
  { id: 'transitPax', label: 'transitPax', header: 'transitPax', get: (_f, r) => fhrByColumnId('transitPax', r ?? null) },
  { id: 'MTOW', label: 'MTOW', header: 'MTOW', get: (_f, r) => fhrByColumnId('MTOW', r ?? null) },
  { id: 'FTT', label: 'FTT', header: 'FTT', get: (_f, r) => fhrByColumnId('FTT', r ?? null) },
  { id: 'Billto', label: 'Billto', header: 'Billto', get: (_f, r) => fhrByColumnId('Billto', r ?? null) },
  { id: 'Frontopen', label: 'Frontopen', header: 'Frontopen', get: (_f, r) => fhrByColumnId('Frontopen', r ?? null) },
  { id: 'Rearopen', label: 'Rearopen', header: 'Rearopen', get: (_f, r) => fhrByColumnId('Rearopen', r ?? null) },
];

const DELAY_EXPORT_IDS = ['slNo', 'airline', 'flightNo', 'aircraft', 'staDate', 'staTime', 'stdDate', 'stdTime', 'route', 'destination'];

function fhrDelayReasonsString(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return '';
      const delay = String((row as { delay?: unknown }).delay ?? '').trim();
      const reason = String((row as { reasonOfDelay?: unknown; reason?: unknown }).reasonOfDelay ?? (row as { reason?: unknown }).reason ?? '').trim();
      return [delay, reason].filter(Boolean).join(' - ');
    })
    .filter(Boolean)
    .join(' | ');
}


function fhrString(value: unknown): string | number | boolean {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return '';
}

/** `mainDetails.TypeofHandling` chain from FHR / flight-report (matches report aggregation). */
function typeOfHandlingFromFhrReport(report: FhrReportRow | null): string {
  if (!report || typeof report !== 'object') return '';
  const r = report as Record<string, unknown>;
  let md: Record<string, unknown> | undefined;
  if (
    r.mainDetails != null &&
    typeof r.mainDetails === 'object' &&
    !Array.isArray(r.mainDetails)
  ) {
    md = r.mainDetails as Record<string, unknown>;
  }
  return String(
    fhrString(r.typeOfHandling) ||
      fhrString(r.type_of_handling) ||
      fhrString(r.TypeofHandling) ||
      fhrString(r['Type of Handling']) ||
      fhrString(md?.TypeofHandling) ||
      fhrString(md?.type_of_handling) ||
      fhrString(md?.typeOfHandling),
  ).trim();
}

/** Normalized advance-aircraft code → catalog `aircraft` display string (for Pax/Freight “F in type” rule). */
function buildAdvanceAircraftCatalogCodeMap(rows: unknown[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    if (o.active === false) continue;
    const raw = String(o.aircraft ?? '').trim();
    if (!raw) continue;
    const key = normalizeAircraftTypeForBodyLookup(raw);
    if (!key || key.length < 2) continue;
    if (!map.has(key)) map.set(key, raw);
  }
  return map;
}

function typeFragmentsForPaxFreight(raw: string): string[] {
  const t = String(raw ?? '').trim();
  if (!t) return [];
  const out = [t];
  for (const part of t.split(/[/|,]+/)) {
    const p = part.trim();
    if (p) out.push(p);
  }
  return out;
}

/** Freighter if aircraft type text contains `F` (case-insensitive). Uses FHR/schedule type strings, then advance-aircraft catalog match. */
function resolvePaxFreightLabel(
  report: FhrReportRow | null,
  flight: FlightData,
  catalogByNormalized: Map<string, string> | null,
): string {
  const raw = aircraftTypeRawForBodyLookup(report, flight);
  const fragments = typeFragmentsForPaxFreight(raw);
  if (fragments.length === 0) return '';
  for (const s of fragments) {
    if (/f/i.test(s)) return 'Freighter';
  }
  if (catalogByNormalized && catalogByNormalized.size > 0) {
    for (const s of fragments) {
      const key = normalizeAircraftTypeForBodyLookup(s);
      if (key.length < 2) continue;
      const catalogAircraft = catalogByNormalized.get(key);
      if (catalogAircraft && /f/i.test(catalogAircraft)) return 'Freighter';
    }
  }
  return 'Passenger';
}

function resolveAircraftBodyFromLookupMap(
  map: Map<string, 'NB' | 'WB'>,
  rawType: string,
): 'NB' | 'WB' | '' {
  const tryOne = (fragment: string): 'NB' | 'WB' | null => {
    const normalized = normalizeAircraftTypeForBodyLookup(fragment ?? '');
    if (normalized.length < 2) return null;
    return map.get(normalized) ?? null;
  };
  const primary = tryOne(rawType);
  if (primary) return primary;
  const parts = String(rawType ?? '')
    .split(/[/|,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    const hit = tryOne(p);
    if (hit) return hit;
  }
  return '';
}

function aircraftTypeRawForBodyLookup(
  report: FhrReportRow | null,
  flight: FlightData,
): string {
  if (report && typeof report === 'object') {
    const r = report as Record<string, unknown>;
    const t = String(
      fhrString((report as { aircraftType?: unknown }).aircraftType) ||
        fhrString(r.TypeCraft) ||
        fhrString(r.typeCraft),
    ).trim();
    if (t) return t;
  }
  return String(flight.aircraft ?? '').trim();
}

const EXPORT_EXTRA_TYPE_OF_HANDLING_ID = 'export:typeOfHandling';
const EXPORT_EXTRA_AIRCRAFT_BODY_ID = 'export:aircraftBody';
const EXPORT_EXTRA_PAX_FREIGHT_ID = 'export:paxFreight';

/** ExcelJS writeBuffer() shape varies by environment; always produce a valid Blob in the browser. */
function xlsxArrayBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
  return new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Shared Excel download for scheduled + non-scheduled FHR/equipment exports.
 * Uses the same lazy ExcelJS + file-saver loaders (keeps heavy libs out of the Worker).
 */
async function downloadExcelJsWorkbook(opts: {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
  widthRows: Array<Record<string, string>>;
  fileName: string;
  /** Optional per-cell format (FHR date/time columns). */
  formatCell?: (cell: { numFmt?: string }, header: string, rawValue: unknown) => void;
}): Promise<void> {
  const [ExcelJS, saveAs] = await Promise.all([getExcelJSModule(), loadFileSaverSaveAs()]);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(opts.sheetName);

  worksheet.addRow(opts.headers);
  opts.rows.forEach((rawValues) => {
    const row = worksheet.addRow(
      rawValues.map((value) =>
        opts.formatCell ? normalizeExcelCellValue(value) : value == null ? '' : String(value),
      ),
    );
    if (opts.formatCell) {
      opts.headers.forEach((header, idx) => {
        opts.formatCell!(row.getCell(idx + 1), header, rawValues[idx]);
      });
    }
  });

  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = {
      bold: true,
      size: 12,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
  });

  const widths = getAutoColumnWidths(opts.widthRows);
  widths.forEach((w, idx) => {
    worksheet.getColumn(idx + 1).width = w;
  });

  const excelBuffer = await workbook.xlsx.writeBuffer();
  const blob = xlsxArrayBufferToBlob(
    excelBuffer instanceof ArrayBuffer ? excelBuffer : (excelBuffer as ArrayBufferView),
  );
  saveAs(blob, opts.fileName);
}

function getAutoColumnWidths(rows: Array<Record<string, string>>): number[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0] ?? {});
  if (!headers.length) return [];

  return headers.map((header) => {
    const headerLen = String(header).length;
    const valueLen = rows.reduce((max, row) => {
      const cell = String(row?.[header] ?? '');
      const longestLine = cell
        .split(/\r?\n/)
        .reduce((lineMax, line) => Math.max(lineMax, line.length), 0);
      return Math.max(max, longestLine);
    }, 0);

    // Keep full header words visible by default, with a little padding.
    const ideal = Math.max(headerLen, valueLen) + 2;
    return Math.min(Math.max(ideal, 10), 80);
  });
}

const EXCEL_DATE_HEADERS = new Set(['STA Date', 'STD Date', 'ATA Date', 'ATD Date']);
const EXCEL_TIME_HEADERS = new Set(['STA Time', 'ATA Time', 'STD Time', 'ATD Time', 'ETD Time']);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateForExcelSerial(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const stamp = Date.UTC(y, m - 1, d);
    const dt = new Date(stamp);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return (stamp - EXCEL_EPOCH_UTC_MS) / MS_PER_DAY;
  }
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    const stamp = Date.UTC(y, m - 1, d);
    const dt = new Date(stamp);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return (stamp - EXCEL_EPOCH_UTC_MS) / MS_PER_DAY;
  }
  return null;
}

function parseTimeForExcelSerial(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(raw);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] ? Number(m[3]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  const meridiem = (m[4] ?? '').toUpperCase();
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === 'AM') {
      if (h === 12) h = 0;
    } else if (meridiem === 'PM') {
      if (h !== 12) h += 12;
    }
  }
  if (h < 0 || h > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) return null;
  return (h * 3600 + min * 60 + sec) / 86400;
}

function normalizeExcelCellValue(value: unknown): string | number | boolean {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  return String(value);
}

function applyExcelDateTimeCellFormat(cell: { value: unknown; numFmt?: string }, header: string, rawValue: unknown) {
  if (EXCEL_DATE_HEADERS.has(header)) {
    const serial = parseDateForExcelSerial(rawValue);
    if (serial != null) {
      cell.value = serial;
      cell.numFmt = 'dd/mm/yyyy';
    }
    return;
  }
  if (EXCEL_TIME_HEADERS.has(header)) {
    const serial = parseTimeForExcelSerial(rawValue);
    if (serial != null) {
      cell.value = serial;
      cell.numFmt = 'hh:mm';
    }
  }
}

function fhrByColumnId(id: string, report: FhrReportRow | null): string {
  if (!report) return '';
  switch (id) {
    case 'arrivalpax':
      return String(fhrString(report.arrivalPax));
    case 'deppax':
      return String(fhrString(report.departurePax));
    case 'transitPax':
      return String(fhrString(report.transitCargo));
    case 'MTOW':
      return String(fhrString(report.mtow));
    case 'FTT':
      return String(fhrString(report.totalDelay));
    case 'Billto':
      return String(fhrString(report.airlineName));
    case 'Frontopen':
      return String(fhrString(report.cargoCompartmentFrontOpen) || fhrString(report.frontOpen));
    case 'Rearopen':
      return String(fhrString(report.cargoCompartmentRearOpen) || fhrString(report.rearOpen));
    default:
      return '';
  }
}

const FHR_EXPORT_COLUMNS: FhrExportColumn[] = [
  { header: 'Serial No', get: (_r, f) => displayScheduledAirlinesTableSerial(f) },
  { header: 'Airline', get: (r, f) => fhrString(r?.airlineName) || String(f.airline ?? '') },
  { header: 'Flight No', get: (r, f) => fhrString(r?.flightNo) || String(f.flightNo ?? '') },
  { header: 'Aircraft Type', get: (r, f) => fhrString(r?.aircraftType) || String(f.aircraft ?? '') },
  { header: 'Aircraft Regn No', get: (r) => fhrString(r?.aircraftRegnNo) },
  { header: 'Turnaround Status', get: (r) => fhrString(r?.turnaroundStatus) },
  { header: 'Terminal Code', get: (r) => fhrString(r?.terminalCode) },
  { header: 'STA Date', get: (r, f) => fhrString(r?.staDate) || String(f.staDate ?? '') },
  { header: 'STA Time', get: (r, f) => fhrString(r?.staTime) || String(f.staTime ?? '') },
  { header: 'ATA Date', get: (r) => fhrString(r?.ataDate) },
  { header: 'ATA Time', get: (r) => fhrString(r?.ataTime) },
  { header: 'STD Date', get: (r, f) => fhrString(r?.stdDate) || String(f.stdDate ?? '') },
  { header: 'STD Time', get: (r, f) => fhrString(r?.stdTime) || String(f.stdTime ?? '') },
  { header: 'ATD Date', get: (r) => fhrString(r?.atdDate) },
  { header: 'ATD Time', get: (r) => fhrString(r?.atdTime) },
  { header: 'ETD Time', get: (r) => fhrString(r?.etdTime) },
  { header: 'Bay No', get: (r) => fhrString(r?.bayNo) },
  { header: 'Gate No', get: (r) => fhrString(r?.gateNo) },
  { header: 'Routing', get: (r) => fhrString(r?.routing) },
  { header: 'MTOW', get: (r) => fhrString(r?.mtow) },
  { header: 'Base Flight', get: (r) => fhrString(r?.baseFlight) },
  { header: 'Total Delay', get: (r) => fhrString(r?.totalDelay) },
  { header: 'Status', get: (r) => fhrString(r?.status) },
  { header: 'IGM No', get: (r) => fhrString(r?.igmNo) },
  { header: 'EGM No', get: (r) => fhrString(r?.egmNo) },
  { header: 'ADC No', get: (r) => fhrString(r?.adcNo) },
  { header: 'FIC No', get: (r) => fhrString(r?.ficNo) },
  { header: 'IPOS Date', get: (r) => fhrString(r?.iposDate) },
  { header: 'IPOS Time', get: (r) => fhrString(r?.iposTime) },
  { header: 'Counter Opened', get: (r) => fhrString(r?.cntOpenedTime) },
  { header: 'Counter Closed', get: (r) => fhrString(r?.cntClosedTime) },
  { header: 'Boarding Opened', get: (r) => fhrString(r?.boardingOpenedTime) },
  { header: 'Boarding Closed', get: (r) => fhrString(r?.boardingClosedTime) },
  { header: 'Arrival Pax', get: (r) => fhrString(r?.arrivalPax) },
  { header: 'Departure Pax', get: (r) => fhrString(r?.departurePax) },
  { header: 'Arrival Bag', get: (r) => fhrString(r?.arrivalBag) },
  { header: 'Departure Bag', get: (r) => fhrString(r?.departureBag) },
  { header: 'Cleaning From', get: (r) => fhrString(r?.cleaningFromTime) },
  { header: 'Cleaning To', get: (r) => fhrString(r?.cleaningToTime) },
  { header: 'Cleaning Duration', get: (r) => fhrString(r?.cleaningDuration) || fhrString(r?.cleaning_duration) },
  { header: 'Front Open', get: (r) => fhrString(r?.cargoCompartmentFrontOpen) },
  { header: 'Front Close', get: (r) => fhrString(r?.cargoCompartmentFrontClose) },
  { header: 'Rear Open', get: (r) => fhrString(r?.cargoCompartmentRearOpen) },
  { header: 'Rear Close', get: (r) => fhrString(r?.cargoCompartmentRearClose) },
  { header: 'Bulk Open', get: (r) => fhrString(r?.cargoCompartmentBulkOpen) },
  { header: 'Bulk Close', get: (r) => fhrString(r?.cargoCompartmentBulkClose) },
  { header: 'Main Open', get: (r) => fhrString(r?.cargoCompartmentMainOpen) },
  { header: 'Main Close', get: (r) => fhrString(r?.cargoCompartmentMainClose) },
  { header: 'Last Activity On Hold', get: (r) => fhrString(r?.lastActivityTimeOnHold) },
  { header: 'Transit Cargo', get: (r) => fhrString(r?.transitCargo) },
  { header: 'ULD Arrived', get: (r) => fhrString(r?.uldCargoArrived) },
  { header: 'ULD Planned', get: (r) => fhrString(r?.uldCargoPlanned) },
  { header: 'ULD Departed', get: (r) => fhrString(r?.uldCargoDeparted) },
  { header: 'Cargo Arrived (kg)', get: (r) => fhrString(r?.cargoArrived) },
  { header: 'Cargo Planned (kg)', get: (r) => fhrString(r?.cargoPlanned) },
  { header: 'Cargo Departed (kg)', get: (r) => fhrString(r?.cargoDeparted) },
  { header: 'Mail Arrived (kg)', get: (r) => fhrString(r?.mailArrived) },
  { header: 'Mail Planned (kg)', get: (r) => fhrString(r?.mailPlanned) },
  { header: 'Mail Departed (kg)', get: (r) => fhrString(r?.mailDeparted) },
  { header: 'Cargo Pcs In', get: (r) => fhrString(r?.cargoPcsIn) },
  { header: 'Cargo Pcs Out', get: (r) => fhrString(r?.cargoPcsOut) },
  { header: 'Courier In', get: (r) => fhrString(r?.courierIn) },
  { header: 'Courier Out', get: (r) => fhrString(r?.courierOut) },
  { header: 'Cabin F', get: (r) => fhrString(r?.cabinConfigF) },
  { header: 'Cabin C', get: (r) => fhrString(r?.cabinConfigC) },
  { header: 'Cabin Y', get: (r) => fhrString(r?.cabinConfigY) },
  { header: 'LDC', get: (r) => fhrString(r?.ldc) },
  { header: 'LDP', get: (r) => fhrString(r?.ldp) },
  { header: 'MDP', get: (r) => fhrString(r?.mdp) },
  { header: 'First Arr Hall', get: (r) => fhrString(r?.firstArrHall) },
  { header: 'Last Arr Hall', get: (r) => fhrString(r?.lastArrHall) },
  { header: 'First BMA', get: (r) => fhrString(r?.firstBMA) },
  { header: 'Last BMA', get: (r) => fhrString(r?.lastBMA) },
  { header: 'WCH Arrival C', get: (r) => fhrString(r?.wheelChairArrivalC) },
  { header: 'WCH Arrival S', get: (r) => fhrString(r?.wheelChairArrivalS) },
  { header: 'WCH Arrival R', get: (r) => fhrString(r?.wheelChairArrivalR) },
  { header: 'WCH Departure C', get: (r) => fhrString(r?.wheelChairDepartureC) },
  { header: 'WCH Departure S', get: (r) => fhrString(r?.wheelChairDepartureS) },
  { header: 'WCH Departure R', get: (r) => fhrString(r?.wheelChairDepartureR) },
  { header: 'Delay Reasons', get: (r) => fhrDelayReasonsString(r?.delayReasons) },
  { header: 'GH Remarks', get: (r) => fhrString(r?.ghRemarks) },
  { header: 'Airline Remarks', get: (r) => fhrString(r?.airlineRemarks) },
  { header: 'GH Representative', get: (r) => fhrString(r?.ghRepresentativeName) },
  { header: 'Airline Representative', get: (r) => fhrString(r?.airlineRepresentativeName) },
  { header: 'Ops', get: (r) => fhrString(r?.ops) },
  { header: 'Serial Display', get: (r) => fhrString(r?.serialNoDisplay) },
  { header: 'Hold Config', get: (r) => fhrString(r?.holdConfig) },
  { header: 'Verified By', get: (r) => fhrString(r?.verifiedBy) },
];

/** FHR columns with stable ids for checkboxes, preview table, and Excel (same set as fetched for export). */
const FHR_TABLE_EXPORT_COLUMNS: Array<{
  id: string;
  header: string;
  get: (report: FhrReportRow | null, flight: FlightData) => unknown;
}> = FHR_EXPORT_COLUMNS.map((col, idx) => ({
  id: `fhr:${idx}`,
  header: col.header,
  get: col.get,
}));

type ExportTab = {
  id: string;
  label: string;
  href?: string;
  /** In-page export mode on Scheduled data export (no navigation). */
  exportMode?: 'fhr' | 'equipment';
};

const SCHEDULED_DATA_EXPORT_PATH = '/fris/flights/scheduledairlines/data-export';
const NS_DATA_EXPORT_PATH = '/fris/flights/non-scheduled-airlines/data-export';
/** UI preview cap for Non-Scheduled data export (export still uses full filtered set). */
const NS_PREVIEW_ROW_LIMIT = 10;
const SCHEDULED_PREVIEW_ROW_LIMIT = 20;

function isNonScheduledDataExportPath(pathname: string | null | undefined): boolean {
  const p = String(pathname ?? '');
  return (
    p.includes('/non-scheduled-airlines/data-export') ||
    p.includes('/Non-Scheduled-Airlines/data-export')
  );
}

function buildDataExportTabs(isNsPage: boolean): ExportTab[] {
  return [
    {
      id: 'fhr-export',
      label: 'Scheduled flights',
      ...(isNsPage
        ? { href: SCHEDULED_DATA_EXPORT_PATH }
        : { exportMode: 'fhr' as const }),
    },
    {
      id: 'equipment-export',
      label: 'Scheduled equipment data',
      ...(isNsPage
        ? { href: `${SCHEDULED_DATA_EXPORT_PATH}?mode=equipment` }
        : { exportMode: 'equipment' as const }),
    },
    {
      id: 'ns',
      label: 'Non-Scheduled Flight',
      ...(isNsPage
        ? { exportMode: 'fhr' as const }
        : { href: NS_DATA_EXPORT_PATH }),
    },
    {
      id: 'ns-equipment',
      label: 'Non scheduled equipment data',
      ...(isNsPage
        ? { exportMode: 'equipment' as const }
        : { href: `${NS_DATA_EXPORT_PATH}?mode=equipment` }),
    },
    { id: 'sa', label: 'Scheduled Ad-Hoc' },
    { id: 'nsa', label: 'Non-Scheduled Ad-Hoc' },
    { id: 'raf', label: 'RAF Flight' },
    { id: 'rafh', label: 'RAF Ad-Hoc' },
    { id: 'log', label: 'Log' },
    { id: 'pax', label: 'Pax Shift' },
    { id: 'cms', label: 'CMS' },
    { id: 'train', label: 'Training' },
    { id: 'fm', label: 'FM Report' },
    { id: 'l4', label: 'Level 4 Bags' },
  ];
}

const EXPORT_DATE_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type ExportDateField = (typeof EXPORT_DATE_FIELD_ORDER)[number];

export function ScheduledDataExportContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isNsExportPage = isNonScheduledDataExportPath(pathname);
  const dataExportTabs = useMemo(
    () => buildDataExportTabs(isNsExportPage),
    [isNsExportPage],
  );
  const fetchGenerationRef = useRef(0);
  const previewFhrFetchGenRef = useRef(0);
  const equipmentFetchGenRef = useRef(0);
  const [exportView, setExportView] = useState<'fhr' | 'equipment'>(() =>
    searchParams?.get('mode') === 'equipment' ? 'equipment' : 'fhr',
  );
  const isEquipmentPage = exportView === 'equipment';
  const previewRowLimit = isNsExportPage
    ? NS_PREVIEW_ROW_LIMIT
    : SCHEDULED_PREVIEW_ROW_LIMIT;
  const [equipmentRows, setEquipmentRows] = useState<EquipmentFlatRow[]>([]);
  /** WCHR/WCHS/WCHC from FHR terminalDetails — merged into Excel only when opted in. */
  const [wheelchairEquipmentRows, setWheelchairEquipmentRows] = useState<EquipmentFlatRow[]>(
    [],
  );
  /** Scheduled equipment tab: include wheelchair rows in preview + Excel (default off). */
  const [includeWheelchairsInEquipmentExport, setIncludeWheelchairsInEquipmentExport] =
    useState(false);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [exportingEquipment, setExportingEquipment] = useState(false);
  const defaultRange = useMemo(() => defaultDataExportRange(), []);
  const [fromDate, setFromDate] = useState(defaultRange.fromYmd);
  const [toDate, setToDate] = useState(defaultRange.toYmd);
  const { errors: dateErrors, clearField: clearDateField, applyAndFocus: applyDateErrors } =
    useFieldErrors<ExportDateField>(EXPORT_DATE_FIELD_ORDER);
  const [dateTypeFilters, setDateTypeFilters] =
    useState<FlightDateFilterType[]>(DEFAULT_DATE_FILTERS);
  const [loadedRows, setLoadedRows] = useState<FlightData[]>([]);
  const [fhrReportsBySerial, setFhrReportsBySerial] = useState<Record<string, FhrReportRow>>({});
  const [airlineFilter, setAirlineFilter] = useState<string>('__all__');
  const [selectedCols, setSelectedCols] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    FHR_TABLE_EXPORT_COLUMNS.forEach((c) => {
      o[c.id] = true;
    });
    return o;
  });
  const [includeTypeOfHandling, setIncludeTypeOfHandling] = useState(true);
  const [includeAircraftBody, setIncludeAircraftBody] = useState(true);
  const [includePaxFreight, setIncludePaxFreight] = useState(true);
  /** FHR tab: column / extra checkboxes panel — collapsed by default to reduce clutter. */
  const [fhrExportColumnsOpen, setFhrExportColumnsOpen] = useState(false);
  /** Equipment tab: only selected columns are shown in the preview and exported. */
  const [selectedEquipCols, setSelectedEquipCols] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    EQUIPMENT_TABLE_COLUMNS.forEach((c) => {
      o[c.id] = true;
    });
    return o;
  });
  const [equipExportColumnsOpen, setEquipExportColumnsOpen] = useState(false);
  const [aircraftBodyLookup, setAircraftBodyLookup] = useState<Map<string, 'NB' | 'WB'> | null>(
    null,
  );
  const [advanceAircraftCatalogCodes, setAdvanceAircraftCatalogCodes] = useState<Map<
    string,
    string
  > | null>(null);
  const [aircraftBodyLookupLoading, setAircraftBodyLookupLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportingNow, setExportingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const loadClosedFlights = useCallback(async () => {
    const next = validateYmdDateRange(fromDate, toDate, {
      fromLabel: 'From date',
      toLabel: 'To date',
      toNotAfterToday: true,
      fromNotAfterToday: true,
    });
    if (applyDateErrors(next)) {
      toast.warning(next.toDate || next.fromDate || 'Fix the date range.');
      setLoadedRows([]);
      setFhrReportsBySerial({});
      setError(null);
      return;
    }

    const fromDd = yyyyMmDdToDdMmYyyy(fromDate);
    const toDd = yyyyMmDdToDdMmYyyy(toDate);
    if (!fromDd || !toDd) {
      toast.error('Invalid date selection.');
      setLoadedRows([]);
      setFhrReportsBySerial({});
      setError(null);
      return;
    }

    const gen = ++fetchGenerationRef.current;

    setHasFetched(true);
    setLoading(true);
    setError(null);
    setFhrReportsBySerial({});
    try {
      const data = isNsExportPage
        ? await fetchNonScheduledAirlineFlights({
            filterBy: 'AirlineDate',
            fromDate,
            tillDate: toDate,
          })
        : await fetchDailyScheduledFromAdvance(fromDd, toDd, { bustCache: false });
      if (gen !== fetchGenerationRef.current) return;

      const processed = processFlightData(Array.isArray(data) ? data : []);
      const inWindow = filterFlightsToDateWindow(
        processed,
        fromDate,
        toDate,
        dateTypeFilters,
      ).filter((f) =>
        isNsExportPage ? true : !shouldHideScheduledAirlinesTableRow(f),
      );
      // Keep every in-range record for export; do not collapse/skip rows.
      // UI preview is capped separately to keep rendering responsive.
      setFhrReportsBySerial({});
      setLoadedRows(inWindow);
      setAirlineFilter('__all__');
      if (inWindow.length === 0) {
        toast.message(
          isNsExportPage
            ? 'No non-scheduled flights in this range.'
            : 'No scheduled flights in this range.',
          {
            description: isNsExportPage
              ? 'Fetched from ns_fhr_collection using indexed STA dates.'
              : 'This view includes all scheduled flights for the dates, including cancelled.',
          },
        );
      }
    } catch (e) {
      if (gen !== fetchGenerationRef.current) return;
      setLoadedRows([]);
      setFhrReportsBySerial({});
      setError(formatLoadError(e, 'Could not load flights.'));
      toast.error(formatLoadError(e, 'Could not load flights.'));
    } finally {
      if (gen === fetchGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [applyDateErrors, fromDate, toDate, dateTypeFilters, isNsExportPage]);

  useEffect(() => {
    const needAdvance = isEquipmentPage || includeAircraftBody || includePaxFreight;
    if (!needAdvance) {
      setAircraftBodyLookup(null);
      setAdvanceAircraftCatalogCodes(null);
      setAircraftBodyLookupLoading(false);
      return;
    }
    let ignore = false;
    setAircraftBodyLookupLoading(true);
    void fetchFlightsReferenceAircraft()
      .then((rows) => {
        if (ignore) return;
        setAircraftBodyLookup(
          isEquipmentPage || includeAircraftBody ? buildAircraftBodyLookupMap(rows) : null,
        );
        setAdvanceAircraftCatalogCodes(buildAdvanceAircraftCatalogCodeMap(rows));
      })
      .catch(() => {
        if (!ignore) {
          setAircraftBodyLookup(null);
          setAdvanceAircraftCatalogCodes(null);
        }
      })
      .finally(() => {
        if (!ignore) setAircraftBodyLookupLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [includeAircraftBody, includePaxFreight, isEquipmentPage]);

  const airlineOptions = useMemo(() => {
    const set = new Set<string>();
    loadedRows.forEach((f) => {
      const a = String(f.airline ?? '').trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [loadedRows]);

  const filteredRows = useMemo(() => {
    if (airlineFilter === '__all__') return loadedRows;
    return loadedRows.filter((f) => String(f.airline ?? '').trim() === airlineFilter);
  }, [loadedRows, airlineFilter]);
  const previewRows = useMemo(
    () => filteredRows.slice(0, previewRowLimit),
    [filteredRows, previewRowLimit],
  );
  const selectedDateFilterLabels = useMemo(
    () =>
      DATE_FILTER_OPTIONS.filter((opt) => dateTypeFilters.includes(opt.id))
        .map((opt) => opt.label)
        .join(', '),
    [dateTypeFilters],
  );

  const toggleDateTypeFilter = useCallback((filterType: FlightDateFilterType) => {
    setDateTypeFilters((prev) => {
      if (prev.includes(filterType)) {
        if (prev.length === 1) {
          toast.warning('Select at least one date type filter.');
          return prev;
        }
        return prev.filter((id) => id !== filterType);
      }
      return [...prev, filterType];
    });
  }, []);

  useEffect(() => {
    if (previewRows.length === 0) return;
    const missing = previewRows.filter((flight) => fhrReportForFlight(flight, fhrReportsBySerial) == null);
    if (missing.length === 0) return;
    const gen = ++previewFhrFetchGenRef.current;
    const base = getApiBase().replace(/\/$/, '');
    void fetchResolvedFlightReportRowsBatch(missing, base)
      .then((fhrRowsMap) => {
        if (gen !== previewFhrFetchGenRef.current) return;
        setFhrReportsBySerial((prev) => {
          let changed = false;
          const next = { ...prev };
          fhrRowsMap.forEach((report, flight) => {
            if (!report) return;
            for (const k of fhrSerialCandidates(flight)) {
              if (!k) continue;
              if (next[k] !== report) {
                next[k] = report;
                changed = true;
              }
            }
          });
          return changed ? next : prev;
        });
      })
      .catch(() => {
        // Keep preview usable with schedule fallback values on lookup errors.
      });
  }, [previewRows, fhrReportsBySerial]);

  useEffect(() => {
    if (!isEquipmentPage) {
      setEquipmentRows([]);
      setWheelchairEquipmentRows([]);
      setEquipmentLoading(false);
      return;
    }
    if (filteredRows.length === 0) {
      setEquipmentRows([]);
      setWheelchairEquipmentRows([]);
      setEquipmentLoading(false);
      return;
    }
    const gen = ++equipmentFetchGenRef.current;
    setEquipmentLoading(true);
    void (async () => {
      try {
        const [catalogItems, bodyMap] = await Promise.all([
          fetchEquipmentManpowerMasterCatalog(),
          // NB/WB lookup so the "Aircraft Body" column resolves from mainDetails.TypeCraft
          // (mirrors the server FHR resolution); falls back to embedded value / heuristic.
          aircraftBodyLookup && aircraftBodyLookup.size > 0
            ? Promise.resolve(aircraftBodyLookup)
            : fetchFlightsReferenceAircraft()
                .then((rows) => buildAircraftBodyLookupMap(rows))
                .catch(() => new Map<string, 'NB' | 'WB'>()),
        ]);
        const { gseLookup, unitTypeLookup } = buildEquipmentCatalogLookups(catalogItems);
        const { equipmentRows: gseRows, wheelchairRows } =
          await fetchEquipmentLinesForFlightsBatch(
            filteredRows,
            gseLookup,
            unitTypeLookup,
            bodyMap,
          );
        if (gen !== equipmentFetchGenRef.current) return;
        setEquipmentRows(gseRows);
        setWheelchairEquipmentRows(isNsExportPage ? [] : wheelchairRows);
      } catch {
        if (gen === equipmentFetchGenRef.current) {
          setEquipmentRows([]);
          setWheelchairEquipmentRows([]);
        }
      } finally {
        if (gen === equipmentFetchGenRef.current) setEquipmentLoading(false);
      }
    })();
  }, [isEquipmentPage, filteredRows, aircraftBodyLookup, isNsExportPage]);

  /** Equipment preview + Excel rows (GSE always; wheelchairs when checkbox on). */
  const equipmentExportRows = useMemo(() => {
    if (
      !includeWheelchairsInEquipmentExport ||
      isNsExportPage ||
      wheelchairEquipmentRows.length === 0
    ) {
      return equipmentRows;
    }
    return [...equipmentRows, ...wheelchairEquipmentRows];
  }, [
    equipmentRows,
    wheelchairEquipmentRows,
    includeWheelchairsInEquipmentExport,
    isNsExportPage,
  ]);

  const visibleColumnDefs = useMemo(() => {
    const selected = FHR_TABLE_EXPORT_COLUMNS.filter((c) => selectedCols[c.id]);
    const extras: Array<{
      id: string;
      header: string;
      get: (report: FhrReportRow | null, flight: FlightData) => unknown;
    }> = [];
    if (includeTypeOfHandling) {
      extras.push({
        id: EXPORT_EXTRA_TYPE_OF_HANDLING_ID,
        header: 'Type of Handling',
        get: (report) => typeOfHandlingFromFhrReport(report),
      });
    }
    if (includeAircraftBody) {
      const bodyMap = aircraftBodyLookup;
      extras.push({
        id: EXPORT_EXTRA_AIRCRAFT_BODY_ID,
        header: 'Aircraft Body (NB/WB)',
        get: (report, flight) => {
          if (aircraftBodyLookupLoading || !bodyMap || bodyMap.size === 0) return '';
          const raw = aircraftTypeRawForBodyLookup(report, flight);
          if (!raw) return '';
          return resolveAircraftBodyFromLookupMap(bodyMap, raw);
        },
      });
    }
    if (includePaxFreight) {
      const catalog = advanceAircraftCatalogCodes;
      extras.push({
        id: EXPORT_EXTRA_PAX_FREIGHT_ID,
        header: 'Pax / Freight',
        get: (report, flight) =>
          resolvePaxFreightLabel(
            report,
            flight,
            catalog && catalog.size > 0 ? catalog : null,
          ),
      });
    }
    return [...selected, ...extras];
  }, [
    selectedCols,
    includeTypeOfHandling,
    includeAircraftBody,
    includePaxFreight,
    aircraftBodyLookup,
    advanceAircraftCatalogCodes,
    aircraftBodyLookupLoading,
  ]);

  const toggleColumn = (id: string) => {
    setSelectedCols((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllColumns = (on: boolean) => {
    setSelectedCols((prev) => {
      const next = { ...prev };
      FHR_TABLE_EXPORT_COLUMNS.forEach((c) => {
        next[c.id] = on;
      });
      return next;
    });
    setIncludeTypeOfHandling(on);
    setIncludeAircraftBody(on);
    setIncludePaxFreight(on);
  };

  const visibleEquipColumns = useMemo(
    () => EQUIPMENT_TABLE_COLUMNS.filter((c) => selectedEquipCols[c.id]),
    [selectedEquipCols],
  );

  const selectedEquipCount = useMemo(
    () => EQUIPMENT_TABLE_COLUMNS.filter((c) => selectedEquipCols[c.id]).length,
    [selectedEquipCols],
  );

  const toggleEquipColumn = (id: string) => {
    setSelectedEquipCols((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllEquipColumns = (on: boolean) => {
    setSelectedEquipCols(() => {
      const next: Record<string, boolean> = {};
      EQUIPMENT_TABLE_COLUMNS.forEach((c) => {
        next[c.id] = on;
      });
      return next;
    });
  };

  const buildCsv = useCallback(
    (rows: FlightData[], colIds: ColumnDef[]) => {
      if (colIds.length === 0) return '';
      const headers = colIds.map((c) => c.header);
      const lines = [
        headers.map(csvEscape).join(','),
        ...rows.map((f) => {
          const report = fhrReportForFlight(f, fhrReportsBySerial);
          return colIds.map((c) => csvEscape(c.get(f, report))).join(',');
        }),
      ];
      return lines.join('\n');
    },
    [fhrReportsBySerial],
  );

  const exportNow = useCallback(() => {
    const run = async () => {
      if (filteredRows.length === 0) {
        toast.warning('No data loaded for this range, or adjust filters.');
        return;
      }
      const baseCols = FHR_TABLE_EXPORT_COLUMNS.filter((c) => selectedCols[c.id]);
      if (baseCols.length === 0 && !includeTypeOfHandling && !includeAircraftBody && !includePaxFreight) {
        toast.warning('Select at least one column for Excel export.');
        return;
      }

      const closedEntries: Array<[string, FlightData]> = filteredRows
        .map((f): [string, FlightData] => [String(f.slNo ?? '').trim(), f])
        .filter(([serial]) => serial.length > 0);
      const uniqueClosed = Array.from(new Map<string, FlightData>(closedEntries).values());
      if (uniqueClosed.length === 0) {
        toast.warning(
          isNsExportPage
            ? 'No non-scheduled flights found to export.'
            : 'No scheduled flights found to export.',
        );
        return;
      }

      setExportingNow(true);
      try {
        const base = getApiBase().replace(/\/$/, '');

        let bodyMapResolved = new Map<string, 'NB' | 'WB'>();
        if (includeAircraftBody) {
          bodyMapResolved =
            aircraftBodyLookup && aircraftBodyLookup.size > 0
              ? aircraftBodyLookup
              : new Map();
        }

        let catalogCodesResolved = new Map<string, string>();
        if (includePaxFreight) {
          catalogCodesResolved =
            advanceAircraftCatalogCodes && advanceAircraftCatalogCodes.size > 0
              ? advanceAircraftCatalogCodes
              : new Map();
        }

        const needAdvanceAircraftMaster =
          (includeAircraftBody && bodyMapResolved.size === 0) ||
          (includePaxFreight && catalogCodesResolved.size === 0);

        if (needAdvanceAircraftMaster) {
          try {
            const rows = await fetchFlightsReferenceAircraft();
            if (includeAircraftBody && bodyMapResolved.size === 0) {
              bodyMapResolved = buildAircraftBodyLookupMap(rows);
            }
            if (includePaxFreight && catalogCodesResolved.size === 0) {
              catalogCodesResolved = buildAdvanceAircraftCatalogCodeMap(rows);
            }
          } catch {
            if (includeAircraftBody && bodyMapResolved.size === 0) bodyMapResolved = new Map();
            if (includePaxFreight && catalogCodesResolved.size === 0) catalogCodesResolved = new Map();
          }
        }

        const extraCols: Array<{
          id: string;
          header: string;
          get: (report: FhrReportRow | null, flight: FlightData) => unknown;
        }> = [];
        if (includeTypeOfHandling) {
          extraCols.push({
            id: EXPORT_EXTRA_TYPE_OF_HANDLING_ID,
            header: 'Type of Handling',
            get: (report) => typeOfHandlingFromFhrReport(report),
          });
        }
        if (includeAircraftBody) {
          extraCols.push({
            id: EXPORT_EXTRA_AIRCRAFT_BODY_ID,
            header: 'Aircraft Body (NB/WB)',
            get: (report, flight) => {
              const raw = aircraftTypeRawForBodyLookup(report, flight);
              if (!raw) return '';
              return resolveAircraftBodyFromLookupMap(bodyMapResolved, raw);
            },
          });
        }
        if (includePaxFreight) {
          extraCols.push({
            id: EXPORT_EXTRA_PAX_FREIGHT_ID,
            header: 'Pax / Freight',
            get: (report, flight) =>
              resolvePaxFreightLabel(
                report,
                flight,
                catalogCodesResolved && catalogCodesResolved.size > 0 ? catalogCodesResolved : null,
              ),
          });
        }

        const colsSelected = [...baseCols, ...extraCols];

        const uncached = uniqueClosed.filter(
          (flight) => fhrReportForFlight(flight, fhrReportsBySerial) == null,
        );
        const uncachedReports =
          uncached.length > 0
            ? await fetchResolvedFlightReportRowsBatch(uncached, base)
            : new Map<FlightData, FhrReportRow | null>();

        const details = uniqueClosed.map((flight) => {
          const cached = fhrReportForFlight(flight, fhrReportsBySerial);
          const report = cached != null ? cached : (uncachedReports.get(flight) ?? null);
          return { flight, report };
        });

        const buildFhrWidthRows = (rows: Array<{ flight: FlightData; report: FhrReportRow | null }>) =>
          rows.map(({ flight, report }) => {
            const o: Record<string, string> = {};
            colsSelected.forEach((col) => {
              o[col.header] = String(col.get(report, flight) ?? '');
            });
            return o;
          });

        const widthRows = buildFhrWidthRows(details);
        await downloadExcelJsWorkbook({
          sheetName: isNsExportPage ? 'Non-Scheduled FHR' : 'Scheduled FHR',
          headers: colsSelected.map((c) => c.header),
          rows: details.map(({ flight, report }) =>
            colsSelected.map((col) => col.get(report, flight)),
          ),
          widthRows,
          fileName: isNsExportPage
            ? `non-scheduled-fhr-export_${fromDate}_${toDate}.xlsx`
            : `scheduled-closed-fhr-export_${fromDate}_${toDate}.xlsx`,
          formatCell: (cell, header, rawValue) => {
            applyExcelDateTimeCellFormat(
              cell as { value: unknown; numFmt?: string },
              header,
              rawValue,
            );
          },
        });

        const missingCount = details.filter((x) => x.report == null).length;
        if (missingCount > 0) {
          toast.success(`Excel exported (${details.length} rows). ${missingCount} used schedule fallback values.`);
        } else {
          toast.success(`Excel exported (${details.length} rows).`);
        }
      } catch (e) {
        console.error('FHR Excel export', e);
        toast.error(formatLoadError(e, 'FHR export failed. Please try again.'));
      } finally {
        setExportingNow(false);
      }
    };

    void run();
  }, [
    filteredRows,
    fhrReportsBySerial,
    fromDate,
    toDate,
    selectedCols,
    includeTypeOfHandling,
    includeAircraftBody,
    includePaxFreight,
    aircraftBodyLookup,
    advanceAircraftCatalogCodes,
    isNsExportPage,
  ]);

  const exportDelayData = useCallback(() => {
    const run = async () => {
      if (filteredRows.length === 0) {
        toast.warning('No data for this date range.');
        return;
      }
      const cols = EXPORT_COLUMNS.filter((c) => DELAY_EXPORT_IDS.includes(c.id));
      const csv = buildCsv(filteredRows, cols);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const saveAs = await loadFileSaverSaveAs();
      saveAs(
        blob,
        isNsExportPage
          ? `non-scheduled-delay-data_${fromDate}_${toDate}.csv`
          : `scheduled-closed-delay-data_${fromDate}_${toDate}.csv`,
      );
      toast.success('Delay data export started');
    };
    void run();
  }, [filteredRows, buildCsv, fromDate, toDate, isNsExportPage]);

  const exportEquipmentExcel = useCallback(() => {
    const run = async () => {
      if (equipmentExportRows.length === 0) {
        toast.warning('No equipment lines for this range or filters.');
        return;
      }
      const exportCols = EQUIPMENT_TABLE_COLUMNS.filter((c) => selectedEquipCols[c.id]);
      if (exportCols.length === 0) {
        toast.warning('Select at least one column for Excel export.');
        return;
      }
      setExportingEquipment(true);
      try {
        const widthRows = equipmentExportRows.map((r) => {
          const o: Record<string, string> = {};
          exportCols.forEach((col) => {
            o[col.header] = col.get(r);
          });
          return o;
        });
        await downloadExcelJsWorkbook({
          sheetName: isNsExportPage ? 'Non-Scheduled Equipment' : 'Equipment',
          headers: exportCols.map((c) => c.header),
          rows: equipmentExportRows.map((r) => exportCols.map((col) => col.get(r))),
          widthRows,
          fileName: isNsExportPage
            ? `non-scheduled-equipment-export_${fromDate}_${toDate}.xlsx`
            : `scheduled-equipment-export_${fromDate}_${toDate}.xlsx`,
        });
        toast.success(`Equipment Excel exported (${equipmentExportRows.length} rows).`);
      } catch (e) {
        console.error('Equipment Excel export', e);
        toast.error(formatLoadError(e, 'Equipment export failed. Please try again.'));
      } finally {
        setExportingEquipment(false);
      }
    };

    void run();
  }, [equipmentExportRows, fromDate, toDate, selectedEquipCols, isNsExportPage]);

  const selectedCount = useMemo(
    () =>
      FHR_TABLE_EXPORT_COLUMNS.filter((c) => selectedCols[c.id]).length +
      (includeTypeOfHandling ? 1 : 0) +
      (includeAircraftBody ? 1 : 0) +
      (includePaxFreight ? 1 : 0),
    [selectedCols, includeTypeOfHandling, includeAircraftBody, includePaxFreight],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-50 px-3 py-4 sm:px-4 sm:py-5 md:p-6"
    >
      <div className="mx-auto max-w-[1600px] space-y-3 sm:space-y-4">
        <FrisPageHeader
          title={isNsExportPage ? 'Non Scheduled Data Export' : 'Scheduled data export'}
          icon={FileSpreadsheet}
        />

        {/* Export mode + legacy category tabs */}
        <div className="-mx-3 flex snap-x snap-mandatory overflow-x-auto rounded-lg border border-gray-200 bg-white px-1 shadow-sm scrollbar-thin sm:mx-0">
          {dataExportTabs.map((tab) => {
            if (tab.exportMode) {
              const isActive = exportView === tab.exportMode;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setExportView(tab.exportMode!)}
                  className={cn(
                    'shrink-0 snap-start px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap sm:px-4 sm:text-sm',
                    isActive
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  {tab.label}
                </button>
              );
            }

            const onNsDataExportPath = Boolean(
              pathname?.includes('non-scheduled-airlines/data-export') ||
                pathname?.includes('Non-Scheduled-Airlines/data-export'),
            );
            const onScheduledDataExportPath = Boolean(
              pathname?.includes('/scheduledairlines/data-export'),
            );
            const isActive =
              tab.href != null &&
              (tab.id === 'ns'
                ? onNsDataExportPath && !isEquipmentPage
                : tab.id === 'ns-equipment'
                  ? onNsDataExportPath && isEquipmentPage
                  : tab.id === 'fhr-export'
                    ? onScheduledDataExportPath && !isEquipmentPage
                    : tab.id === 'equipment-export'
                      ? onScheduledDataExportPath && isEquipmentPage
                      : tab.id === 'nsa' || tab.id === 'rafh'
                        ? false
                        : pathname === tab.href ||
                          pathname?.startsWith(`${tab.href}/`));
            if (tab.href) {
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={cn(
                    'shrink-0 snap-start px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap sm:px-4 sm:text-sm',
                    isActive
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  {tab.label}
                </Link>
              );
            }
            return (
              <button
                key={tab.id}
                type="button"
                disabled
                title="Not available in FRIS yet"
                className="shrink-0 snap-start px-3 py-2.5 text-xs font-medium border-b-2 border-transparent text-gray-400 cursor-not-allowed whitespace-nowrap sm:px-4 sm:text-sm"
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filters (Advance-style: white card, emerald actions) */}
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 md:p-5">
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 lg:grid-cols-12">
            <div className="min-w-0 md:col-span-1 lg:col-span-2">
              <label htmlFor="data-export-airline-filter" className="mb-1.5 block text-xs font-bold text-gray-800">
                Choose Airlines
              </label>
              <Select
                value={airlineFilter}
                onValueChange={setAirlineFilter}
                disabled={loadedRows.length === 0}
              >
                <SelectTrigger
                  id="data-export-airline-filter"
                  className="h-10 w-full border border-gray-200 bg-white text-gray-900 shadow-sm focus:ring-emerald-500 focus:ring-offset-0"
                >
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="border border-gray-200 bg-white text-gray-900 shadow-lg">
                  <SelectItem value="__all__" className="text-gray-900">All</SelectItem>
                  {airlineOptions.map((a) => (
                    <SelectItem key={a} value={a} className="text-gray-900">
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormFieldError />
            </div>

            <div className="min-w-0 md:col-span-1 lg:col-span-2">
              <p className="mb-1.5 block text-xs font-bold text-gray-800">Selected Columns</p>
              <div className="flex h-10 w-full items-center rounded-lg border border-gray-200 bg-gray-50/80 px-3 text-sm text-gray-900">
                {isEquipmentPage ? selectedEquipCount : selectedCount} columns selected
              </div>
              <FormFieldError />
            </div>

            <div className="min-w-0 md:col-span-2 lg:col-span-4">
              <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
                <div className={cn(dateErrors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                  <label htmlFor="field-fromDate" className="mb-1.5 block text-xs font-bold text-gray-800">
                    From Date
                  </label>
                  <div className="rounded-lg border border-gray-200 bg-white p-0.5">
                    <DatePicker
                      id="field-fromDate"
                      value={fromDate}
                      onChange={(v) => {
                        setFromDate(v);
                        clearDateField('fromDate');
                        clearDateField('toDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      className="w-full min-w-0 border-0"
                      ariaLabel="From date"
                    />
                  </div>
                  <FormFieldError id="field-fromDate-error" message={dateErrors.fromDate} />
                </div>
                <div className={cn(dateErrors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                  <label htmlFor="field-toDate" className="mb-1.5 block text-xs font-bold text-gray-800">
                    To Date
                  </label>
                  <div className="rounded-lg border border-gray-200 bg-white p-0.5">
                    <DatePicker
                      id="field-toDate"
                      value={toDate}
                      onChange={(v) => {
                        setToDate(v);
                        clearDateField('toDate');
                        clearDateField('fromDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      className="w-full min-w-0 border-0"
                      ariaLabel="To date"
                    />
                  </div>
                  <FormFieldError id="field-toDate-error" message={dateErrors.toDate} />
                </div>
              </div>
            </div>

            <div className="min-w-0 md:col-span-2 lg:col-span-4">
              <span
                className="mb-1.5 block select-none text-xs font-bold text-gray-800 invisible"
                aria-hidden
              >
                &nbsp;
              </span>
              <div className="flex flex-wrap gap-2">
              {/* Fetch button — always visible on both tabs; the single action that loads flight + equipment data */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void loadClosedFlights()}
                disabled={loading}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-40 xs:w-auto"
              >
                {loading ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <Search className="h-4 w-4 shrink-0" />}
                {loading ? 'Fetching…' : 'Fetch Data'}
              </motion.button>
              {!isEquipmentPage ? (
                <>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={exportDelayData}
                    disabled={filteredRows.length === 0}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 xs:w-auto"
                  >
                    <CalendarClock className="h-4 w-4 shrink-0" />
                    Delay Data
                  </motion.button>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={exportNow}
                    disabled={filteredRows.length === 0 || exportingNow}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 xs:w-auto"
                  >
                    {exportingNow ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <Download className="h-4 w-4 shrink-0" />}
                    {exportingNow ? 'Exporting FHR…' : 'Export Now'}
                  </motion.button>
                </>
              ) : (
                <>
                  {!isNsExportPage ? (
                    <label className="inline-flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-800 shadow-sm xs:w-auto sm:text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        checked={includeWheelchairsInEquipmentExport}
                        onChange={(e) =>
                          setIncludeWheelchairsInEquipmentExport(e.target.checked)
                        }
                        aria-describedby="equip-wheelchair-export-hint"
                      />
                      <span className="leading-tight">
                        Include wheelchairs (WCHC / WCHR / WCHS)
                      </span>
                    </label>
                  ) : null}
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={exportEquipmentExcel}
                    disabled={
                      equipmentExportRows.length === 0 ||
                      equipmentLoading ||
                      exportingEquipment
                    }
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 xs:w-auto"
                  >
                    {exportingEquipment ? (
                      <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 shrink-0" />
                    )}
                    {exportingEquipment ? 'Exporting…' : 'Export Now'}
                  </motion.button>
                </>
              )}
              </div>
              {isEquipmentPage && !isNsExportPage ? (
                <p
                  id="equip-wheelchair-export-hint"
                  className="mt-1.5 text-[11px] text-gray-600"
                >
                  When checked, Export adds wheelchair pax rows from FHR terminal
                  details (arrival + departure) for each flight. Off by default.
                  {wheelchairEquipmentRows.length > 0
                    ? ` ${wheelchairEquipmentRows.length} wheelchair row(s) available for this fetch.`
                    : ''}
                </p>
              ) : null}
              <FormFieldError />
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
            <p className="mb-2 text-xs font-bold text-gray-800">Date Type Filter (fetch scope)</p>
            <div className="flex flex-wrap gap-2">
              {DATE_FILTER_OPTIONS.map((option) => {
                const active = dateTypeFilters.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleDateTypeFilter(option.id)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                      active
                        ? 'border-emerald-600 bg-emerald-100 text-emerald-900'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-gray-600">
              Flights are fetched when any selected date type is within the chosen range.
            </p>
          </div>
          {!isEquipmentPage && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 overflow-hidden">
              <button
                type="button"
                onClick={() => setFhrExportColumnsOpen((o) => !o)}
                aria-expanded={fhrExportColumnsOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-100/80 sm:gap-3"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 shrink-0 text-emerald-600 transition-transform',
                      fhrExportColumnsOpen && 'rotate-180',
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold text-gray-800">
                    {isNsExportPage ? 'NS FHR export columns' : 'FHR export columns'}
                  </span>
                  <span className="text-xs text-gray-500 truncate">({selectedCount} selected)</span>
                </span>
                <span className="text-xs font-medium text-emerald-700 shrink-0">
                  {fhrExportColumnsOpen ? 'Hide' : 'Show'}
                </span>
              </button>
              {fhrExportColumnsOpen ? (
                <div className="border-t border-gray-200 p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => selectAllColumns(true)}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                      >
                        Select all
                      </motion.button>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => selectAllColumns(false)}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                      >
                        Clear
                      </motion.button>
                    </div>
                    <span className="text-xs text-gray-600 sm:text-right">
                      Columns shown in preview and Excel (FHR export)
                    </span>
                  </div>
                  <div className="max-h-[min(480px,55vh)] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-1 pr-1">
                    {FHR_TABLE_EXPORT_COLUMNS.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 py-1 rounded cursor-pointer text-xs text-gray-800"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          checked={!!selectedCols[c.id]}
                          onChange={() => toggleColumn(c.id)}
                        />
                        <span className="truncate" title={c.header}>
                          {c.header}
                        </span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 py-1 rounded cursor-pointer text-xs text-gray-800">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        checked={includeTypeOfHandling}
                        onChange={(e) => setIncludeTypeOfHandling(e.target.checked)}
                        aria-label="Include Type of Handling from FHR"
                      />
                      <span className="truncate" title="From fhr_collection via flight report (TypeofHandling)">
                        Type of Handling (FHR)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 py-1 rounded cursor-pointer text-xs text-gray-800">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        checked={includeAircraftBody}
                        onChange={(e) => setIncludeAircraftBody(e.target.checked)}
                        aria-label="Include aircraft body NB or WB from advance-aircraft master"
                      />
                      <span
                        className="truncate"
                        title="NB/WB from advance-aircraft matched on aircraft type"
                      >
                        Aircraft Body (NB/WB)
                        {includeAircraftBody && aircraftBodyLookupLoading && (
                          <span className="ml-1 text-gray-500">(loading…)</span>
                        )}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 py-1 rounded cursor-pointer text-xs text-gray-800">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        checked={includePaxFreight}
                        onChange={(e) => setIncludePaxFreight(e.target.checked)}
                        aria-label="Include Pax or Freighter from aircraft type"
                      />
                      <span
                        className="truncate"
                        title="Freighter if aircraft type contains F (FHR TypeCraft / schedule, plus advance-aircraft catalog); otherwise Passenger when type is known"
                      >
                        Pax / Freight
                        {includePaxFreight && aircraftBodyLookupLoading && (
                          <span className="ml-1 text-gray-500">(loading…)</span>
                        )}
                      </span>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {isEquipmentPage && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 overflow-hidden">
              <button
                type="button"
                onClick={() => setEquipExportColumnsOpen((o) => !o)}
                aria-expanded={equipExportColumnsOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-100/80 sm:gap-3"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 shrink-0 text-emerald-600 transition-transform',
                      equipExportColumnsOpen && 'rotate-180',
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold text-gray-800">
                    {isNsExportPage
                      ? 'NS equipment export columns'
                      : 'Equipment export columns'}
                  </span>
                  <span className="text-xs text-gray-500 truncate">({selectedEquipCount} selected)</span>
                </span>
                <span className="text-xs font-medium text-emerald-700 shrink-0">
                  {equipExportColumnsOpen ? 'Hide' : 'Show'}
                </span>
              </button>
              {equipExportColumnsOpen ? (
                <div className="border-t border-gray-200 p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => selectAllEquipColumns(true)}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                      >
                        Select all
                      </motion.button>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => selectAllEquipColumns(false)}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 shadow-sm"
                      >
                        Clear
                      </motion.button>
                    </div>
                    <span className="text-xs text-gray-600 sm:text-right">
                      Columns shown in preview and Excel (Equipment export)
                    </span>
                  </div>
                  <div className="max-h-[min(480px,55vh)] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-1 pr-1">
                    {EQUIPMENT_TABLE_COLUMNS.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 py-1 rounded cursor-pointer text-xs text-gray-800"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          checked={!!selectedEquipCols[c.id]}
                          onChange={() => toggleEquipColumn(c.id)}
                        />
                        <span className="truncate" title={c.header}>
                          {c.header}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <p className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs leading-relaxed text-gray-600">
            <Table2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1">
              {!isEquipmentPage ? (
                <>
                  Showing {Math.min(filteredRows.length, previewRowLimit)} of{' '}
                  {filteredRows.length}{' '}
                  {isNsExportPage ? 'non-scheduled' : 'flight schedule'} row(s) in
                  range {fromDate} → {toDate}
                  {selectedDateFilterLabels ? ` · Date type: ${selectedDateFilterLabels}` : ''}
                  {airlineFilter !== '__all__' ? ` · Airline: ${airlineFilter}` : ''}
                </>
              ) : (
                <>
                  Showing {equipmentExportRows.length} equipment line(s) from {filteredRows.length} flight(s), range{' '}
                  {fromDate} → {toDate}
                  {airlineFilter !== '__all__' ? ` · Airline: ${airlineFilter}` : ''}
                </>
              )}
            </span>
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 sm:px-4 sm:py-3">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-gray-100 bg-gray-50/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
            <span className="text-sm font-semibold text-gray-800">
              {!isEquipmentPage
                ? isNsExportPage
                  ? 'Non-Scheduled flights'
                  : 'Scheduled flights'
                : isNsExportPage
                  ? 'Non-Scheduled equipment data'
                  : 'Equipment data'}
            </span>
            {!isEquipmentPage && loading && (
              <span className="text-xs text-gray-500 animate-pulse">Loading…</span>
            )}
            {isEquipmentPage && (loading || equipmentLoading) && (
              <span className="text-xs text-gray-500 animate-pulse">Loading…</span>
            )}
          </div>
          <div className="overflow-x-auto overscroll-x-contain">
            {!isEquipmentPage ? (
            <table className="w-full min-w-[640px] text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-700 sm:text-xs">
                  {visibleColumnDefs.length === 0 ? (
                    <th className="px-2 py-2.5 sm:px-4 sm:py-3">Select columns</th>
                  ) : (
                    visibleColumnDefs.map((c) => (
                      <th key={c.id} className="whitespace-nowrap px-2 py-2.5 sm:px-4 sm:py-3">
                        {c.header}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={Math.max(visibleColumnDefs.length, 1)}
                      className="px-3 py-12 text-center text-gray-500 sm:px-4 sm:py-16"
                    >
                      Loading{' '}
                      {isNsExportPage ? 'non-scheduled flights' : 'flight schedule'} for the
                      selected date range…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(visibleColumnDefs.length, 1)}
                      className="px-3 py-12 text-center text-gray-500 sm:px-4 sm:py-16"
                    >
                      {!hasFetched
                        ? `Select a date range and click Fetch Data to load ${
                            isNsExportPage ? 'non-scheduled flights' : 'the flight schedule'
                          }.`
                        : loadedRows.length === 0
                          ? isNsExportPage
                            ? 'No non-scheduled flights for this date range, or dates are invalid (cannot be after today).'
                            : 'No scheduled flights for this date range, or dates are invalid (cannot be after today).'
                          : 'No rows match the airline filter.'}
                    </td>
                  </tr>
                ) : (
                  previewRows.map((f) => (
                    <tr
                      key={`${f.slNo}-${f.staDate}-${f.staTime}`}
                      className="border-t border-gray-100 hover:bg-emerald-50/50"
                    >
                      {visibleColumnDefs.map((c) => {
                        const report = fhrReportForFlight(f, fhrReportsBySerial);
                        return (
                          <td key={c.id} className="whitespace-nowrap px-2 py-2 text-gray-800 sm:px-4 sm:py-2.5">
                            {c.header === 'Serial No' ? (
                              <span className="font-mono text-[11px] sm:text-xs">{String(c.get(report, f) ?? '')}</span>
                            ) : (
                              String(c.get(report, f) ?? '') || '—'
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            ) : (
            <table className="w-full min-w-[640px] text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-700 sm:text-xs">
                  {visibleEquipColumns.length === 0 ? (
                    <th className="px-2 py-2.5 sm:px-4 sm:py-3">Select columns</th>
                  ) : (
                    visibleEquipColumns.map((c) => (
                      <th key={c.id} className="whitespace-nowrap px-2 py-2.5 sm:px-4 sm:py-3">
                        {c.header}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {loading || equipmentLoading ? (
                  <tr>
                    <td
                      colSpan={Math.max(visibleEquipColumns.length, 1)}
                      className="px-3 py-12 text-center text-gray-500 sm:px-4 sm:py-16"
                    >
                      Loading equipment data for the selected flights…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(visibleEquipColumns.length, 1)}
                      className="px-3 py-12 text-center text-gray-500 sm:px-4 sm:py-16"
                    >
                      {!hasFetched
                        ? `Select a date range and click Fetch Data to load ${
                            isNsExportPage
                              ? 'non-scheduled equipment data'
                              : 'scheduled equipment data'
                          }.`
                        : loadedRows.length === 0
                          ? isNsExportPage
                            ? 'No non-scheduled flights for this date range, or dates are invalid (cannot be after today).'
                            : 'No scheduled flights for this date range, or dates are invalid (cannot be after today).'
                          : 'No rows match the airline filter.'}
                    </td>
                  </tr>
                ) : equipmentExportRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(visibleEquipColumns.length, 1)}
                      className="px-3 py-12 text-center text-gray-500 sm:px-4 sm:py-16"
                    >
                      No equipment lines recorded for these flights in{' '}
                      {isNsExportPage ? 'ns_fhr_collection' : 'FHR'}.
                      {!isNsExportPage &&
                      includeWheelchairsInEquipmentExport &&
                      wheelchairEquipmentRows.length === 0
                        ? ' No wheelchair counts either.'
                        : ''}
                    </td>
                  </tr>
                ) : (
                  equipmentExportRows.map((r, idx) => (
                    <tr
                      key={`${idx}-${r.flight.slNo}-${r.equipment_name}-${r.from_date}-${r.equipment_quantity}`}
                      className="border-t border-gray-100 hover:bg-emerald-50/50"
                    >
                      {visibleEquipColumns.map((c) => (
                        <td key={c.id} className="whitespace-nowrap px-2 py-2 text-gray-800 sm:px-4 sm:py-2.5">
                          {c.id === 'sl' ? (
                            <span className="font-mono text-[11px] sm:text-xs">{c.get(r) || '—'}</span>
                          ) : (
                            c.get(r) || '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
