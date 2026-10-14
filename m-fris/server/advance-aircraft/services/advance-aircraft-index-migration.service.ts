import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  GLOBAL_AIRCRAFT_STATION_CODE,
  LEGACY_STATION_CODE,
} from '../../common/station/station.constants';
import {
  AdvanceAircraft,
  AdvanceAircraftDocument,
} from '../schema/advance-aircraft.schema';

/** Per-station compound unique — superseded by global `aircraft_1`. */
const STATION_AIRCRAFT_COMPOUND_INDEX = 'stationCode_1_aircraft_1';

/** Global unique index on aircraft type (shared catalog). */
const GLOBAL_AIRCRAFT_UNIQUE_INDEX = 'aircraft_1';

/**
 * Consolidates per-station aircraft copies into one global catalog and restores
 * the global unique index on `aircraft`.
 */
@Injectable()
export class AdvanceAircraftIndexMigrationService implements OnModuleInit {
  private readonly logger = new Logger(AdvanceAircraftIndexMigrationService.name);

  constructor(
    @InjectModel(AdvanceAircraft.name)
    private readonly model: Model<AdvanceAircraftDocument>,
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

  private normalizeAircraftType(raw: string): string {
    return raw
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '-')
      .replace(/[^A-Z0-9/-]/g, '')
      .replace(/-+/g, '-')
      .replace(/\/+/g, '/')
      .replace(/[-/]{2,}/g, '-')
      .replace(/^[-/]+|[-/]+$/g, '');
  }

  private docPriority(doc: {
    stationCode?: string;
    updatedAt?: Date;
  }): number {
    const code = String(doc.stationCode ?? '').toUpperCase();
    if (code === GLOBAL_AIRCRAFT_STATION_CODE) return 0;
    if (code === LEGACY_STATION_CODE) return 1;
    return 2;
  }

  private pickCanonical<T extends { stationCode?: string; updatedAt?: Date }>(
    docs: T[],
  ): T {
    return docs.reduce((best, doc) => {
      const bestPri = this.docPriority(best);
      const docPri = this.docPriority(doc);
      if (docPri < bestPri) return doc;
      if (docPri > bestPri) return best;
      const bestUpdated = best.updatedAt?.getTime() ?? 0;
      const docUpdated = doc.updatedAt?.getTime() ?? 0;
      return docUpdated > bestUpdated ? doc : best;
    });
  }

  private async consolidateDuplicateAircraftTypes(): Promise<void> {
    const all = await this.model.find({}).exec();
    const groups = new Map<string, AdvanceAircraftDocument[]>();

    for (const doc of all) {
      const key = this.normalizeAircraftType(String(doc.aircraft ?? ''));
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(doc);
      groups.set(key, list);
    }

    let mergedGroups = 0;
    let removedRows = 0;

    for (const [, docs] of groups) {
      if (docs.length <= 1) {
        const only = docs[0];
        if (
          only &&
          String(only.stationCode ?? '').toUpperCase() !== GLOBAL_AIRCRAFT_STATION_CODE
        ) {
          only.stationCode = GLOBAL_AIRCRAFT_STATION_CODE;
          await only.save();
        }
        continue;
      }

      const canonical = this.pickCanonical(docs);
      canonical.stationCode = GLOBAL_AIRCRAFT_STATION_CODE;
      await canonical.save();

      const staleIds = docs
        .filter((d) => String(d._id) !== String(canonical._id))
        .map((d) => d._id);
      if (staleIds.length > 0) {
        const result = await this.model.deleteMany({ _id: { $in: staleIds } }).exec();
        removedRows += result.deletedCount ?? 0;
      }
      mergedGroups += 1;
    }

    if (mergedGroups > 0 || removedRows > 0) {
      this.logger.log(
        `[advance_aircraft_indexes] consolidated ${mergedGroups} duplicate aircraft type group(s); removed ${removedRows} per-station copy(ies)`,
      );
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consolidateDuplicateAircraftTypes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[advance_aircraft_indexes] duplicate consolidation skipped: ${msg}`,
      );
    }

    const coll = this.model.collection;

    try {
      await coll.dropIndex(STATION_AIRCRAFT_COMPOUND_INDEX);
      this.logger.log(
        `[advance_aircraft_indexes] dropped per-station index "${STATION_AIRCRAFT_COMPOUND_INDEX}"`,
      );
    } catch (err: unknown) {
      if (!this.isIndexNotFoundError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[advance_aircraft_indexes] could not drop "${STATION_AIRCRAFT_COMPOUND_INDEX}": ${msg}`,
        );
      }
    }

    try {
      await this.model.syncIndexes();
      this.logger.log(
        `[advance_aircraft_indexes] syncIndexes done (global "${GLOBAL_AIRCRAFT_UNIQUE_INDEX}")`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[advance_aircraft_indexes] syncIndexes failed: ${msg}`);
    }
  }
}
