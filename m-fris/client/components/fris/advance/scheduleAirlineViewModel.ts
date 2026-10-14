/**
 * Transforms `advance_schedule_setup` master rows into the airline schedule grid
 * (weekly STA/STD + valid from / valid to).
 */

import {
  detectCurrentScheduleSeason,
  masterMatchesSeasonKey,
  SCHEDULE_SEASON,
  type ScheduleSeasonPreview,
} from '@/lib/schedule-season';
import { displayFlightNoFromScheduleData } from '@/lib/schedule-flight-no-display';

/** Internal schedule keys (Mon–Sun) — matches saved `scheduleDays` */
export const SCHEDULE_VIEW_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type ScheduleViewDay = (typeof SCHEDULE_VIEW_DAYS)[number];

/** Display headers for weekday columns (full names, no bracket numbers) */
export const SCHEDULE_VIEW_FULL_WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type ScheduleMasterInput = {
  id: string;
  data: Record<string, unknown>;
  serialNo?: string;
};

export type ScheduleAirlineViewRow = {
  airlineName: string;
  /** Weekly frequency (no. of operating days in the week) */
  weeklyCount: number;
  route: string;
  flightNo: string;
  aircraft: string;
  /** Mon..Sun — STA - STD or empty */
  dayCells: string[];
  validFrom: string;
  validTo: string;
};

function getStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function parseBoolLike(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

export function isScheduleRowActive(data: Record<string, unknown>): boolean {
  const v = data.active ?? data.Active;
  if (v === true) return true;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'no' || s === 'false' || s === '0') return false;
  if (s === 'yes' || s === 'true' || s === '1') return true;
  return true;
}

export function isDayOn(data: Record<string, unknown>, day: string): boolean {
  const rawDays = data?.scheduleDays;
  if (!rawDays || typeof rawDays !== 'object' || Array.isArray(rawDays)) return false;
  const v = (rawDays as Record<string, unknown>)[day];
  return parseBoolLike(v);
}

function formatTimeShort(raw: string): string {
  if (!raw?.trim()) return '';
  const parts = raw.trim().split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return raw.trim();
}

function joinStaStd(sta: string, std: string): string {
  if (sta && std) return `${sta} - ${std}`;
  return sta || std || '';
}

/** Per-day STA/STD from `dayTimes`, when a weekday differs from the row pair. */
function dayTimeCell(data: Record<string, unknown>, day: string): string {
  const raw = data.dayTimes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const slot = (raw as Record<string, unknown>)[day];
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return '';
  const rec = slot as Record<string, unknown>;
  const sta = formatTimeShort(String(rec.sta ?? rec.staTime ?? ''));
  const std = formatTimeShort(String(rec.std ?? rec.stdTime ?? ''));
  return joinStaStd(sta, std);
}

/** Flight number as stored in schedule setup (single or split arrival/departure). */
export function getScheduleMasterFlightNo(data: Record<string, unknown>): string {
  return displayFlightNoFromScheduleData(data);
}

/** Parse dd/MM/yyyy (or yyyy-MM-dd) to Date; invalid → null */
export function parseScheduleDateLoose(s: string): Date | null {
  const t = s?.trim();
  if (!t) return null;
  const parts = t.split(/[-/]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  let day: number;
  let month: number;
  let year: number;
  if (parts[0].length === 4 && /^19\d{2}|20\d{2}$/.test(parts[0])) {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2], 10);
  }
  const d = new Date(year, month, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Formats a date as dd-mm-yyyy (schedule title and column display). */
export function formatDateDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

/** Title date from max validTo in rows — dd-mm-yyyy */
export function formatTitleDateUs(maxDate: Date): string {
  return formatDateDdMmYyyy(maxDate);
}

/** Title-case each space-separated word (first letter upper, rest lower). */
export function toTitleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

export type BuildScheduleViewResult = {
  rows: ScheduleAirlineViewRow[];
  maxValidTo: Date | null;
  totalWeeklyFlights: number;
  footerDayCounts: number[];
  /** Season used to filter the grid (current calendar season by default). */
  currentSeason: ScheduleSeasonPreview;
};

export type BuildScheduleViewOptions = {
  /**
   * When set, only masters for this seasonKey are shown.
   * Default: current season from today (Summer Apr–Sep / Winter Oct–Mar).
   */
  seasonKey?: string;
  /** Override "today" for season detection (tests). */
  asOf?: Date;
};

/**
 * @param airlineName When empty, includes every active schedule row (all airlines).
 * When set, filters to that airline name only.
 * Always limited to the current schedule season unless `options.seasonKey` overrides.
 */
export function buildScheduleViewRows(
  masters: ScheduleMasterInput[],
  airlineName: string,
  options?: BuildScheduleViewOptions,
): BuildScheduleViewResult {
  const currentSeason = detectCurrentScheduleSeason(options?.asOf);
  const seasonKey = String(options?.seasonKey ?? currentSeason.seasonKey)
    .trim()
    .toLowerCase();

  const filterAll = airlineName.trim() === '';
  const nameLower = airlineName.trim().toLowerCase();
  const filtered = masters.filter((m) => {
    const d = m.data ?? {};
    if (!isScheduleRowActive(d)) return false;
    if (!masterMatchesSeasonKey(d, seasonKey)) return false;
    if (filterAll) return true;
    const a = getStr(d, 'airline', 'Airline');
    return a.trim().toLowerCase() === nameLower;
  });

  const rows: ScheduleAirlineViewRow[] = [];
  let maxValid: Date | null = null;

  for (const m of filtered) {
    const d = m.data ?? {};
    const airline = getStr(d, 'airline', 'Airline');
    const sta = formatTimeShort(getStr(d, 'staTime', 'STA Time'));
    const std = formatTimeShort(getStr(d, 'stdTime', 'STD Time'));
    const timeCell = joinStaStd(sta, std);

    const dayCells = SCHEDULE_VIEW_DAYS.map((day) => {
      const specific = dayTimeCell(d, day);
      if (specific) return specific;
      return isDayOn(d, day) ? timeCell : '';
    });

    const weeklyCount = dayCells.filter((cell) => cell.trim() !== '').length;

    const toStr = getStr(d, 'validTo', 'Valid To', 'STD Date', 'stdDate');
    const fromStr = getStr(d, 'validFrom', 'Valid From', 'STA Date', 'staDate');
    const toD = parseScheduleDateLoose(toStr);
    const fromD = parseScheduleDateLoose(fromStr);
    if (toD && (!maxValid || toD > maxValid)) maxValid = toD;
    if (!toD && fromD && (!maxValid || fromD > maxValid)) maxValid = fromD;

    rows.push({
      airlineName: airline,
      weeklyCount,
      route: getStr(d, 'routing', 'Routing', 'route'),
      flightNo: getScheduleMasterFlightNo(d),
      aircraft: getStr(d, 'aircraft', 'Aircraft', 'TypeCraft'),
      dayCells,
      validFrom: fromD ? formatDateDdMmYyyy(fromD) : fromStr.trim(),
      validTo: toD ? formatDateDdMmYyyy(toD) : toStr.trim(),
    });
  }

  rows.sort((a, b) => {
    const ac = a.airlineName.localeCompare(b.airlineName);
    if (ac !== 0) return ac;
    return a.flightNo.localeCompare(b.flightNo);
  });

  const totalWeeklyFlights = rows.reduce((s, r) => s + r.weeklyCount, 0);

  const footerDayCounts = SCHEDULE_VIEW_DAYS.map((_, idx) =>
    rows.reduce((s, r) => s + (r.dayCells[idx] ? 1 : 0), 0),
  );

  const shownSeason =
    seasonKey.startsWith('winter-')
      ? SCHEDULE_SEASON.WINTER
      : seasonKey.startsWith('summer-')
        ? SCHEDULE_SEASON.SUMMER
        : currentSeason.season;

  return {
    rows,
    maxValidTo: maxValid,
    totalWeeklyFlights,
    footerDayCounts,
    currentSeason: {
      season: shownSeason,
      seasonKey,
    },
  };
}
