/** Reco_skd: Advance schedule rows × closed-flight weekday / extra-day counts. */

import {
  airlineCodeFromFlight,
  daysInMonth,
  isScheduledIataCode,
  normalizeMisScheduleYmd,
  ymdForDay,
} from './billing-mis-bhs-proj-skd.util';
import {
  getScheduleMasterFlightNo,
  isScheduleSetupRowEnabled,
} from '../utils/gateway-scheduled-customer-sync.util';

export type RecoSkdFlightLike = {
  flightNo?: string;
  customerCode?: string;
  scheduleDate?: string;
  cancelled?: boolean;
  flightStatus?: string;
};

export type RecoSkdScheduleMaster = {
  data?: Record<string, unknown>;
};

export type RecoSkdRow = {
  airlineCode: string;
  flightNo: string;
  weekdayCounts: number[];
  weeklyTotal: number;
  fullOpsWeeks: number;
  completedWeeks: number;
  extraCounts: number[];
  extraSum: number;
  addLess: number;
  netCurrent: number;
  netLast: number;
  diff: number;
  reason: string;
};

export type RecoSkdExtraDay = {
  ymd: string;
  weekday: number;
};

export type RecoSkdMatrix = {
  year: number;
  month: number;
  monthToken: string;
  prevMonthToken: string;
  extraDays: RecoSkdExtraDay[];
  rows: RecoSkdRow[];
  weeklyCurrent: number;
  weeklyLast: number;
};

export type RecoSkdSheetLayout = {
  seriesCol: number;
  codeCol: number;
  flightCol: number | null;
  firstWeekdayCol: number;
  weeklyCol: number;
  opsWeeksCol: number;
  completedCol: number;
  extraStartCol: number;
  extraSlotCount: number;
  totalFlightsCol: number;
  addLessCol: number;
  netCurrentCol: number;
  netLastCol: number;
  diffCol: number;
  reasonCol: number;
  lastWriteCol: number;
};

const SCHEDULE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const FULL_OPS_WEEKS = 4;
export const RECO_SKD_DATA_START_ROW = 4;
const RECO_SKD_FOOTER_ROWS = 6;
const RECO_SKD_CLEAR_PAD = 8;

/** Grow/clear Reco table past leftover template rows when station/month has more flights. */
export function recoSkdClearUntilRow(
  rowCount: number,
  templateMaxRow = 0,
): number {
  const needed =
    RECO_SKD_DATA_START_ROW + Math.max(rowCount, 0) + RECO_SKD_FOOTER_ROWS + RECO_SKD_CLEAR_PAD;
  return Math.max(needed, templateMaxRow, 40);
}

export function getRecoSkdSheetLayout(layout: 'maa' | 'del'): RecoSkdSheetLayout {
  if (layout === 'del') {
    return {
      seriesCol: 1,
      codeCol: 2,
      flightCol: null,
      firstWeekdayCol: 3,
      weeklyCol: 10,
      opsWeeksCol: 11,
      completedCol: 12,
      extraStartCol: 13,
      extraSlotCount: 3,
      totalFlightsCol: 16,
      addLessCol: 17,
      netCurrentCol: 18,
      netLastCol: 19,
      diffCol: 20,
      reasonCol: 21,
      lastWriteCol: 21,
    };
  }
  return {
    seriesCol: 1,
    codeCol: 2,
    flightCol: 3,
    firstWeekdayCol: 4,
    weeklyCol: 11,
    opsWeeksCol: 12,
    completedCol: 13,
    extraStartCol: 14,
    extraSlotCount: 3,
    totalFlightsCol: 17,
    addLessCol: 18,
    netCurrentCol: 19,
    netLastCol: 20,
    diffCol: 21,
    reasonCol: 22,
    lastWriteCol: 22,
  };
}

export function previousCalendarMonth(fromYmd: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})/.exec(String(fromYmd ?? '').trim());
  if (!match) return { from: fromYmd, to: fromYmd };
  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  const last = daysInMonth(year, month);
  return {
    from: ymdForDay(year, month, 1),
    to: ymdForDay(year, month, last),
  };
}

export function monthTokenFromYmd(fromYmd: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(String(fromYmd ?? '').trim());
  if (!match) return 'MON-YY';
  const abbr = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  return `${abbr[Number(match[2]) - 1] ?? 'MON'}-${match[1].slice(2)}`;
}

/** Monday = 1 … Sunday = 7 */
export function isoWeekdayMon1(ymd: string): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!parts) return 0;
  const utc = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  const sun0 = new Date(utc).getUTCDay();
  return sun0 === 0 ? 7 : sun0;
}

/**
 * MAA docs created before multi-station often have empty stationCode (or CHENNAI).
 * Schedule Setup still shows them; Reco must use the same visibility.
 */
export function recoStationReadFilter(
  stationCode: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const code = String(stationCode ?? '').trim().toUpperCase();
  const stationPred =
    code === 'MAA' || code === 'CHENNAI'
      ? {
          $or: [
            { stationCode: 'MAA' },
            { stationCode: 'CHENNAI' },
            { stationCode: { $exists: false } },
            { stationCode: null },
            { stationCode: '' },
          ],
        }
      : { stationCode: code };
  if (Object.keys(extra).length === 0) return stationPred;
  return { $and: [extra, stationPred] };
}

export function misStaDateCandidates(fromYmd: string, toYmd: string): string[] {
  const out = new Set<string>();
  const start = new Date(`${fromYmd}T00:00:00.000Z`);
  const end = new Date(`${toYmd}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [fromYmd, toYmd];
  }
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    out.add(`${y}-${m}-${d}`);
    out.add(`${d}/${m}/${y}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return [...out];
}

export function extraDaysAfter28(year: number, month: number): RecoSkdExtraDay[] {
  const last = daysInMonth(year, month);
  const extras: RecoSkdExtraDay[] = [];
  for (let day = 29; day <= last; day += 1) {
    const ymd = ymdForDay(year, month, day);
    extras.push({ ymd, weekday: isoWeekdayMon1(ymd) });
  }
  return extras;
}

export function isClosedRecoFlight(flight: RecoSkdFlightLike): boolean {
  if (flight.cancelled) return false;
  const status = String(flight.flightStatus ?? '')
    .trim()
    .toLowerCase();
  return status === 'closed' || status === 'close';
}

/** Same rule as Scheduled Airlines “Closed”: core FHR forms present (data filled). */
export function isFhrCoreFormsFilled(doc: Record<string, unknown>): boolean {
  const has = (value: unknown) =>
    value != null && typeof value === 'object' && !Array.isArray(value);
  return (
    has(doc.mainDetails) &&
    has(doc.terminalDetails) &&
    has(doc.rampDetails1) &&
    has(doc.loadControlDetails)
  );
}

/** FHR row usable for Reco counts: not cancelled / XXLD. Status may be empty on older docs. */
export function isCountableFhrRecoFlight(flight: RecoSkdFlightLike): boolean {
  if (flight.cancelled) return false;
  const status = String(flight.flightStatus ?? '')
    .trim()
    .toLowerCase();
  if (!status) return true;
  if (/cancel|xxld|divert/.test(status)) return false;
  return true;
}

function pickStr(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function embedRecord(doc: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = doc[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** One Reco flight per fhr_collection document (STA date + arrival/departure numbers). */
export function mapFhrCollectionDocToRecoFlights(
  doc: Record<string, unknown>,
): RecoSkdFlightLike[] {
  const main = embedRecord(doc, 'mainDetails');
  const terminal = embedRecord(doc, 'terminalDetails');
  const ramp1 = embedRecord(doc, 'rampDetails1');
  const arrival = pickStr(
    main.ArrivalFltNo,
    main.arrivalFltNo,
    terminal.ArrivalFltNo,
    ramp1.ArrivalFltNo,
  );
  const departure = pickStr(
    main.DepartureFltNo,
    main.departureFltNo,
    terminal.DepartureFltNo,
    ramp1.DepartureFltNo,
  );
  const single = pickStr(
    terminal.FlightNo,
    terminal.flightNo,
    main.flightNo,
    main.FlightNo,
    ramp1.FlightNo,
    ramp1.flightNo,
  );
  const flightNo = arrival && departure ? `${arrival}/${departure}` : arrival || departure || single;
  const staDates = Array.isArray(doc.staDates) ? doc.staDates : [];
  const scheduleDate =
    normalizeMisScheduleYmd(terminal.STADate) ||
    normalizeMisScheduleYmd(terminal.staDate) ||
    normalizeMisScheduleYmd(main.STADate) ||
    normalizeMisScheduleYmd(main.staDate) ||
    normalizeMisScheduleYmd(ramp1.STADate) ||
    normalizeMisScheduleYmd(ramp1.staDate) ||
    staDates.map((d) => normalizeMisScheduleYmd(d)).find(Boolean) ||
    '';
  if (!flightNo || !scheduleDate) return [];
  const statusFromField = pickStr(
    main.flightStatus,
    main['Flight Status'],
    terminal.flightStatus,
    doc.flightStatus,
  );
  const status = isFhrCoreFormsFilled(doc)
    ? 'Closed'
    : statusFromField || 'Open';
  const cancelled =
    /cancel|xxld|divert/i.test(status) ||
    /canc|xxld/i.test(flightNo) ||
    /canc/i.test(pickStr(main.Cate_of_Flight, main.Typeofflight));
  const customerCode = airlineCodeFromFlight(
    pickStr(main.Arline_Code, main.airlineCode, main.AirlineCode),
    flightNo,
  );
  return [{ flightNo, customerCode, scheduleDate, cancelled, flightStatus: status }];
}

function getStr(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const text = String(data[key] ?? '').trim();
    if (text) return text;
  }
  return '';
}

function parseBoolLike(value: unknown): boolean {
  if (value === true) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'true' || text === 'yes' || text === '1';
}

function isDayOn(data: Record<string, unknown>, day: string): boolean {
  const rawDays = data.scheduleDays ?? data.days ?? data.Days;
  if (!rawDays || typeof rawDays !== 'object' || Array.isArray(rawDays)) return false;
  return parseBoolLike((rawDays as Record<string, unknown>)[day]);
}

/** IATA summer = Apr–Sep, winter = Oct–Mar. Same as Advance → Schedule Setup. */
export function seasonKeyFromYmd(ymd: string): string {
  const month = Number(ymd.slice(5, 7));
  const year = Number(ymd.slice(0, 4));
  if (!month || !year) return '';
  if (month >= 4 && month <= 9) return `summer-${year}`;
  const startYear = month >= 10 ? year : year - 1;
  return `winter-${startYear}`;
}

function resolveMasterSeasonKey(data: Record<string, unknown>): string {
  const stored = String(data.seasonKey ?? '').trim().toLowerCase();
  if (stored.startsWith('summer-') || stored.startsWith('winter-')) return stored;
  const validFrom = parseMasterYmd(
    data.validFrom ?? data['Valid From'] ?? data.staDate,
  );
  return validFrom ? seasonKeyFromYmd(validFrom) : '';
}

function masterAppliesToExportMonth(
  data: Record<string, unknown>,
  fromYmd: string,
  toYmd: string,
): boolean {
  const validFrom = parseMasterYmd(
    data.validFrom ?? data['Valid From'] ?? data.staDate,
  );
  const validTo = parseMasterYmd(data.validTo ?? data['Valid To'] ?? data.stdDate);
  if (validFrom && validTo && rangesOverlap(validFrom, validTo, fromYmd, toYmd)) {
    return true;
  }
  if (!validFrom && !validTo) return true;
  const exportSeason = seasonKeyFromYmd(fromYmd);
  const masterSeason = resolveMasterSeasonKey(data);
  return Boolean(exportSeason && masterSeason && exportSeason === masterSeason);
}

function parseMasterYmd(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  return normalizeMisScheduleYmd(text.replace(/-/g, '/')) || normalizeMisScheduleYmd(text);
}

function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  if (!aFrom || !aTo || !bFrom || !bTo) return true;
  return aFrom <= bTo && bFrom <= aTo;
}

export function normalizeFlightTokens(flightNo: string, airlineCode = ''): string[] {
  const code = String(airlineCode ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const tokens = String(flightNo ?? '')
    .toUpperCase()
    .split('/')
    .map((part) => part.replace(/[^A-Z0-9]/g, ''))
    .filter((part) => part.length >= 2)
    .map((part) => {
      if (code && /^\d{2,5}$/.test(part)) return `${code}${part}`;
      if (code && part.startsWith(code)) return part;
      return part;
    })
    .filter((part) => part.length >= 3);
  return [...new Set(tokens)];
}

function tokensOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  return a.some((token) => setB.has(token));
}

function displayFlightKey(tokens: string[], raw: string): string {
  if (tokens.length >= 2) return `${tokens[0]}/${tokens[1]}`;
  if (tokens.length === 1) return tokens[0];
  return String(raw ?? '').trim().toUpperCase();
}

type ComboAcc = {
  airlineCode: string;
  flightNo: string;
  tokens: string[];
  weekdaySlots: number[];
  slotKeys: Array<Set<string>>;
};

function masterAirlineAndFlight(data: Record<string, unknown>): {
  airlineCode: string;
  flightNo: string;
  tokens: string[];
} | null {
  const rawFlight = getScheduleMasterFlightNo(data);
  const rawCode = getStr(data, 'airlineCode', 'Airline Code', 'Arline_Code', 'code');
  const airlineCode = airlineCodeFromFlight(rawCode, rawFlight);
  if (!isScheduledIataCode(airlineCode)) return null;
  const tokens = normalizeFlightTokens(rawFlight, airlineCode);
  const flightNo = displayFlightKey(tokens, rawFlight);
  if (!flightNo) return null;
  return { airlineCode, flightNo, tokens };
}

function collectCombos(
  masters: RecoSkdScheduleMaster[],
  fromYmd: string,
  toYmd: string,
): ComboAcc[] {
  const byKey = new Map<string, ComboAcc>();
  for (const master of masters) {
    const data = master.data ?? {};
    if (!isScheduleSetupRowEnabled(data)) continue;
    const parsed = masterAirlineAndFlight(data);
    if (!parsed) continue;
    if (!masterAppliesToExportMonth(data, fromYmd, toYmd)) continue;
    const validFrom =
      parseMasterYmd(data.validFrom ?? data['Valid From'] ?? data.staDate) || fromYmd;
    const validTo = parseMasterYmd(data.validTo ?? data['Valid To'] ?? data.stdDate) || toYmd;

    const key = `${parsed.airlineCode}|${parsed.flightNo}`;
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        airlineCode: parsed.airlineCode,
        flightNo: parsed.flightNo,
        tokens: parsed.tokens,
        weekdaySlots: [0, 0, 0, 0, 0, 0, 0],
        slotKeys: Array.from({ length: 7 }, () => new Set<string>()),
      };
      byKey.set(key, acc);
    }
    const sta = getStr(data, 'staTime', 'STA Time');
    const std = getStr(data, 'stdTime', 'STD Time');
    const slotId = `${sta}|${std}|${validFrom}|${validTo}`;
    SCHEDULE_DAYS.forEach((day, idx) => {
      if (!isDayOn(data, day)) return;
      if (acc!.slotKeys[idx].has(slotId)) return;
      acc!.slotKeys[idx].add(slotId);
      acc!.weekdaySlots[idx] += 1;
    });
  }
  return sortCombos([...byKey.values()]);
}

function sortCombos(combos: ComboAcc[]): ComboAcc[] {
  return combos.sort((a, b) => {
    const code = a.airlineCode.localeCompare(b.airlineCode);
    if (code !== 0) return code;
    return a.flightNo.localeCompare(b.flightNo);
  });
}

/** When Advance validity misses the month (e.g. MAA seeded only through June), still list FHR pairs. */
function collectCombosFromFlights(
  flights: RecoSkdFlightLike[],
  fromYmd: string,
  toYmd: string,
): ComboAcc[] {
  const byKey = new Map<string, ComboAcc>();
  for (const flight of flights) {
    if (!isCountableFhrRecoFlight(flight)) continue;
    const ymd = normalizeMisScheduleYmd(flight.scheduleDate);
    if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
    const airlineCode = airlineCodeFromFlight(flight.customerCode ?? '', flight.flightNo ?? '');
    if (!isScheduledIataCode(airlineCode)) continue;
    const tokens = normalizeFlightTokens(flight.flightNo ?? '', airlineCode);
    const flightNo = displayFlightKey(tokens, flight.flightNo ?? '');
    if (!flightNo) continue;
    const key = `${airlineCode}|${flightNo}`;
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        airlineCode,
        flightNo,
        tokens,
        weekdaySlots: [0, 0, 0, 0, 0, 0, 0],
        slotKeys: Array.from({ length: 7 }, () => new Set<string>()),
      };
      byKey.set(key, acc);
    }
    const dayNum = Number(ymd.slice(8, 10));
    if (dayNum >= 1 && dayNum <= 28) {
      const wd = isoWeekdayMon1(ymd);
      if (wd >= 1 && wd <= 7 && acc.weekdaySlots[wd - 1] < 1) {
        acc.weekdaySlots[wd - 1] = 1;
      }
    }
  }
  return sortCombos([...byKey.values()]);
}

function mergeCombos(masters: ComboAcc[], fromFlights: ComboAcc[]): ComboAcc[] {
  const byKey = new Map<string, ComboAcc>();
  for (const combo of masters) {
    byKey.set(`${combo.airlineCode}|${combo.flightNo}`, combo);
  }
  for (const combo of fromFlights) {
    const key = `${combo.airlineCode}|${combo.flightNo}`;
    if (byKey.has(key)) continue;
    const overlap = [...byKey.values()].some((existing) =>
      tokensOverlap(existing.tokens, combo.tokens) && existing.airlineCode === combo.airlineCode,
    );
    if (overlap) continue;
    byKey.set(key, combo);
  }
  return sortCombos([...byKey.values()]);
}

function fhrFlightsMatching(
  flights: RecoSkdFlightLike[],
  combo: ComboAcc,
): RecoSkdFlightLike[] {
  return flights.filter((flight) => {
    if (!isCountableFhrRecoFlight(flight)) return false;
    const flightTokens = normalizeFlightTokens(flight.flightNo ?? '', combo.airlineCode);
    if (!tokensOverlap(combo.tokens, flightTokens)) return false;
    const code = String(flight.customerCode ?? '').trim().toUpperCase();
    if (code && isScheduledIataCode(code) && code !== combo.airlineCode) return false;
    return true;
  });
}

function periodCounts(
  combo: ComboAcc,
  flights: RecoSkdFlightLike[],
  fromYmd: string,
  toYmd: string,
): { weekdayCounts: number[]; extraCounts: number[]; weeklyTotal: number; extraSum: number; net: number } {
  const year = Number(fromYmd.slice(0, 4));
  const month = Number(fromYmd.slice(5, 7));
  const extras = extraDaysAfter28(year, month);
  const extraYmds = new Set(extras.map((d) => d.ymd));
  const matched = fhrFlightsMatching(flights, combo).filter((f) => {
    if (!isClosedRecoFlight(f)) return false;
    const ymd = normalizeMisScheduleYmd(f.scheduleDate);
    return Boolean(ymd) && ymd >= fromYmd && ymd <= toYmd;
  });

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  const extraCounts = extras.map(() => 0);
  const seen = new Set<string>();
  for (const flight of matched) {
    const ymd = normalizeMisScheduleYmd(flight.scheduleDate);
    const tokens = normalizeFlightTokens(flight.flightNo ?? '', combo.airlineCode).join('/');
    const key = `${ymd}|${tokens || String(flight.flightNo ?? '').toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (extraYmds.has(ymd)) {
      const idx = extras.findIndex((d) => d.ymd === ymd);
      if (idx >= 0) extraCounts[idx] += 1;
      continue;
    }
    const dayNum = Number(ymd.slice(8, 10));
    if (dayNum < 1 || dayNum > 28) continue;
    const wd = isoWeekdayMon1(ymd);
    if (wd >= 1 && wd <= 7) weekdayCounts[wd - 1] += 1;
  }

  const weeklyTotal = weekdayCounts.reduce((sum, n) => sum + n, 0);
  const extraSum = extraCounts.reduce((sum, n) => sum + n, 0);
  const net = weeklyTotal + extraSum;
  return { weekdayCounts, extraCounts, weeklyTotal, extraSum, net };
}

function reasonForDiff(diff: number): string {
  if (diff === 0) return 'No change';
  const abs = Math.abs(diff);
  return `${abs} flight${abs === 1 ? '' : 's'}`;
}

export function buildRecoSkdMatrix(
  masters: RecoSkdScheduleMaster[],
  currentFlights: RecoSkdFlightLike[],
  lastMonthFlights: RecoSkdFlightLike[],
  fromYmd: string,
  toYmd: string,
): RecoSkdMatrix {
  const year = Number(fromYmd.slice(0, 4));
  const month = Number(fromYmd.slice(5, 7));
  const prev = previousCalendarMonth(fromYmd);
  const extraDays = extraDaysAfter28(year, month);
  const combos = mergeCombos(
    collectCombos(masters, fromYmd, toYmd),
    collectCombosFromFlights(currentFlights, fromYmd, toYmd),
  );

  const rows: RecoSkdRow[] = combos.map((combo) => {
    const current = periodCounts(combo, currentFlights, fromYmd, toYmd);
    const last = periodCounts(combo, lastMonthFlights, prev.from, prev.to);
    const diff = current.net - last.net;
    return {
      airlineCode: combo.airlineCode,
      flightNo: combo.flightNo,
      weekdayCounts: current.weekdayCounts,
      weeklyTotal: current.weeklyTotal,
      fullOpsWeeks: FULL_OPS_WEEKS,
      completedWeeks: current.weeklyTotal,
      extraCounts: current.extraCounts,
      extraSum: current.extraSum,
      addLess: 0,
      netCurrent: current.net,
      netLast: last.net,
      diff,
      reason: reasonForDiff(diff),
    };
  });

  return {
    year,
    month,
    monthToken: monthTokenFromYmd(fromYmd),
    prevMonthToken: monthTokenFromYmd(prev.from),
    extraDays,
    rows,
    weeklyCurrent: rows.reduce((sum, row) => sum + row.weeklyTotal, 0),
    weeklyLast: combos.reduce((sum, combo) => {
      return sum + periodCounts(combo, lastMonthFlights, prev.from, prev.to).weeklyTotal;
    }, 0),
  };
}
