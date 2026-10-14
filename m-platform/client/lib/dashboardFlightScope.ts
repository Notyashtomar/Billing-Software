import type { DashboardFlightScope } from '@/lib/api';

export const DASHBOARD_PATH = '/fris/dashboard';

export function parseDashboardFlightScopeFromSearch(
  search: string | URLSearchParams | null | undefined,
): DashboardFlightScope {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(
          search.startsWith('?') ? search.slice(1) : search,
        )
      : search instanceof URLSearchParams
        ? search
        : null;
  const raw = String(params?.get('flightScope') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (
    raw === 'nonscheduled' ||
    raw === 'non-scheduled' ||
    raw === 'ns' ||
    raw === 'non_scheduled'
  ) {
    return 'nonScheduled';
  }
  return 'scheduled';
}

export function dashboardHrefForFlightScope(
  scope: DashboardFlightScope,
): string {
  if (scope === 'nonScheduled') {
    return `${DASHBOARD_PATH}?flightScope=nonScheduled`;
  }
  return DASHBOARD_PATH;
}

/** True when `href` matches current dashboard pathname + flightScope query. */
export function isDashboardFlightScopeHrefActive(
  href: string,
  pathname: string | null | undefined,
  searchParams: URLSearchParams | null | undefined,
): boolean {
  const [pathPart, query = ''] = href.split('?');
  if ((pathname ?? '') !== pathPart) return false;
  const wanted = parseDashboardFlightScopeFromSearch(query);
  const current = parseDashboardFlightScopeFromSearch(searchParams);
  return wanted === current;
}
