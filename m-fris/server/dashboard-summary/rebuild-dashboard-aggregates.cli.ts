/**
 * Rebuilds `dashboard_daily_aggregates` for a date range (all aggregate types per day).
 *
 * Usage (from server/):
 *   npm run rebuild:dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --mode 4h
 *   npm run rebuild:dashboard-aggregates -- --from 2026-02-28 --to 2026-07-20 --mode 4h --scope ns --full
 *   npm run rebuild:dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --mode 6h
 *   npm run rebuild:dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --mode 6h --full
 *   npm run rebuild:dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --mode 4h --concurrency 6 --bust-cache
 *
 * `--scope ns` (or `non-scheduled`) writes `ns_dashboard_daily_aggregates` / `ns_dashboard_summaries`
 * from `ns_fhr_collection`. Default scope is scheduled (`dashboard_*`).

 * Exit codes: 0 = OK, 2 = usage/runtime error.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';
import { FhrCollectionService } from '../fhr-collection/services/fhr-collection.service';
import { DashboardSummaryWorkerService } from './services/dashboard-summary-worker.service';
import {
  rebuildDashboardShards,
  type RebuildShardScope,
} from './utils/rebuild-dashboard-shards.util';
import { enumerateYmdInclusive } from './utils/daily-aggregate-merge.util';

const cliLogger = new Logger('RebuildDashboardAggregates');

type CliArgs = {
  fromYmd: string;
  toYmd: string;
  mode: '4h' | '6h';
  concurrency: number;
  bustCache: boolean;
  dryRun: boolean;
  backupDir: string;
  fullRebuild: boolean;
  /** Concrete station to rebuild for; default legacy MAA. */
  stationCode: string;
  /** `scheduled` (default) or `nonScheduled` (`ns_dashboard_*`). */
  flightScope: 'scheduled' | 'nonScheduled';
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let fromRaw = '';
  let toRaw = '';
  let mode: '4h' | '6h' = '4h';
  let concurrency = 4;
  let bustCache = false;
  let dryRun = false;
  let backupDir = '';
  let fullRebuild = false;
  let stationCode = 'MAA';
  let flightScope: 'scheduled' | 'nonScheduled' = 'scheduled';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i + 1]) {
      fromRaw = argv[++i];
    } else if (a === '--to' && argv[i + 1]) {
      toRaw = argv[++i];
    } else if (a === '--mode' && argv[i + 1]) {
      const m = argv[++i].trim().toLowerCase();
      mode = m === '6h' ? '6h' : '4h';
    } else if (a === '--concurrency' && argv[i + 1]) {
      concurrency = Math.max(1, Math.floor(Number(argv[++i])));
    } else if (a === '--bust-cache') {
      bustCache = true;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--backup' && argv[i + 1]) {
      backupDir = argv[++i];
    } else if (a === '--full') {
      fullRebuild = true;
    } else if (a === '--station' && argv[i + 1]) {
      stationCode = argv[++i].trim().toUpperCase() || 'MAA';
    } else if ((a === '--scope' || a === '--flight-scope') && argv[i + 1]) {
      const s = argv[++i].trim().toLowerCase().replace(/[_\s]+/g, '-');
      flightScope =
        s === 'ns' || s === 'non-scheduled' || s === 'nonscheduled'
          ? 'nonScheduled'
          : 'scheduled';
    }
  }

  const fromYmd = FhrCollectionService.queryParamToYmd(fromRaw) ?? '';
  const toYmd = FhrCollectionService.queryParamToYmd(toRaw) ?? '';
  if (!fromYmd || !toYmd) {
    cliLogger.error(
      'Usage: npm run rebuild:dashboard-aggregates -- --from <yyyy-MM-dd|dd/MM/yyyy> --to <...> [--mode 4h|6h] [--scope scheduled|ns] [--full] [--concurrency N] [--bust-cache]',
    );
    process.exit(2);
  }
  return {
    fromYmd,
    toYmd,
    mode,
    concurrency,
    bustCache,
    dryRun,
    backupDir,
    fullRebuild,
    stationCode,
    flightScope,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const dates = enumerateYmdInclusive(args.fromYmd, args.toYmd);
  cliLogger.log(
    `Rebuilding ${dates.length} day(s) station=${args.stationCode} scope=${args.flightScope} mode=${args.mode} concurrency=${args.concurrency} dryRun=${args.dryRun}`,
  );

  const scope: RebuildShardScope =
    args.mode === '6h' && !args.fullRebuild ? 'equipment-only' : 'full';
  if (args.mode === '6h' && !args.fullRebuild) {
    cliLogger.log(
      '6h rebuild scope=equipment-only — updates equipmentUtilization|6h daily aggregates only; ' +
        'airline remarks, aircraft analysis, and primary cards are not touched. ' +
        'Pass --full to rebuild all aggregate types for the 6h summary shard.',
    );
  } else if (args.mode === '6h' && args.fullRebuild) {
    cliLogger.warn(
      '6h rebuild scope=full — also refreshes shared aggregates (equipmentMode "") and dashboard_summaries|6h.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    if (args.backupDir) {
      const conn = app.get<Connection>(getConnectionToken());
      const collName =
        args.flightScope === 'nonScheduled'
          ? 'ns_dashboard_daily_aggregates'
          : 'dashboard_daily_aggregates';
      const docs = await conn.db!.collection(collName)
        .find({ date: { $gte: args.fromYmd, $lte: args.toYmd } })
        .toArray();
      mkdirSync(args.backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outPath = join(
        args.backupDir,
        `pre_rebuild_${args.fromYmd}_${args.toYmd}_${args.mode}_${stamp}.json`,
      );
      writeFileSync(outPath, JSON.stringify({ count: docs.length, documents: docs }, null, 2));
      cliLogger.log(JSON.stringify({ event: 'rebuild_backup', path: outPath, count: docs.length }));
    }

    if (args.dryRun) {
      cliLogger.log(JSON.stringify({ event: 'rebuild_dry_run', days: dates.length, mode: args.mode }));
      return;
    }

    const worker = app.get(DashboardSummaryWorkerService);
    const results = await rebuildDashboardShards(worker, dates, {
      equipmentMode: args.mode,
      scope,
      concurrency: args.concurrency,
      invalidateFhrCache: args.bustCache,
      stationCode: args.stationCode,
      flightScope: args.flightScope,
    });
    const totalMs = results.reduce((s, r) => s + r.ms, 0);
    cliLogger.log(
      `Done — days=${results.length} totalMs=${totalMs} avgMs=${Math.round(totalMs / results.length)}`,
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
