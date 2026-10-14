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

export function masterMatchesSeasonKey(
  data: Record<string, unknown>,
  seasonKey: string,
): boolean {
  const key = String(seasonKey ?? '').trim().toLowerCase();
  if (!key) return true;
  return resolveScheduleSeasonKey(data) === key;
}
