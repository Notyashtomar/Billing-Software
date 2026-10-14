import { Injectable } from '@nestjs/common';
import type { StationScopeContext } from 'src/common/station/station-scope';
import { MisStationWiseQueryDto } from '../dto/mis-station-wise-query.dto';
import { MisStationWiseService } from './mis-station-wise.service';
import {
  REMARKS_FLIGHT_COLUMNS,
  REMARKS_SUMMARY_COLUMNS,
  buildRemarksModel,
  type RemarksAirlineSummary,
  type RemarksMonthBlock,
  type RemarksRatingPreview,
} from '../utils/remarks-layout.util';
import {
  mapFhrDocToRemarksRow,
  type RemarksFlightRow,
  type RemarksPreviewFlight,
} from '../utils/remarks-map-fhr.util';
import {
  buildRemarksWorkbook,
  remarksExportFileName,
} from '../utils/remarks-workbook.util';
import { formatRangeLabel } from '../utils/station-wise-months.util';
import {
  isNonScheduledStationWiseScope,
  isScheduledMonthwiseLeftoverAirline,
  parseStationWiseFlightScope,
} from '../utils/station-wise-scope.util';

export type RemarksStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  rangeLabel: string;
  flightScope: 'scheduled' | 'nonScheduled';
  flightScopeLabel: string;
  readyForExport: boolean;
  coverage: Awaited<
    ReturnType<MisStationWiseService['collectStationWise']>
  >['coverage'];
  months: Array<Omit<RemarksMonthBlock, 'flights'>>;
  airlines: RemarksAirlineSummary[];
  totals: RemarksAirlineSummary;
  ratingPreview: RemarksRatingPreview[];
  sampleFlights: RemarksPreviewFlight[];
  flightColumns: Array<{ letter: string; key: string; label: string }>;
  summaryColumns: Array<{
    letter: string;
    key: string;
    label: string;
    fillArgb: string;
  }>;
  summary: {
    flights: number;
    months: number;
    airlines: number;
    comments: number;
  };
};

@Injectable()
export class MisRemarksService {
  constructor(private readonly stationWise: MisStationWiseService) {}

  async getStatus(
    station: StationScopeContext,
    query: MisStationWiseQueryDto,
  ): Promise<RemarksStatusPayload> {
    const collected = await this.stationWise.collectStationWise(station, query);
    const { rowsByMonth, allRows } = this.mapCollected(collected);
    const model = buildRemarksModel(
      collected.months,
      rowsByMonth,
      allRows,
    );
    const flightScope = parseStationWiseFlightScope(query.flightScope);

    return {
      stationCode: collected.stationCode,
      stationLabel: collected.stationLabel,
      from: collected.from,
      to: collected.to,
      rangeLabel: formatRangeLabel(collected.from, collected.to),
      flightScope,
      flightScopeLabel: isNonScheduledStationWiseScope(flightScope)
        ? 'MIS Remarks (Non-Schedule)'
        : 'MIS Remarks',
      readyForExport: true,
      coverage: collected.coverage,
      months: model.months.map(({ flights: _flights, ...month }) => month),
      airlines: model.combinedAirlines,
      totals: model.combinedTotals,
      ratingPreview: model.ratingPreview,
      sampleFlights: model.sampleFlights,
      flightColumns: REMARKS_FLIGHT_COLUMNS.map((c) => ({
        letter: c.letter,
        key: c.key,
        label: c.label,
      })),
      summaryColumns: REMARKS_SUMMARY_COLUMNS.map((c) => ({
        letter: c.letter,
        key: c.key,
        label: c.label,
        fillArgb: c.fillArgb,
      })),
      summary: {
        flights: model.combinedTotals.fltCount,
        months: collected.months.length,
        airlines: model.combinedAirlines.length,
        comments: model.combinedTotals.arlComnt,
      },
    };
  }

  async exportWorkbook(
    station: StationScopeContext,
    query: MisStationWiseQueryDto,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const collected = await this.stationWise.collectStationWise(station, query);
    const { rowsByMonth, allRows } = this.mapCollected(collected);
    const model = buildRemarksModel(
      collected.months,
      rowsByMonth,
      allRows,
    );
    const buffer = await buildRemarksWorkbook({
      stationCode: collected.stationCode,
      stationLabel: collected.stationLabel,
      from: collected.from,
      to: collected.to,
      months: collected.months,
      monthBlocks: model.months,
    });
    return {
      buffer,
      fileName: remarksExportFileName(
        collected.stationCode,
        collected.from,
        collected.to,
      ),
    };
  }

  private mapCollected(
    collected: Awaited<ReturnType<MisStationWiseService['collectStationWise']>>,
  ): {
    rowsByMonth: Map<string, RemarksFlightRow[]>;
    allRows: RemarksFlightRow[];
  } {
    const rowsByMonth = new Map<string, RemarksFlightRow[]>();
    for (const month of collected.months) {
      rowsByMonth.set(month.key, []);
    }

    const allRows: RemarksFlightRow[] = [];
    for (const doc of collected.docs) {
      const row = mapFhrDocToRemarksRow(doc);
      if (!row) continue;
      if (
        !isNonScheduledStationWiseScope(collected.flightScope) &&
        isScheduledMonthwiseLeftoverAirline(row.airline)
      ) {
        continue;
      }
      if (row.staYmd < collected.from || row.staYmd > collected.to) continue;
      const key = row.staYmd.slice(0, 7);
      const bucket = rowsByMonth.get(key);
      if (!bucket) continue;
      bucket.push(row);
      allRows.push(row);
    }

    for (const [, rows] of rowsByMonth) {
      rows.sort((a, b) => {
        const ak = `${a.staYmd}\0${a.ataTime}\0${a.flightNo}`;
        const bk = `${b.staYmd}\0${b.ataTime}\0${b.flightNo}`;
        return ak.localeCompare(bk);
      });
    }

    return { rowsByMonth, allRows };
  }
}
