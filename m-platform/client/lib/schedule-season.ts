/**
 * Client mirror of server schedule-season rules (Valid From → Summer/Winter).
 * Keep in sync with `server/src/raw-flight-data/utils/schedule-season.util.ts`.
 */

export const SCHEDULE_SEASON = {
  SUMMER: 'Summer',
  WINTER: 'Winter',
} as const;

export type ScheduleSeason =
  (typeof SCHEDULE_SEASON)[keyof typeof SCHEDULE_SEASON];

const SUMMER_START_MONTH = 4;
const SUMMER_END_MONTH = 9;
const WINTER_START_MONTH = 10;

function normalizeDdMmYyyy(input: string): string {
  if (!input?.trim()) return '';
  const s = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d}/${m}/${y}`;
  }
  const parts = s.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  return s;
}

function parseDdMmYyyy(input: string): Date | null {
  const s = normalizeDdMmYyyy(input);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!day || !month || !year) return null;
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export type ScheduleSeasonPreview = {
  season: ScheduleSeason;
  seasonKey: string;
};

/** Detect season from Valid From; null if date missing/invalid. */
export function detectScheduleSeasonFromValidFrom(
  validFrom: string,
): ScheduleSeasonPreview | null {
  const date = parseDdMmYyyy(validFrom);
  if (!date) return null;
  return detectScheduleSeasonFromDate(date);
}

/** Summer = Apr–Sep; Winter = Oct–Mar (year = Oct start year). */
export function detectScheduleSeasonFromDate(
  date: Date,
): ScheduleSeasonPreview {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month >= SUMMER_START_MONTH && month <= SUMMER_END_MONTH) {
    return { season: SCHEDULE_SEASON.SUMMER, seasonKey: `summer-${year}` };
  }

  const seasonStartYear = month >= WINTER_START_MONTH ? year : year - 1;
  return {
    season: SCHEDULE_SEASON.WINTER,
    seasonKey: `winter-${seasonStartYear}`,
  };
}

/** Current aviation season from today's date (or `asOf`). */
export function detectCurrentScheduleSeason(
  asOf: Date = new Date(),
): ScheduleSeasonPreview {
  const d = new Date(asOf);
  d.setHours(0, 0, 0, 0);
  return detectScheduleSeasonFromDate(d);
}

/** Season immediately before `current` (Summer ↔ previous Winter, and the reverse). */
export function previousScheduleSeason(
  current: ScheduleSeasonPreview = detectCurrentScheduleSeason(),
): ScheduleSeasonPreview {
  const match = /^(summer|winter)-(\d{4})$/.exec(current.seasonKey);
  if (!match) return current;
  const year = Number(match[2]);
  if (match[1] === 'summer') {
    return {
      season: SCHEDULE_SEASON.WINTER,
      seasonKey: `winter-${year - 1}`,
    };
  }
  return {
    season: SCHEDULE_SEASON.SUMMER,
    seasonKey: `summer-${year}`,
  };
}

/** Readable label, e.g. Summer 2026 or Winter 2025–26. */
export function formatScheduleSeasonTitle(preview: ScheduleSeasonPreview): string {
  const match = /^(summer|winter)-(\d{4})$/.exec(preview.seasonKey);
  if (!match) return preview.season;
  const year = Number(match[2]);
  if (match[1] === 'summer') return `${SCHEDULE_SEASON.SUMMER} ${year}`;
  const end = String(year + 1).slice(-2);
  return `${SCHEDULE_SEASON.WINTER} ${year}–${end}`;
}

export function resolveScheduleSeasonLabel(
  data: Record<string, unknown>,
): ScheduleSeason | '' {
  const stored = String(data.season ?? data.Season ?? '').trim();
  if (stored === SCHEDULE_SEASON.SUMMER || stored === SCHEDULE_SEASON.WINTER) {
    return stored;
  }
  const validFrom = String(
    data.validFrom ?? data['Valid From'] ?? data.staDate ?? data['STA Date'] ?? '',
  ).trim();
  return detectScheduleSeasonFromValidFrom(validFrom)?.season ?? '';
}

/** Resolve seasonKey from stored field or Valid From. */
export function resolveScheduleSeasonKey(
  data: Record<string, unknown>,
): string {
  const stored = String(data.seasonKey ?? '').trim().toLowerCase();
  if (stored.startsWith('summer-') || stored.startsWith('winter-')) {
    return stored;
  }
  const validFrom = String(
    data.validFrom ?? data['Valid From'] ?? data.staDate ?? data['STA Date'] ?? '',
  ).trim();
  return detectScheduleSeasonFromValidFrom(validFrom)?.seasonKey ?? '';
}

/** Inclusive calendar window for a seasonKey (summer-YYYY / winter-YYYY). */
function scheduleSeasonWindow(seasonKey: string): { start: Date; end: Date } | null {
  const match = /^(summer|winter)-(\d{4})$/.exec(seasonKey.trim().toLowerCase());
  if (!match) return null;
  const year = Number(match[2]);
  if (match[1] === 'summer') {
    return {
      start: new Date(year, SUMMER_START_MONTH - 1, 1),
      end: new Date(year, SUMMER_END_MONTH - 1, 30),
    };
  }
  return {
    start: new Date(year, WINTER_START_MONTH - 1, 1),
    end: new Date(year + 1, 2, 31),
  };
}

/**
 * A master belongs on a season view when its Valid From–Valid To range overlaps
 * that season. Falls back to the stored seasonKey when dates are missing.
 */
export function masterMatchesSeasonKey(
  data: Record<string, unknown>,
  seasonKey: string,
): boolean {
  const key = String(seasonKey ?? '').trim().toLowerCase();
  if (!key) return true;
  const window = scheduleSeasonWindow(key);
  const from = parseDdMmYyyy(
    String(data.validFrom ?? data['Valid From'] ?? data.staDate ?? data['STA Date'] ?? ''),
  );
  const to = parseDdMmYyyy(
    String(data.validTo ?? data['Valid To'] ?? data.stdDate ?? data['STD Date'] ?? ''),
  );
  if (window && from && to) {
    return from.getTime() <= window.end.getTime() && to.getTime() >= window.start.getTime();
  }
  return resolveScheduleSeasonKey(data) === key;
}
