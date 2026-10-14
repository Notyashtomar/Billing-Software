/** Proj_Skd matrix: airline × aircraft-type columns, daily flown counts, last-col Total. */

export type ProjSkdFlightLike = {
  flightNo?: string;
  aircraftType?: string;
  customerCode?: string;
  scheduleDate?: string;
  cancelled?: boolean;
  category?: string;
  skdNonSkd?: string;
  ops?: string;
  bookingNo?: string;
  challanNo?: string;
};

export type ProjSkdColumn = {
  key: string;
  airlineCode: string;
  aircraftType: string;
  aircraftLabel: string;
};

export type ProjSkdLayoutKind = 'maa' | 'del';

export type ProjSkdSheetLayout = {
  firstAirlineCol: number;
  weekdayCol: number;
  dayNameCol?: number;
  /** Do not clear/write from this column onward (royalty / Actual Flight Data). */
  protectFromCol: number;
  totalHeader: string;
};

export type ProjSkdMatrix = {
  year: number;
  month: number;
  numDays: number;
  asOfYmd: string;
  columns: ProjSkdColumn[];
  /** dayYmd → columnKey → unique flight count */
  counts: Map<string, Map<string, number>>;
  countedFlights: number;
};

export const PROJ_SKD_FIRST_DAY_ROW = 4;

/** Clear past leftover May-sized template when month/station grid is larger. */
export function projSkdClearUntilRow(numDays: number, templateMaxRow = 0): number {
  const totalRow = 3 + Math.max(numDays, 0) + 1;
  return Math.max(totalRow + 6, templateMaxRow, 40);
}

/** Split Reco net totals across Proj columns that share an airline code. */
export function splitProjectedByAirlineColumns(
  columns: Array<{ airlineCode: string }>,
  recoRows: Array<{ airlineCode: string; netCurrent: number }>,
): number[] {
  const nets = new Map<string, number>();
  for (const row of recoRows) {
    const code = String(row.airlineCode ?? '').trim().toUpperCase();
    if (!code) continue;
    nets.set(code, (nets.get(code) ?? 0) + Number(row.netCurrent || 0));
  }
  const counts = new Map<string, number>();
  for (const col of columns) {
    const code = String(col.airlineCode ?? '').trim().toUpperCase();
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const leftover = new Map(nets);
  return columns.map((col) => {
    const code = String(col.airlineCode ?? '').trim().toUpperCase();
    const n = counts.get(code) ?? 1;
    const used = (seen.get(code) ?? 0) + 1;
    seen.set(code, used);
    const total = nets.get(code) ?? 0;
    if (used < n) {
      const part = Math.floor(total / n);
      leftover.set(code, (leftover.get(code) ?? 0) - part);
      return part;
    }
    return leftover.get(code) ?? 0;
  });
}

export function getProjSkdSheetLayout(layout: ProjSkdLayoutKind): ProjSkdSheetLayout {
  if (layout === 'del') {
    return {
      firstAirlineCol: 4,
      weekdayCol: 3,
      dayNameCol: 2,
      protectFromCol: 67,
      totalHeader: 'Total\n(A)',
    };
  }
  return {
    firstAirlineCol: 3,
    weekdayCol: 2,
    protectFromCol: 25,
    totalHeader: 'Total',
  };
}

export function todayIstYmd(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function ymdForDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function excelColLetter(col: number): string {
  let n = col;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** FHR STA/STD often `dd/MM/yyyy` or ISO; Proj_Skd keys are `YYYY-MM-DD`. */
export function normalizeMisScheduleYmd(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const dash = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`;
  }
  return '';
}

/** IATA carrier from scheduled / FHR flight token (IX1686, IX-1498, IX 1604, 8D4421). */
export function extractCarrierFromFlightNo(flightNo: string): string {
  const text = String(flightNo ?? '').trim().toUpperCase();
  if (!text) return '';
  const match = text.match(/\b([A-Z0-9]{2})[-\s]*\d{1,5}\b/);
  return match?.[1] ?? '';
}

export function looksLikeScheduledFlightNo(flightNo: string): boolean {
  return Boolean(extractCarrierFromFlightNo(flightNo));
}

/** IATA designator: AA, 6E, 8D — not 10, ACS, SKP. */
export function isScheduledIataCode(raw: string): boolean {
  return /^(?:[A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])$/.test(raw);
}

/**
 * Charter / NS operator codes seen on FHR (not scheduled IATA).
 * Keep 2-letter scheduled carriers (IX, SG, UL) out of this list.
 */
const NS_OPERATOR_CODES = new Set([
  'ACS', 'SKP', 'VSR', 'VSC', 'AAPL', 'ASPL', 'FASP', 'AAS', 'ATS', 'AEL',
  'AFO', 'ASI', 'FCS', 'JSG', 'TAL', 'GVH', 'GMR', 'AIX',
]);

/**
 * Scheduled-airlines IATA from the flight number only.
 * Never promote 3–4 letter NS operator / billing codes (ACS, SKP, AAPL).
 */
export function airlineCodeFromFlight(customerCode: string, flightNo: string): string {
  const fromFlight = extractCarrierFromFlightNo(flightNo);
  if (fromFlight && isScheduledIataCode(fromFlight) && !NS_OPERATOR_CODES.has(fromFlight)) {
    return fromFlight;
  }
  const fromCustomer = String(customerCode ?? '')
    .trim()
    .toUpperCase()
    .split('-')[0]
    ?.trim();
  if (
    isScheduledIataCode(fromCustomer) &&
    !NS_OPERATOR_CODES.has(fromCustomer) &&
    looksLikeScheduledFlightNo(flightNo)
  ) {
    return fromCustomer;
  }
  return 'UNK';
}

export function isNonScheduledProjFlight(flight: ProjSkdFlightLike): boolean {
  const blob = [flight.category, flight.skdNonSkd, flight.ops]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  if (/non[-\s]?scheduled|non[-\s]?skd|nonskd|nonschedule|charter/.test(blob)) {
    return true;
  }
  if (String(flight.bookingNo ?? '').trim() || String(flight.challanNo ?? '').trim()) {
    return true;
  }
  const code = airlineCodeFromFlight(flight.customerCode ?? '', flight.flightNo ?? '');
  if (NS_OPERATOR_CODES.has(code) || NS_OPERATOR_CODES.has(String(flight.customerCode ?? '').trim().toUpperCase())) {
    return true;
  }
  return !looksLikeScheduledFlightNo(flight.flightNo ?? '');
}

function normAircraft(raw: string): { key: string; label: string } {
  const label = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return { key: label.toUpperCase(), label };
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

/**
 * One column per airline + aircraft type.
 * Count unique non-cancelled flights that operated on/before as-of (month-to-date).
 */
export function buildProjSkdMatrix(
  flights: ProjSkdFlightLike[],
  fromYmd: string,
  toYmd?: string,
  now = new Date(),
): ProjSkdMatrix {
  const target = String(fromYmd ?? '').slice(0, 10);
  const parts = /^(\d{4})-(\d{2})/.exec(target);
  const year = parts ? Number(parts[1]) : now.getFullYear();
  const month = parts ? Number(parts[2]) : now.getMonth() + 1;
  const numDays = daysInMonth(year, month);
  const monthStart = ymdForDay(year, month, 1);
  const monthEnd = ymdForDay(year, month, numDays);
  const rangeEnd = String(toYmd ?? monthEnd).slice(0, 10) || monthEnd;
  const asOfYmd = minYmd(minYmd(rangeEnd, monthEnd), todayIstYmd(now));

  const columnsByKey = new Map<string, ProjSkdColumn>();
  const counts = new Map<string, Map<string, number>>();
  const seen = new Set<string>();
  let countedFlights = 0;

  for (const flight of flights) {
    if (flight.cancelled) continue;
    if (isNonScheduledProjFlight(flight)) continue;
    const day = normalizeMisScheduleYmd(flight.scheduleDate);
    if (!day) continue;
    if (day < monthStart || day > asOfYmd) continue;

    const airlineCode = airlineCodeFromFlight(flight.customerCode ?? '', flight.flightNo ?? '');
    if (!airlineCode || airlineCode === 'UNK') continue;
    const aircraft = normAircraft(flight.aircraftType ?? '');
    const colKey = `${airlineCode}|${aircraft.key}`;
    if (!columnsByKey.has(colKey)) {
      columnsByKey.set(colKey, {
        key: colKey,
        airlineCode,
        aircraftType: aircraft.key,
        aircraftLabel: aircraft.label,
      });
    }

    const flightNo = String(flight.flightNo ?? '').trim().toUpperCase() || 'UNK';
    const dedupe = `${day}|${flightNo}|${colKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    if (!counts.has(day)) counts.set(day, new Map());
    const bucket = counts.get(day)!;
    bucket.set(colKey, (bucket.get(colKey) ?? 0) + 1);
    countedFlights += 1;
  }

  const columns = [...columnsByKey.values()].sort((a, b) => {
    const airlineCmp = a.airlineCode.localeCompare(b.airlineCode);
    if (airlineCmp !== 0) return airlineCmp;
    return a.aircraftType.localeCompare(b.aircraftType);
  });

  return { year, month, numDays, asOfYmd, columns, counts, countedFlights };
}

export function projSkdCount(
  matrix: ProjSkdMatrix,
  dayYmd: string,
  columnKey: string,
): number {
  return matrix.counts.get(dayYmd)?.get(columnKey) ?? 0;
}

export function projSkdDayTotal(matrix: ProjSkdMatrix, dayYmd: string): number {
  let total = 0;
  for (const col of matrix.columns) {
    total += projSkdCount(matrix, dayYmd, col.key);
  }
  return total;
}
