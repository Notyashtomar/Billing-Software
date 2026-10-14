export const MONTH_ABBR = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

export const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const MAX_STATION_WISE_MONTHS = 24;

export type CalendarMonthSlice = {
  key: string;
  sheetName: string;
  label: string;
  from: string;
  to: string;
};

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYmd(value: string): boolean {
  return YMD_RE.test(String(value ?? '').trim());
}

export function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Shift a YYYY-MM-DD by whole calendar days (UTC). */
/** Same calendar day one year earlier. 29 Feb → 28 Feb when needed. */
export function shiftYmdBackOneYear(ymd: string): string | null {
  const m = YMD_RE.exec(String(ymd ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]) - 1;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const last = lastDayOfMonth(year, month - 1);
  return `${year}-${pad2(month)}-${pad2(Math.min(day, last))}`;
}

export function shiftRangeBackOneYear(
  fromYmd: string,
  toYmd: string,
): { from: string; to: string } | null {
  const from = shiftYmdBackOneYear(fromYmd);
  const to = shiftYmdBackOneYear(toYmd);
  if (!from || !to || from > to) return null;
  return { from, to };
}

export function addDaysYmd(ymd: string, days: number): string | null {
  const m = YMD_RE.exec(String(ymd ?? '').trim());
  if (!m) return null;
  const dt = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days),
  );
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function ymdToDdMmYyyy(ymd: string): string {
  const m = YMD_RE.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Excel 1900-date serial (day 0 = 1899-12-30). Safe for formula date compare. */
export function ymdToExcelSerial(ymd: string): number | null {
  const m = YMD_RE.exec(String(ymd ?? '').trim());
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const epoch = Date.UTC(1899, 11, 30);
  const serial = (utc - epoch) / 86_400_000;
  return Number.isFinite(serial) ? serial : null;
}

export function ymdRangeToDdMmYyyyList(fromYmd: string, toYmd: string): string[] {
  const list: string[] = [];
  const cur = new Date(`${fromYmd}T00:00:00Z`);
  const endMs = new Date(`${toYmd}T00:00:00Z`).getTime();
  if (Number.isNaN(cur.getTime()) || Number.isNaN(endMs) || cur.getTime() > endMs) {
    return list;
  }
  while (cur.getTime() <= endMs) {
    list.push(
      `${pad2(cur.getUTCDate())}/${pad2(cur.getUTCMonth() + 1)}/${cur.getUTCFullYear()}`,
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return list;
}

export function monthSheetName(year: number, monthIndex0: number): string {
  const abbr = MONTH_ABBR[monthIndex0] ?? 'UNK';
  return `${abbr}${String(year).slice(-2)}`;
}

export function formatRangeLabel(fromYmd: string, toYmd: string): string {
  return `${ymdToDdMmYyyy(fromYmd)} – ${ymdToDdMmYyyy(toYmd)}`;
}

export function listCalendarMonthsInRange(
  fromYmd: string,
  toYmd: string,
): CalendarMonthSlice[] {
  if (!isYmd(fromYmd) || !isYmd(toYmd) || fromYmd > toYmd) return [];

  const start = new Date(`${fromYmd}T00:00:00Z`);
  const end = new Date(`${toYmd}T00:00:00Z`);
  const out: CalendarMonthSlice[] = [];

  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();

  while (
    Date.UTC(year, month, 1) <= Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
  ) {
    const monthStart = `${year}-${pad2(month + 1)}-01`;
    const monthEnd = `${year}-${pad2(month + 1)}-${pad2(lastDayOfMonth(year, month))}`;
    const from = fromYmd > monthStart ? fromYmd : monthStart;
    const to = toYmd < monthEnd ? toYmd : monthEnd;
    out.push({
      key: `${year}-${pad2(month + 1)}`,
      sheetName: monthSheetName(year, month),
      label: `${MONTH_FULL[month]} ${year}`,
      from,
      to,
    });
    if (out.length >= MAX_STATION_WISE_MONTHS) break;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return out;
}

export const STATION_WISE_LABELS: Record<string, string> = {
  MAA: 'Chennai',
  DEL: 'Delhi',
  IXC: 'Chandigarh',
  HYD: 'Hyderabad',
  BLR: 'Bengaluru',
  BOM: 'Mumbai',
  CCU: 'Kolkata',
  AMD: 'Ahmedabad',
  COK: 'Kochi',
  GOI: 'Goa',
  PNQ: 'Pune',
  TRV: 'Thiruvananthapuram',
};

export function stationWiseLabel(stationCode: string): string {
  const code = String(stationCode ?? '').trim().toUpperCase();
  if (!code) return 'Station';
  return STATION_WISE_LABELS[code] ?? code;
}

function parseYmdParts(ymd: string): { year: number; monthIndex0: number } | null {
  const m = YMD_RE.exec(String(ymd ?? '').trim());
  if (!m) return null;
  return { year: Number(m[1]), monthIndex0: Number(m[2]) - 1 };
}

function monthToken(monthIndex0: number): string {
  return (MONTH_FULL[monthIndex0] ?? 'Unknown').toUpperCase();
}

function yy(year: number): string {
  return String(year).slice(-2);
}

export type StationWiseStaCoverage = {
  earliestStaYmd: string | null;
  latestStaYmd: string | null;
  latestMonthFrom: string | null;
  latestMonthTo: string | null;
  latestMonthLabel: string | null;
};

/** Full calendar month that contains `ymd` (UTC). */
export function monthBoundsFromYmd(
  ymd: string,
): { from: string; to: string; label: string } | null {
  const p = parseYmdParts(ymd);
  if (!p) return null;
  const from = `${p.year}-${pad2(p.monthIndex0 + 1)}-01`;
  const to = `${p.year}-${pad2(p.monthIndex0 + 1)}-${pad2(lastDayOfMonth(p.year, p.monthIndex0))}`;
  return {
    from,
    to,
    label: `${MONTH_FULL[p.monthIndex0]} ${p.year}`,
  };
}

export function staCoverageFromYmds(
  earliestYmd: string | null,
  latestYmd: string | null,
): StationWiseStaCoverage | null {
  if (!earliestYmd && !latestYmd) return null;
  const bounds = latestYmd ? monthBoundsFromYmd(latestYmd) : null;
  return {
    earliestStaYmd: earliestYmd,
    latestStaYmd: latestYmd,
    latestMonthFrom: bounds?.from ?? null,
    latestMonthTo: bounds?.to ?? null,
    latestMonthLabel: bounds?.label ?? null,
  };
}

/**
 * Download name:
 * - scheduled one month → `MAA_SCH_MONTHWISE_AUGUST-26.xlsx`
 * - non-sked one month → `NON-SKED_MIS_MONTHWISE_AUGUST-26.xlsx`
 * - span months, same year → `…_APRIL_TO_AUGUST-26.xlsx`
 * - span years → `…_DECEMBER-25_TO_FEBRUARY-26.xlsx`
 */
export function stationWiseExportFileName(
  stationCode: string,
  fromYmd: string,
  toYmd: string,
  flightScope: 'scheduled' | 'nonScheduled' = 'scheduled',
): string {
  const from = parseYmdParts(fromYmd);
  const to = parseYmdParts(toYmd);
  const ns = flightScope === 'nonScheduled';
  const code = `${String(stationCode ?? '').trim().toUpperCase() || 'STN'}`;
  const prefix = ns ? 'NON-SKED_MIS' : `${code}_SCH`;

  if (!from || !to) {
    return `${prefix}_MONTHWISE.xlsx`;
  }

  const sameMonth = from.year === to.year && from.monthIndex0 === to.monthIndex0;
  if (sameMonth) {
    return `${prefix}_MONTHWISE_${monthToken(from.monthIndex0)}-${yy(from.year)}.xlsx`;
  }

  if (from.year === to.year) {
    return `${prefix}_${monthToken(from.monthIndex0)}_TO_${monthToken(to.monthIndex0)}-${yy(to.year)}.xlsx`;
  }

  return `${prefix}_${monthToken(from.monthIndex0)}-${yy(from.year)}_TO_${monthToken(to.monthIndex0)}-${yy(to.year)}.xlsx`;
}

/** Airline month-wise workbook (LH_MONTHWISE layout). */
export function monthWiseExportFileName(
  stationCode: string,
  fromYmd: string,
  toYmd: string,
  flightScope: 'scheduled' | 'nonScheduled' = 'scheduled',
): string {
  const from = parseYmdParts(fromYmd);
  const to = parseYmdParts(toYmd);
  const ns = flightScope === 'nonScheduled';
  const code = `${String(stationCode ?? '').trim().toUpperCase() || 'STN'}`;
  const year = from?.year ?? to?.year;
  const yearPart = year != null ? String(year) : '';
  if (ns) {
    return yearPart
      ? `${code}_NON-SKED_AIRLINEWISE_${yearPart}.xlsx`
      : `${code}_NON-SKED_AIRLINEWISE.xlsx`;
  }
  return yearPart
    ? `${code}_AIRLINEWISE_${yearPart}.xlsx`
    : `${code}_AIRLINEWISE.xlsx`;
}
