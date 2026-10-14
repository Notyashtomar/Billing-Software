import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  OPERATIONAL_ROLES,
  REPORT_VIEW_ROLES,
} from '../../auth/enums/roles.enum';
import { ReportsService } from '../services/reports.service';
import { ReportAggregationService } from '../services/report-aggregation.service';
import { CreateReportDto, ClearSignatureDto } from '../dto/create-report.dto';
import { MainDetailsService } from '../../main-details/services/main-details.service';
import { RawFlightDataService } from '../../raw-flight-data/services/raw-flight-data.service';
import { FhrCollectionService } from '../../fhr-collection/services/fhr-collection.service';
import { DashboardSummaryPrecomputeService } from '../../dashboard-summary/services/dashboard-summary-precompute.service';
import { parseDashboardFlightScope } from '../../dashboard-summary/constants/dashboard-flight-scope';
import { DelayAnalyticsService } from '../services/delay-analytics.service';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import { CurrentStation } from '../../common/station/current-station.decorator';
import { DelayReportSummaryService } from '../services/delay-report-summary.service';

@Roles(...REPORT_VIEW_ROLES)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly mainDetailsService: MainDetailsService,
    private readonly reportAggregationService: ReportAggregationService,
    private readonly rawFlightDataService: RawFlightDataService,
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly dashboardSummaryPrecomputeService: DashboardSummaryPrecomputeService,
    private readonly delayAnalyticsService: DelayAnalyticsService,
    private readonly delayReportSummaryService: DelayReportSummaryService,
  ) {}

  @Post()
  @Roles(...OPERATIONAL_ROLES)
  create(@Body() body: CreateReportDto) {
    return this.reportsService.create(body);
  }

  @Get()
  @Roles(...REPORT_VIEW_ROLES)
  findAll() {
    return this.reportsService.findAll();
  }

  @Get('main-report/:serialNo')
  @Roles(...OPERATIONAL_ROLES)
  getMainReport(@Param('serialNo') serialNo: string) {
    return this.reportAggregationService.getMainReportData(Number(serialNo));
  }

  @Get('equipment-sheet/:serialNo')
  @Roles(...OPERATIONAL_ROLES)
  getEquipmentSheet(@Param('serialNo') serialNo: string) {
    return this.reportAggregationService.getEquipmentSheetData(
      Number(serialNo),
    );
  }

  @Get('flight-report/:serialNo')
  @Roles(...REPORT_VIEW_ROLES)
  getFlightReport(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.reportAggregationService.getFlightReportData(
      Number(serialNo),
      station,
    );
  }

  /**
   * Batch flight-report lookup — one request for many serials instead of one
   * per flight. Powers the Scheduled data export page's FHR export tab so large
   * date ranges populate in seconds instead of timing out on N sequential fetches.
   */
  @Post('flight-report-batch')
  @Roles(...REPORT_VIEW_ROLES)
  getFlightReportBatch(
    @Body() body: { serialNos?: unknown },
    @CurrentStation() station: StationScopeContext,
  ) {
    const serialNos = Array.isArray(body?.serialNos)
      ? body.serialNos
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n))
          .slice(0, 2000)
      : [];
    return this.reportAggregationService.getFlightReportDataBatch(
      serialNos,
      station,
    );
  }

  @Get('flights')
  @Roles(...REPORT_VIEW_ROLES)
  async findFlights(
    @CurrentStation() station: StationScopeContext,
    @Query('filterBy') filterBy?: string,
    @Query('airline') airline?: string,
    @Query('serialNo') serialNo?: string,
    @Query('challanNo') challanNo?: string,
    @Query('bookingNo') bookingNo?: string,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    const list = await this.mainDetailsService.findAll(station);
    return this.mainDetailsService.filterListedFlights(
      list as unknown as Array<Record<string, unknown>>,
      {
        filterBy,
        airline,
        serialNo,
        challanNo,
        bookingNo,
        fromDate,
        tillDate,
      },
    );
  }

  /**
   * Materialized delay report KPI strip — served from the dedicated `delay_reports`
   * collection and composed by requested date range + airline/station filters.
   */
  @Get('delay-report-top-cards')
  delayReportTopCards(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('airline') airline?: string,
    @Query('station') station?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate);
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate);
    if (!fromYmd || !toYmd) {
      throw new BadRequestException('fromDate and tillDate are required (yyyy-MM-dd or dd/MM/yyyy)');
    }
    if (fromYmd > toYmd) {
      throw new BadRequestException('fromDate must be on or before tillDate');
    }
    return this.delayReportSummaryService.getTopCards(
      fromYmd,
      toYmd,
      airline,
      station,
    );
  }

  /**
   * Delay analytics dashboard — aggregates FHR main-details delay codes (01–99).
   * Query: fromDate, tillDate (yyyy-MM-dd or dd/MM/yyyy); optional airline, station.
   * With `code` — returns drilldown flights for that delay code only.
   */
  @Get('delay-analytics')
  delayAnalytics(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('airline') airline?: string,
    @Query('station') station?: string,
    @Query('code') code?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate);
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate);
    if (!fromYmd || !toYmd) {
      throw new BadRequestException('fromDate and tillDate are required (yyyy-MM-dd or dd/MM/yyyy)');
    }
    if (fromYmd > toYmd) {
      throw new BadRequestException('fromDate must be on or before tillDate');
    }
    if (code?.trim()) {
      return this.delayAnalyticsService.getDrilldown(
        fromYmd,
        toYmd,
        code,
        airline,
        station,
      );
    }
    return this.delayAnalyticsService.getAnalytics(
      fromYmd,
      toYmd,
      airline,
      station,
    );
  }

  @Get('delay-reasons-top')
  delayReasonsTop(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = Math.min(20, Math.max(1, Number(limit) || 5));
    return this.mainDetailsService.getTopDelayReasons(fromDate, tillDate, lim);
  }

  /** Main-details counts: handled (`!flightCancelled`) vs `flightCancelled` in optional date range (yyyy-MM-dd or dd/MM/yyyy). */
  @Get('dashboard-handled-stats')
  dashboardHandledStats(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    return this.mainDetailsService.getHandledAndCancelledCounts(
      fromDate,
      tillDate,
    );
  }

  /** Cancelled non-scheduled flights from main-details (`flightCancelled`). */
  @Get('non-scheduled-cancellations')
  nonScheduledCancellations(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    return this.mainDetailsService.getCancelledFlightRows(
      fromDate,
      tillDate,
      station,
    );
  }

  /**
   * Scheduled Airlines: counts from `fhr_collection` only (STA day in range; cancel = embed + CANC flight no).
   * Aligned with `GET /scheduled-airline-pipeline/daily-from-advance`.
   */
  @Get('dashboard-fhr-handled-stats')
  dashboardFhrHandledStats(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    return this.fhrCollectionService.getHandledAndCancelledForStaYmdWindow(
      fromYmd,
      toYmd,
      station,
    );
  }

  /**
   * Scheduled Airlines active-flights breakdown: FHR STA window + dashboard cancel rules.
   */
  @Get('dashboard-scheduled-airlines-active-stats')
  dashboardScheduledAirlinesActiveStats(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    return this.fhrCollectionService.getScheduledAirlinesActiveStatsForStaYmdWindow(
      fromYmd,
      toYmd,
      station,
    );
  }

  @Get('quality-scheduled-table')
  qualityScheduledTable(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('airline') airline?: string,
  ) {
    // Fail closed for station sessions: never fall back to cross-station FHR.
    if (!station.crossStation) {
      StationScope.require(station);
    }
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    return this.fhrCollectionService.getQualityReportScheduledTableForStaYmdWindow(
      fromYmd,
      toYmd,
      airline ?? '',
      station,
    );
  }

  @Get('quality-non-scheduled-table')
  qualityNonScheduledTable(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('airline') airline?: string,
  ) {
    if (!station.crossStation) {
      StationScope.require(station);
    }
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    return this.fhrCollectionService.getQualityReportNonScheduledTableForStaYmdWindow(
      fromYmd,
      toYmd,
      airline ?? '',
      station,
    );
  }

  @Patch('quality-update')
  @Roles(...OPERATIONAL_ROLES)
  qualityUpdate(
    @CurrentStation() station: StationScopeContext,
    @Body()
    body: { fromDate?: string; tillDate?: string; toDate?: string },
  ) {
    if (!station.crossStation) {
      StationScope.require(station);
    }
    const fromYmd =
      FhrCollectionService.queryParamToYmd(body?.fromDate) ?? '';
    const toYmd =
      FhrCollectionService.queryParamToYmd(
        body?.tillDate ?? body?.toDate,
      ) ?? '';
    return this.fhrCollectionService.updateQualityFbLbHoldForStaYmdWindow(
      fromYmd,
      toYmd,
      station,
    );
  }

  /**
   * Cancelled flights list from `fhr_collection` only (STA day window + same cancel rules as
   * dashboard FHR handled stats). Query: `fromDate`, `tillDate` (yyyy-MM-dd or dd/MM/yyyy).
   */
  @Get('dashboard-fhr-cancelled-flights')
  dashboardFhrCancelledFlights(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    return this.fhrCollectionService.listCancelledFlightsForStaYmdWindow(
      fromYmd,
      toYmd,
      station,
    );
  }

  /**
   * Performance report (Bird KPI parity): operated vs cancelled + timing buckets from `fhr_collection` only.
   * Percentages use operated-flight total as denominator. Query: `fromDate`, `tillDate` (yyyy-MM-dd or dd/MM/yyyy).
   */
  @Get('dashboard-fhr-performance-report')
  dashboardFhrPerformanceReport(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    return this.fhrCollectionService.getPerformanceReportForStaYmdWindow(
      fromYmd,
      toYmd,
    );
  }

  /**
   * Performance report: count main-details flights where terminal/ramp STA date & time equal
   * main ATA date & time; STA calendar date in [fromDate, tillDate] (`yyyy-MM-dd` inclusive).
   */
  @Get('dashboard-on-time-sta-ata-exact-count')
  dashboardOnTimeStaAtaExactCount(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    return this.rawFlightDataService.countDidFlyOnTimeExactStaEqualsAta(
      fromDate,
      tillDate,
    );
  }

  /** Main-details counts: Turnaround (`ops`) vs Cargo (`flightCategory`). */
  @Get('dashboard-flight-types')
  dashboardFlightTypes(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    return this.mainDetailsService.getFlightTypeCounts(fromDate, tillDate);
  }

  /**
   * Aircraft category mix from `fhr_collection` (STA window + same cancel rules as handled stats).
   * Returns **`scheduled`** (TypeofHandling Scheduled/SCH, excludes Additional) and **`additional`**
   * (handling text contains “Additional”), each with SCH-* buckets + legacy SIP/SIF/SDP/SDF aggregates.
   * NB/WB from `advance-aircraft` when TypeCraft matches.
   * Query: fromDate, tillDate (yyyy-MM-dd or dd/MM/yyyy).
   */
  @Get('dashboard-scheduled-category-breakdown')
  dashboardScheduledCategoryBreakdown(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    return this.fhrCollectionService.getScheduledCategoryBreakdownForStaYmdWindow(
      fromYmd,
      toYmd,
    );
  }

  /**
   * Aircraft analysis drill-down: every counted flight (scheduled + additional)
   * tagged with its carrier track and `SCH-*` category bucket, for the same STA
   * window/cancel rules as `dashboard-scheduled-category-breakdown`. Powers the
   * expandable per-category flight lists in the dashboard "Aircraft analysis" card.
   */
  @Get('dashboard-aircraft-analysis-flights')
  async dashboardAircraftAnalysisFlights(
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    const flights =
      await this.fhrCollectionService.listAircraftAnalysisFlightsForStaYmdWindow(
        fromYmd,
        toYmd,
        flightScope,
      );
    return { range: { fromYmd, toYmd }, flightScope, flights };
  }

  /**
   * Bird dashboard: airline remarks card only (independent of other secondary cards).
   */
  @Get('dashboard-airline-remarks-card')
  dashboardAirlineRemarksCard(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    return this.dashboardSummaryPrecomputeService.getAirlineRemarksCard(
      {
        fromDate: fromYmd,
        tillDate: toYmd,
        flightScope,
      },
      station,
    );
  }

  /**
   * Bird dashboard: aircraft analysis card only (independent of other secondary cards).
   */
  @Get('dashboard-aircraft-analysis-card')
  dashboardAircraftAnalysisCard(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    return this.dashboardSummaryPrecomputeService.getAircraftAnalysisCard(
      {
        fromDate: fromYmd,
        tillDate: toYmd,
        flightScope,
      },
      station,
    );
  }

  /**
   * Bird dashboard: equipment utilization card only (`equipmentMode` = 4h or 6h).
   */
  @Get('dashboard-equipment-utilization-card')
  dashboardEquipmentUtilizationCard(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('equipmentMode') equipmentMode?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const mode =
      (equipmentMode ?? '').trim().toLowerCase() === '4h' ? '4h' : '6h';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    return this.dashboardSummaryPrecomputeService.getEquipmentUtilizationCard(
      {
        fromDate: fromYmd,
        tillDate: toYmd,
        equipmentMode: mode,
        flightScope,
      },
      station,
    );
  }

  /**
   * Bird dashboard: airline remarks + aircraft analysis + equipment utilization (legacy bundle).
   * Prefer per-card routes above so one card cannot block another.
   */
  @Get('dashboard-secondary-cards')
  dashboardSecondaryCards(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('equipmentMode') equipmentMode?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const mode =
      (equipmentMode ?? '').trim().toLowerCase() === '4h' ? '4h' : '6h';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    return this.dashboardSummaryPrecomputeService.getOrGenerateSummary(
      {
        fromDate: fromYmd,
        tillDate: toYmd,
        equipmentMode: mode,
        flightScope,
      },
      station,
    );
  }

  /**
   * Bird dashboard: performance report card only (independent of KPI / GHA / OTP bundles).
   */
  @Get('dashboard-performance-report-card')
  dashboardPerformanceReportCard(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    return this.dashboardSummaryPrecomputeService.getPerformanceReportCard(
      {
        fromDate: fromYmd,
        tillDate: toYmd,
        flightScope,
      },
      station,
    );
  }

  /**
   * Bird dashboard: performance report + GHA improvement + on-time performance.
   * Read-only daily aggregates + summaries (scheduled or `ns_` collections). Never scans FHR on this path.
   */
  @Get('dashboard-primary-cards')
  dashboardPrimaryCards(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('equipmentMode') equipmentMode?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const mode =
      (equipmentMode ?? '').trim().toLowerCase() === '4h' ? '4h' : '6h';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    return this.dashboardSummaryPrecomputeService.getOrGeneratePrimaryCards(
      {
        fromDate: fromYmd,
        tillDate: toYmd,
        equipmentMode: mode,
        flightScope,
      },
      station,
    );
  }

  /**
   * Bird dashboard: performance-report modal drill-down (`dashboard_drilldowns` / `ns_dashboard_drilldowns` read model).
   * Optional `skip` + `limit` page into `payload.flights` (omit limit for full list).
   */
  @Get('dashboard-performance-drilldown')
  dashboardPerformanceDrilldown(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('equipmentMode') equipmentMode?: string,
    @Query('skip') skipRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const mode =
      (equipmentMode ?? '').trim().toLowerCase() === '4h' ? '4h' : '6h';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    const skip = skipRaw != null ? Math.max(0, Math.floor(Number(skipRaw))) : 0;
    const limit =
      limitRaw != null && limitRaw !== ''
        ? Math.max(0, Math.floor(Number(limitRaw)))
        : 0;
    const slice = limit > 0 ? { skip, limit } : undefined;
    return this.dashboardSummaryPrecomputeService.getPerformanceDrilldown(
      {
        fromDate: fromYmd,
        tillDate: toYmd,
        equipmentMode: mode,
        flightScope,
      },
      slice,
      station,
    );
  }

  /**
   * Bird dashboard: airline remarks modal — unified KPI snapshot + rows + chart breakdown.
   */
  @Get('dashboard-airline-remarks-drilldown')
  dashboardAirlineRemarksDrilldown(
    @CurrentStation() station: StationScopeContext,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
    @Query('equipmentMode') equipmentMode?: string,
    @Query('skip') skipRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('flightScope') flightScopeRaw?: string,
  ) {
    const fromYmd = FhrCollectionService.queryParamToYmd(fromDate) ?? '';
    const toYmd = FhrCollectionService.queryParamToYmd(tillDate) ?? '';
    const mode =
      (equipmentMode ?? '').trim().toLowerCase() === '4h' ? '4h' : '6h';
    const flightScope = parseDashboardFlightScope(flightScopeRaw);
    const skip = skipRaw != null ? Math.max(0, Math.floor(Number(skipRaw))) : 0;
    const limit =
      limitRaw != null && limitRaw !== ''
        ? Math.max(0, Math.floor(Number(limitRaw)))
        : 0;
    const slice = limit > 0 ? { skip, limit } : undefined;
    return this.dashboardSummaryPrecomputeService.getAirlineRemarksDrilldown(
      {
        fromDate: fromYmd,
        tillDate: toYmd,
        equipmentMode: mode,
        flightScope,
      },
      slice,
      station,
    );
  }

  @Get('by-serial/:serialNo')
  findBySerial(@Param('serialNo') serialNo: string) {
    return this.reportsService.findBySerialNo(Number(serialNo));
  }

  @Get('by-serial/:serialNo/type/:reportType')
  findBySerialAndType(
    @Param('serialNo') serialNo: string,
    @Param('reportType') reportType: string,
  ) {
    return this.reportsService.findBySerialNoAndType(
      Number(serialNo),
      decodeURIComponent(reportType),
    );
  }

  @Post(':serialNo/signature/clear')
  @Roles(...OPERATIONAL_ROLES)
  clearSignature(
    @Param('serialNo') serialNo: string,
    @Body() body: ClearSignatureDto,
    @Query('reportType') reportType: string,
  ) {
    return this.reportsService.clearSignature(
      Number(serialNo),
      reportType || 'Main Report',
      body.clearedBy,
      body.timestamp,
    );
  }

  @Get('record/:id')
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(id);
  }

  @Patch('record/:id')
  @Roles(...OPERATIONAL_ROLES)
  update(@Param('id') id: string, @Body() body: Partial<CreateReportDto>) {
    return this.reportsService.update(id, body);
  }

  @Delete('record/:id')
  @Roles(...OPERATIONAL_ROLES)
  remove(@Param('id') id: string) {
    return this.reportsService.remove(id);
  }
}
