/**
 * One-time migration: copies drill payloads from legacy `dashboard_summaries.drilldowns`
 * into `dashboard_daily_aggregates` (`performanceDrilldown`, `airlineRemarksDrill`).
 *
 * Usage (from server/):
 *   npm run migrate:dashboard-drills -- --from 2026-02-28 --to 2026-03-31
 *   npm run migrate:dashboard-drills -- --from 2026-02-28 --to 2026-03-31 --dry-run
 *
 * Does not delete `dashboard_summaries`. Run `rebuild:dashboard-aggregates` afterward
 * if you prefer fresh FHR-derived payloads over copied drill shards.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';
import { FhrCollectionService } from '../fhr-collection/services/fhr-collection.service';
import { DASHBOARD_AGGREGATE_TYPES } from './constants/dashboard-aggregate-types';
import { DailyAggregateSummaryService } from './services/daily-aggregate-summary.service';
import { enumerateYmdInclusive } from './utils/daily-aggregate-merge.util';

const cliLogger = new Logger('MigrateDashboardDrills');

type CliArgs = {
  fromYmd: string;
  toYmd: string;
  dryRun: boolean;
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let fromRaw = '';
  let toRaw = '';
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i + 1]) fromRaw = argv[++i];
    else if (a === '--to' && argv[i + 1]) toRaw = argv[++i];
    else if (a === '--dry-run') dryRun = true;
  }
  const fromYmd = FhrCollectionService.queryParamToYmd(fromRaw) ?? '';
  const toYmd = FhrCollectionService.queryParamToYmd(toRaw) ?? '';
  if (!fromYmd || !toYmd) {
    cliLogger.error(
      'Usage: npm run migrate:dashboard-drills -- --from <date> --to <date> [--dry-run]',
    );
    process.exit(2);
  }
  return { fromYmd, toYmd, dryRun };
}

type LegacySummaryDoc = {
  summaryDate?: string;
  equipmentMode?: string;
  generatedAt?: Date;
  drilldowns?: Record<string, unknown>;
  perf?: Record<string, unknown>;
  sourceVersion?: string;
  sourceSnapshotAt?: Date;
};

function extractPerformanceDrill(
  drilldowns: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!drilldowns) return null;
  const raw =
    drilldowns.performance ??
    drilldowns.performanceReport ??
    null;
  if (!raw || typeof raw !== 'object') return null;
  return raw as Record<string, unknown>;
}

function extractAirlineRemarksDrill(
  drilldowns: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!drilldowns) return null;
  const raw = drilldowns.airlineRemarks;
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rows = obj.rows;
  if (!Array.isArray(rows)) return null;
  return {
    rows,
    chartTopAirlinesByRating:
      (obj.chartTopAirlinesByRating as Record<string, unknown>) ?? {},
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const expectedDates = new Set(enumerateYmdInclusive(args.fromYmd, args.toYmd));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const conn = app.get<Connection>(getConnectionToken());
    const aggregateService = app.get(DailyAggregateSummaryService);
    const coll = conn.db!.collection('dashboard_summaries');

    const cursor = coll.find({
      summaryDate: { $gte: args.fromYmd, $lte: args.toYmd },
    });

    let scanned = 0;
    let perfMigrated = 0;
    let airlineMigrated = 0;
    let skipped = 0;

    for await (const doc of cursor) {
      scanned += 1;
      const summary = doc as LegacySummaryDoc;
      const date = String(summary.summaryDate ?? '').trim();
      if (!date || !expectedDates.has(date)) continue;

      const perfData = extractPerformanceDrill(summary.drilldowns);
      const airlineData = extractAirlineRemarksDrill(summary.drilldowns);
      if (!perfData && !airlineData) {
        skipped += 1;
        continue;
      }

      const generatedAt = summary.generatedAt ?? new Date();
      const perfMeta = (summary.perf ?? {}) as Record<string, unknown>;

      if (perfData) {
        if (args.dryRun) {
          perfMigrated += 1;
        } else {
          await aggregateService.upsertAggregate({
            date,
            aggregateType: DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_DRILLDOWN,
            data: perfData,
            perf: {
              sourceRows: Number(perfMeta.sourceRows) || 0,
              aggregationMs: 0,
              mongoWallMs: 0,
              staWindowCacheHit: false,
            },
            generatedAt,
            sourceVersion: summary.sourceVersion,
          });
          perfMigrated += 1;
        }
      }

      if (airlineData) {
        if (args.dryRun) {
          airlineMigrated += 1;
        } else {
          await aggregateService.upsertAggregate({
            date,
            aggregateType: DASHBOARD_AGGREGATE_TYPES.AIRLINE_REMARKS_DRILL,
            data: airlineData,
            perf: {
              sourceRows: Number(perfMeta.sourceRows) || 0,
              aggregationMs: 0,
              mongoWallMs: 0,
              staWindowCacheHit: false,
            },
            generatedAt,
            sourceVersion: summary.sourceVersion,
          });
          airlineMigrated += 1;
        }
      }
    }

    cliLogger.log(
      JSON.stringify({
        event: 'migrate_dashboard_drills',
        dryRun: args.dryRun,
        from: args.fromYmd,
        to: args.toYmd,
        scanned,
        perfMigrated,
        airlineMigrated,
        skipped,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  cliLogger.error(msg);
  process.exit(2);
});
