import { displayFlightInstanceSerial, staDateStringToIsoYmd } from '@/utils/dataProcessor';

/** Matches dashboard performance-report cancellation drill-down (sheet or schedule-derived). */
export type BirdSheetCancellationFlightRow = {
  airline: string;
  flightNo: string;
  staDate: string;
  staTime: string;
  route: string;
  delayStatus: string;
  reason: string;
};

/** Matches Bird JSON `performanceFlights` rows — ISO-like local datetimes, empty string when unknown. */
export type PerformanceFlightTiming = { sta: string; ata: string; std: string; atd: string };

/** One leg from Mongo (scheduled + NS) with fields needed for performance report cancellations / drill-down. */
export type PerformanceFlightFromDb = PerformanceFlightTiming & {
  flightNo: string;
  delay: string;
  isCancelled: boolean;
  airline: string;
  typeCraft: string;
};

/** Basic row for dashboard drill-down (enriched from Mongo when STA matches). */
export type PerformanceFlightDisplayDetail = {
  sta: string;
  ata: string;
  std: string;
  atd: string;
  airline: string;
  flightNo: string;
  typeCraft: string;
  /** Flight instance serial from Mongo row when STA matches; otherwise em dash. */
  serial: string;
  /** Ground turnaround minutes when drill row includes them. */
  agtMinutes?: number | null;
  sgtMinutes?: number | null;
};

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

function getRowData(row: unknown): Record<string, unknown> {
  const r = row as Record<string, unknown> | null | undefined;
  const inner = r?.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return (r ?? {}) as Record<string, unknown>;
}

function serialFromRow(d: Record<string, unknown>): string {
  return String(
    d.slNo ??
      d['Sl No'] ??
      d['Sl. No'] ??
      d['SL No'] ??
      d['Serial No'] ??
      d['Serial Number'] ??
      d.SlNo ??
      d.SerialNo ??
      d.serialNo ??
      d.scheduleId ??
      ''
  ).trim();
}

/** Serial label for performance drill tables (matches scheduled-flights display rules). */
export function mongoRowSerialDisplay(d: Record<string, unknown> | undefined): string {
  if (!d) return '—';
  const raw = serialFromRow(d);
  if (!raw) return '—';
  return displayFlightInstanceSerial(raw);
}

function normalizeTimeForIso(t: string): string | null {
  const s = t.trim().replace(/\./g, ':');
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const hh = m[1].padStart(2, '0');
    const mm = m[2];
    const ss = m[3] ?? '00';
    return `${hh}:${mm}:${ss}`;
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length === 4) {
    const hh = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const h = Number(hh);
    const mi = Number(mm);
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      return `${hh}:${mm}:00`;
    }
  }
  if (digits.length === 3) {
    const h = Number(digits[0]);
    const mm = digits.slice(1, 3);
    const mi = Number(mm);
    if (h >= 0 && h <= 9 && mi >= 0 && mi <= 59) {
      return `${String(h).padStart(2, '0')}:${mm}:00`;
    }
  }
  return null;
}

/**
 * Build `YYYY-MM-DDTHH:mm:ss` compatible with Bird JSON / `Date` parsing (no timezone suffix).
 */
function combineDateTimeToIso(dateRaw: string, timeRaw: string): string {
  const ymd = staDateStringToIsoYmd(dateRaw);
  const t = normalizeTimeForIso(timeRaw);
  if (!ymd || !t) return '';
  return `${ymd}T${t}`;
}

/** Map `mainDetails` cancelled row (ATA fields + airline/flight) for performance drill-down. */
export function mainDetailsCancelledRowToPerformanceFlight(row: {
  airlineName: string;
  flightCode: string;
  ataDate: string;
  ataTime: string;
  departureStatus?: string;
}): PerformanceFlightFromDb {
  const iso = combineDateTimeToIso(String(row.ataDate ?? ''), String(row.ataTime ?? ''));
  return {
    sta: iso,
    ata: iso,
    std: '',
    atd: '',
    flightNo: String(row.flightCode ?? ''),
    delay: String(row.departureStatus ?? ''),
    isCancelled: true,
    airline: String(row.airlineName ?? ''),
    typeCraft: '',
  };
}

/**
 * Build `YYYY-MM-DDTHH:mm:ss` when both date + time resolve; if row date columns are blank but **time exists**,
 * `fallbackIsoYmd` anchors the timestamp for GT / OTP math (STA day for ATA when arrival date is omitted; STD or STA calendar day for STD/ATD when departure date is omitted).
 */
function timingField(
  d: Record<string, unknown>,
  dateKeys: string[],
  timeKeys: string[],
  fallbackIsoYmd?: string | null,
): string {
  const dateRaw = firstNonEmpty(...dateKeys.map((k) => d[k]));
  const timeRaw = firstNonEmpty(...timeKeys.map((k) => d[k]));
  const direct = combineDateTimeToIso(dateRaw, timeRaw);
  if (direct !== '') return direct;

  const t = normalizeTimeForIso(timeRaw);
  if (!t) return '';

  let ymd = staDateStringToIsoYmd(dateRaw);
  if (!ymd && fallbackIsoYmd) {
    ymd =
      /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackIsoYmd))
        ? String(fallbackIsoYmd)
        : staDateStringToIsoYmd(String(fallbackIsoYmd));
  }
  if (!ymd) return '';
  return `${ymd}T${t}`;
}

function isPresentTimeField(s: string): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * One row per (serial, STA date, STA time) — first row wins.
 */
export function dedupeDbRowsBySerialSta(rows: unknown[]): unknown[] {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const seen = new Map<string, unknown>();
  for (const row of rows) {
    const d = getRowData(row);
    const serial = serialFromRow(d);
    const staDate = firstNonEmpty(
      d.staDate,
      d['STA Date'],
      d.STADate,
      d.scheduleDate,
      d['scheduleDate'],
      d['Valid From'],
    );
    const staTime = firstNonEmpty(d.staTime, d['STA Time'], d.STATime);
    const key = `${serial}__${staDate}__${staTime}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return Array.from(seen.values());
}

/**
 * Map scheduled / NS Mongo rows (see `fetchScheduledFlightsForDashboard`, `fetchNonScheduledFlightsForDashboard`)
 * into the same timing shape as Bird `performanceFlights`.
 */
export function mapDbRowsToPerformanceTimings(rows: unknown[]): PerformanceFlightTiming[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const out: PerformanceFlightTiming[] = [];
  for (const row of rows) {
    const d = getRowData(row);
    const staDateRaw = firstNonEmpty(
      d.staDate,
      d['STA Date'],
      d.STADate,
      d.scheduleDate,
      d['Valid From'],
    );
    const staDateYmd = staDateStringToIsoYmd(staDateRaw);
    const stdDateRaw = firstNonEmpty(d.stdDate, d['STD Date'], d.STDDate, d['Valid To']);
    const stdDateYmd = staDateStringToIsoYmd(stdDateRaw);
    const stdDepAnchorYmd = stdDateYmd ?? staDateYmd;

    const sta = timingField(
      d,
      ['staDate', 'STADate', 'STA Date', 'scheduleDate', 'Valid From'],
      ['staTime', 'STATime', 'STA Time'],
      staDateYmd,
    );
    const ata = timingField(
      d,
      ['ataDate', 'ATADate', 'ATA Date'],
      ['ataTime', 'ATATime', 'ATA Time'],
      staDateYmd,
    );
    const std = timingField(
      d,
      ['stdDate', 'STDDate', 'STD Date', 'Valid To'],
      ['stdTime', 'STDTime', 'STD Time'],
      stdDepAnchorYmd,
    );
    const atd = timingField(
      d,
      ['atdDate', 'ATDDate', 'ATD Date'],
      ['atdTime', 'ATDTime', 'ATD Time'],
      stdDepAnchorYmd,
    );
    if (!isPresentTimeField(sta) && !isPresentTimeField(ata) && !isPresentTimeField(std) && !isPresentTimeField(atd)) {
      continue;
    }
    out.push({ sta, ata, std, atd });
  }
  return out;
}

function dbRowFlightCancelledFlag(d: Record<string, unknown>): boolean {
  return d.flightCancelled === true || d['flightCancelled'] === true;
}

/** Parse `YYYY-MM-DDTHH:mm:ss` (or with fractional seconds / trailing Z) into comparable date + time. */
function parseLocalDateTimeParts(isoLike: string): { date: string; time: string } | null {
  const s = isoLike.trim();
  const ti = s.indexOf('T');
  if (ti < 0) return null;
  const date = s.slice(0, ti);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let rest = s.slice(ti + 1).replace(/[zZ]$/, '').trim();
  rest = rest.replace(/\s*[+-]\d{2}:?\d{2}$/, '').trim();
  const baseTime = rest.split('.')[0].trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(baseTime);
  if (!m) return null;
  const hh = m[1].padStart(2, '0');
  const mm = m[2];
  const ss = (m[3] ?? '00').padStart(2, '0');
  return { date, time: `${hh}:${mm}:${ss}` };
}

/**
 * Performance report “on time”: STA date equals ATA date and STA time equals ATA time
 * (after normalizing DB-mapped `sta` / `ata` strings).
 */
export function isOnTimeExactStaAtaDateTimeMatch(f: PerformanceFlightTiming): boolean {
  const staParts = parseLocalDateTimeParts(String(f.sta ?? ''));
  const ataParts = parseLocalDateTimeParts(String(f.ata ?? ''));
  if (!staParts || !ataParts) return false;
  return staParts.date === ataParts.date && staParts.time === ataParts.time;
}

/**
 * All deduped Mongo rows in range as performance legs (includes rows with partial timings; STA date fallback for range filters).
 */
export function mapDbRowsToPerformanceFlightsForReport(rows: unknown[]): PerformanceFlightFromDb[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const out: PerformanceFlightFromDb[] = [];
  for (const row of rows) {
    const d = getRowData(row);
    const staDateRaw = firstNonEmpty(
      d.staDate,
      d['STA Date'],
      d.STADate,
      d.scheduleDate,
      d['Valid From'],
    );
    const staDateYmd = staDateStringToIsoYmd(staDateRaw);
    const stdDateRaw = firstNonEmpty(d.stdDate, d['STD Date'], d.STDDate, d['Valid To']);
    const stdDateYmd = staDateStringToIsoYmd(stdDateRaw);
    const stdDepAnchorYmd = stdDateYmd ?? staDateYmd;

    let sta = timingField(
      d,
      ['staDate', 'STADate', 'STA Date', 'scheduleDate', 'Valid From'],
      ['staTime', 'STATime', 'STA Time'],
      staDateYmd,
    );
    if (!isPresentTimeField(sta) && staDateYmd) {
      sta = `${staDateYmd}T00:00:00`;
    }
    const ata = timingField(
      d,
      ['ataDate', 'ATADate', 'ATA Date'],
      ['ataTime', 'ATATime', 'ATA Time'],
      staDateYmd,
    );
    const std = timingField(
      d,
      ['stdDate', 'STDDate', 'STD Date', 'Valid To'],
      ['stdTime', 'STDTime', 'STD Time'],
      stdDepAnchorYmd,
    );
    const atd = timingField(
      d,
      ['atdDate', 'ATDDate', 'ATD Date'],
      ['atdTime', 'ATDTime', 'ATD Time'],
      stdDepAnchorYmd,
    );
    const flightNo = firstNonEmpty(d.FlightNo, d.flightNo, d['Flight No']);
    const delay = firstNonEmpty(d.Delay, d.delay, d['Delay Status']);
    const isCancelled = dbRowFlightCancelledFlag(d);
    const airline = firstNonEmpty(d.Airline, d.airline);
    const typeCraft = firstNonEmpty(d.TypeCraft, d.aircraft, d.Aircraft);
    out.push({ sta, ata, std, atd, flightNo, delay, isCancelled, airline, typeCraft });
  }
  return out;
}

/**
 * Prefer JSON timings when present; fill blanks from DB rows matched by exact STA string.
 */
export function mergePerformanceFlightsWithDb(
  json: PerformanceFlightTiming[],
  dbRows: unknown[],
): PerformanceFlightTiming[] {
  if (!json.length) return [];
  const dbRecords = mapDbRowsToPerformanceTimings(dbRows);
  const bySta = new Map<string, PerformanceFlightTiming>();
  for (const r of dbRecords) {
    const k = r.sta.trim();
    if (k && !bySta.has(k)) bySta.set(k, r);
  }
  return json.map((j) => {
    const k = j.sta.trim();
    if (!k) return j;
    const db = bySta.get(k);
    if (!db) return j;
    return {
      sta: isPresentTimeField(j.sta) ? j.sta : db.sta,
      ata: isPresentTimeField(j.ata) ? j.ata : db.ata,
      std: isPresentTimeField(j.std) ? j.std : db.std,
      atd: isPresentTimeField(j.atd) ? j.atd : db.atd,
    };
  });
}

/**
 * First Mongo row per normalized STA datetime string (same key as `mergePerformanceFlightsWithDb`).
 */
export function buildStaKeyToDbRowMap(dbRows: unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(dbRows) || dbRows.length === 0) return map;
  for (const row of dbRows) {
    const d = getRowData(row);
    const staDateRaw = firstNonEmpty(
      d.staDate,
      d['STA Date'],
      d.STADate,
      d.scheduleDate,
      d['Valid From'],
    );
    const staDateYmd = staDateStringToIsoYmd(staDateRaw);
    const sta = timingField(
      d,
      ['staDate', 'STADate', 'STA Date', 'scheduleDate', 'Valid From'],
      ['staTime', 'STATime', 'STA Time'],
      staDateYmd,
    );
    const k = sta.trim();
    if (k && !map.has(k)) map.set(k, d);
  }
  return map;
}

export function performanceFlightToDisplayDetail(
  f: PerformanceFlightTiming & Partial<Pick<PerformanceFlightFromDb, 'airline' | 'flightNo' | 'typeCraft'>>,
  dbBySta: Map<string, Record<string, unknown>>,
): PerformanceFlightDisplayDetail {
  const d = dbBySta.get(f.sta.trim());
  return {
    sta: f.sta,
    ata: f.ata,
    std: f.std,
    atd: f.atd,
    airline:
      f.airline != null && String(f.airline).trim() !== ''
        ? String(f.airline).trim()
        : d
          ? firstNonEmpty(d.Airline, d.airline)
          : '—',
    flightNo:
      f.flightNo != null && String(f.flightNo).trim() !== ''
        ? String(f.flightNo).trim()
        : d
          ? firstNonEmpty(d.FlightNo, d.flightNo, d['Flight No'])
          : '—',
    typeCraft:
      f.typeCraft != null && String(f.typeCraft).trim() !== ''
        ? String(f.typeCraft).trim()
        : d
          ? firstNonEmpty(d.TypeCraft, d.aircraft, d.Aircraft)
          : '—',
    serial: mongoRowSerialDisplay(d),
  };
}

/** Pre-serialized dashboard drill row — no STA→Mongo lookup. */
export function performanceDrillRowToDisplayDetail(f: {
  serialNo: number | null;
  sta: string;
  ata: string;
  std: string;
  atd: string;
  flightNo: string;
  airline: string;
  typeCraft: string;
  agtMinutes?: number | null;
  sgtMinutes?: number | null;
}): PerformanceFlightDisplayDetail {
  const serial =
    f.serialNo != null && Number.isFinite(f.serialNo)
      ? displayFlightInstanceSerial(String(Math.trunc(f.serialNo)))
      : '—';
  const agtMinutes =
    f.agtMinutes != null && Number.isFinite(f.agtMinutes) ? f.agtMinutes : null;
  const sgtMinutes =
    f.sgtMinutes != null && Number.isFinite(f.sgtMinutes) ? f.sgtMinutes : null;
  return {
    sta: f.sta,
    ata: f.ata,
    std: f.std,
    atd: f.atd,
    airline: f.airline != null && String(f.airline).trim() !== '' ? String(f.airline).trim() : '—',
    flightNo: f.flightNo != null && String(f.flightNo).trim() !== '' ? String(f.flightNo).trim() : '—',
    typeCraft: f.typeCraft != null && String(f.typeCraft).trim() !== '' ? String(f.typeCraft).trim() : '—',
    serial,
    agtMinutes,
    sgtMinutes,
  };
}

function isMaaCancelledMongoRow(d: Record<string, unknown>): boolean {
  const flightNo = firstNonEmpty(d.FlightNo, d.flightNo, d['Flight No']).toLowerCase();
  if (flightNo.includes('canc')) return true;
  if (d.flightCancelled === true || d['flightCancelled'] === true) return true;
  const cntRaw = d['Count Cancelled FLIGHT'] ?? d['Count Cancelled FLIGHT '];
  const cnt = typeof cntRaw === 'number' ? cntRaw : Number(cntRaw);
  if (Number.isFinite(cnt) && cnt > 0) return true;
  if (firstNonEmpty(d['Cancelled data'], d.cancelledData)) return true;
  const delay = firstNonEmpty(d.Delay, d.delay, d['Delay Status']).trim();
  const ataD = firstNonEmpty(d.ataDate, d.ATADate, d['ATA Date']);
  const ataT = firstNonEmpty(d.ataTime, d.ATATime, d['ATA Time']);
  if (!delay && !ataD && !ataT) return true;
  return false;
}

/**
 * Cancelled movements from Mongo schedule / raw rows (advance + NS), using the same MAA-style
 * signals as the Bird sheet where possible. Use when JSON has no `cancellationFlights` and
 * `flight_cancellations` is sparse.
 */
export function maaCancellationRowsFromDbRows(
  dbRows: unknown[],
  fromYmd: string,
  toYmd: string,
): BirdSheetCancellationFlightRow[] {
  if (!Array.isArray(dbRows) || !fromYmd || !toYmd) return [];
  const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymdRe.test(fromYmd) || !ymdRe.test(toYmd)) return [];
  const out: BirdSheetCancellationFlightRow[] = [];
  const seen = new Set<string>();

  for (const row of dbRows) {
    const d = getRowData(row);
    if (!isMaaCancelledMongoRow(d)) continue;
    const staDateRaw = firstNonEmpty(
      d.staDate,
      d.STADate,
      d['STA Date'],
      d.scheduleDate,
      d['Valid From'],
    );
    const ymd = staDateStringToIsoYmd(staDateRaw);
    if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
    const flightNo = firstNonEmpty(d.FlightNo, d.flightNo, d['Flight No']);
    const airline = firstNonEmpty(d.Airline, d.airline);
    const staTime = firstNonEmpty(d.staTime, d.STATime, d['STA Time']);
    const key = `${ymd}|${flightNo}|${airline}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      airline,
      flightNo,
      staDate: ymd,
      staTime,
      route: firstNonEmpty(
        d.route_raw,
        d.Route,
        d.route,
        d['Route'],
        d.From,
        d.To,
        d.source,
        d.destination,
      ),
      delayStatus: firstNonEmpty(d.Delay, d.delay, d['Delay Status']),
      reason: firstNonEmpty(
        d.ReasonofDelay,
        d['Reason of Delay'],
        d.reason,
        d.reason_1,
      ),
    });
  }
  return out.sort((a, b) => {
    const c = a.staDate.localeCompare(b.staDate);
    if (c !== 0) return c;
    return a.staTime.localeCompare(b.staTime);
  });
}

/** Fields from `terminalDetails` / `mainDetails` for backfilling schedule rows (see reports supplement API). */
export type DashboardTimingSupplementFields = {
  staDate?: string;
  staTime?: string;
  stdDate?: string;
  stdTime?: string;
  ataDate?: string;
  ataTime?: string;
  atdDate?: string;
  atdTime?: string;
};

export type DashboardTimingSupplementResponse = {
  bySerial: Record<string, DashboardTimingSupplementFields>;
};

export function collectSerialsFromDashboardDbRows(rows: unknown[]): number[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const set = new Set<number>();
  for (const row of rows) {
    const d = getRowData(row);
    const s = serialFromRow(d);
    if (!s) continue;
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) set.add(n);
  }
  return [...set];
}

function applyTimingSupplementToData(
  d: Record<string, unknown>,
  s: DashboardTimingSupplementFields,
): Record<string, unknown> {
  const next = { ...d };
  const fill = (alternateKeys: string[], value: string | undefined) => {
    if (value == null || String(value).trim() === '') return;
    if (firstNonEmpty(...alternateKeys.map((k) => next[k])) !== '') return;
    next[alternateKeys[0]] = String(value).trim();
  };
  fill(['staDate', 'STA Date', 'STADate', 'scheduleDate'], s.staDate);
  fill(['staTime', 'STA Time', 'STATime', 'sta'], s.staTime);
  fill(['stdDate', 'STD Date', 'STDDate', 'Valid To'], s.stdDate);
  fill(['stdTime', 'STD Time', 'STDTime', 'std'], s.stdTime);
  fill(['ataDate', 'ATA Date', 'ATADate'], s.ataDate);
  fill(['ataTime', 'ATA Time', 'ATATime'], s.ataTime);
  fill(['atdDate', 'ATD Date', 'ATDDate'], s.atdDate);
  fill(['atdTime', 'ATD Time', 'ATDTime'], s.atdTime);
  return next;
}

/** Fill missing timing fields on each row from `bySerial` (does not overwrite non-empty schedule data). */
export function mergeTimingSupplementIntoDbRows(
  rows: unknown[],
  bySerial: Record<string, DashboardTimingSupplementFields>,
): unknown[] {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (!bySerial || typeof bySerial !== 'object') return rows;
  return rows.map((row) => {
    const d = getRowData(row);
    const serial = serialFromRow(d);
    if (!serial) return row;
    const sup = bySerial[String(serial)];
    if (!sup) return row;
    const mergedData = applyTimingSupplementToData(d, sup);
    const r = row as Record<string, unknown>;
    if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
      return { ...r, data: mergedData };
    }
    return { ...r, ...mergedData };
  });
}
