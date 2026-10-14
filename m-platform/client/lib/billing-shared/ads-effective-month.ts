/** Legacy ADS rules without a month are treated as June 2026. */
export const DEFAULT_ADS_EFFECTIVE_MONTH = '2026-06';

const YM_PATTERN = /^\d{4}-\d{2}$/;

export function normalizeAdsEffectiveMonth(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (YM_PATTERN.test(raw)) return raw;
  return DEFAULT_ADS_EFFECTIVE_MONTH;
}

export function currentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function isYearMonthNotAfterCurrent(ym: string): boolean {
  if (!YM_PATTERN.test(ym)) return false;
  return ym <= currentYearMonth();
}

export function formatAdsEffectiveMonthLabel(ym: string): string {
  const normalized = normalizeAdsEffectiveMonth(ym);
  const [y, m] = normalized.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export function sortYearMonths(months: string[]): string[] {
  return [...months].filter((m) => YM_PATTERN.test(m)).sort();
}

export function uniqueYearMonths(months: string[]): string[] {
  return sortYearMonths([...new Set(months.map((m) => normalizeAdsEffectiveMonth(m)))]);
}
