/** Opening billing window until someone saves a different default month. */
export const SYSTEM_DEFAULT_BILLING_PERIOD = { from: '2026-10-01', to: '2026-10-31' } as const;
export const SYSTEM_DEFAULT_BILLING_MONTH = '2026-10';

/** Kept for older imports. Every station now opens on the system default month. */
export const DELHI_BILLING_PERIOD = SYSTEM_DEFAULT_BILLING_PERIOD;
export const OTHER_STATION_BILLING_PERIOD = SYSTEM_DEFAULT_BILLING_PERIOD;

const SYSTEM_MONTH_KEY = 'billing.system.defaultMonth';
const LEGACY_PREP_MONTH_KEY = 'billing.preparation.defaultFlightMonth';
const APPLIED_STAMP_PREFIX = 'billing.system.defaultMonthApplied';
const LEGACY_UPGRADE_PREFIX = 'billing.system.defaultPeriodUpgrade';
const LEGACY_UPGRADE_TOKEN = '2026-10';

/** Full months that used to be applied automatically (Delhi August, other stations September). */
const LEGACY_AUTOMATIC_PERIODS: ReadonlyArray<readonly [string, string]> = [
  ['2026-08-01', '2026-08-31'],
  ['2026-09-01', '2026-09-30'],
];

export function readLoginStationCode(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('userStationCode')?.trim().toUpperCase() || '';
}

export function isDelhiStation(stationCode?: string | null): boolean {
  return String(stationCode ?? '').trim().toUpperCase() === 'DEL';
}

/** Inclusive YYYY-MM-DD window covering the calendar month before `now` (local time). */
export function previousMonthBillingPeriod(now: Date = new Date()): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: ymd(first), to: ymd(last) };
}

export function builtinDefaultBillingPeriod(): { from: string; to: string } {
  return {
    from: SYSTEM_DEFAULT_BILLING_PERIOD.from,
    to: SYSTEM_DEFAULT_BILLING_PERIOD.to,
  };
}

export function monthBoundsFromYearMonth(month: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (!Number.isInteger(year) || monthIndex < 1 || monthIndex > 12) return null;
  const lastDay = new Date(year, monthIndex, 0).getDate();
  const mm = String(monthIndex).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function stationSuffix(stationCode?: string | null): string {
  const station = String(stationCode ?? readLoginStationCode()).trim().toUpperCase();
  return station || 'station';
}

function storageGet(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(key)?.trim() ?? '';
  } catch {
    return '';
  }
}

function storageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the current page can still show the range */
  }
}

function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && monthBoundsFromYearMonth(value) !== null;
}

/** Saved default month for this station, including the older preparation-only key. */
export function readStoredDefaultBillingMonth(stationCode?: string | null): string | null {
  const station = stationSuffix(stationCode);
  const current = storageGet(`${SYSTEM_MONTH_KEY}:${station}`);
  if (isYearMonth(current)) return current;
  const legacy = storageGet(`${LEGACY_PREP_MONTH_KEY}:${station}`);
  if (!isYearMonth(legacy)) return null;
  storageSet(`${SYSTEM_MONTH_KEY}:${station}`, legacy);
  return legacy;
}

export function writeStoredDefaultBillingMonth(
  month: string,
  stationCode?: string | null,
): void {
  if (!isYearMonth(month)) return;
  storageSet(`${SYSTEM_MONTH_KEY}:${stationSuffix(stationCode)}`, month);
}

export function readStoredDefaultBillingPeriod(
  stationCode?: string | null,
): { from: string; to: string } | null {
  const month = readStoredDefaultBillingMonth(stationCode);
  return month ? monthBoundsFromYearMonth(month) : null;
}

/** Stored month when one has been saved, otherwise 1–31 October 2026. */
export function resolveDefaultBillingPeriod(stationCode?: string | null): {
  from: string;
  to: string;
} {
  return readStoredDefaultBillingPeriod(stationCode) ?? builtinDefaultBillingPeriod();
}

/** Inclusive YYYY-MM-DD window for the logged-in station. */
export function defaultBillingPeriodForStation(stationCode?: string | null): {
  from: string;
  to: string;
} {
  return resolveDefaultBillingPeriod(stationCode);
}

export function readDefaultMonthAppliedStamp(pageKey: string, stationCode?: string | null): string | null {
  const raw = storageGet(`${APPLIED_STAMP_PREFIX}:${stationSuffix(stationCode)}:${pageKey}`);
  return isYearMonth(raw) ? raw : null;
}

export function writeDefaultMonthAppliedStamp(
  pageKey: string,
  month: string,
  stationCode?: string | null,
): void {
  if (!pageKey || !isYearMonth(month)) return;
  storageSet(`${APPLIED_STAMP_PREFIX}:${stationSuffix(stationCode)}:${pageKey}`, month);
}

export function isLegacyAutomaticBillingPeriod(
  from?: string | null,
  to?: string | null,
): boolean {
  const start = String(from ?? '').slice(0, 10);
  const end = String(to ?? '').slice(0, 10);
  return LEGACY_AUTOMATIC_PERIODS.some(([legacyFrom, legacyTo]) => start === legacyFrom && end === legacyTo);
}

export function legacyPeriodUpgradePending(pageKey: string, stationCode?: string | null): boolean {
  if (!pageKey || typeof window === 'undefined') return false;
  return (
    storageGet(`${LEGACY_UPGRADE_PREFIX}:${stationSuffix(stationCode)}:${pageKey}`) !==
    LEGACY_UPGRADE_TOKEN
  );
}

export function markLegacyPeriodUpgraded(pageKey: string, stationCode?: string | null): void {
  if (!pageKey) return;
  storageSet(
    `${LEGACY_UPGRADE_PREFIX}:${stationSuffix(stationCode)}:${pageKey}`,
    LEGACY_UPGRADE_TOKEN,
  );
}

/** True when a billing period overlaps [from, to]. Missing dates stay visible. */
export function billingPeriodOverlaps(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  from: string,
  to: string,
): boolean {
  const start = String(periodStart ?? '').slice(0, 10);
  const end = String(periodEnd ?? periodStart ?? '').slice(0, 10) || start;
  if (!start || !from || !to) return true;
  return start <= to && end >= from;
}
