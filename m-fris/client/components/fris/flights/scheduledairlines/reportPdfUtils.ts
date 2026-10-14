/**
 * Shared PDF helpers used by FHR report and Equipment report.
 */

import {
  getSessionStationCode,
  getSessionStationLogoPath,
} from '@/lib/station-company-logo';

export interface NonScheduledReportHeaderData {
  challanNo?: string;
  bookingNo?: string;
  operation?: string;
  handlingType?: string;
  mtow?: string | number;
  /** Booking operator — shown with airline as `Airline-(Operator)` on NS FHR. */
  operator?: string;
}

/** `Airline-(Operator)` when both present; else whichever is non-empty. */
export function formatNsAirlineWithOperator(
  airline: string | null | undefined,
  operator?: string | null,
): string {
  const a = String(airline ?? '').trim();
  const o = String(operator ?? '').trim();
  if (a && o) return `${a}-(${o})`;
  return a || o || '';
}

/** Draw one PDF line; shrink font so long Performa/Booking stay on a single line. */
export function drawPdfTextFitWidth(
  doc: {
    setFontSize: (n: number) => void;
    getTextWidth: (t: string) => number;
    text: (
      t: string,
      x: number,
      y: number,
      opts?: { align?: 'left' | 'right' | 'center' | 'justify' },
    ) => unknown;
  },
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts?: { fontSize?: number; minFontSize?: number; align?: 'left' | 'right' | 'center' },
): void {
  const start = opts?.fontSize ?? 10;
  const min = opts?.minFontSize ?? 6;
  let size = start;
  doc.setFontSize(size);
  while (size > min && doc.getTextWidth(text) > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  doc.text(text, x, y, { align: opts?.align ?? 'left' });
  doc.setFontSize(start);
}

/**
 * Draw a right-side info block with a shared left edge (not jagged right-align).
 * Block’s right edge sits at `rightX`; long lines shrink font so they still fit.
 */
export function drawPdfRightAlignedBlock(
  doc: {
    setFontSize: (n: number) => void;
    getTextWidth: (t: string) => number;
    text: (
      t: string,
      x: number,
      y: number,
      opts?: { align?: 'left' | 'right' | 'center' | 'justify' },
    ) => unknown;
  },
  lines: string[],
  rightX: number,
  startY: number,
  maxWidth: number,
  opts?: { fontSize?: number; minFontSize?: number; lineHeight?: number },
): number {
  const start = opts?.fontSize ?? 10;
  const min = opts?.minFontSize ?? 6.5;
  const lineHeight = opts?.lineHeight ?? 4;
  let size = start;
  doc.setFontSize(size);
  const widest = () => Math.max(0, ...lines.map((line) => doc.getTextWidth(line)));
  while (size > min && widest() > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  const blockW = Math.min(maxWidth, Math.max(widest(), 1));
  const leftX = rightX - blockW;
  lines.forEach((line, index) => {
    doc.setFontSize(size);
    doc.text(line, leftX, startY + index * lineHeight, { align: 'left' });
  });
  doc.setFontSize(start);
  return lines.length * lineHeight;
}

export function formatReportMtow(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const numeric = Number(raw.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric.toFixed(2) : raw;
}

/**
 * Station IATA code printed on all flight reports (FHR, GSE, Team, etc.).
 * Resolved from the logged-in session so the prefix always reflects the active
 * station, never a hardcoded value.
 */
export function getReportStationCode(): string {
  return getSessionStationCode();
}

/** e.g. `MAA / 16616` (station code reflects the logged-in station) */
export function formatReportSerialNo(
  serialNo: string | number | null | undefined,
): string {
  const stationCode = getReportStationCode();
  const serial = String(serialNo ?? '').trim();
  return serial ? `${stationCode} / ${serial}` : stationCode;
}

/** e.g. `Serial No : MAA / 16616` */
export function formatReportSerialNoLabel(
  serialNo: string | number | null | undefined,
): string {
  return `Serial No : ${formatReportSerialNo(serialNo)}`;
}

/** Trim ADC / FIC for FHR; each field displays independently when non-empty. */
export function adcFicForFhrReport(
  adcNo?: string,
  ficNo?: string,
): { adcNo: string; ficNo: string } {
  return {
    adcNo: String(adcNo ?? '').trim(),
    ficNo: String(ficNo ?? '').trim(),
  };
}

/** Format date as dd/mm/yyyy for flight details (handles yyyy-MM-dd, dd-MM-yyyy, dd/MM/yyyy). */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr?.trim()) return '';
  const parts = dateStr.trim().split(/[-/]/).map((p) => p.trim());
  if (parts.length !== 3) return dateStr;
  let day: string;
  let month: string;
  let year: string;
  const first = parts[0];
  const second = parts[1];
  const third = parts[2];
  if (first.length === 4 && /^19\d{2}|20\d{2}$/.test(first)) {
    year = first;
    month = second.padStart(2, '0');
    day = third.padStart(2, '0');
  } else {
    day = first.padStart(2, '0');
    month = second.padStart(2, '0');
    year = third.length === 2 ? `20${third}` : third.padStart(4, '0');
  }
  return `${day}/${month}/${year}`;
}

export function formatTime(timeStr: string): string {
  if (!timeStr?.trim()) return '';
  const trimmed = timeStr.trim();
  // Combined "dd/mm/yyyy HH:mm" (or ISO) — show clock only.
  const spaceIdx = trimmed.search(/\s+/);
  const clock =
    spaceIdx > 0 && /\d{1,2}[/-]\d{1,2}/.test(trimmed.slice(0, spaceIdx))
      ? trimmed.slice(spaceIdx + 1).trim()
      : trimmed.includes('T')
        ? trimmed.slice(trimmed.indexOf('T') + 1)
        : trimmed;
  const parts = clock.split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return clock;
}

/** Coerce Mongo/API value (string, `{ $date }`, `Date`) to a string `Date` can parse. */
export function coerceEquipmentDateField(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v !== null && '$date' in v) {
    const inner = (v as { $date: string | number }).$date;
    if (typeof inner === 'number') return new Date(inner).toISOString();
    return String(inner).trim();
  }
  return String(v).trim();
}

/**
 * equipmentManpower `entries[]`: `fromDate`/`toDate` may contain a full datetime while
 * `fromTime`/`toTime` are empty (e.g. ISO or `Date#toString()`). Splits into date (dd/mm/yyyy) and time (HH:mm).
 */
export function splitEquipmentDateTimeForDisplay(
  dateField: unknown,
  timeField: unknown,
): { date: string; time: string } {
  const raw = coerceEquipmentDateField(dateField);
  const existingTimeRaw = timeField == null ? '' : String(timeField).trim();
  const existingTime = existingTimeRaw ? formatTime(existingTimeRaw) : '';

  if (!raw) return { date: '', time: existingTime };

  const parsed = new Date(raw);
  const parsedOk = !Number.isNaN(parsed.getTime());
  const trimmed = raw.trim();
  const dateOnlyYmd = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const looksLikeHasTime =
    !!existingTime ||
    /[Tt]\d{2}:|GMT|UTC|\(\w+(\s+\w+)*\)|^[A-Za-z]{3}\s[A-Za-z]{3}\s+\d{1,2}\s+\d{4}/.test(
      trimmed,
    );

  if (parsedOk) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    const date = formatDisplayDate(`${y}-${m}-${d}`);

    let time = existingTime;
    if (!time && looksLikeHasTime && !dateOnlyYmd) {
      time = formatTime(`${parsed.getHours()}:${parsed.getMinutes()}`);
    }
    return { date, time };
  }

  return {
    date: formatDisplayDate(raw),
    time: existingTime,
  };
}

/** Parse date-time string (dd/mm/yyyy HH:mm, yyyy-mm-dd HH:mm, HH:mm, or date only) to Date or null. */
function parseDateTime(s: string | undefined): Date | null {
  if (!s?.trim()) return null;
  const t = s.trim();
  const spaceIdx = t.indexOf(' ');
  let datePart = '';
  let timePart = '';
  if (spaceIdx > 0) {
    datePart = t.slice(0, spaceIdx).trim();
    timePart = t.slice(spaceIdx + 1).trim();
  } else if (t.includes(':')) {
    timePart = t;
  } else if (t.includes('/') || t.includes('-')) {
    datePart = t;
  }
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  let day = now.getDate();
  let hour = 0;
  let min = 0;
  if (datePart) {
    const parts = datePart.split(/[-/]/).map((p) => p.trim());
    if (parts.length !== 3) return null;
    if (parts[0].length === 4 && /^19\d{2}|20\d{2}$/.test(parts[0])) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2], 10);
    }
  }
  if (timePart) {
    const tp = timePart.split(':');
    if (tp.length >= 2) {
      hour = parseInt(tp[0], 10) || 0;
      min = parseInt(tp[1], 10) || 0;
    }
  }
  const d = new Date(year, month, day, hour, min, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Ground time for FHR (SGT / AGT): `to − from`, as HH:MM:SS.
 * Uses date+time when both dates present; otherwise time-only (next-day wrap if to < from).
 */
export function formatGroundTimeBetween(
  fromDate: string | undefined,
  fromTime: string | undefined,
  toDate: string | undefined,
  toTime: string | undefined,
): string {
  const fromT = formatTime(fromTime ?? '');
  const toT = formatTime(toTime ?? '');
  if (!fromT || !toT) return '';
  const fromD = (fromDate ?? '').trim();
  const toD = (toDate ?? '').trim();
  const fromStr =
    fromD && toD ? `${formatDisplayDate(fromD) || fromD} ${fromT}` : fromT;
  const toStr = fromD && toD ? `${formatDisplayDate(toD) || toD} ${toT}` : toT;

  const from = parseDateTime(fromStr);
  let to = parseDateTime(toStr);
  if (!from || !to) return '';
  let diffMs = to.getTime() - from.getTime();
  const timeOnly = (s: string) => s.includes(':') && !s.includes(' ');
  if (timeOnly(fromStr) && timeOnly(toStr) && diffMs < 0) {
    to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    diffMs = to.getTime() - from.getTime();
  }
  if (diffMs < 0) return '';
  return formatSecondsAsHms(Math.floor(diffMs / 1000));
}

/** Duration as mm:ss (minutes may exceed 59). */
export function formatDurationAsMmSs(diffMs: number): string {
  if (!Number.isFinite(diffMs) || diffMs < 0) return '';
  const totalSec = Math.floor(diffMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * FHR IPOS Time: Arr Belt Last − First as mm:ss.
 * `first`/`last` may be combined "date time" or time-only.
 */
export function formatIposTimeFromFirstLast(
  firstRaw: string | undefined,
  lastRaw: string | undefined,
): string {
  const first = (firstRaw ?? '').trim();
  const last = (lastRaw ?? '').trim();
  if (!first || !last) return '';

  let from = parseDateTime(first);
  let to = parseDateTime(last);
  if (!from || !to) {
    const fromT = formatTime(first);
    const toT = formatTime(last);
    if (!fromT || !toT) return '';
    from = parseDateTime(fromT);
    to = parseDateTime(toT);
    if (!from || !to) return '';
  }

  let diffMs = to.getTime() - from.getTime();
  const timeOnly = (s: string) => s.includes(':') && !/\s/.test(s.trim());
  if (timeOnly(first) && timeOnly(last) && diffMs < 0) {
    to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    diffMs = to.getTime() - from.getTime();
  }
  // Combined date+time with same calendar day but last clock before first → empty
  if (diffMs < 0 && !timeOnly(first) && !timeOnly(last)) {
    return '';
  }
  if (diffMs < 0) {
    to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    diffMs = to.getTime() - from.getTime();
  }
  if (diffMs < 0) return '';
  return formatDurationAsMmSs(diffMs);
}

/** Compute duration between cleaning from and to (e.g. "1 hrs 30 min" or "45 min"). Handles time-only (HH:mm): if to < from, treats to as next day. */
export function formatDurationBetween(fromStr: string | undefined, toStr: string | undefined): string {
  const from = parseDateTime(fromStr);
  let to = parseDateTime(toStr);
  if (!from || !to) return '';
  let diffMs = to.getTime() - from.getTime();
  // Time-only: if to is earlier than from, assume to is next day (e.g. 23:30 -> 00:15)
  const timeOnly = (s: string | undefined) => s != null && s.trim().includes(':') && !s.trim().includes(' ');
  if (timeOnly(fromStr) && timeOnly(toStr) && diffMs < 0) {
    to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    diffMs = to.getTime() - from.getTime();
  }
  if (diffMs < 0) return '';
  const totalMin = Math.round(diffMs / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hrs} hrs ${mins} min` : `${hrs} hrs`;
}

/** Human-readable duration from minute count (matches formatDurationBetween style). */
function formatHumanCleaningMinutes(totalMin: number): string {
  if (totalMin < 0) return '';
  if (totalMin < 60) return `${totalMin} min`;
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hrs} hrs ${mins} min` : `${hrs} hrs`;
}

/** Same idea as Ramp Details “Cleaning Duration” (HH:mm delta → FHR wording). */
function cleaningDurationFromTimeStringsOnly(fromT: string, toT: string): string {
  const fromM = timeToMinutes(fromT);
  const toM = timeToMinutes(toT);
  if (fromM == null || toM == null) return '';
  let diff = toM - fromM;
  if (diff < 0) diff += 24 * 60;
  return formatHumanCleaningMinutes(diff);
}

function cleaningTimePartForDuration(s: string | undefined): string {
  if (!s?.trim()) return '';
  const t = s.trim();
  if (t.includes(' ')) return extractTimePart(t);
  if (t.includes(':')) return t;
  return '';
}

/**
 * FHR **cleaningDuration**: API value, else full date/time parse, else time-only (Cleaning Started/Closed times).
 */
export function resolveCleaningDurationForReport(
  cleaningDuration: string | undefined,
  cleaningFrom: string | undefined,
  cleaningTo: string | undefined,
): string {
  const d = cleaningDuration?.trim();
  if (d) return d;
  const full = formatDurationBetween(cleaningFrom, cleaningTo);
  if (full) return full;
  return cleaningDurationFromTimeStringsOnly(
    cleaningTimePartForDuration(cleaningFrom),
    cleaningTimePartForDuration(cleaningTo),
  );
}

/** Parse delay duration HH:mm or HH:mm:ss to total seconds (duration, not clock). */
export function parseDelayDurationToSeconds(t: string | undefined | null): number {
  if (!t?.trim()) return 0;
  const normalized = t.trim().replace(/\./g, ':');
  const parts = normalized.split(':').map((p) => Number(p.trim()));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return 0;
  const [h = 0, m = 0, s = 0] = parts;
  if (h < 0 || m < 0 || m > 59 || s < 0 || s > 59) return 0;
  return h * 3600 + m * 60 + s;
}

/** Format total seconds as HH:mm:ss (hours capped at 99 for display). */
export function formatSecondsAsHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.min(99, Math.floor(safe / 3600));
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Sum one or more delay duration strings into HH:mm:ss. */
export function sumDelayDurations(...parts: Array<string | undefined | null>): string {
  const total = parts.reduce((acc, p) => acc + parseDelayDurationToSeconds(p), 0);
  return formatSecondsAsHms(total);
}

function pickDelayFromRow(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  const o = row as Record<string, unknown>;
  return String(o.delay ?? o.Delay ?? o.DelayTime ?? o.delayTime ?? '').trim();
}

/**
 * FHR Total Delay = Arrival Delay + Departure Delay.
 * Uses delay-reason row durations when totals are blank; then `fallback`.
 */
export function resolveFhrTotalDelay(opts: {
  arrivalDelay?: string | null;
  actualDelay?: string | null;
  departureDelay?: string | null;
  arrivalDelays?: unknown;
  departureDelays?: unknown;
  fallback?: string | null;
}): string {
  const arrival = String(opts.arrivalDelay ?? opts.actualDelay ?? '').trim();
  const departure = String(opts.departureDelay ?? '').trim();
  if (arrival || departure) {
    return sumDelayDurations(arrival, departure);
  }

  const rowParts: string[] = [];
  for (const list of [opts.arrivalDelays, opts.departureDelays]) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const d = pickDelayFromRow(row);
      if (d) rowParts.push(d);
    }
  }
  if (rowParts.length > 0) {
    return sumDelayDurations(...rowParts);
  }

  return String(opts.fallback ?? '').trim();
}

/**
 * FHR Total Delay = Arrival Delay + Departure Delay.
 * Falls back to `fallback` only when both sides are missing/blank.
 */
export function totalDelayFromArrivalAndDeparture(
  arrivalDelay?: string | null,
  departureDelay?: string | null,
  fallback?: string | null,
): string {
  return resolveFhrTotalDelay({
    arrivalDelay,
    departureDelay,
    fallback,
  });
}

/** Parse time string (HH:mm or HH:mm:ss) to minutes since midnight; null if invalid. */
function timeToMinutes(timeStr: string | undefined): number | null {
  if (!timeStr?.trim()) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) || 0;
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Extract time part from "date time" or "time" string for ATA diff. */
function extractTimePart(s: string | undefined): string {
  if (!s?.trim()) return '';
  const t = s.trim();
  const spaceIdx = t.indexOf(' ');
  if (spaceIdx > 0) return t.slice(spaceIdx + 1).trim();
  return t;
}

/** Format "ATA + (ATA - cellTime)" e.g. "ATA + 30 min" or "ATA - 15 min". Accepts "date time" or "time" strings. */
export function formatAtaPlusDiff(ataTimeStr: string | undefined, cellTimeStr: string | undefined): string {
  const ataMin = timeToMinutes(extractTimePart(ataTimeStr) || ataTimeStr);
  const cellMin = timeToMinutes(extractTimePart(cellTimeStr) || cellTimeStr);
  if (ataMin == null || cellMin == null) return '';
  const diffMin = ataMin - cellMin;
  if (diffMin >= 0) {
    if (diffMin < 60) return `ATA+ ${diffMin} min`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m > 0 ? `ATA+ ${h}:${String(m).padStart(2, '0')}` : `ATA+ ${h} hr`;
  }
  const absMin = Math.abs(diffMin);
  if (absMin < 60) return `ATA- ${absMin} min`;
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  return m > 0 ? `ATA- ${h}:${String(m).padStart(2, '0')}` : `ATA- ${h} hr`;
}

export async function loadLogoAsBase64(logoPath?: string): Promise<string | null> {
  const resolvedPath =
    logoPath ??
    (typeof window !== 'undefined' ? getSessionStationLogoPath() : '/BAS.png');
  try {
    const response = await fetch(resolvedPath);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
