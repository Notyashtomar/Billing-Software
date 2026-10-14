import { BadRequestException, Injectable } from '@nestjs/common';
import type { StationScopeContext } from 'src/common/station/station-scope';
import { normalizeStationCode } from 'src/common/station/station.constants';
import { MisAirlineWiseQueryDto } from '../dto/mis-airline-wise-query.dto';
import { MisStationWiseQueryDto } from '../dto/mis-station-wise-query.dto';
import {
  airlineCodeFromRow,
  airlineWiseExportFileName,
  attachPriorYear,
  buildAirlineWiseModel,
  type AirlineWiseAirlineBlock,
} from '../utils/airline-wise-layout.util';
import { buildAirlineWiseWorkbook } from '../utils/airline-wise-workbook.util';
import { MONTH_WISE_COLUMNS, performanceRows } from '../utils/month-wise-layout.util';
import {
  formatRangeLabel,
  shiftRangeBackOneYear,
  stationWiseLabel,
} from '../utils/station-wise-months.util';
import {
  excelTimeToHm,
  type StationWiseInputRow,
} from '../utils/station-wise-map-fhr.util';
import {
  isNonScheduledStationWiseScope,
  parseStationWiseFlightScope,
} from '../utils/station-wise-scope.util';
import { MisStationWiseService } from './mis-station-wise.service';

const PREVIEW_FLIGHT_CAP = 8000;

export type AirlineWisePreviewFlight = {
  stationCode: string;
  airlineCode: string;
  airline: string;
  flightNo: string;
  typeCraft: string;
  staYmd: string;
  staTime: string;
  staDate: string;
  stdTime: string;
  stdDate: string;
  ataTime: string;
  ataDate: string;
  atdTime: string;
  atdDate: string;
  delay: string;
};

export type AirlineWiseStatusPayload = {
  scope: 'all-stations';
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  rangeLabel: string;
  flightScope: 'scheduled' | 'nonScheduled';
  flightScopeLabel: string;
  readyForExport: boolean;
  columns: Array<{
    letter: string;
    key: string;
    label: string;
    tone?: string;
    fillArgb?: string;
    fontArgb?: string;
  }>;
  preview: Array<{ key: string; label: string; count: number; percent: number }>;
  airlines: AirlineWiseAirlineBlock[];
  flights: AirlineWisePreviewFlight[];
  flightsTruncated: boolean;
  summary: {
    flights: number;
    months: number;
    airlines: number;
    stations: number;
  };
};

function toLiteFlight(row: StationWiseInputRow): AirlineWisePreviewFlight {
  return {
    stationCode: String(row.stationCode ?? '').trim().toUpperCase() || 'UNK',
    airlineCode: airlineCodeFromRow(row),
    airline: row.airline,
    flightNo: row.flightNo,
    typeCraft: row.typeCraft,
    staYmd: row.staYmd,
    staTime: excelTimeToHm(row.staTime),
    staDate: row.staDate,
    stdTime: excelTimeToHm(row.stdTime),
    stdDate: row.stdDate,
    ataTime: excelTimeToHm(row.ataTime),
    ataDate: row.ataDate,
    atdTime: excelTimeToHm(row.atdTime),
    atdDate: row.atdDate,
    delay: row.delay,
  };
}

@Injectable()
export class MisAirlineWiseService {
  constructor(private readonly stationWise: MisStationWiseService) {}

  async getStatus(
    station: StationScopeContext,
    query: MisStationWiseQueryDto,
  ): Promise<AirlineWiseStatusPayload> {
    const collected = await this.stationWise.collectAllStations(query);
    const homeStation = normalizeStationCode(station.stationCode) || '';
    const rows = collected.allRows.map((row) => ({
      ...row,
      stationCode: row.stationCode || 'UNK',
    }));
    const currentAirlines = buildAirlineWiseModel(collected.months, rows);
    const priorRange = shiftRangeBackOneYear(collected.from, collected.to);
    let priorAirlines: AirlineWiseAirlineBlock[] = [];
    if (priorRange) {
      try {
        const priorCollected = await this.stationWise.collectAllStations({
          ...query,
          from: priorRange.from,
          to: priorRange.to,
        });
        if (priorCollected.allRows.length > 0) {
          priorAirlines = buildAirlineWiseModel(
            priorCollected.months,
            priorCollected.allRows.map((row) => ({
              ...row,
              stationCode: row.stationCode || 'UNK',
            })),
          );
        }
      } catch {
        priorAirlines = [];
      }
    }
    const airlines = attachPriorYear(currentAirlines, priorAirlines).map((airline) => ({
      ...airline,
      atHomeStation: homeStation
        ? airline.stations.some((stn) => stn.stationCode === homeStation)
        : airline.flights > 0,
    }));
    const flightScope = parseStationWiseFlightScope(query.flightScope);
    const stations = new Set<string>();
    for (const airline of airlines) {
      for (const stn of airline.stations) stations.add(stn.stationCode);
    }
    const allFlights = rows
      .filter((row) => airlineCodeFromRow(row))
      .map(toLiteFlight);
    const truncated = allFlights.length > PREVIEW_FLIGHT_CAP;
    const combinedFlights = airlines.reduce((n, a) => n + a.flights, 0);
    const combinedPerf = airlines.reduce(
      (acc, a) => ({
        onTime: acc.onTime + a.performance.onTime,
        cancelled: acc.cancelled + a.performance.cancelled,
        offSked: acc.offSked + a.performance.offSked,
        gtSaved: acc.gtSaved + a.performance.gtSaved,
        beforeStd: acc.beforeStd + a.performance.beforeStd,
        nonGha: acc.nonGha + a.performance.nonGha,
        gha: acc.gha + a.performance.gha,
        total: acc.total + a.performance.total,
      }),
      {
        onTime: 0,
        cancelled: 0,
        offSked: 0,
        gtSaved: 0,
        beforeStd: 0,
        nonGha: 0,
        gha: 0,
        total: 0,
      },
    );

    return {
      scope: 'all-stations',
      stationCode: homeStation || collected.stationCode,
      stationLabel: homeStation
        ? stationWiseLabel(homeStation)
        : collected.stationLabel,
      from: collected.from,
      to: collected.to,
      rangeLabel: formatRangeLabel(collected.from, collected.to),
      flightScope,
      flightScopeLabel: isNonScheduledStationWiseScope(flightScope)
        ? 'MIS - Non Schedule Airline Wise'
        : 'MIS - Scheduled Airline Wise',
      readyForExport: true,
      columns: MONTH_WISE_COLUMNS.map((c) => ({
        letter: c.letter,
        key: c.key,
        label: c.label,
        tone: c.tone,
        fillArgb: c.fillArgb,
        fontArgb: c.fontArgb,
      })),
      preview: performanceRows(combinedPerf),
      airlines,
      flights: truncated ? allFlights.slice(0, PREVIEW_FLIGHT_CAP) : allFlights,
      flightsTruncated: truncated,
      summary: {
        flights: combinedFlights,
        months: collected.months.length,
        airlines: airlines.filter((a) => a.flights > 0).length,
        stations: stations.size,
      },
    };
  }

  async exportWorkbook(
    station: StationScopeContext,
    query: MisAirlineWiseQueryDto,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const code = String(query.airlineCode ?? '')
      .trim()
      .toUpperCase();
    if (!code) {
      throw new BadRequestException('Select an airline code to download.');
    }
    const collected = await this.stationWise.collectAllStations(query);
    const rows = collected.allRows.map((row) => ({
      ...row,
      stationCode: row.stationCode || 'UNK',
    }));
    const currentAirlines = buildAirlineWiseModel(collected.months, rows);
    const priorRange = shiftRangeBackOneYear(collected.from, collected.to);
    let priorAirlines: AirlineWiseAirlineBlock[] = [];
    if (priorRange) {
      try {
        const priorCollected = await this.stationWise.collectAllStations({
          ...query,
          from: priorRange.from,
          to: priorRange.to,
        });
        if (priorCollected.allRows.length > 0) {
          priorAirlines = buildAirlineWiseModel(
            priorCollected.months,
            priorCollected.allRows.map((row) => ({
              ...row,
              stationCode: row.stationCode || 'UNK',
            })),
          );
        }
      } catch {
        priorAirlines = [];
      }
    }
    const airlines = attachPriorYear(currentAirlines, priorAirlines);
    const airline = airlines.find((a) => a.code === code);
    if (!airline) {
      throw new BadRequestException(`No Airline Wise block for ${code}.`);
    }
    const buffer = await buildAirlineWiseWorkbook({
      airline,
      from: collected.from,
      to: collected.to,
    });
    return {
      buffer,
      fileName: airlineWiseExportFileName(code, collected.from, collected.flightScope),
    };
  }
}
