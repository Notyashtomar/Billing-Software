import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import { NsFhrCollectionService } from 'src/ns-fhr-collection/services/ns-fhr-collection.service';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  StationScope,
  type StationScopeContext,
} from 'src/common/station/station-scope';

import {
  aggregatePerformanceReportSnapshotFromLegs,
  mapLeanFhrRowsToPerformanceLegs,
} from 'src/dashboard-summary/utils/dashboard-performance-from-fhr.util';
import { MisStationWiseQueryDto } from '../dto/mis-station-wise-query.dto';
import {
  addDaysYmd,
  formatRangeLabel,
  listCalendarMonthsInRange,
  stationWiseExportFileName,
  stationWiseLabel,
  staCoverageFromYmds,
  ymdRangeToDdMmYyyyList,
  type CalendarMonthSlice,
  type StationWiseStaCoverage,
} from '../utils/station-wise-months.util';
import {
  listFormulaSheetColumns,
  listStationWiseSheetColumns,
  type StationWiseSheetColumn,
} from '../utils/station-wise-columns.util';
import {
  mapFhrDocToStationWiseRow,
  toPreviewFlight,
  type StationWiseInputRow,
  type StationWisePreviewFlight,
} from '../utils/station-wise-map-fhr.util';
import {
  AIRLINE_REPORT_COLUMNS,
  buildAirlineFlightReport,
  type AirlineFlightReportRow,
} from '../utils/station-wise-airline-report.util';
import {
  belongsInScheduledStationWise,
  isNonScheduledStationWiseScope,
  isScheduledMonthwiseLeftoverAirline,
  parseStationWiseFlightScope,
  type StationWiseFlightScope,
} from '../utils/station-wise-scope.util';
import { stationWiseCfRulesForApi } from '../utils/station-wise-conditional-format.util';
import { buildStationWiseWorkbook } from '../utils/station-wise-workbook.util';

export type StationWiseMonthStatus = {
  id: string;
  sheetName: string;
  label: string;
  from: string;
  to: string;
  flightCount: number;
  status: 'complete' | 'partial' | 'missing';
  message: string;
  /** FLIGHT REPORT for this month sheet only (COMBINED + airlines). */
  airlines?: AirlineFlightReportRow[];
};

export type StationWisePreviewMetric = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

export type StationWiseAirlinePreview = AirlineFlightReportRow;

export type StationWiseAirlineReportColumn = {
  key: string;
  label: string;
  tone?: 'xxld' | 'gha' | 'timing' | 'otp' | 'total';
};

export type StationWiseStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  rangeLabel: string;
  flightScope: StationWiseFlightScope;
  flightScopeLabel: string;
  readyForExport: boolean;
  months: StationWiseMonthStatus[];
  preview: StationWisePreviewMetric[];
  airlines: StationWiseAirlinePreview[];
  airlineReportColumns: StationWiseAirlineReportColumn[];
  sampleFlights: StationWisePreviewFlight[];
  /** Full month-sheet column map (A–T inputs + every formula column). */
  sheetColumns: StationWiseSheetColumn[];
  formulaColumns: StationWiseSheetColumn[];
  /** MAA conditional formatting legend (preview + Excel share these rules). */
  conditionalFormats: ReturnType<typeof stationWiseCfRulesForApi>;
  /** STA span in the source collection (set when the selected window is empty). */
  coverage: StationWiseStaCoverage | null;
  summary: {
    flights: number;
    months: number;
    airlines: number;
    inputColumns: number;
    formulaColumns: number;
  };
};

export type Collected = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  flightScope: StationWiseFlightScope;
  months: CalendarMonthSlice[];
  rowsByMonth: Map<string, StationWiseInputRow[]>;
  allRows: StationWiseInputRow[];
  docs: Array<Record<string, unknown>>;
  coverage: StationWiseStaCoverage | null;
};

const PREVIEW_FLIGHT_CAP = 400;

function previewFlightsAcrossMonths(
  months: CalendarMonthSlice[],
  rowsByMonth: Map<string, StationWiseInputRow[]>,
  allRows: StationWiseInputRow[],
): StationWisePreviewFlight[] {
  if (months.length <= 1) {
    return allRows.slice(0, PREVIEW_FLIGHT_CAP).map(toPreviewFlight);
  }
  const per = Math.max(20, Math.floor(PREVIEW_FLIGHT_CAP / months.length));
  const out: StationWisePreviewFlight[] = [];
  for (const month of months) {
    const rows = rowsByMonth.get(month.key) ?? [];
    for (const row of rows.slice(0, per)) {
      out.push(toPreviewFlight(row));
      if (out.length >= PREVIEW_FLIGHT_CAP) return out;
    }
  }
  return out;
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return count / total;
}

function monthStatus(
  count: number,
  slice: CalendarMonthSlice,
  flightScope: StationWiseFlightScope,
): StationWiseMonthStatus {
  const kind = isNonScheduledStationWiseScope(flightScope)
    ? 'non-scheduled'
    : 'scheduled';
  if (count === 0) {
    return {
      id: slice.key,
      sheetName: slice.sheetName,
      label: slice.label,
      from: slice.from,
      to: slice.to,
      flightCount: 0,
      status: 'missing',
      message: `No ${kind} FHR flights on STA dates in this month slice.`,
    };
  }
  return {
    id: slice.key,
    sheetName: slice.sheetName,
    label: slice.label,
    from: slice.from,
    to: slice.to,
    flightCount: count,
    status: 'complete',
    message: `${count} ${kind} flight row${count === 1 ? '' : 's'} · formulas on every data cell.`,
  };
}

@Injectable()
export class MisStationWiseService {
  private readonly logger = new Logger(MisStationWiseService.name);

  constructor(
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly nsFhrCollectionService: NsFhrCollectionService,
  ) {}

  async getStatus(station: StationScopeContext, query: MisStationWiseQueryDto) {
    const collected = await this.collectStationWise(station, query);
    return this.toStatus(collected);
  }

  async exportWorkbook(
    station: StationScopeContext,
    query: MisStationWiseQueryDto,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const collected = await this.collectStationWise(station, query);
    const buffer = await buildStationWiseWorkbook({
      stationCode: collected.stationCode,
      stationLabel: collected.stationLabel,
      from: collected.from,
      to: collected.to,
      months: collected.months,
      rowsByMonth: collected.rowsByMonth,
    });
    const fileName = stationWiseExportFileName(
      collected.stationCode,
      collected.from,
      collected.to,
      collected.flightScope,
    );
    return { buffer, fileName };
  }

  /**
   * Shared FHR collect for Station Wise and Month Wise workbooks.
   *
   * Station rule (universal): metrics and export are always for the
   * authenticated session station from `@CurrentStation()` — never a client
   * station query param. Same filter path for Scheduled and Non-Schedule.
   */
  async collectStationWise(
    station: StationScopeContext,
    query: MisStationWiseQueryDto,
  ): Promise<Collected> {
    return this.collectMapped(station, query, { allStations: false });
  }

  /**
   * Airline Wise: every FHR station in the window. New stations appear when
   * their `stationCode` is present on FHR docs — no hardcoded station list.
   */
  async collectAllStations(query: MisStationWiseQueryDto): Promise<Collected> {
    return this.collectMapped(CROSS_STATION_SYSTEM_SCOPE, query, {
      allStations: true,
    });
  }

  private async collectMapped(
    station: StationScopeContext,
    query: MisStationWiseQueryDto,
    opts: { allStations: boolean },
  ): Promise<Collected> {
    const from = query.from.trim();
    const to = query.to.trim();
    if (!from || !to || from > to) {
      throw new BadRequestException('Select a valid calendar range (from ≤ to).');
    }

    const months = listCalendarMonthsInRange(from, to);
    if (months.length === 0) {
      throw new BadRequestException('Date range does not cover any calendar month.');
    }

    const flightScope = parseStationWiseFlightScope(query.flightScope);
    const stationCode = opts.allStations
      ? 'ALL'
      : StationScope.require(station);
    const stationLabel = opts.allStations
      ? 'All stations'
      : stationWiseLabel(stationCode);
    const dateStrings = ymdRangeToDdMmYyyyList(from, to);
    const fetchFrom = addDaysYmd(from, -1) ?? from;
    const scheduledDateStrings =
      fetchFrom < from ? ymdRangeToDdMmYyyyList(fetchFrom, to) : dateStrings;

    let docs: Array<Record<string, unknown>>;
    if (isNonScheduledStationWiseScope(flightScope)) {
      const bundle = await this.nsFhrCollectionService.findAllLeanForDashboardBundle(
        dateStrings,
        station,
      );
      // Source of truth is ns_fhr_collection — do not re-filter Turnaround/NS handling.
      docs = bundle.rows as Array<Record<string, unknown>>;
    } else {
      const lean = (await this.fhrCollectionService.findAllLeanForScheduledTableMerge(
        scheduledDateStrings,
        station,
      )) as Array<Record<string, unknown>>;
      // Scheduled carriers including Additional Turnaround / Diverted.
      // Charter leftovers and explicit NS stamps stay out.
      docs = lean.filter(belongsInScheduledStationWise);
    }

    const rowsByMonth = new Map<string, StationWiseInputRow[]>();
    for (const month of months) rowsByMonth.set(month.key, []);

    const allRows: StationWiseInputRow[] = [];
    for (const doc of docs) {
      const row = mapFhrDocToStationWiseRow(doc);
      if (!row) continue;
      if (
        !isNonScheduledStationWiseScope(flightScope) &&
        isScheduledMonthwiseLeftoverAirline(row.airline)
      ) {
        continue;
      }
      if (row.staYmd < from || row.staYmd > to) continue;
      const key = row.staYmd.slice(0, 7);
      const bucket = rowsByMonth.get(key);
      if (!bucket) continue;
      bucket.push(row);
      allRows.push(row);
    }

    for (const [, rows] of rowsByMonth) {
      rows.sort((a, b) => {
        const ak = `${a.staYmd}\0${a.staTime}\0${a.flightNo}`;
        const bk = `${b.staYmd}\0${b.staTime}\0${b.flightNo}`;
        return ak.localeCompare(bk);
      });
    }

    let coverage: StationWiseStaCoverage | null = null;
    if (isNonScheduledStationWiseScope(flightScope) && allRows.length === 0) {
      const span = await this.nsFhrCollectionService.findStaYmdCoverage(station);
      coverage = staCoverageFromYmds(span.earliestYmd, span.latestYmd);
    }

    if (docs.length > 0 && allRows.length === 0) {
      this.logger.warn(
        `[mis-station-wise] ${docs.length} ${flightScope} FHR docs in window but 0 mapped rows from=${from} to=${to}`,
      );
    } else if (isNonScheduledStationWiseScope(flightScope)) {
      this.logger.debug(
        `[mis-station-wise] ns_fhr docs=${docs.length} mapped=${allRows.length} from=${from} to=${to}`,
      );
    }

    return {
      stationCode,
      stationLabel,
      from,
      to,
      flightScope,
      months,
      rowsByMonth,
      allRows,
      docs,
      coverage,
    };
  }

  private toStatus(collected: Collected): StationWiseStatusPayload {
    const legs = mapLeanFhrRowsToPerformanceLegs(
      collected.docs.filter((doc) => {
        const row = mapFhrDocToStationWiseRow(doc);
        return row != null && row.staYmd >= collected.from && row.staYmd <= collected.to;
      }),
    );
    const snap = aggregatePerformanceReportSnapshotFromLegs(legs);
    const total = snap.totalFlights;
    const airlines = buildAirlineFlightReport(collected.allRows);
    const faTotal = airlines[0]?.metrics.total ?? collected.allRows.length;
    const preview: StationWisePreviewMetric[] = [
      {
        key: 'onTime',
        label: '1. Flight Operated ON TIME',
        count: snap.onTimeCount,
        percent: pct(snap.onTimeCount, total),
      },
      {
        key: 'cancelled',
        label: '2. Cancelled Flight',
        count: snap.cancelledCount,
        percent: pct(snap.cancelledCount, total),
      },
      {
        key: 'offSkd',
        label: '3. Flight Operated Off - Sked',
        count: snap.offSkdCount,
        percent: pct(snap.offSkdCount, total),
      },
      {
        key: 'gtSaved',
        label: 'a. Ground Time Saved',
        count: snap.aCount,
        percent: pct(snap.aCount, total),
      },
      {
        key: 'beforeStd',
        label: 'b. Departed on or before STD',
        count: snap.bCount,
        percent: pct(snap.bCount, total),
      },
      {
        key: 'nonGha',
        label: 'c. AGT > SGT (Reasons not attributable to GHA)',
        count: snap.cCount,
        percent: pct(snap.cCount, total),
      },
      {
        key: 'gha',
        label: 'Improvement for GHA',
        count: snap.ghaImprovement,
        percent: pct(snap.ghaImprovement, total),
      },
      {
        key: 'total',
        label: 'Total Flights',
        count: faTotal,
        percent: faTotal === 0 ? 0 : 1,
      },
    ];

    const airlineReportColumns = AIRLINE_REPORT_COLUMNS.map((c) => ({
      key: c.key,
      label: c.label,
      tone: c.tone,
    }));

    const sheetColumns = listStationWiseSheetColumns();
    const formulaColumns = listFormulaSheetColumns();

    return {
      stationCode: collected.stationCode,
      stationLabel: collected.stationLabel,
      from: collected.from,
      to: collected.to,
      rangeLabel: formatRangeLabel(collected.from, collected.to),
      flightScope: collected.flightScope,
      flightScopeLabel: isNonScheduledStationWiseScope(collected.flightScope)
        ? 'Non Schedule MIS Station Wise'
        : 'Scheduled MIS Station Wise',
      readyForExport: true,
      months: collected.months.map((month) => {
        const monthRows = collected.rowsByMonth.get(month.key) ?? [];
        return {
          ...monthStatus(monthRows.length, month, collected.flightScope),
          airlines: buildAirlineFlightReport(monthRows),
        };
      }),
      preview,
      airlines,
      airlineReportColumns,
      sampleFlights: previewFlightsAcrossMonths(
        collected.months,
        collected.rowsByMonth,
        collected.allRows,
      ),
      sheetColumns,
      formulaColumns,
      conditionalFormats: stationWiseCfRulesForApi(),
      coverage: collected.coverage,
      summary: {
        flights: faTotal,
        months: collected.months.length,
        airlines: Math.max(0, airlines.length - 1), // exclude COMBINED
        inputColumns: sheetColumns.filter((c) => c.kind === 'input').length,
        formulaColumns: formulaColumns.length,
      },
    };
  }
}
