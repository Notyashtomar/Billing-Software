import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { LEGACY_STATION_CODE } from '../../common/station/station.constants';
import {
  AdvanceAirline,
  AdvanceAirlineDocument,
} from '../schema/advance-airline.schema';

/** Legacy global unique indexes — superseded by `{ stationCode, name|code }`. */
const LEGACY_AIRLINE_UNIQUE_INDEXES = ['name_1', 'code_1'] as const;

/**
 * Drops pre-station global unique indexes on `advance-airline` and syncs
 * station-scoped compound indexes from the schema.
 */
@Injectable()
export class AdvanceAirlineIndexMigrationService implements OnModuleInit {
  private readonly logger = new Logger(AdvanceAirlineIndexMigrationService.name);

  constructor(
    @InjectModel(AdvanceAirline.name)
    private readonly model: Model<AdvanceAirlineDocument>,
  ) {}

  private isIndexNotFoundError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('index not found') ||
      msg.includes('Index not found') ||
      msg.toLowerCase().includes('ns not found')
    ) {
      return true;
    }
    const code =
      typeof err === 'object' && err !== null ? (err as { code?: number }).code : undefined;
    return code === 27;
  }

  async onModuleInit(): Promise<void> {
    const coll = this.model.collection;

    try {
      const backfill = await coll.updateMany(
        {
          $or: [
            { stationCode: { $exists: false } },
            { stationCode: null },
            { stationCode: '' },
          ],
        },
        { $set: { stationCode: LEGACY_STATION_CODE } },
      );
      if (backfill.modifiedCount > 0) {
        this.logger.log(
          `[advance_airline_indexes] backfilled stationCode=${LEGACY_STATION_CODE} on ${backfill.modifiedCount} legacy row(s)`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[advance_airline_indexes] stationCode backfill skipped: ${msg}`);
    }

    for (const indexName of LEGACY_AIRLINE_UNIQUE_INDEXES) {
      try {
        await coll.dropIndex(indexName);
        this.logger.log(
          `[advance_airline_indexes] dropped legacy index "${indexName}"`,
        );
      } catch (err: unknown) {
        if (!this.isIndexNotFoundError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[advance_airline_indexes] could not drop "${indexName}": ${msg}`,
          );
        }
      }
    }

    try {
      await this.model.syncIndexes();
      this.logger.log('[advance_airline_indexes] syncIndexes done for advance-airline');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[advance_airline_indexes] syncIndexes failed: ${msg}`);
    }
  }
}
