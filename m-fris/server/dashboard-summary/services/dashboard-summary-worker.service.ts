import { Injectable, Logger } from '@nestjs/common';
import { LEGACY_STATION_CODE } from '../../common/station/station.constants';
import {
  ALL_DASHBOARD_AGGREGATE_TYPES,
  DASHBOARD_AGGREGATE_TYPES,
} from '../constants/dashboard-aggregate-types';
import {
  DASHBOARD_FLIGHT_SCOPES,
  type DashboardFlightScope,
} from '../constants/dashboard-flight-scope';
import type { DashboardEquipmentMode } from '../interfaces';
import { DailyAggregateGeneratorService } from './daily-aggregate-generator.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { UnifiedDashboardSummaryAggregatorService } from './unified-dashboard-summary-aggregator.service';

export interface RecomputeSummaryParams {
  /** Single calendar day to materialize (`yyyy-MM-dd`). */
  summaryDate: string;
  equipmentMode: DashboardEquipmentMode;
  /**
   * Concrete owning station this shard is built for (e.g. `MAA`, `AGR`).
   * Scopes the FHR source rows + equipment catalog and stamps the stored shard.
   * Omitted = legacy MAA behavior.
   */
  stationCode?: string;
  /** When true, clears FHR STA-window cache before loading rows (worker refresh). */
  invalidateFhrCache?: boolean;
  /** `nonScheduled` materializes `ns_dashboard_*` from `ns_fhr_collection`. */
  flightScope?: DashboardFlightScope;
}

/**
 * Materializes Bird dashboard data:
 * - **Cards (HTTP source):** `dashboard_daily_aggregates` (one doc per type × day × mode).
 * - **Drilldowns:** embedded on `dashboard_summaries` via unified daily shard build.
 */
@Injectable()
export class DashboardSummaryWorkerService {
  private readonly logger = new Logger(DashboardSummaryWorkerService.name);

  constructor(
    private readonly dailyAggregateGenerator: DailyAggregateGeneratorService,
    private readonly unifiedAggregator: UnifiedDashboardSummaryAggregatorService,
    private readonly dashboardSummaryService: DashboardSummaryService,
  ) {}

  async recomputeAndStore(params: RecomputeSummaryParams): Promise<void> {
    const summaryDate = params.summaryDate.trim();
    const equipmentMode: DashboardEquipmentMode =
      params.equipmentMode === '4h' ? '4h' : '6h';
    // Always materialize for a concrete station; legacy callers default to MAA.
    const stationCode = (params.stationCode ?? LEGACY_STATION_CODE).trim();
    const flightScope =
      params.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;
    const wallStart = Date.now();
    const bustCache = params.invalidateFhrCache === true;

    for (const aggregateType of ALL_DASHBOARD_AGGREGATE_TYPES) {
      await this.dailyAggregateGenerator.generateAndStoreAggregate(
        aggregateType,
        summaryDate,
        { equipmentMode, bustCache, stationCode, flightScope },
      );
    }

    const { cards, drilldowns, perf } =
      await this.unifiedAggregator.buildDailyShard({
        summaryDate,
        equipmentMode,
        bustCache: false,
        stationCode,
        flightScope,
      });

    const performancePayload = drilldowns.performance as
      | { flights?: unknown[] }
      | undefined;
    const airlineBlock = drilldowns.airlineRemarks as
      | { rows?: unknown[] }
      | undefined;
    const flightCount = Array.isArray(performancePayload?.flights)
      ? performancePayload.flights.length
      : 0;
    const airlineRowCount = Array.isArray(airlineBlock?.rows)
      ? airlineBlock.rows.length
      : 0;

    const generatedAt = new Date();
    const tWrite = Date.now();
    await this.dashboardSummaryService.upsert({
      summaryDate,
      equipmentMode,
      stationCode,
      flightScope,
      generatedAt,
      cards,
      drilldowns,
      perf,
      isStale: false,
      sourceSnapshotAt: generatedAt,
      refreshInProgress: false,
      // `null`, not `undefined` — Mongo's driver drops `undefined` keys from `$set`,
      // which would silently leave a stale refreshFailedAt from an earlier failure.
      refreshFailedAt: null,
    });
    const mongoWriteMs = Date.now() - tWrite;

    this.logger.log(
      JSON.stringify({
        event: 'dashboard_worker_materialize',
        summaryDate,
        equipmentMode,
        flightScope,
        wallMs: Date.now() - wallStart,
        mongoWriteMs,
        dailyAggregateTypes: ALL_DASHBOARD_AGGREGATE_TYPES.length,
        sourceRows: perf.sourceRows,
        drillFlights: flightCount,
        drillAirlineRows: airlineRowCount,
      }),
    );
  }

  /**
   * Regenerates only `equipmentUtilization` daily aggregates for the given mode.
   * Used by `--mode 6h` rebuilds so shared shards (`equipmentMode: ""`) and other
   * cards are never overwritten.
   */
  async recomputeEquipmentUtilizationOnly(
    params: RecomputeSummaryParams,
  ): Promise<void> {
    const summaryDate = params.summaryDate.trim();
    const equipmentMode: DashboardEquipmentMode =
      params.equipmentMode === '4h' ? '4h' : '6h';
    const stationCode = (params.stationCode ?? LEGACY_STATION_CODE).trim();
    const flightScope =
      params.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;
    const wallStart = Date.now();
    const bustCache = params.invalidateFhrCache === true;

    await this.dailyAggregateGenerator.generateAndStoreAggregate(
      DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
      summaryDate,
      { equipmentMode, bustCache, stationCode, flightScope },
    );

    this.logger.log(
      JSON.stringify({
        event: 'dashboard_worker_equipment_util_only',
        summaryDate,
        equipmentMode,
        flightScope,
        wallMs: Date.now() - wallStart,
      }),
    );
  }
}
