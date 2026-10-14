import type { DashboardEquipmentMode } from './dashboard-summary.interface';

/** HTTP response shape for `GET /reports/dashboard-primary-cards`. */
export interface DashboardPrimaryCardsPayload {
  from: string;
  to: string;
  equipmentMode: DashboardEquipmentMode;
  kpiStrip: Record<string, unknown>;
  performanceReport: Record<string, unknown>;
  ghaImprovement: Record<string, unknown>;
  onTimePerformance: Record<string, unknown>;
  drilldowns?: Record<string, unknown>;
  _perf?: {
    totalMs: number;
    mongoWallMs: number;
    rowCount: number;
    staWindowCacheHit: boolean;
    aggregateMs: number;
    summaryCacheHit: boolean;
    summaryStale?: true;
  };
}

/** Worker card-generation timing metadata (not persisted as its own collection). */
export interface DashboardCardPerf {
  sourceRows: number;
  aggregationMs: number;
  mongoWallMs?: number;
  staWindowCacheHit?: boolean;
}

export type DashboardCardReadPerf = {
  totalMs: number;
  mongoWallMs: number;
  rowCount: number;
  staWindowCacheHit: boolean;
  aggregateMs: number;
  summaryCacheHit: boolean;
  summaryStale?: true;
};

/** HTTP response for `GET /reports/dashboard-airline-remarks-card`. */
export interface DashboardAirlineRemarksCardPayload {
  from: string;
  to: string;
  airlineRatings: Record<string, unknown>;
  _perf?: DashboardCardReadPerf;
}

/** HTTP response for `GET /reports/dashboard-aircraft-analysis-card`. */
export interface DashboardAircraftAnalysisCardPayload {
  from: string;
  to: string;
  aircraftCategory: Record<string, unknown>;
  _perf?: DashboardCardReadPerf;
}

/** HTTP response for `GET /reports/dashboard-equipment-utilization-card`. */
export interface DashboardEquipmentUtilizationCardPayload {
  from: string;
  to: string;
  equipmentMode: DashboardEquipmentMode;
  equipmentUtil: Record<string, unknown>;
  _perf?: DashboardCardReadPerf;
}

/** HTTP response for `GET /reports/dashboard-performance-report-card`. */
export interface DashboardPerformanceReportCardPayload {
  from: string;
  to: string;
  performanceReport: Record<string, unknown>;
  _perf?: DashboardCardReadPerf;
}
