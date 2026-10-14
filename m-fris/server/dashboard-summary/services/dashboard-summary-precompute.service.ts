import { Injectable, Logger } from '@nestjs/common';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  type StationScopeContext,
} from '../../common/station/station-scope';
import type { DashboardFlightScope } from '../constants/dashboard-flight-scope';
import type { DashboardEquipmentMode } from '../interfaces';
import type {
  DashboardAirlineRemarksCardPayload,
  DashboardAircraftAnalysisCardPayload,
  DashboardEquipmentUtilizationCardPayload,
  DashboardPerformanceReportCardPayload,
  DashboardPrimaryCardsPayload,
} from '../interfaces/dashboard-bundle.interface';
import type { DrillSliceParams } from './dashboard-summary-read.service';
import { DashboardSummaryReadService } from './dashboard-summary-read.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardDrilldownService } from './dashboard-drilldown.service';
import {
  DashboardSecondaryCardsService,
  type DashboardSecondaryCardsPayload,
} from './dashboard-secondary-cards.service';

export interface GetDashboardBundleParams {
  fromDate: string;
  tillDate: string;
  equipmentMode: DashboardEquipmentMode;
  flightScope?: DashboardFlightScope;
}

/**
 * Read-only facade for Bird dashboard HTTP routes.
 * Card bundles read `dashboard_daily_aggregates`; drilldowns read `dashboard_summaries.drilldowns`.
 */
@Injectable()
export class DashboardSummaryPrecomputeService {
  private readonly log = new Logger(DashboardSummaryPrecomputeService.name);

  constructor(
    private readonly dashboardSummaryReadService: DashboardSummaryReadService,
    private readonly dashboardSummaryService: DashboardSummaryService,
    private readonly dashboardDrilldownService: DashboardDrilldownService,
    private readonly dashboardSecondaryCardsService: DashboardSecondaryCardsService,
  ) {}
  async getOrGenerateSummary(
    params: GetDashboardBundleParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardSecondaryCardsPayload> {
    const result = await this.dashboardSummaryReadService.readSecondaryCards(
      params,
      station,
    );
    return result.payload;
  }

  async getAirlineRemarksCard(
    params: Pick<GetDashboardBundleParams, 'fromDate' | 'tillDate' | 'flightScope'>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardAirlineRemarksCardPayload> {
    const result =
      await this.dashboardSummaryReadService.readAirlineRemarksCard(
        params,
        station,
      );
    return result.payload;
  }

  async getAircraftAnalysisCard(
    params: Pick<GetDashboardBundleParams, 'fromDate' | 'tillDate' | 'flightScope'>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardAircraftAnalysisCardPayload> {
    const result =
      await this.dashboardSummaryReadService.readAircraftAnalysisCard(
        params,
        station,
      );
    return result.payload;
  }

  async getEquipmentUtilizationCard(
    params: GetDashboardBundleParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardEquipmentUtilizationCardPayload> {
    const result =
      await this.dashboardSummaryReadService.readEquipmentUtilizationCard(
        params,
        station,
      );
    return result.payload;
  }

  async getPerformanceReportCard(
    params: Pick<GetDashboardBundleParams, 'fromDate' | 'tillDate' | 'flightScope'>,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardPerformanceReportCardPayload> {
    const result =
      await this.dashboardSummaryReadService.readPerformanceReportCard(
        params,
        station,
      );
    return result.payload;
  }

  async getOrGeneratePrimaryCards(
    params: GetDashboardBundleParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardPrimaryCardsPayload> {
    const result = await this.dashboardSummaryReadService.readPrimaryCards(
      params,
      station,
    );
    return result.payload;
  }

  async getPerformanceDrilldown(
    params: GetDashboardBundleParams,
    slice?: DrillSliceParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<{
    performanceReport?: Record<string, unknown>;
    drillPaging?: { skip: number; limit: number; total: number };
    _perf?: Record<string, unknown>;
  }> {
    const wallStart = Date.now();
    const result =
      await this.dashboardSummaryReadService.readPerformanceDrilldown(
        params,
        slice,
        station,
      );
    const payload = result.payload;
    const perf = payload.performanceReport as
      | { flights?: unknown[] }
      | undefined;
    const flightCount = Array.isArray(perf?.flights) ? perf.flights.length : 0;
    const tSerialize = Date.now();
    const json = JSON.stringify(payload);
    const performanceDrilldownBytes = Buffer.byteLength(json, 'utf8');
    const serializeDurationMs = Date.now() - tSerialize;
    const responseDurationMs = Date.now() - wallStart;
    const logBody = {
      performanceDrilldownBytes,
      flightCount,
      serializeDurationMs,
      responseDurationMs,
      mongoReadMs: result.drillMongoReadMs ?? null,
      serializeMs: serializeDurationMs,
      fromDate: params.fromDate.trim(),
      tillDate: params.tillDate.trim(),
      equipmentMode: params.equipmentMode,
      summaryCacheHit: result.cacheHit,
      summaryStale: result.stale,
      drillStale: result.drillStale ?? false,
      drillEntryCount: result.drillEntryCount ?? null,
    };
    if (performanceDrilldownBytes > 1_000_000) {
      this.log.error(
        `performance_drilldown_large_payload ${JSON.stringify(logBody)}`,
      );
    } else if (performanceDrilldownBytes > 500_000) {
      this.log.warn(
        `performance_drilldown_large_payload ${JSON.stringify(logBody)}`,
      );
    } else {
      this.log.log(`performance_drilldown ${JSON.stringify(logBody)}`);
    }
    return {
      ...payload,
      _perf: {
        totalMs: responseDurationMs,
        mongoReadMs: result.drillMongoReadMs ?? 0,
        serializeMs: serializeDurationMs,
        payloadBytes: performanceDrilldownBytes,
        flightCount,
        summaryCacheHit: result.cacheHit && !result.stale,
        summaryStale: result.stale,
        drillStale: result.drillStale,
      },
    };
  }

  async getAirlineRemarksDrilldown(
    params: GetDashboardBundleParams,
    slice?: DrillSliceParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<Record<string, unknown>> {
    const wallStart = Date.now();
    const result =
      await this.dashboardSummaryReadService.readAirlineRemarksDrilldown(
        params,
        slice,
        station,
      );
    const json = JSON.stringify(result.payload);
    const payloadBytes = Buffer.byteLength(json, 'utf8');
    const responseDurationMs = Date.now() - wallStart;
    const logBody = {
      payloadBytes,
      rowCount: Array.isArray(result.payload.rows)
        ? result.payload.rows.length
        : 0,
      totalRows: result.payload.totalRows,
      responseDurationMs,
      mongoReadMs: result.drillMongoReadMs ?? null,
      fromDate: params.fromDate.trim(),
      tillDate: params.tillDate.trim(),
      equipmentMode: params.equipmentMode,
      summaryStale: result.stale,
      drillStale: result.drillStale ?? false,
    };
    if (payloadBytes > 1_000_000) {
      this.log.error(`airline_remarks_drilldown_large ${JSON.stringify(logBody)}`);
    } else if (payloadBytes > 500_000) {
      this.log.warn(`airline_remarks_drilldown_large ${JSON.stringify(logBody)}`);
    } else {
      this.log.log(`airline_remarks_drilldown ${JSON.stringify(logBody)}`);
    }
    return {
      ...result.payload,
      _perf: {
        totalMs: responseDurationMs,
        mongoReadMs: result.drillMongoReadMs ?? 0,
        payloadBytes,
        summaryStale: result.stale,
        drillStale: result.drillStale,
      },
    };
  }

  /**
   * Admin-only live FHR aggregation — not used by Bird dashboard routes.
   * Prefer queue-driven `dashboard_summaries` refresh in production.
   */
  async generateLiveSecondaryBundle(
    params: GetDashboardBundleParams,
    station: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE,
  ): Promise<DashboardSecondaryCardsPayload> {
    return this.dashboardSecondaryCardsService.getBundle(
      params.fromDate.trim(),
      params.tillDate.trim(),
      params.equipmentMode === '4h' ? '4h' : '6h',
      { station },
    );
  }

  async invalidateAll(): Promise<{ deletedCount: number }> {
    const summaries = await this.dashboardSummaryService.deleteAll();
    const drills = await this.dashboardDrilldownService.deleteAll();
    return {
      deletedCount: summaries.deletedCount + drills.deletedCount,
    };
  }
}
