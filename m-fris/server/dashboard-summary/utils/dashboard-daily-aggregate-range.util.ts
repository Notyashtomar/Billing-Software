import { ServiceUnavailableException } from '@nestjs/common';
import {
  DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';
import type { DashboardDailyAggregateLean } from '../interfaces/dashboard-daily-aggregate.interface';
import type { DashboardEquipmentMode } from '../interfaces';
import { enumerateYmdInclusive } from './daily-aggregate-merge.util';

export function expectedDatesInRange(fromYmd: string, tillYmd: string): string[] {
  return enumerateYmdInclusive(fromYmd.trim(), tillYmd.trim());
}

export function assertDailyAggregateCoverage(
  aggregateType: DashboardAggregateType,
  fromYmd: string,
  tillYmd: string,
  days: DashboardDailyAggregateLean[],
): void {
  const expected = expectedDatesInRange(fromYmd, tillYmd);
  const have = new Set(days.map((d) => d.date));
  const missing = expected.filter((d) => !have.has(d));
  if (missing.length > 0) {
    throw new ServiceUnavailableException(
      `Dashboard daily aggregate "${aggregateType}" is not materialized for ${missing.length} day(s) ` +
        `in ${fromYmd}..${tillYmd}. Run worker/CLI rebuild for dashboard_daily_aggregates.`,
    );
  }
}

export function anyDailyAggregateStale(days: DashboardDailyAggregateLean[]): boolean {
  return days.some((d) => d.isStale === true);
}

export function perfFromDailyDocs(
  days: DashboardDailyAggregateLean[],
  mergeMs: number,
): {
  sourceRows: number;
  aggregationMs: number;
  mongoWallMs: number;
  staWindowCacheHit: boolean;
} {
  const sourceRows = days.reduce(
    (sum, d) => sum + (Number(d.perf?.sourceRows) || 0),
    0,
  );
  const mongoWallMs = days.reduce(
    (max, d) => Math.max(max, Number(d.perf?.mongoWallMs) || 0),
    0,
  );
  const staWindowCacheHit =
    days.length > 0 && days.every((d) => Boolean(d.perf?.staWindowCacheHit));
  const aggregationMs =
    days.reduce((sum, d) => sum + (Number(d.perf?.aggregationMs) || 0), 0) +
    mergeMs;
  return { sourceRows, aggregationMs, mongoWallMs, staWindowCacheHit };
}

export const PRIMARY_AGGREGATE_TYPES = [
  DASHBOARD_AGGREGATE_TYPES.KPI_STRIP,
  DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT,
  DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT,
  DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE,
] as const;

export const SECONDARY_AGGREGATE_TYPES = [
  DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS,
  DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
  DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
] as const;

export function equipmentModeForAggregate(
  aggregateType: DashboardAggregateType,
  mode: DashboardEquipmentMode,
): DashboardEquipmentMode | undefined {
  return aggregateType === DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION
    ? mode
    : undefined;
}
