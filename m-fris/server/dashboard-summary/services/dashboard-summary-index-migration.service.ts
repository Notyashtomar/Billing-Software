import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  DashboardSummary,
  DashboardSummaryDocument,
} from '../schemas/dashboard-summary.schema';
import {
  DashboardDailyAggregate,
  DashboardDailyAggregateDocument,
} from '../schemas/dashboard-daily-aggregate.schema';
import {
  DashboardDrilldown,
  DashboardDrilldownDocument,
} from '../schemas/dashboard-drilldown.schema';

function isLegacyRangeUniqueIndex(key: Record<string, unknown>): boolean {
  const fields = Object.keys(key);
  return (
    fields.length === 3 &&
    fields.includes('fromDate') &&
    fields.includes('tillDate') &&
    fields.includes('equipmentMode')
  );
}

/**
 * One-time-per-deploy hygiene: old `dashboard_summaries` used a unique index on
 * `(fromDate, tillDate, equipmentMode)`. Daily shards only set `summaryDate`, so
 * `fromDate`/`tillDate` are missing → repeated `(null, null, "4h")` violates that
 * index (E11000) and blocks all upserts. Drop legacy range indexes (by name or
 * key shape), then sync schema indexes (`uniq_day_mode`, etc.).
 *
 * Station rollout: the global-unique indexes on all three materialized dashboard
 * collections become station-scoped compounds (`uniq_station_*`). `syncIndexes()`
 * drops the obsolete legacy index and builds the schema-declared compound by
 * name, so no manual index swap is needed for these collections.
 */
@Injectable()
export class DashboardSummaryIndexMigrationService implements OnModuleInit {
  private readonly logger = new Logger(DashboardSummaryIndexMigrationService.name);

  /** Known legacy index names from earlier deployments. */
  private static readonly LEGACY_INDEX_NAMES = [
    'uniq_range_mode',
    'uniq_range_modedup',
    'uniq_range_mode_dup',
    'range_generatedAt',
    // Pre-station global-unique indexes (now superseded by uniq_station_*).
    'uniq_day_mode',
  ] as const;

  /** Legacy global-unique index names on the sibling materialized collections. */
  private static readonly LEGACY_SIBLING_INDEX_NAMES: Record<string, string[]> = {
    dashboard_daily_aggregates: ['uniq_date_type_mode'],
    dashboard_drilldowns: ['uniq_drill_range_mode_type'],
  };

  constructor(
    @InjectModel(DashboardSummary.name)
    private readonly model: Model<DashboardSummaryDocument>,
    @InjectModel(DashboardDailyAggregate.name)
    private readonly dailyAggregateModel: Model<DashboardDailyAggregateDocument>,
    @InjectModel(DashboardDrilldown.name)
    private readonly drilldownModel: Model<DashboardDrilldownDocument>,
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

    for (const name of DashboardSummaryIndexMigrationService.LEGACY_INDEX_NAMES) {
      try {
        await coll.dropIndex(name);
        this.logger.log(
          `[dashboard_summary_indexes] dropped legacy index "${name}" on ${coll.collectionName}`,
        );
      } catch (err: unknown) {
        if (this.isIndexNotFoundError(err)) continue;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[dashboard_summary_indexes] could not drop "${name}": ${msg}`,
        );
      }
    }

    try {
      const specs = await coll.indexes();
      for (const spec of specs) {
        const name = spec.name as string | undefined;
        const key = spec.key as Record<string, unknown> | undefined;
        if (!name || name === '_id_' || !key) continue;
        const unique = spec.unique === true;
        if (unique && isLegacyRangeUniqueIndex(key)) {
          try {
            await coll.dropIndex(name);
            this.logger.log(
              `[dashboard_summary_indexes] dropped legacy range unique index "${name}" ` +
                `(fromDate+tillDate+equipmentMode) on ${coll.collectionName}`,
            );
          } catch (err: unknown) {
            if (this.isIndexNotFoundError(err)) continue;
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `[dashboard_summary_indexes] could not drop "${name}": ${msg}`,
            );
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[dashboard_summary_indexes] listIndexes: ${msg}`);
    }

    try {
      await this.model.syncIndexes();
      this.logger.log(
        `[dashboard_summary_indexes] syncIndexes done for ${coll.collectionName}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[dashboard_summary_indexes] syncIndexes failed: ${msg}`,
      );
    }

    // Sibling materialized collections: drop their pre-station global-unique
    // index and build the station-scoped compound (by schema name). Done here so
    // the whole dashboard index surface self-heals at boot without a manual swap.
    await this.syncSiblingIndexes(this.dailyAggregateModel);
    await this.syncSiblingIndexes(this.drilldownModel);
  }

  private async syncSiblingIndexes(
    model: Model<DashboardDailyAggregateDocument | DashboardDrilldownDocument>,
  ): Promise<void> {
    const coll = model.collection;
    const legacyNames =
      DashboardSummaryIndexMigrationService.LEGACY_SIBLING_INDEX_NAMES[
        coll.collectionName
      ] ?? [];

    for (const name of legacyNames) {
      try {
        await coll.dropIndex(name);
        this.logger.log(
          `[dashboard_summary_indexes] dropped legacy index "${name}" on ${coll.collectionName}`,
        );
      } catch (err: unknown) {
        if (this.isIndexNotFoundError(err)) continue;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[dashboard_summary_indexes] could not drop "${name}" on ${coll.collectionName}: ${msg}`,
        );
      }
    }

    try {
      await model.syncIndexes();
      this.logger.log(
        `[dashboard_summary_indexes] syncIndexes done for ${coll.collectionName}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[dashboard_summary_indexes] syncIndexes failed for ${coll.collectionName}: ${msg}`,
      );
    }
  }
}
