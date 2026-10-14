import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  fixedStationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import { LEGACY_STATION_CODE } from '../../common/station/station.constants';
import { readDashboardRefreshEnv } from '../config/dashboard-refresh-env';
import {
  DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';
import {
  DASHBOARD_FLIGHT_SCOPES,
  type DashboardFlightScope,
} from '../constants/dashboard-flight-scope';
import type { DashboardEquipmentMode } from '../interfaces';
import type { DashboardSummaryLean } from '../interfaces/dashboard-summary.interface';
import type { DashboardDailyAggregateLean } from '../interfaces/dashboard-daily-aggregate.interface';
import { DailyAggregateSummaryService } from './daily-aggregate-summary.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import type { DashboardSecondaryCardsPayload } from './dashboard-secondary-cards.service';
import type {
  DashboardAirlineRemarksCardPayload,
  DashboardAircraftAnalysisCardPayload,
  DashboardEquipmentUtilizationCardPayload,
  DashboardPerformanceReportCardPayload,
  DashboardPrimaryCardsPayload,
} from '../interfaces/dashboard-bundle.interface';
import {
  mergeAirlineRemarkAggregates,
  mergeAircraftAnalysisAggregates,
  mergeEquipmentUtilAggregates,
  mergeGhaImprovementAggregates,
  mergeKpiStripAggregates,
  mergeOnTimePerformanceAggregates,
  mergePerformanceReportAggregates,
} from '../utils/daily-aggregate-merge.util';
import {
  applyDrillPaging,
  mergeAirlineRemarksDrillShards,
  mergePerformanceDrilldownShards,
  anyShardStale,
} from '../utils/compose-dashboard-daily-shards.util';
import {
  assertDailyAggregateCoverage,
  anyDailyAggregateStale,
  equipmentModeForAggregate,
  expectedDatesInRange,
  perfFromDailyDocs,
  PRIMARY_AGGREGATE_TYPES,
  SECONDARY_AGGREGATE_TYPES,
} from '../utils/dashboard-daily-aggregate-range.util';
import {
  normalizeStoredPerformanceDrillFlights,
  storedPerformanceDrillNeedsRecompose,
} from '../utils/dashboard-performance-drill-read.util';
import { enumerateYmdInclusive } from '../utils/daily-aggregate-merge.util';
import { mapPool } from '../utils/async-pool.util';
import { DailyAggregateGeneratorService } from './daily-aggregate-generator.service';
import { DashboardSummaryWorkerService } from './dashboard-summary-worker.service';

export interface ReadDashboardBundleParams {
  fromDate: string;
  tillDate: string;
  equipmentMode: DashboardEquipmentMode;
  flightScope?: DashboardFlightScope;
}

export type DashboardReadResult<T> = {
  payload: T;
  cacheHit: boolean;
  stale: boolean;
  totalMs: number;
  summary: DashboardSummaryLean | null;
  drillMongoReadMs?: number;
  drillStale?: boolean;
  drillEntryCount?: number;
};

export interface DrillSliceParams {
  skip?: number;
  limit?: number;
}

const DRILL_MISS_MESSAGE =
  'Dashboard drilldown is not materialized for this range. Rebuild daily shards (worker stores drilldowns on dashboard_summaries).';

/**
 * Bird dashboard HTTP read path:
 * - **Cards** from `dashboard_daily_aggregates` (merge per aggregateType across days).
 * - **Drilldowns** from embedded `dashboard_summaries.drilldowns` (no FHR on GET).
 */
@Injectable()
export class DashboardSummaryReadService {
  private readonly logger = new Logger(DashboardSummaryReadService.name);

  private readonly staleTtlMs: number;
  private readonly dailyAggregateConcurrency: number;

  constructor(
    private readonly dailyAggregateSummaryService: DailyAggregateSummaryService,
    private readonly dashboardSummaryService: DashboardSummaryService,
    private readonly dailyAggregateGeneratorService: DailyAggregateGeneratorService,
    private readonly dashboardSummaryWorkerService: DashboardSummaryWorkerService,
  ) {
    const env = readDashboardRefreshEnv();
    this.staleTtlMs = env.staleTtlMs;
    this.dailyAggregateConcurrency = env.dailyAggregateConcurrency;
  }

  /**
   * The dashboard is always a single-station view: a global admin still reads
   * one station's shards (their assigned station), never a cross-station blend
   * of pre-aggregated rows. Convert any cross-station scope to that station's
   * concrete scope (defaulting to legacy MAA).
   */
  private static readScope(station: StationScopeContext): StationScopeContext {
    if (!station.crossStation) return station;
    return fixedStationScope(station.stationCode ?? LEGACY_STATION_CODE);
  }

  private stationCodeOf(station: StationScopeContext): string {
    return (
      DashboardSummaryReadService.readScope(station).stationCode ??
      LEGACY_STATION_CODE
    );
  }

  /**
   * Load inclusive daily aggregates. Missing calendar days (common for NS when
   * To Date extends past the last seeded flight day) are materialized on demand
   * as zero-flight shards so the requested range returns exact coverage.
   * Days marked stale after FHR/NS form saves are regenerated so dashboard KPIs
   * reflect the latest flight data on the next GET.
   */
  private async loadRangeAggregate(
    fromDate: string,
    tillDate: string,
    aggregateType: DashboardAggregateType,
    equipmentMode: DashboardEquipmentMode,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
    flightScope: DashboardFlightScope = DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
  ): Promise<DashboardDailyAggregateLean[]> {
    const scope = DashboardSummaryReadService.readScope(station);
    const mode = equipmentModeForAggregate(aggregateType, equipmentMode);
    let days = await this.dailyAggregateSummaryService.findRangeAggregates(
      fromDate,
      tillDate,
      aggregateType,
      mode,
      scope,
      flightScope,
    );

    const expected = expectedDatesInRange(fromDate, tillDate);
    const byDate = new Map(days.map((d) => [d.date, d]));
    const missing = expected.filter((d) => !byDate.has(d));
    const stale = expected.filter((d) => {
      const doc = byDate.get(d);
      return doc != null && doc.isStale === true;
    });
    const toRebuild = [...new Set([...missing, ...stale])];
    if (toRebuild.length > 0) {
      const stationCode = this.stationCodeOf(station);
      this.logger.warn(
        `[dashboard_read] rematerializing ${toRebuild.length} day(s) ` +
          `(missing=${missing.length} stale=${stale.length}) ` +
          `aggregateType=${aggregateType} scope=${flightScope} station=${stationCode} ` +
          `range=${fromDate}..${tillDate}`,
      );
      await mapPool(toRebuild, this.dailyAggregateConcurrency, (date) =>
        this.dailyAggregateGeneratorService.generateAndStoreAggregate(
          aggregateType,
          date,
          { equipmentMode: mode, stationCode, flightScope },
        ),
      );
      days = await this.dailyAggregateSummaryService.findRangeAggregates(
        fromDate,
        tillDate,
        aggregateType,
        mode,
        scope,
        flightScope,
      );
    }

    assertDailyAggregateCoverage(aggregateType, fromDate, tillDate, days);
    return days;
  }

  /**
   * Ensure every calendar day in the drill window has a summary shard.
   * Pads trailing empty NS days the same way card aggregates do.
   * Rebuilds shards marked stale after FHR / NS form saves.
   */
  private async ensureDrillShardsOrdered(
    fromDate: string,
    tillDate: string,
    equipmentMode: DashboardEquipmentMode,
    station: StationScopeContext,
    flightScope: DashboardFlightScope,
  ): Promise<DashboardSummaryLean[]> {
    const scope = DashboardSummaryReadService.readScope(station);
    let shards = await this.dashboardSummaryService.findDrillShardsOrdered(
      fromDate,
      tillDate,
      equipmentMode,
      scope,
      flightScope,
    );

    const expected = enumerateYmdInclusive(fromDate, tillDate);
    const existing = await this.dashboardSummaryService.listExistingSummaryDates(
      fromDate,
      tillDate,
      equipmentMode,
      scope,
      flightScope,
    );
    const have = new Set(existing);
    const missing = expected.filter((d) => !have.has(d));
    const stale = (shards ?? [])
      .filter((s) => s.isStale === true)
      .map((s) => String(s.summaryDate ?? '').trim())
      .filter(Boolean);
    const toRebuild = [...new Set([...missing, ...stale])];

    if (toRebuild.length === 0) {
      if (shards) return shards;
      throw new ServiceUnavailableException(DRILL_MISS_MESSAGE);
    }

    const stationCode = this.stationCodeOf(station);
    this.logger.warn(
      `[dashboard_read] rematerializing ${toRebuild.length} summary shard(s) ` +
        `(missing=${missing.length} stale=${stale.length}) ` +
        `scope=${flightScope} station=${stationCode} range=${fromDate}..${tillDate}`,
    );
    await mapPool(toRebuild, this.dailyAggregateConcurrency, (summaryDate) =>
      this.dashboardSummaryWorkerService.recomputeAndStore({
        summaryDate,
        equipmentMode,
        stationCode,
        flightScope,
      }),
    );

    shards = await this.dashboardSummaryService.findDrillShardsOrdered(
      fromDate,
      tillDate,
      equipmentMode,
      scope,
      flightScope,
    );
    if (!shards) {
      throw new ServiceUnavailableException(DRILL_MISS_MESSAGE);
    }
    return shards;
  }

  private flightScopeOf(
    params: Pick<ReadDashboardBundleParams, 'flightScope'>,
  ): DashboardFlightScope {
    return params.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;
  }

  async readPrimaryCards(
    params: ReadDashboardBundleParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardReadResult<DashboardPrimaryCardsPayload>> {
    const wallStart = Date.now();
    const fromDate = params.fromDate.trim();
    const tillDate = params.tillDate.trim();
    const equipmentMode: DashboardEquipmentMode =
      params.equipmentMode === '4h' ? '4h' : '6h';

    const mergeStart = Date.now();
    const loaded = await Promise.all(
      PRIMARY_AGGREGATE_TYPES.map(async (aggregateType) => {
        const days = await this.loadRangeAggregate(
          fromDate,
          tillDate,
          aggregateType,
          equipmentMode,
          station,
          this.flightScopeOf(params),
        );
        return { aggregateType, days };
      }),
    );
    const mergeMs = Date.now() - mergeStart;

    const byType = new Map(
      loaded.map((x) => [x.aggregateType, x.days] as const),
    );
    const kpiDays = byType.get(DASHBOARD_AGGREGATE_TYPES.KPI_STRIP)!;
    const perfDays = byType.get(DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT)!;
    const ghaDays = byType.get(DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT)!;
    const otpDays = byType.get(DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE)!;

    const allDays = [...kpiDays, ...perfDays, ...ghaDays, ...otpDays];
    const stale = allDays.some(
      (d) =>
        d.isStale === true ||
        !this.dailyAggregateSummaryService.isLogicallyFresh(d, this.staleTtlMs),
    );
    const cacheHit = !stale;
    const perf = perfFromDailyDocs(allDays, mergeMs);
    const totalMs = Date.now() - wallStart;

    this.logger.log(
      `[dashboard_read] primary_cards source=${this.flightScopeOf(params) === 'nonScheduled' ? 'ns_dashboard_daily_aggregates' : 'dashboard_daily_aggregates'} scope=${this.flightScopeOf(params)} from=${fromDate} till=${tillDate} ` +
        `mode=${equipmentMode} dayBuckets=${kpiDays.length} totalMs=${totalMs}`,
    );

    return {
      cacheHit,
      stale,
      totalMs,
      summary: null,
      payload: {
        from: fromDate,
        to: tillDate,
        equipmentMode,
        kpiStrip: mergeKpiStripAggregates(kpiDays) as Record<string, unknown>,
        performanceReport: mergePerformanceReportAggregates(
          perfDays,
        ) as Record<string, unknown>,
        ghaImprovement: mergeGhaImprovementAggregates(
          ghaDays,
        ) as Record<string, unknown>,
        onTimePerformance: mergeOnTimePerformanceAggregates(
          otpDays,
        ) as Record<string, unknown>,
        _perf: {
          totalMs,
          mongoWallMs: perf.mongoWallMs,
          rowCount: perf.sourceRows,
          staWindowCacheHit: perf.staWindowCacheHit,
          aggregateMs: perf.aggregationMs,
          summaryCacheHit: cacheHit,
          ...(stale ? { summaryStale: true as const } : {}),
        },
      },
    };
  }

  private cardReadPerf(
    days: DashboardDailyAggregateLean[],
    mergeMs: number,
    totalMs: number,
    stale: boolean,
    cacheHit: boolean,
  ): NonNullable<DashboardAirlineRemarksCardPayload['_perf']> {
    const perf = perfFromDailyDocs(days, mergeMs);
    return {
      totalMs,
      mongoWallMs: perf.mongoWallMs,
      rowCount: perf.sourceRows,
      staWindowCacheHit: perf.staWindowCacheHit,
      aggregateMs: perf.aggregationMs,
      summaryCacheHit: cacheHit,
      ...(stale ? { summaryStale: true as const } : {}),
    };
  }

  private isDaysStale(days: DashboardDailyAggregateLean[]): boolean {
    return (
      anyDailyAggregateStale(days) ||
      days.some(
        (d) =>
          !this.dailyAggregateSummaryService.isLogicallyFresh(
            d,
            this.staleTtlMs,
          ),
      )
    );
  }

  async readAirlineRemarksCard(
    params: Pick<ReadDashboardBundleParams, 'fromDate' | 'tillDate' | 'flightScope'>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardReadResult<DashboardAirlineRemarksCardPayload>> {
    const wallStart = Date.now();
    const fromDate = params.fromDate.trim();
    const tillDate = params.tillDate.trim();
    const mergeStart = Date.now();
    const days = await this.loadRangeAggregate(
      fromDate,
      tillDate,
      DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS,
      '4h',
      station,
      this.flightScopeOf(params),
    );
    const mergeMs = Date.now() - mergeStart;
    const stale = this.isDaysStale(days);
    const cacheHit = !stale;
    const totalMs = Date.now() - wallStart;

    this.logger.log(
      `[dashboard_read] airline_remarks_card scope=${this.flightScopeOf(params)} from=${fromDate} till=${tillDate} totalMs=${totalMs}`,
    );

    return {
      cacheHit,
      stale,
      totalMs,
      summary: null,
      payload: {
        from: fromDate,
        to: tillDate,
        airlineRatings: mergeAirlineRemarkAggregates(
          days,
          fromDate,
          tillDate,
        ) as Record<string, unknown>,
        _perf: this.cardReadPerf(days, mergeMs, totalMs, stale, cacheHit),
      },
    };
  }

  async readAircraftAnalysisCard(
    params: Pick<ReadDashboardBundleParams, 'fromDate' | 'tillDate' | 'flightScope'>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardReadResult<DashboardAircraftAnalysisCardPayload>> {
    const wallStart = Date.now();
    const fromDate = params.fromDate.trim();
    const tillDate = params.tillDate.trim();
    const mergeStart = Date.now();
    const days = await this.loadRangeAggregate(
      fromDate,
      tillDate,
      DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
      '4h',
      station,
      this.flightScopeOf(params),
    );
    const mergeMs = Date.now() - mergeStart;
    const stale = this.isDaysStale(days);
    const cacheHit = !stale;
    const totalMs = Date.now() - wallStart;

    this.logger.log(
      `[dashboard_read] aircraft_analysis_card from=${fromDate} till=${tillDate} totalMs=${totalMs}`,
    );

    return {
      cacheHit,
      stale,
      totalMs,
      summary: null,
      payload: {
        from: fromDate,
        to: tillDate,
        aircraftCategory: mergeAircraftAnalysisAggregates(
          days,
        ) as Record<string, unknown>,
        _perf: this.cardReadPerf(days, mergeMs, totalMs, stale, cacheHit),
      },
    };
  }

  async readPerformanceReportCard(
    params: Pick<ReadDashboardBundleParams, 'fromDate' | 'tillDate' | 'flightScope'>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardReadResult<DashboardPerformanceReportCardPayload>> {
    const wallStart = Date.now();
    const fromDate = params.fromDate.trim();
    const tillDate = params.tillDate.trim();
    const mergeStart = Date.now();
    const days = await this.loadRangeAggregate(
      fromDate,
      tillDate,
      DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT,
      '4h',
      station,
      this.flightScopeOf(params),
    );
    const mergeMs = Date.now() - mergeStart;
    const stale = this.isDaysStale(days);
    const cacheHit = !stale;
    const totalMs = Date.now() - wallStart;

    this.logger.log(
      `[dashboard_read] performance_report_card from=${fromDate} till=${tillDate} totalMs=${totalMs}`,
    );

    return {
      cacheHit,
      stale,
      totalMs,
      summary: null,
      payload: {
        from: fromDate,
        to: tillDate,
        performanceReport: mergePerformanceReportAggregates(
          days,
        ) as Record<string, unknown>,
        _perf: this.cardReadPerf(days, mergeMs, totalMs, stale, cacheHit),
      },
    };
  }

  async readEquipmentUtilizationCard(
    params: ReadDashboardBundleParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardReadResult<DashboardEquipmentUtilizationCardPayload>> {
    const wallStart = Date.now();
    const fromDate = params.fromDate.trim();
    const tillDate = params.tillDate.trim();
    const equipmentMode: DashboardEquipmentMode =
      params.equipmentMode === '4h' ? '4h' : '6h';
    const mergeStart = Date.now();
    const days = await this.loadRangeAggregate(
      fromDate,
      tillDate,
      DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
      equipmentMode,
      station,
      this.flightScopeOf(params),
    );
    const mergeMs = Date.now() - mergeStart;
    const stale = this.isDaysStale(days);
    const cacheHit = !stale;
    const totalMs = Date.now() - wallStart;

    this.logger.log(
      `[dashboard_read] equipment_utilization_card from=${fromDate} till=${tillDate} ` +
        `mode=${equipmentMode} totalMs=${totalMs}`,
    );

    return {
      cacheHit,
      stale,
      totalMs,
      summary: null,
      payload: {
        from: fromDate,
        to: tillDate,
        equipmentMode,
        equipmentUtil: mergeEquipmentUtilAggregates(
          days,
        ) as Record<string, unknown>,
        _perf: this.cardReadPerf(days, mergeMs, totalMs, stale, cacheHit),
      },
    };
  }

  async readSecondaryCards(
    params: ReadDashboardBundleParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardReadResult<DashboardSecondaryCardsPayload>> {
    const wallStart = Date.now();
    const fromDate = params.fromDate.trim();
    const tillDate = params.tillDate.trim();
    const equipmentMode: DashboardEquipmentMode =
      params.equipmentMode === '4h' ? '4h' : '6h';

    const mergeStart = Date.now();
    const loaded = await Promise.all(
      SECONDARY_AGGREGATE_TYPES.map(async (aggregateType) => {
        const days = await this.loadRangeAggregate(
          fromDate,
          tillDate,
          aggregateType,
          equipmentMode,
          station,
          this.flightScopeOf(params),
        );
        return { aggregateType, days };
      }),
    );
    const mergeMs = Date.now() - mergeStart;

    const byType = new Map(
      loaded.map((x) => [x.aggregateType, x.days] as const),
    );
    const airlineDays = byType.get(DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS)!;
    const aircraftDays = byType.get(DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS)!;
    const equipDays = byType.get(
      DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
    )!;

    const allDays = [...airlineDays, ...aircraftDays, ...equipDays];
    const stale = anyDailyAggregateStale(allDays) ||
      allDays.some(
        (d) =>
          !this.dailyAggregateSummaryService.isLogicallyFresh(
            d,
            this.staleTtlMs,
          ),
      );
    const cacheHit = !stale;
    const perf = perfFromDailyDocs(allDays, mergeMs);
    const totalMs = Date.now() - wallStart;

    this.logger.log(
      `[dashboard_read] secondary_cards source=dashboard_daily_aggregates from=${fromDate} till=${tillDate} ` +
        `mode=${equipmentMode} totalMs=${totalMs}`,
    );

    return {
      cacheHit,
      stale,
      totalMs,
      summary: null,
      payload: {
        from: fromDate,
        to: tillDate,
        equipmentMode,
        airlineRatings: mergeAirlineRemarkAggregates(
          airlineDays,
          fromDate,
          tillDate,
        ) as DashboardSecondaryCardsPayload['airlineRatings'],
        aircraftCategory: mergeAircraftAnalysisAggregates(
          aircraftDays,
        ) as DashboardSecondaryCardsPayload['aircraftCategory'],
        equipmentUtil: mergeEquipmentUtilAggregates(
          equipDays,
        ) as DashboardSecondaryCardsPayload['equipmentUtil'],
        _perf: {
          totalMs,
          mongoWallMs: perf.mongoWallMs,
          rowCount: perf.sourceRows,
          staWindowCacheHit: perf.staWindowCacheHit,
          aggregateMs: perf.aggregationMs,
          summaryCacheHit: cacheHit,
          ...(stale ? { summaryStale: true as const } : {}),
        },
      },
    };
  }

  async readPerformanceDrilldown(
    params: ReadDashboardBundleParams,
    slice?: DrillSliceParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<
    DashboardReadResult<{
      performanceReport?: Record<string, unknown>;
      drillPaging?: { skip: number; limit: number; total: number };
    }>
  > {
    const wallStart = Date.now();
    const fromDate = params.fromDate.trim();
    const tillDate = params.tillDate.trim();
    const mode = params.equipmentMode === '4h' ? '4h' : '6h';
    const skip = Math.max(0, Math.floor(slice?.skip ?? 0));
    const limitRaw = slice?.limit != null ? Math.floor(slice.limit) : 0;
    const useSlice = limitRaw > 0;

    const drillWall = Date.now();
    const drillShards = await this.ensureDrillShardsOrdered(
      fromDate,
      tillDate,
      mode,
      station,
      this.flightScopeOf(params),
    );
    const drillMongoReadMs = Date.now() - drillWall;

    const merged = mergePerformanceDrilldownShards(drillShards);
    if (!merged) {
      throw new ServiceUnavailableException(DRILL_MISS_MESSAGE);
    }

    let flights: unknown[] = merged.flights;
    if (storedPerformanceDrillNeedsRecompose(flights)) {
      flights = normalizeStoredPerformanceDrillFlights(flights);
    }
    const drillAnyStale = anyShardStale(drillShards);

    let paging:
      | { skip: number; limit: number; total: number }
      | undefined;
    if (useSlice) {
      const paged = applyDrillPaging(flights, skip, limitRaw);
      flights = paged.slice;
      paging = { skip, limit: limitRaw, total: paged.total };
    }

    const performanceReport = {
      flights,
      partitionMeta: merged.partitionMeta,
      schemaVersion: merged.schemaVersion,
    } as Record<string, unknown>;

    return {
      cacheHit: !drillAnyStale,
      stale: drillAnyStale,
      totalMs: Date.now() - wallStart,
      summary: null,
      drillMongoReadMs,
      drillStale: drillAnyStale,
      drillEntryCount: flights.length,
      payload: {
        performanceReport,
        ...(paging ? { drillPaging: paging } : {}),
      },
    };
  }

  async readAirlineRemarksDrilldown(
    params: ReadDashboardBundleParams,
    slice?: DrillSliceParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<
    DashboardReadResult<{
      from: string;
      to: string;
      equipmentMode: DashboardEquipmentMode;
      ratingsSummary: Record<string, unknown>;
      chartTopAirlinesByRating: Record<string, { airline: string; count: number }[]>;
      rows: unknown[];
      totalRows: number;
      drillPaging?: { skip: number; limit: number; total: number };
    }>
  > {
    const wallStart = Date.now();
    const fromDate = params.fromDate.trim();
    const tillDate = params.tillDate.trim();
    const mode = params.equipmentMode === '4h' ? '4h' : '6h';
    const skip = Math.max(0, Math.floor(slice?.skip ?? 0));
    const limitRaw = slice?.limit != null ? Math.floor(slice.limit) : 0;
    const useSlice = limitRaw > 0;

    const drillWall = Date.now();
    const drillShards = await this.ensureDrillShardsOrdered(
      fromDate,
      tillDate,
      mode,
      station,
      this.flightScopeOf(params),
    );
    const drillMongoReadMs = Date.now() - drillWall;

    const merged = mergeAirlineRemarksDrillShards(
      drillShards,
      fromDate,
      tillDate,
    );
    if (!merged) {
      throw new ServiceUnavailableException(DRILL_MISS_MESSAGE);
    }

    let rows = merged.rows;
    let totalRows = rows.length;
    let drillPaging:
      | { skip: number; limit: number; total: number }
      | undefined;
    if (useSlice) {
      const paged = applyDrillPaging(rows, skip, limitRaw);
      rows = paged.slice;
      totalRows = paged.total;
      drillPaging = { skip, limit: limitRaw, total: paged.total };
    }

    const drillAnyStale = anyShardStale(drillShards);

    return {
      cacheHit: !drillAnyStale,
      stale: drillAnyStale,
      totalMs: Date.now() - wallStart,
      summary: null,
      drillMongoReadMs,
      drillStale: drillAnyStale,
      drillEntryCount: totalRows,
      payload: {
        from: fromDate,
        to: tillDate,
        equipmentMode: mode,
        ratingsSummary: (merged.ratingsSummary ?? {}) as Record<string, unknown>,
        chartTopAirlinesByRating:
          (merged.chartTopAirlinesByRating ?? {}) as Record<
            string,
            { airline: string; count: number }[]
          >,
        rows,
        totalRows,
        ...(drillPaging ? { drillPaging } : {}),
      },
    };
  }
}
