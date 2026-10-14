import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { normalizeStationCode } from '../../common/station/station.constants';
import { fixedStationScope } from '../../common/station/station-scope';
import { readScheduledDailyReadModelEnv } from '../config/scheduled-daily-read-model.env';
import {
  ScheduledDailyRow,
  ScheduledDailyRowDocument,
} from '../schema/scheduled-daily-row.schema';
import {
  eachYmdInclusive,
  identityKeyFromDailyData,
  parseYmd,
  pickAirline,
  pickFlightNo,
  pickRowStatus,
  pickScheduleId,
  pickSerialNo,
  sourceTypeFromDailyData,
  staYmdFromDailyData,
  ymdToDdMmYyyy,
} from '../utils/scheduled-daily-row.util';
import { RawFlightDataService } from './raw-flight-data.service';
import { invalidateListDailyFromAdvanceCache } from '../utils/list-daily-from-advance-cache.util';

export interface RebuildDayResult {
  stationCode: string;
  staYmd: string;
  upserted: number;
  deletedOrphans: number;
  sourceRows: number;
  wallMs: number;
}

/**
 * Materializes `scheduled_daily_rows` from the legacy assembler (Phase 2).
 * Apply Filters still reads legacy until Phase 3+.
 */
@Injectable()
export class ScheduledDailyProjectorService {
  private readonly logger = new Logger(ScheduledDailyProjectorService.name);

  constructor(
    @InjectModel(ScheduledDailyRow.name)
    private readonly rowModel: Model<ScheduledDailyRowDocument>,
    private readonly rawFlightDataService: RawFlightDataService,
  ) {}

  async rebuildDay(params: {
    stationCode: string;
    staYmd: string;
  }): Promise<RebuildDayResult> {
    const wallStart = Date.now();
    const stationCode = normalizeStationCode(params.stationCode);
    const staYmd = String(params.staYmd ?? '').trim();
    if (!stationCode) {
      throw new BadRequestException('stationCode is required');
    }
    if (!parseYmd(staYmd)) {
      throw new BadRequestException('staYmd must be yyyy-MM-dd');
    }
    const dd = ymdToDdMmYyyy(staYmd);
    if (!dd) {
      throw new BadRequestException('invalid staYmd');
    }

    const station = fixedStationScope(stationCode);
    // Always use legacy assembler when materializing — never read the projection
    // we are writing (avoids empty self-read when SCHEDULED_DAILY_READ_MODEL=on).
    const legacyRows = await this.rawFlightDataService.listDailyFromAdvance(
      dd,
      dd,
      true,
      station,
      { forceLegacyAssembler: true },
    );

    const projectedAt = new Date();
    const retentionDays = readScheduledDailyReadModelEnv().retentionDays;
    const expireAt = new Date(
      projectedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000,
    );
    const sourceVersion = String(projectedAt.getTime());
    const keptKeys = new Set<string>();
    const ops: Parameters<Model<ScheduledDailyRowDocument>['bulkWrite']>[0] =
      [];

    for (const row of legacyRows) {
      const data = (row?.data ?? {}) as Record<string, unknown>;
      const rowStaYmd = staYmdFromDailyData(data, staYmd);
      if (rowStaYmd !== staYmd) continue;
      const identityKey = identityKeyFromDailyData(data);
      keptKeys.add(identityKey);
      ops.push({
        updateOne: {
          filter: { stationCode, staYmd, identityKey },
          update: {
            $set: {
              stationCode,
              staYmd,
              identityKey,
              sourceType: sourceTypeFromDailyData(data),
              scheduleId: pickScheduleId(data),
              serialNo: pickSerialNo(data),
              airline: pickAirline(data),
              flightNo: pickFlightNo(data),
              rowStatus: pickRowStatus(data),
              data,
              projectedAt,
              sourceVersion,
              lastEventId: `rebuild_day:${staYmd}`,
              expireAt,
            },
          },
          upsert: true,
        },
      });
    }

    if (ops.length > 0) {
      await this.rowModel.bulkWrite(ops, { ordered: false });
    }

    const deleteFilter: Record<string, unknown> = {
      stationCode,
      staYmd,
    };
    if (keptKeys.size > 0) {
      deleteFilter.identityKey = { $nin: [...keptKeys] };
    }
    const del = await this.rowModel.deleteMany(deleteFilter).exec();

    // Soft-cache consumers must not serve pre-rebuild payloads.
    invalidateListDailyFromAdvanceCache();

    const result: RebuildDayResult = {
      stationCode,
      staYmd,
      upserted: ops.length,
      deletedOrphans: del.deletedCount ?? 0,
      sourceRows: legacyRows.length,
      wallMs: Date.now() - wallStart,
    };
    this.logger.log(
      `[scheduled_daily_projector] rebuild_day ${JSON.stringify(result)}`,
    );
    return result;
  }

  async rebuildRange(params: {
    stationCode: string;
    fromYmd: string;
    toYmd: string;
  }): Promise<{
    stationCode: string;
    fromYmd: string;
    toYmd: string;
    days: number;
    results: RebuildDayResult[];
  }> {
    const stationCode = normalizeStationCode(params.stationCode);
    if (!stationCode) {
      throw new BadRequestException('stationCode is required');
    }
    const days = eachYmdInclusive(params.fromYmd, params.toYmd);
    if (days.length === 0) {
      throw new BadRequestException('fromYmd/toYmd invalid or empty range');
    }
    if (days.length > 62) {
      throw new BadRequestException(
        'rebuild range limited to 62 days per request; enqueue outbox for larger backfills',
      );
    }
    const results: RebuildDayResult[] = [];
    for (const staYmd of days) {
      results.push(await this.rebuildDay({ stationCode, staYmd }));
    }
    return {
      stationCode,
      fromYmd: params.fromYmd,
      toYmd: params.toYmd,
      days: days.length,
      results,
    };
  }

  async countRowsForStation(stationCode: string): Promise<number> {
    const code = normalizeStationCode(stationCode);
    if (!code) return 0;
    return this.rowModel.countDocuments({ stationCode: code }).exec();
  }

  /** Distinct staYmd coverage for a station (backfill progress). */
  async coverageForStation(
    stationCode: string,
    fromYmd?: string,
    toYmd?: string,
  ): Promise<{
    stationCode: string;
    rowCount: number;
    distinctDays: number;
    days: string[];
  }> {
    const code = normalizeStationCode(stationCode);
    if (!code) {
      return { stationCode: '', rowCount: 0, distinctDays: 0, days: [] };
    }
    const match: Record<string, unknown> = { stationCode: code };
    if (fromYmd && toYmd && parseYmd(fromYmd) && parseYmd(toYmd)) {
      match.staYmd = { $gte: fromYmd, $lte: toYmd };
    }
    const [rowCount, dayRows] = await Promise.all([
      this.rowModel.countDocuments(match).exec(),
      this.rowModel.distinct('staYmd', match).exec(),
    ]);
    const days = (dayRows as string[]).slice().sort();
    return {
      stationCode: code,
      rowCount,
      distinctDays: days.length,
      days,
    };
  }
}
