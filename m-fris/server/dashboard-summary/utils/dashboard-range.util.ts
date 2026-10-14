import { enumerateYmdInclusive } from './daily-aggregate-merge.util';

export type DashboardWindowRange = { fromDate: string; tillDate: string };

const toYmdLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (base: Date, delta: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
};

/** Rolling dashboard windows aligned with legacy warmers (today, yesterday, MTD, last-7). */
export function buildCommonDashboardWindowRanges(
  now = new Date(),
): DashboardWindowRange[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayYmd = toYmdLocal(today);
  const yesterdayYmd = toYmdLocal(addDays(today, -1));
  const last7From = toYmdLocal(addDays(today, -6));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthStartYmd = toYmdLocal(monthStart);

  return [
    { fromDate: todayYmd, tillDate: todayYmd },
    { fromDate: yesterdayYmd, tillDate: yesterdayYmd },
    { fromDate: last7From, tillDate: todayYmd },
    { fromDate: monthStartYmd, tillDate: todayYmd },
  ];
}

/** YYYY-MM-DD string order compares lexicographically. */
export function ymdInRange(ymd: string, from: string, till: string): boolean {
  return ymd >= from && ymd <= till;
}

export function prevYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Pick common window ranges that touch any affected operating day or the prior day (STA midnight edge).
 */
export function filterWindowRangesTouchingDates(
  affectedYmd: readonly string[],
  windows: readonly DashboardWindowRange[] = buildCommonDashboardWindowRanges(),
): DashboardWindowRange[] {
  if (!affectedYmd.length) {
    return [...windows];
  }
  const expanded = new Set<string>();
  for (const d of affectedYmd) {
    const t = d.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    expanded.add(t);
    expanded.add(prevYmd(t));
  }
  return windows.filter((w) =>
    [...expanded].some((d) => ymdInRange(d, w.fromDate, w.tillDate)),
  );
}

export function ymdToDateKey(ymd: string): number | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return Number(t.replace(/-/g, ''));
}

export function ymdToDdMmYyyy(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function expandYmdInRanges(
  ranges: readonly DashboardWindowRange[],
): string[] {
  const out = new Set<string>();
  for (const r of ranges) {
    const slice = enumerateYmdInclusive(r.fromDate, r.tillDate);
    for (const d of slice) out.add(d);
  }
  return [...out].sort();
}

/**
 * Days whose daily `dashboard_summaries` shards must be marked stale when FHR
 * changes on an operating day — includes the prior calendar day for STA-midnight edges.
 */
export function expandAffectedSummaryDates(
  affectedYmd: readonly string[],
): string[] {
  const out = new Set<string>();
  for (const d of affectedYmd) {
    const t = d.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    out.add(t);
    out.add(prevYmd(t));
  }
  return [...out].sort();
}
