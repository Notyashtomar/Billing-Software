import { Injectable, Logger } from '@nestjs/common';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import { NsFhrCollectionService } from 'src/ns-fhr-collection/services/ns-fhr-collection.service';
import { EquipmentManpowerService } from 'src/equipment-manpower/services/equipment-manpower.service';
import { AdvanceAircraftService } from 'src/advance-aircraft/services/advance-aircraft.service';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  fixedStationScope,
} from 'src/common/station/station-scope';
import {
  DASHBOARD_FLIGHT_SCOPES,
  isNonScheduledDashboardScope,
  type DashboardFlightScope,
} from '../constants/dashboard-flight-scope';
import type { DashboardEquipmentMode } from '../interfaces';
import type {
  DashboardSummaryCards,
  DashboardSummaryPerf,
} from '../interfaces/dashboard-summary.interface';
import { buildAirlineRemarksChartBreakdown } from '../utils/dashboard-airline-remarks-drilldown.util';
import {
  aggregateKpiStripFromLeanRows,
  aggregatePerformanceCardsFromLeanFhrRows,
  buildPerformanceDrilldownFromLeanRows,
} from '../utils/dashboard-performance-from-fhr.util';
import {
  normalizeAircraftCategorySecondary,
  normalizeAirlineRatingsSecondary,
  normalizeEquipmentUtilSecondary,
  normalizeGhaImprovementCard,
  normalizeKpiStripCard,
  normalizeOnTimePerformanceCard,
  normalizePerformanceReportCard,
} from '../utils/normalize-dashboard-read-payloads';

const WARN_AGGREGATION_MS = 1000;
const WARN_DRILL_PAYLOAD_BYTES = 250_000;

export interface UnifiedDailyShardParams {
  summaryDate: string;
  equipmentMode: DashboardEquipmentMode;
  /** Clears STA-window cache before the single FHR read. */
  bustCache?: boolean;
  /**
   * Concrete owning station (e.g. `MAA`, `AGR`) — scopes the FHR source rows
   * and the equipment catalog. Omitted = legacy/system (cross-station).
   */
  stationCode?: string;
  /** `nonScheduled` reads `ns_fhr_collection`. */
  flightScope?: DashboardFlightScope;
}

export interface UnifiedDailyShardResult {
  cards: DashboardSummaryCards;
  drilldowns: Record<string, unknown>;
  perf: DashboardSummaryPerf;
}

/**
 * Single FHR read per calendar day + CPU aggregation only (no `dashboard_daily_aggregates`,
 * no per-card generator passes, no second STA scan for drilldowns).
 *
 * Performance/GHA/OTP share one `mapLeanFhrRowsToPerformanceLegs` inside
 * {@link aggregatePerformanceCardsFromLeanFhrRows}. Remaining card builders consume the same `rows`.
 */
@Injectable()
export class UnifiedDashboardSummaryAggregatorService {
  private readonly logger = new Logger(UnifiedDashboardSummaryAggregatorService.name);

  constructor(
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly nsFhrCollectionService: NsFhrCollectionService,
    private readonly equipmentManpowerService: EquipmentManpowerService,
    private readonly advanceAircraftService: AdvanceAircraftService,
  ) {}

  private static ymdToDdMmYyyy(ymd: string): string {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  }

  async buildDailyShard(
    params: UnifiedDailyShardParams,
  ): Promise<UnifiedDailyShardResult> {
    const summaryDate = params.summaryDate.trim();
    const equipmentMode: DashboardEquipmentMode =
      params.equipmentMode === '4h' ? '4h' : '6h';
    const code = params.stationCode?.trim();
    const scope = code ? fixedStationScope(code) : CROSS_STATION_SYSTEM_SCOPE;
    const flightScope =
      params.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;

    const wallStart = Date.now();
    const dateStrings = [
      UnifiedDashboardSummaryAggregatorService.ymdToDdMmYyyy(summaryDate),
    ];

    if (params.bustCache === true) {
      if (isNonScheduledDashboardScope(flightScope)) {
        this.nsFhrCollectionService.invalidateStaWindowRowsCache(dateStrings);
      } else {
        this.fhrCollectionService.invalidateStaWindowRowsCache(dateStrings);
      }
    }

    const tFhr = Date.now();
    const fetched = isNonScheduledDashboardScope(flightScope)
      ? await this.nsFhrCollectionService.findAllLeanForDashboardBundle(
          dateStrings,
          scope,
        )
      : await this.fhrCollectionService.findAllLeanForDashboardBundle(
          dateStrings,
          scope,
        );
    const fhrWallMs = Date.now() - tFhr;
    const fhrReadMs = fetched.queryMs;
    const rows = fetched.rows as Array<Record<string, unknown>>;
    const rowCount = rows.length;
    const staWindowCacheHit = Boolean(fetched.cacheHit);

    const tAgg = Date.now();

    const perfBundle = aggregatePerformanceCardsFromLeanFhrRows(rows);
    const kpiStrip = aggregateKpiStripFromLeanRows(rows);
    const airlineRemarksCard =
      this.fhrCollectionService.aggregateAirlineRemarksRatingsFromLeanRows(
        rows,
        summaryDate,
        summaryDate,
      );

    const [bodyCatalog, equipmentCatalog] = await Promise.all([
      this.advanceAircraftService.getActiveAircraftBodyMap(),
      this.equipmentManpowerService.getMasterCatalog(scope),
    ]);

    const aircraftAnalysis =
      this.fhrCollectionService.getScheduledCategoryBreakdownFromLeanRows(
        rows,
        summaryDate,
        summaryDate,
        bodyCatalog,
      );
    const equipmentUtilization =
      this.equipmentManpowerService.aggregateDashboardEquipmentUtilFromLeanRows(
        rows,
        equipmentMode,
        equipmentCatalog,
      );

    const aggregationMs = Date.now() - tAgg;

    const tFinalize = Date.now();
    const cards: DashboardSummaryCards = {
      kpiStrip: normalizeKpiStripCard(kpiStrip) as DashboardSummaryCards['kpiStrip'],
      performanceReport: normalizePerformanceReportCard(
        perfBundle.performanceReport,
      ) as DashboardSummaryCards['performanceReport'],
      ghaImprovement: normalizeGhaImprovementCard(
        perfBundle.ghaImprovement,
      ) as DashboardSummaryCards['ghaImprovement'],
      onTimePerformance: normalizeOnTimePerformanceCard(
        perfBundle.onTimePerformance,
      ) as DashboardSummaryCards['onTimePerformance'],
      airlineRemarks: normalizeAirlineRatingsSecondary(
        airlineRemarksCard,
      ) as DashboardSummaryCards['airlineRemarks'],
      aircraftAnalysis: normalizeAircraftCategorySecondary(
        aircraftAnalysis,
      ) as DashboardSummaryCards['aircraftAnalysis'],
      equipmentUtilization: normalizeEquipmentUtilSecondary(
        equipmentUtilization,
      ) as DashboardSummaryCards['equipmentUtilization'],
    };

    const performancePayload = buildPerformanceDrilldownFromLeanRows(rows);
    const airlineDrillRows =
      this.fhrCollectionService.extractAirlineRemarkDrillRowsFromLean(
        rows,
        summaryDate,
        summaryDate,
      );
    const chartTopAirlinesByRating =
      buildAirlineRemarksChartBreakdown(airlineDrillRows);

    const drilldowns: Record<string, unknown> = {
      performance: performancePayload as unknown as Record<string, unknown>,
      airlineRemarks: {
        ratingsSummary: airlineRemarksCard,
        chartTopAirlinesByRating,
        rows: airlineDrillRows,
      },
    };

    const finalizeMs = Date.now() - tFinalize;
    const drilldownPayloadBytes = Buffer.byteLength(
      JSON.stringify(drilldowns),
      'utf8',
    );

    if (aggregationMs > WARN_AGGREGATION_MS) {
      this.logger.warn(
        `[unified_dashboard_agg] aggregation slow aggregationMs=${aggregationMs} ` +
          `summaryDate=${summaryDate} rows=${rowCount}`,
      );
    }
    if (drilldownPayloadBytes > WARN_DRILL_PAYLOAD_BYTES) {
      this.logger.warn(
        `[unified_dashboard_agg] drilldown payload large bytes=${drilldownPayloadBytes} ` +
          `summaryDate=${summaryDate}`,
      );
    }

    const totalMs = Date.now() - wallStart;
    this.logger.log(
      JSON.stringify({
        event: 'unified_daily_shard',
        summaryDate,
        equipmentMode,
        rowCount,
        fhrReadMs,
        fhrWallMs,
        aggregationMs,
        finalizeMs,
        drilldownPayloadBytes,
        staWindowCacheHit,
        totalMs,
        fhrQueries: 1,
      }),
    );

    return {
      cards,
      drilldowns,
      perf: {
        sourceRows: rowCount,
        aggregationMs: aggregationMs + finalizeMs,
        mongoWallMs: Math.max(fhrReadMs, fhrWallMs),
        staWindowCacheHit,
      },
    };
  }
}
