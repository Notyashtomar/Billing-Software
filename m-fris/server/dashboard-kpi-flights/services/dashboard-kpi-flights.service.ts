import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DashboardKpiFlight,
  DashboardKpiFlightDocument,
} from '../schema/dashboard-kpi-flight.schema';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import { normalizeStationCode } from '../../common/station/station.constants';

@Injectable()
export class DashboardKpiFlightsService {
  constructor(
    @InjectModel(DashboardKpiFlight.name)
    private readonly model: Model<DashboardKpiFlightDocument>,
  ) {}

  private static splitRow(line: string): string[] {
    if (line.includes('\t')) {
      return line.split('\t').map((x) => x.trim());
    }
    return line.split(/\s{2,}/).map((x) => x.trim());
  }

  private static parseRawTable(rawText: string): Record<string, unknown>[] {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== '');

    if (lines.length < 2) {
      throw new BadRequestException(
        'rawText must include header row + at least one data row',
      );
    }

    const headers = this.splitRow(lines[0] ?? '');
    if (!headers.length) {
      throw new BadRequestException(
        'Could not parse header columns from rawText',
      );
    }

    return lines.slice(1).map((line) => {
      const cols = this.splitRow(line);
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        row[h] = (cols[i] ?? '').trim();
      });
      return row;
    });
  }

  /**
   * Resolve the station an import/replace must be scoped to. Station-scoped
   * users always write to their own station (client value ignored); cross-station
   * admins must name a target station so a replace can never span all stations.
   */
  private resolveImportStation(
    station: StationScopeContext,
    requested?: string,
  ): string {
    if (!station.crossStation) {
      return StationScope.require(station);
    }
    const explicit = normalizeStationCode(requested);
    if (!explicit) {
      throw new BadRequestException(
        'stationCode is required for cross-station admins so the import targets a single station.',
      );
    }
    return explicit;
  }

  async importFlights(
    input: {
      flights?: Record<string, unknown>[];
      rawText?: string;
      replaceExisting?: boolean;
      stationCode?: string;
    },
    station: StationScopeContext,
  ) {
    const stationCode = this.resolveImportStation(station, input.stationCode);
    const replaceExisting = input.replaceExisting ?? true;
    const rows =
      input.flights && input.flights.length > 0
        ? input.flights
        : input.rawText
          ? DashboardKpiFlightsService.parseRawTable(input.rawText)
          : [];

    if (!rows.length) {
      throw new BadRequestException('Provide either flights[] or rawText');
    }

    if (replaceExisting) {
      // Station-scoped wipe: never deletes another station's KPI rows.
      await this.model.deleteMany({ stationCode });
    }

    const docs = await this.model.insertMany(
      rows.map((r) => ({ data: r, stationCode })),
    );
    return {
      success: true,
      insertedCount: docs.length,
      replacedExisting: replaceExisting,
      stationCode,
      sample: docs[0]?.data ?? null,
    };
  }

  async getAll(station: StationScopeContext) {
    return this.model
      .find(StationScope.filter({}, station))
      .sort({ createdAt: -1 })
      .lean();
  }
}
