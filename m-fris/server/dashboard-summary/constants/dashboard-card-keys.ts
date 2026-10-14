/** Logical card slots inside `dashboard_summaries.cards` (worker materialization). */
export const DASHBOARD_CARD_KEYS = {
  AIRLINE_REMARKS: 'airlineRemarks',
  AIRCRAFT_ANALYSIS: 'aircraftAnalysis',
  EQUIPMENT_UTILIZATION: 'equipmentUtilization',
  PERFORMANCE_REPORT: 'performanceReport',
  GHA_IMPROVEMENT: 'ghaImprovement',
  ON_TIME_PERFORMANCE: 'onTimePerformance',
  KPI_STRIP: 'kpiStrip',
} as const;

export type DashboardCardKey =
  (typeof DASHBOARD_CARD_KEYS)[keyof typeof DASHBOARD_CARD_KEYS];

export const ALL_DASHBOARD_CARD_KEYS: readonly DashboardCardKey[] = [
  DASHBOARD_CARD_KEYS.AIRLINE_REMARKS,
  DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
  DASHBOARD_CARD_KEYS.EQUIPMENT_UTILIZATION,
  DASHBOARD_CARD_KEYS.KPI_STRIP,
  DASHBOARD_CARD_KEYS.PERFORMANCE_REPORT,
  DASHBOARD_CARD_KEYS.GHA_IMPROVEMENT,
  DASHBOARD_CARD_KEYS.ON_TIME_PERFORMANCE,
];

/** Primary KPI cards (performance report, GHA, OTP) — no equipment slab dependency. */
export const PRIMARY_DASHBOARD_CARD_KEYS: readonly DashboardCardKey[] = [
  DASHBOARD_CARD_KEYS.KPI_STRIP,
  DASHBOARD_CARD_KEYS.PERFORMANCE_REPORT,
  DASHBOARD_CARD_KEYS.GHA_IMPROVEMENT,
  DASHBOARD_CARD_KEYS.ON_TIME_PERFORMANCE,
];

/** Secondary bundled cards (remarks, aircraft, equipment). */
export const SECONDARY_DASHBOARD_CARD_KEYS: readonly DashboardCardKey[] = [
  DASHBOARD_CARD_KEYS.AIRLINE_REMARKS,
  DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
  DASHBOARD_CARD_KEYS.EQUIPMENT_UTILIZATION,
];

export function isDashboardCardKey(value: string): value is DashboardCardKey {
  return (ALL_DASHBOARD_CARD_KEYS as readonly string[]).includes(value);
}
