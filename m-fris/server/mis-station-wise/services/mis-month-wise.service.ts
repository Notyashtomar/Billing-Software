import { Injectable } from '@nestjs/common';
import type { StationScopeContext } from 'src/common/station/station-scope';
import { MisStationWiseQueryDto } from '../dto/mis-station-wise-query.dto';
import { MisStationWiseService } from './mis-station-wise.service';
import {
  MONTH_WISE_COLUMNS,
  buildMonthWiseModel,
  performanceRows,
  type MonthWiseAirlineBlock,
} from '../utils/month-wise-layout.util';
import { buildMonthWiseWorkbook } from '../utils/month-wise-workbook.util';
import {
  formatRangeLabel,
  monthWiseExportFileName,
} from '../utils/station-wise-months.util';
import {
  isNonScheduledStationWiseScope,
  parseStationWiseFlightScope,
} from '../utils/station-wise-scope.util';

export type MonthWiseStatusPayload = {
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
  columns: Array<{
    letter: string;
    key: string;
    label: string;
    tone?: string;
    fillArgb?: string;
    fontArgb?: string;
  }>;
  preview: Array<{ key: string; label: string; count: number; percent: number }>;
  airlines: MonthWiseAirlineBlock[];
  combined: MonthWiseAirlineBlock;
  summary: {
    flights: number;
    months: number;
    airlines: number;
  };
};

@Injectable()
export class MisMonthWiseService {
  constructor(private readonly stationWise: MisStationWiseService) {}

  async getStatus(
    station: StationScopeContext,
    query: MisStationWiseQueryDto,
  ): Promise<MonthWiseStatusPayload> {
    // Same station-scoped FHR collect as MIS Station Wise — airlines = FHR only.
    const collected = await this.stationWise.collectStationWise(station, query);
    const model = buildMonthWiseModel(collected.months, collected.rowsByMonth);
    const flightScope = parseStationWiseFlightScope(query.flightScope);
    return {
      stationCode: collected.stationCode,
      stationLabel: collected.stationLabel,
      from: collected.from,
      to: collected.to,
      rangeLabel: formatRangeLabel(collected.from, collected.to),
      flightScope,
      flightScopeLabel: isNonScheduledStationWiseScope(flightScope)
        ? 'MIS - Non Schedule Month Wise'
        : 'MIS - Scheduled Month Wise',
      readyForExport: true,
      coverage: collected.coverage,
      columns: MONTH_WISE_COLUMNS.map((c) => ({
        letter: c.letter,
        key: c.key,
        label: c.label,
        tone: c.tone,
        fillArgb: c.fillArgb,
        fontArgb: c.fontArgb,
      })),
      preview: performanceRows(model.combined.performance),
      airlines: model.airlines,
      combined: model.combined,
      summary: {
        flights: model.combined.totals.total,
        months: collected.months.length,
        airlines: model.airlines.length,
      },
    };
  }

  async exportWorkbook(
    station: StationScopeContext,
    query: MisStationWiseQueryDto,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const collected = await this.stationWise.collectStationWise(station, query);
    const model = buildMonthWiseModel(collected.months, collected.rowsByMonth);
    const buffer = await buildMonthWiseWorkbook({
      stationCode: collected.stationCode,
      stationLabel: collected.stationLabel,
      from: collected.from,
      to: collected.to,
      months: collected.months,
      combined: model.combined,
      airlines: model.airlines,
    });
    return {
      buffer,
      fileName: monthWiseExportFileName(
        collected.stationCode,
        collected.from,
        collected.to,
        collected.flightScope,
      ),
    };
  }
}
