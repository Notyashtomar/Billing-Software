/**
 * Bird dashboard source: scheduled (`fhr_collection` → `dashboard_*`)
 * vs non-scheduled (`ns_fhr_collection` → `ns_dashboard_*`).
 */
export type DashboardFlightScope = 'scheduled' | 'nonScheduled';

export const DASHBOARD_FLIGHT_SCOPES = {
  SCHEDULED: 'scheduled',
  NON_SCHEDULED: 'nonScheduled',
} as const satisfies Record<string, DashboardFlightScope>;

export function parseDashboardFlightScope(
  raw?: string | null,
): DashboardFlightScope {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (
    s === 'nonscheduled' ||
    s === 'non-scheduled' ||
    s === 'ns' ||
    s === 'non_scheduled'
  ) {
    return DASHBOARD_FLIGHT_SCOPES.NON_SCHEDULED;
  }
  return DASHBOARD_FLIGHT_SCOPES.SCHEDULED;
}

export function isNonScheduledDashboardScope(
  scope?: DashboardFlightScope | null,
): boolean {
  return scope === DASHBOARD_FLIGHT_SCOPES.NON_SCHEDULED;
}
