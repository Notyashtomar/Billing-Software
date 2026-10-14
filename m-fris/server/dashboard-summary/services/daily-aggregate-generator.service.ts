import { Injectable, Logger } from '@nestjs/common';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import { NsFhrCollectionService } from 'src/ns-fhr-collection/services/ns-fhr-collection.service';
import { EquipmentManpowerService } from 'src/equipment-manpower/services/equipment-manpower.service';
import { AdvanceAircraftService } from 'src/advance-aircraft/services/advance-aircraft.service';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  fixedStationScope,
  type StationScopeContext,
} from 'src/common/station/station-scope';
import {
  DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';
import {
  DASHBOARD_FLIGHT_SCOPES,
  isNonScheduledDashboardScope,
  type DashboardFlightScope,
} from '../constants/dashboard-flight-scope';
import type { DashboardDailyAggregatePerf } from '../interfaces/dashboard-daily-aggregate.interface';
import type { DashboardEquipmentMode } from '../interfaces';
import { DailyAggregateSummaryService } from './daily-aggregate-summary.service';
import {
  aggregateGhaDelayCodesFromLegs,
  aggregateKpiStripFromLeanRows,
  aggregatePerformanceReportSnapshotFromLegs,
  buildOnTimePerformanceCardFromLegs,
  mapLeanFhrRowsToPerformanceLegs,
} from '../utils/dashboard-performance-from-fhr.util';
import { assertEquipmentUtilAggregateMatchesMode } from '../utils/equipment-util-aggregate-validate.util';

export interface GenerateDailyAggregateOptions {
  bustCache?: boolean;
  equipmentMode?: DashboardEquipmentMode;
  /**
   * Concrete owning station for this materialization (e.g. `MAA`, `AGR`).
   * Scopes the FHR source rows + equipment catalog and stamps the stored shard.
   * Omitted = legacy/system (cross-station) behavior.
   */
  stationCode?: string;
  /** `nonScheduled` reads `ns_fhr_collection` and writes `ns_dashboard_*`. */
  flightScope?: DashboardFlightScope;
}

@Injectable()
export class DailyAggregateGeneratorService {
  private readonly logger = new Logger(DailyAggregateGeneratorService.name);

  constructor(
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly nsFhrCollectionService: NsFhrCollectionService,
    private readonly equipmentManpowerService: EquipmentManpowerService,
    private readonly advanceAircraftService: AdvanceAircraftService,
    private readonly dailyAggregateSummaryService: DailyAggregateSummaryService,
  ) {}

  private static ymdToDdMmYyyy(ymd: string): string {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  }

  /** Resolve the FHR/catalog read scope from the (optional) concrete station. */
  private static scopeFromOptions(
    options?: GenerateDailyAggregateOptions,
  ): StationScopeContext {
    const code = options?.stationCode?.trim();
    return code ? fixedStationScope(code) : CROSS_STATION_SYSTEM_SCOPE;
  }

  private async loadRowsForSingleDay(
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{
    rows: Array<Record<string, unknown>>;
    queryMs: number;
    cacheHit: boolean;
  }> {
    const dateStrings = [DailyAggregateGeneratorService.ymdToDdMmYyyy(dateYmd)];
    const scope = DailyAggregateGeneratorService.scopeFromOptions(options);
    const flightScope =
      options?.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;

    if (isNonScheduledDashboardScope(flightScope)) {
      if (options?.bustCache) {
        this.nsFhrCollectionService.invalidateStaWindowRowsCache(dateStrings);
      }
      const fetched =
        await this.nsFhrCollectionService.findAllLeanForDashboardBundle(
          dateStrings,
          scope,
        );
      return {
        rows: fetched.rows as Array<Record<string, unknown>>,
        queryMs: fetched.queryMs,
        cacheHit: fetched.cacheHit,
      };
    }

    if (options?.bustCache) {
      this.fhrCollectionService.invalidateStaWindowRowsCache(dateStrings);
    }
    const fetched =
      await this.fhrCollectionService.findAllLeanForDashboardBundle(
        dateStrings,
        scope,
      );
    return {
      rows: fetched.rows as Array<Record<string, unknown>>,
      queryMs: fetched.queryMs,
      cacheHit: fetched.cacheHit,
    };
  }

  async generateAirlineRemarksDailyAggregate(
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{ data: Record<string, unknown>; perf: DashboardDailyAggregatePerf }> {
    const generateStart = Date.now();
    const { rows, queryMs, cacheHit } = await this.loadRowsForSingleDay(
      dateYmd,
      options,
    );
    const data = this.fhrCollectionService.aggregateAirlineRemarksRatingsFromLeanRows(
      rows,
      dateYmd,
      dateYmd,
    );
    const perf: DashboardDailyAggregatePerf = {
      sourceRows: rows.length,
      aggregationMs: Date.now() - generateStart,
      mongoWallMs: queryMs,
      staWindowCacheHit: cacheHit,
    };
    this.logDaily(DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS, dateYmd, perf);
    return { data: data as unknown as Record<string, unknown>, perf };
  }

  async generateAircraftAnalysisDailyAggregate(
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{ data: Record<string, unknown>; perf: DashboardDailyAggregatePerf }> {
    const generateStart = Date.now();
    const { rows, queryMs, cacheHit } = await this.loadRowsForSingleDay(
      dateYmd,
      options,
    );
    const bodyCatalog =
      await this.advanceAircraftService.getActiveAircraftBodyMap();
    const data =
      this.fhrCollectionService.getScheduledCategoryBreakdownFromLeanRows(
        rows,
        dateYmd,
        dateYmd,
        bodyCatalog,
      );
    const perf: DashboardDailyAggregatePerf = {
      sourceRows: rows.length,
      aggregationMs: Date.now() - generateStart,
      mongoWallMs: queryMs,
      staWindowCacheHit: cacheHit,
    };
    this.logDaily(DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS, dateYmd, perf);
    return { data: data as unknown as Record<string, unknown>, perf };
  }

  async generateEquipmentUtilizationDailyAggregate(
    dateYmd: string,
    equipmentMode: DashboardEquipmentMode,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{ data: Record<string, unknown>; perf: DashboardDailyAggregatePerf }> {
    const generateStart = Date.now();
    const { rows, queryMs, cacheHit } = await this.loadRowsForSingleDay(
      dateYmd,
      options,
    );
    const catalog = await this.equipmentManpowerService.getMasterCatalog(
      DailyAggregateGeneratorService.scopeFromOptions(options),
    );
    const data =
      this.equipmentManpowerService.aggregateDashboardEquipmentUtilFromLeanRows(
        rows,
        equipmentMode,
        catalog,
      );
    assertEquipmentUtilAggregateMatchesMode(
      data as unknown as Record<string, unknown>,
      equipmentMode,
      `date=${dateYmd}`,
    );
    const perf: DashboardDailyAggregatePerf = {
      sourceRows: rows.length,
      aggregationMs: Date.now() - generateStart,
      mongoWallMs: queryMs,
      staWindowCacheHit: cacheHit,
    };
    this.logDaily(
      DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
      dateYmd,
      perf,
      equipmentMode,
    );
    return { data: data as unknown as Record<string, unknown>, perf };
  }

  async generatePerformanceReportDailyAggregate(
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{ data: Record<string, unknown>; perf: DashboardDailyAggregatePerf }> {
    const generateStart = Date.now();
    const { rows, queryMs, cacheHit } = await this.loadRowsForSingleDay(
      dateYmd,
      options,
    );
    const legs = mapLeanFhrRowsToPerformanceLegs(rows);
    const data = aggregatePerformanceReportSnapshotFromLegs(legs);
    const perf: DashboardDailyAggregatePerf = {
      sourceRows: rows.length,
      aggregationMs: Date.now() - generateStart,
      mongoWallMs: queryMs,
      staWindowCacheHit: cacheHit,
    };
    this.logDaily(DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT, dateYmd, perf);
    return { data: data as unknown as Record<string, unknown>, perf };
  }

  async generateGhaImprovementDailyAggregate(
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{ data: Record<string, unknown>; perf: DashboardDailyAggregatePerf }> {
    const generateStart = Date.now();
    const { rows, queryMs, cacheHit } = await this.loadRowsForSingleDay(
      dateYmd,
      options,
    );
    const legs = mapLeanFhrRowsToPerformanceLegs(rows);
    const data = aggregateGhaDelayCodesFromLegs(legs);
    const perf: DashboardDailyAggregatePerf = {
      sourceRows: rows.length,
      aggregationMs: Date.now() - generateStart,
      mongoWallMs: queryMs,
      staWindowCacheHit: cacheHit,
    };
    this.logDaily(DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT, dateYmd, perf);
    return { data: data as unknown as Record<string, unknown>, perf };
  }

  async generateOnTimePerformanceDailyAggregate(
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{ data: Record<string, unknown>; perf: DashboardDailyAggregatePerf }> {
    const generateStart = Date.now();
    const { rows, queryMs, cacheHit } = await this.loadRowsForSingleDay(
      dateYmd,
      options,
    );
    const legs = mapLeanFhrRowsToPerformanceLegs(rows);
    const data = buildOnTimePerformanceCardFromLegs(legs);
    const perf: DashboardDailyAggregatePerf = {
      sourceRows: rows.length,
      aggregationMs: Date.now() - generateStart,
      mongoWallMs: queryMs,
      staWindowCacheHit: cacheHit,
    };
    this.logDaily(DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE, dateYmd, perf);
    return { data: data as unknown as Record<string, unknown>, perf };
  }

  async generateKpiStripDailyAggregate(
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{ data: Record<string, unknown>; perf: DashboardDailyAggregatePerf }> {
    const generateStart = Date.now();
    const { rows, queryMs, cacheHit } = await this.loadRowsForSingleDay(
      dateYmd,
      options,
    );
    const data = aggregateKpiStripFromLeanRows(rows);
    const perf: DashboardDailyAggregatePerf = {
      sourceRows: rows.length,
      aggregationMs: Date.now() - generateStart,
      mongoWallMs: queryMs,
      staWindowCacheHit: cacheHit,
    };
    this.logDaily(DASHBOARD_AGGREGATE_TYPES.KPI_STRIP, dateYmd, perf);
    return { data: data as unknown as Record<string, unknown>, perf };
  }

  async generateAggregate(
    aggregateType: DashboardAggregateType,
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<{ data: Record<string, unknown>; perf: DashboardDailyAggregatePerf }> {
    switch (aggregateType) {
      case DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS:
        return this.generateAirlineRemarksDailyAggregate(dateYmd, options);
      case DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS:
        return this.generateAircraftAnalysisDailyAggregate(dateYmd, options);
      case DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION:
        return this.generateEquipmentUtilizationDailyAggregate(
          dateYmd,
          options?.equipmentMode === '4h' ? '4h' : '6h',
          options,
        );
      case DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT:
        return this.generatePerformanceReportDailyAggregate(dateYmd, options);
      case DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT:
        return this.generateGhaImprovementDailyAggregate(dateYmd, options);
      case DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE:
        return this.generateOnTimePerformanceDailyAggregate(dateYmd, options);
      case DASHBOARD_AGGREGATE_TYPES.KPI_STRIP:
        return this.generateKpiStripDailyAggregate(dateYmd, options);
      default: {
        const _exhaustive: never = aggregateType;
        throw new Error(`Unsupported aggregateType: ${String(_exhaustive)}`);
      }
    }
  }

  async generateAndStoreAggregate(
    aggregateType: DashboardAggregateType,
    dateYmd: string,
    options?: GenerateDailyAggregateOptions,
  ): Promise<void> {
    const upsertStart = Date.now();
    const { data, perf } = await this.generateAggregate(
      aggregateType,
      dateYmd,
      options,
    );
    await this.dailyAggregateSummaryService.upsertAggregate({
      date: dateYmd,
      aggregateType,
      equipmentMode: options?.equipmentMode,
      stationCode: options?.stationCode,
      flightScope: options?.flightScope,
      generatedAt: new Date(),
      data,
      perf,
    });
    this.logger.log(
      `[dashboard_daily] upsertMs=${Date.now() - upsertStart} aggregateType=${aggregateType} date=${dateYmd}`,
    );
  }

  private logDaily(
    aggregateType: DashboardAggregateType,
    date: string,
    perf: DashboardDailyAggregatePerf,
    equipmentMode?: DashboardEquipmentMode,
  ): void {
    this.logger.log(
      `[dashboard_daily] aggregateType=${aggregateType} date=${date} ` +
        `generateMs=${perf.aggregationMs} sourceRows=${perf.sourceRows} ` +
        `cacheHit=${Boolean(perf.staWindowCacheHit)}` +
        (equipmentMode ? ` equipmentMode=${equipmentMode}` : ''),
    );
  }
}
