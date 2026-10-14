export type MisCheckerDateRange = {
  from: string;
  to: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdLocal(year: number, monthIndex0: number, day: number): string {
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * Previous calendar month (local).
 * Aug 2026 → from 2026-07-01, to 2026-07-31.
 */
export function getPreviousMonthDateRange(now: Date = new Date()): MisCheckerDateRange {
  const year = now.getFullYear();
  const month = now.getMonth();
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  return {
    from: ymdLocal(prevYear, prevMonth, 1),
    to: ymdLocal(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth)),
  };
}

export function getCurrentMonthDateRange(now: Date = new Date()): MisCheckerDateRange {
  const year = now.getFullYear();
  const month = now.getMonth();
  return {
    from: ymdLocal(year, month, 1),
    to: ymdLocal(year, month, lastDayOfMonth(year, month)),
  };
}

/**
 * Shift an existing `YYYY-MM-DD` month range by `deltaMonths`.
 * June 2026 + (-1) → May 2026, not "calendar previous vs today".
 */
export function shiftMonthDateRange(
  fromYmd: string,
  deltaMonths: number,
): MisCheckerDateRange | null {
  const match = /^(\d{4})-(\d{2})/.exec(fromYmd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex0 = Number(match[2]) - 1;
  if (!Number.isFinite(year) || monthIndex0 < 0 || monthIndex0 > 11) return null;
  const shifted = new Date(year, monthIndex0 + deltaMonths, 1);
  const y = shifted.getFullYear();
  const m = shifted.getMonth();
  return {
    from: ymdLocal(y, m, 1),
    to: ymdLocal(y, m, lastDayOfMonth(y, m)),
  };
}

/** Range for a `YYYY-MM` month input value. */
export function getMonthDateRange(yearMonth: string): MisCheckerDateRange | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex0 = Number(match[2]) - 1;
  if (!Number.isFinite(year) || monthIndex0 < 0 || monthIndex0 > 11) return null;
  return {
    from: ymdLocal(year, monthIndex0, 1),
    to: ymdLocal(year, monthIndex0, lastDayOfMonth(year, monthIndex0)),
  };
}

export function toYearMonth(fromYmd: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(fromYmd.trim());
  return match ? `${match[1]}-${match[2]}` : '';
}

const MONTH_ABBR = [
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

/** e.g. 2026-07-01 → JUL_2026 */
export function formatMonthYearToken(fromYmd: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(fromYmd.trim());
  if (!match) return 'UNKNOWN';
  const year = match[1];
  const monthIndex0 = Number(match[2]) - 1;
  const abbr = MONTH_ABBR[monthIndex0] ?? 'UNK';
  return `${abbr}_${year}`;
}
