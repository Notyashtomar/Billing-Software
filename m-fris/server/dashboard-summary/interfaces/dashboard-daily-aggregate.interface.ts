import type { DashboardAggregateType } from '../constants/dashboard-aggregate-types';
import type { DashboardFlightScope } from '../constants/dashboard-flight-scope';
import type { DashboardEquipmentMode } from './dashboard-summary.interface';

export interface DashboardDailyAggregatePerf {
  sourceRows: number;
  aggregationMs: number;
  mongoWallMs?: number;
  staWindowCacheHit?: boolean;
}

/** Persisted document shape in Mongo `dashboard_daily_aggregates`. */
export interface DashboardDailyAggregateLean {
  _id: string;
  /** Owning station; legacy rows = MAA. */
  stationCode?: string;
  date: string;
  aggregateType: DashboardAggregateType;
  /** Empty string when not applicable (airline / aircraft). */
  equipmentMode: '' | DashboardEquipmentMode;
  generatedAt: Date;
  data: Record<string, unknown>;
  perf: DashboardDailyAggregatePerf;
  isStale?: boolean;
  sourceSnapshotAt?: Date;
  sourceVersion?: string;
  lastInvalidatedAt?: Date;
  refreshInProgress?: boolean;
  refreshFailedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DashboardDailyAggregateUpsertInput {
  date: string;
  aggregateType: DashboardAggregateType;
  equipmentMode?: DashboardEquipmentMode;
  /** Concrete owning station to stamp/target (e.g. `MAA`, `AGR`). */
  stationCode?: string;
  /** `nonScheduled` writes `ns_dashboard_daily_aggregates`. Default scheduled. */
  flightScope?: DashboardFlightScope;
  generatedAt?: Date;
  data: Record<string, unknown>;
  perf: DashboardDailyAggregatePerf;
  sourceVersion?: string;
}
