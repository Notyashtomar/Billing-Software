import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DashboardData,
  DashboardDataDocument,
} from '../schema/dashboard-data.schema';
import {
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import { normalizeStationCode } from '../../common/station/station.constants';

@Injectable()
export class DashboardDataService {
  constructor(
    @InjectModel(DashboardData.name)
    private readonly dashboardDataModel: Model<DashboardDataDocument>,
  ) {}

  private static splitRow(line: string): string[] {
    if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
    return line.split(/\s{2,}/).map((x) => x.trim());
  }

  private static parseRawTable(rawText: string): Record<string, unknown>[] {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '');

    if (lines.length < 2) {
      throw new BadRequestException(
        'rawText must include header row and at least one data row',
      );
    }

    const headers = this.splitRow(lines[0] ?? '');
    if (!headers.length) {
      throw new BadRequestException('Could not parse headers from rawText');
    }

    return lines.slice(1).map((line) => {
      const cols = this.splitRow(line);
      const row: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        row[header] = (cols[i] ?? '').trim();
      });
      return row;
    });
  }

  private static normalizeRow(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    // Backward compatibility: allow legacy spreadsheet headers if provided.
    const flightId = row.flightId ?? row['FLIGHT ID'] ?? '';
    const normalized: Record<string, unknown> = {
      ...row,
      flightId,
      airline: row.airline ?? row['AIRLINE'] ?? '',
      operationType: row.operationType ?? row['OPERATION TYPE'] ?? '',
      flightCategory: row.flightCategory ?? row['FLIGHT CATEGORY'] ?? '',
      aircraftType: row.aircraftType ?? row['ACFT TYPE'] ?? '',
      STD_Time: row.STD_Time ?? row['DEP TIME (SCH)'] ?? '',
      STA_Time: row.STA_Time ?? row['ARR TIME (SCH)'] ?? '',
      ATD_Time: row.ATD_Time ?? row['DEP TIME (ACT)'] ?? '',
      ATA_Time: row.ATA_Time ?? row['ARR TIME (ACT)'] ?? '',
      Remarks: row.Remarks ?? row['REMARKS'] ?? '',
    };

    if (normalized.flightId === '' || normalized.flightId == null) {
      throw new BadRequestException(
        'Each row must include flightId (or FLIGHT ID)',
      );
    }
    return normalized;
  }

  /**
   * Resolve the station an import/replace must be scoped to.
   *
   * Station-scoped users always write to their own station (client value is
   * ignored). Cross-station admins MUST name a target station so a replace can
   * never silently wipe/insert across every station.
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

  async importBulk(
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
          ? DashboardDataService.parseRawTable(input.rawText)
          : [];

    if (!rows.length) {
      throw new BadRequestException('Provide either flights[] or rawText');
    }

    const mappedRows = rows.map((row) => ({
      ...DashboardDataService.normalizeRow(row),
      stationCode,
    }));

    if (replaceExisting) {
      // Station-scoped wipe: never deletes another station's dashboard rows.
      await this.dashboardDataModel.deleteMany({ stationCode });
    }

    const docs = await this.dashboardDataModel.insertMany(mappedRows);

    return {
      success: true,
      insertedCount: docs.length,
      replacedExisting: replaceExisting,
      stationCode,
      collection: 'dashboard_data',
      expectedFormat:
        'Use fields like flightId, airline, operationType, flightCategory, aircraftType, STD_Time, STD_Date, STA_Time, STA_Date, ATD_Time, ATD_Date, ATA_Time, ATA_Date, Planned_STA_Time, Planned_STA_Date, Flight_Status, Delay_Departure, Delay_Arrival, Delay_Code_1, Delay_Reason_1, Delay_Time_1, Delay_Code_2, Delay_Reason_2, Delay_Time_2, Gate_Status_Departure, Gate_Status_Arrival, Body_Type, Remarks, Performance, Month, Record_Status',
    };
  }

  async getAll(station: StationScopeContext) {
    return this.dashboardDataModel
      .find(StationScope.filter({}, station))
      .sort({ createdAt: -1 })
      .lean();
  }
}
