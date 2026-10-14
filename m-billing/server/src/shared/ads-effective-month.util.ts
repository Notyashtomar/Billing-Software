/** Legacy ADS rules without a month are treated as June 2026. */
export const DEFAULT_ADS_EFFECTIVE_MONTH = '2026-06';

const YM_PATTERN = /^\d{4}-\d{2}$/;

export function isYearMonthString(value: unknown): value is string {
  return typeof value === 'string' && YM_PATTERN.test(value.trim());
}

export function normalizeAdsEffectiveMonth(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (YM_PATTERN.test(raw)) return raw;
  return DEFAULT_ADS_EFFECTIVE_MONTH;
}

export function yearMonthFromDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** `YYYY-MM-DD` → `YYYY-MM` (billing STA / ATD month). */
export function effectiveMonthFromYmd(ymd: string | null | undefined): string | undefined {
  const raw = String(ymd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw.slice(0, 7);
}

export function currentYearMonth(): string {
  return yearMonthFromDate(new Date());
}

export function isYearMonthNotAfterCurrent(ym: string): boolean {
  if (!YM_PATTERN.test(ym)) return false;
  return ym <= currentYearMonth();
}

export function formatAdsEffectiveMonthLabel(ym: string): string {
  const normalized = normalizeAdsEffectiveMonth(ym);
  const [y, m] = normalized.split('-').map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return label;
}

/** UTC month boundaries for rate-card sync / validity scoping. */
export function adsEffectiveMonthDateRange(ym: string): { validFrom: Date; validTo: Date } {
  const normalized = normalizeAdsEffectiveMonth(ym);
  const [y, m] = normalized.split('-').map(Number);
  const validFrom = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const validTo = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { validFrom, validTo };
}

export function sortYearMonths(months: string[]): string[] {
  return [...months].filter(isYearMonthString).sort();
}

export function uniqueYearMonths(months: string[]): string[] {
  return sortYearMonths([...new Set(months.map((m) => normalizeAdsEffectiveMonth(m)))]);
}
