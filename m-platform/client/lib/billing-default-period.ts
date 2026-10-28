/** Delhi keeps the August 2026 billing window. Every other station uses September 2026. */
export const DELHI_BILLING_PERIOD = { from: '2026-08-01', to: '2026-08-31' } as const;
export const OTHER_STATION_BILLING_PERIOD = { from: '2026-09-01', to: '2026-09-30' } as const;

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

/** Inclusive YYYY-MM-DD window for the logged-in station. */
export function defaultBillingPeriodForStation(stationCode?: string | null): {
  from: string;
  to: string;
} {
  return isDelhiStation(stationCode) ? DELHI_BILLING_PERIOD : OTHER_STATION_BILLING_PERIOD;
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
