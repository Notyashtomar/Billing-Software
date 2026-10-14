import { Injectable, Logger } from '@nestjs/common';
import { readDashboardRefreshEnv } from '../config/dashboard-refresh-env';
import {
  DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';
import {
  DASHBOARD_CARD_KEYS,
  type DashboardCardKey,
} from '../constants/dashboard-card-keys';
import type { DashboardDailyAggregateLean } from '../interfaces/dashboard-daily-aggregate.interface';
import type { DashboardCardPerf } from '../interfaces/dashboard-bundle.interface';
import type { DashboardEquipmentMode } from '../interfaces';
import {
  enumerateYmdInclusive,
  mergeAirlineRemarkAggregates,
  mergeAircraftAnalysisAggregates,
  mergeEquipmentUtilAggregates,
  mergeGhaImprovementAggregates,
  mergeKpiStripAggregates,
  mergeOnTimePerformanceAggregates,
  mergePerformanceReportAggregates,
} from '../utils/daily-aggregate-merge.util';
import { DailyAggregateGeneratorService } from './daily-aggregate-generator.service';
import { DailyAggregateSummaryService } from './daily-aggregate-summary.service';
import { mapPool } from '../utils/async-pool.util';

export interface GenerateCardParams {
  fromDate: string;
  tillDate: string;
  equipmentMode: DashboardEquipmentMode;
  bustCache?: boolean;
}

export interface GeneratedCardPayload {
  cardKey: DashboardCardKey;
  data: Record<string, unknown>;
  perf: DashboardCardPerf;
}

/**
 * Worker-only card builders — merges internal `dashboard_daily_aggregates` shards.
 * Not invoked from HTTP request handlers.
 */
@Injectable()
export class DashboardCardGeneratorService {
  private readonly logger = new Logger(DashboardCardGeneratorService.name);

  private readonly dailyAggregateConcurrency: number;

  constructor(
    private readonly dailyAggregateSummaryService: DailyAggregateSummaryService,
    private readonly dailyAggregateGeneratorService: DailyAggregateGeneratorService,
  ) {
    this.dailyAggregateConcurrency =
      readDashboardRefreshEnv().dailyAggregateConcurrency;
  }

  private async ensureDailyAggregatesForRange(
    aggregateType: DashboardAggregateType,
    fromYmd: string,
    toYmd: string,
    equipmentMode?: DashboardEquipmentMode,
    bustCache?: boolean,
  ): Promise<DashboardDailyAggregateLean[]> {
    const allDates = enumerateYmdInclusive(fromYmd, toYmd);
    let days = await this.dailyAggregateSummaryService.findRangeAggregates(
      fromYmd,
      toYmd,
      aggregateType,
      equipmentMode,
    );

    const existing = new Set(days.map((d) => d.date));
    const missing = allDates.filter((d) => !existing.has(d));
    const staleDates = days
      .filter((d) => d.isStale === true)
      .map((d) => d.date);
    const toRegenerate = [
      ...new Set([
        ...missing,
        ...(bustCache ? allDates : staleDates),
      ]),
    ];

    if (toRegenerate.length > 0) {
      await mapPool(
        toRegenerate,
        this.dailyAggregateConcurrency,
        (date) =>
          this.dailyAggregateGeneratorService.generateAndStoreAggregate(
            aggregateType,
            date,
            { equipmentMode, bustCache: bustCache === true },
          ),
      );
      days = await this.dailyAggregateSummaryService.findRangeAggregates(
        fromYmd,
        toYmd,
        aggregateType,
        equipmentMode,
      );
    }

    return days;
  }

  private buildPerfFromDailyDocs(
    days: DashboardDailyAggregateLean[],
    mergeMs: number,
    ensureMs: number,
  ): DashboardCardPerf {
    const sourceRows = days.reduce(
      (sum, d) => sum + (Number(d.perf?.sourceRows) || 0),
      0,
    );
    const mongoWallMs = days.reduce(
      (max, d) => Math.max(max, Number(d.perf?.mongoWallMs) || 0),
      0,
    );
    const staWindowCacheHit =
      days.length > 0 &&
      days.every((d) => Boolean(d.perf?.staWindowCacheHit));

    return {
      sourceRows,
      aggregationMs: ensureMs + mergeMs,
      mongoWallMs,
      staWindowCacheHit,
    };
  }

  private logCardMerge(
    aggregateType: DashboardAggregateType,
    fromYmd: string,
    toYmd: string,
    mergeMs: number,
    days: DashboardDailyAggregateLean[],
  ): void {
    const sourceRows = days.reduce(
      (sum, d) => sum + (Number(d.perf?.sourceRows) || 0),
      0,
    );
    this.logger.log(
      `[dashboard_daily] aggregateType=${aggregateType} date=${fromYmd}..${toYmd} ` +
        `mergeMs=${mergeMs} sourceRows=${sourceRows} dayCount=${days.length}`,
    );
  }

  async generateAirlineRemarksCard(
    params: GenerateCardParams,
  ): Promise<GeneratedCardPayload> {
    const from = params.fromDate.trim();
    const to = params.tillDate.trim();
    const ensureStart = Date.now();
    const days = await this.ensureDailyAggregatesForRange(
      DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS,
      from,
      to,
      undefined,
      params.bustCache,
    );
    const ensureMs = Date.now() - ensureStart;

    const mergeStart = Date.now();
    const data = mergeAirlineRemarkAggregates(days, from, to);
    const mergeMs = Date.now() - mergeStart;

    this.logCardMerge(
      DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS,
      from,
      to,
      mergeMs,
      days,
    );

    return {
      cardKey: DASHBOARD_CARD_KEYS.AIRLINE_REMARKS,
      data: data as unknown as Record<string, unknown>,
      perf: this.buildPerfFromDailyDocs(days, mergeMs, ensureMs),
    };
  }

  async generateAircraftAnalysisCard(
    params: GenerateCardParams,
  ): Promise<GeneratedCardPayload> {
    const from = params.fromDate.trim();
    const to = params.tillDate.trim();
    const ensureStart = Date.now();
    const days = await this.ensureDailyAggregatesForRange(
      DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
      from,
      to,
      undefined,
      params.bustCache,
    );
    const ensureMs = Date.now() - ensureStart;

    const mergeStart = Date.now();
    const data = mergeAircraftAnalysisAggregates(days);
    const mergeMs = Date.now() - mergeStart;

    this.logCardMerge(
      DASHBOARD_AGGREGATE_TYPES.AIRCRAFT_ANALYSIS,
      from,
      to,
      mergeMs,
      days,
    );

    return {
      cardKey: DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS,
      data: data as unknown as Record<string, unknown>,
      perf: this.buildPerfFromDailyDocs(days, mergeMs, ensureMs),
    };
  }

  async generateEquipmentUtilizationCard(
    params: GenerateCardParams,
  ): Promise<GeneratedCardPayload> {
    const from = params.fromDate.trim();
    const to = params.tillDate.trim();
    const mode = params.equipmentMode === '4h' ? '4h' : '6h';
    const ensureStart = Date.now();
    const days = await this.ensureDailyAggregatesForRange(
      DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
      from,
      to,
      mode,
      params.bustCache,
    );
    const ensureMs = Date.now() - ensureStart;

    const mergeStart = Date.now();
    const data = mergeEquipmentUtilAggregates(days);
    const mergeMs = Date.now() - mergeStart;

    this.logCardMerge(
      DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
      from,
      to,
      mergeMs,
      days,
    );

    return {
      cardKey: DASHBOARD_CARD_KEYS.EQUIPMENT_UTILIZATION,
      data: data as unknown as Record<string, unknown>,
      perf: this.buildPerfFromDailyDocs(days, mergeMs, ensureMs),
    };
  }

  async generateKpiStripCard(
    params: GenerateCardParams,
  ): Promise<GeneratedCardPayload> {
    const from = params.fromDate.trim();
    const to = params.tillDate.trim();
    const ensureStart = Date.now();
    const days = await this.ensureDailyAggregatesForRange(
      DASHBOARD_AGGREGATE_TYPES.KPI_STRIP,
      from,
      to,
      undefined,
      params.bustCache,
    );
    const ensureMs = Date.now() - ensureStart;
    const mergeStart = Date.now();
    const data = mergeKpiStripAggregates(days);
    const mergeMs = Date.now() - mergeStart;
    this.logCardMerge(DASHBOARD_AGGREGATE_TYPES.KPI_STRIP, from, to, mergeMs, days);
    return {
      cardKey: DASHBOARD_CARD_KEYS.KPI_STRIP,
      data: data as unknown as Record<string, unknown>,
      perf: this.buildPerfFromDailyDocs(days, mergeMs, ensureMs),
    };
  }

  async generatePerformanceReportCard(
    params: GenerateCardParams,
  ): Promise<GeneratedCardPayload> {
    const from = params.fromDate.trim();
    const to = params.tillDate.trim();
    const ensureStart = Date.now();
    const days = await this.ensureDailyAggregatesForRange(
      DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT,
      from,
      to,
      undefined,
      params.bustCache,
    );
    const ensureMs = Date.now() - ensureStart;
    const mergeStart = Date.now();
    const data = mergePerformanceReportAggregates(days);
    const mergeMs = Date.now() - mergeStart;
    this.logCardMerge(
      DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT,
      from,
      to,
      mergeMs,
      days,
    );
    return {
      cardKey: DASHBOARD_CARD_KEYS.PERFORMANCE_REPORT,
      data: data as unknown as Record<string, unknown>,
      perf: this.buildPerfFromDailyDocs(days, mergeMs, ensureMs),
    };
  }

  async generateGhaImprovementCard(
    params: GenerateCardParams,
  ): Promise<GeneratedCardPayload> {
    const from = params.fromDate.trim();
    const to = params.tillDate.trim();
    const ensureStart = Date.now();
    const days = await this.ensureDailyAggregatesForRange(
      DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT,
      from,
      to,
      undefined,
      params.bustCache,
    );
    const ensureMs = Date.now() - ensureStart;
    const mergeStart = Date.now();
    const data = mergeGhaImprovementAggregates(days);
    const mergeMs = Date.now() - mergeStart;
    this.logCardMerge(
      DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT,
      from,
      to,
      mergeMs,
      days,
    );
    return {
      cardKey: DASHBOARD_CARD_KEYS.GHA_IMPROVEMENT,
      data: data as unknown as Record<string, unknown>,
      perf: this.buildPerfFromDailyDocs(days, mergeMs, ensureMs),
    };
  }

  async generateOnTimePerformanceCard(
    params: GenerateCardParams,
  ): Promise<GeneratedCardPayload> {
    const from = params.fromDate.trim();
    const to = params.tillDate.trim();
    const ensureStart = Date.now();
    const days = await this.ensureDailyAggregatesForRange(
      DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE,
      from,
      to,
      undefined,
      params.bustCache,
    );
    const ensureMs = Date.now() - ensureStart;
    const mergeStart = Date.now();
    const data = mergeOnTimePerformanceAggregates(days);
    const mergeMs = Date.now() - mergeStart;
    this.logCardMerge(
      DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE,
      from,
      to,
      mergeMs,
      days,
    );
    return {
      cardKey: DASHBOARD_CARD_KEYS.ON_TIME_PERFORMANCE,
      data: data as unknown as Record<string, unknown>,
      perf: this.buildPerfFromDailyDocs(days, mergeMs, ensureMs),
    };
  }

  async generateCard(
    cardKey: DashboardCardKey,
    params: GenerateCardParams,
  ): Promise<GeneratedCardPayload> {
    switch (cardKey) {
      case DASHBOARD_CARD_KEYS.AIRLINE_REMARKS:
        return this.generateAirlineRemarksCard(params);
      case DASHBOARD_CARD_KEYS.AIRCRAFT_ANALYSIS:
        return this.generateAircraftAnalysisCard(params);
      case DASHBOARD_CARD_KEYS.EQUIPMENT_UTILIZATION:
        return this.generateEquipmentUtilizationCard(params);
      case DASHBOARD_CARD_KEYS.KPI_STRIP:
        return this.generateKpiStripCard(params);
      case DASHBOARD_CARD_KEYS.PERFORMANCE_REPORT:
        return this.generatePerformanceReportCard(params);
      case DASHBOARD_CARD_KEYS.GHA_IMPROVEMENT:
        return this.generateGhaImprovementCard(params);
      case DASHBOARD_CARD_KEYS.ON_TIME_PERFORMANCE:
        return this.generateOnTimePerformanceCard(params);
      default: {
        const _exhaustive: never = cardKey;
        throw new Error(`Unsupported cardKey: ${String(_exhaustive)}`);
      }
    }
  }
}
