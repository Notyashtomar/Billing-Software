/**
 * Safe rollback for dashboard_daily_aggregates migration/rebuild side effects.
 *
 * Usage (from server/):
 *   npm run rollback:dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --inspect
 *   npm run rollback:dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --backup ./backups/aggregates-pre-rollback
 *   npm run rollback:dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --rollback --confirm
 *   npm run rollback:dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --rollback --confirm --rebuild-4h
 *
 * Does NOT touch fhr_collection or dashboard_summaries.
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
import { rebuildDashboardShards } from './utils/rebuild-dashboard-shards.util';
import { enumerateYmdInclusive } from './utils/daily-aggregate-merge.util';

const cliLogger = new Logger('RollbackDashboardAggregates');

type CliArgs = {
  fromYmd: string;
  toYmd: string;
  inspect: boolean;
  backupDir: string;
  rollback: boolean;
  confirm: boolean;
  rebuild4h: boolean;
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let fromRaw = '';
  let toRaw = '';
  let inspect = false;
  let backupDir = '';
  let rollback = false;
  let confirm = false;
  let rebuild4h = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i + 1]) fromRaw = argv[++i];
    else if (a === '--to' && argv[i + 1]) toRaw = argv[++i];
    else if (a === '--inspect') inspect = true;
    else if (a === '--backup' && argv[i + 1]) backupDir = argv[++i];
    else if (a === '--rollback') rollback = true;
    else if (a === '--confirm') confirm = true;
    else if (a === '--rebuild-4h') rebuild4h = true;
  }

  const fromYmd = FhrCollectionService.queryParamToYmd(fromRaw) ?? '';
  const toYmd = FhrCollectionService.queryParamToYmd(toRaw) ?? '';
  if (!fromYmd || !toYmd) {
    cliLogger.error(
      'Usage: npm run rollback:dashboard-aggregates -- --from <date> --to <date> [--inspect] [--backup <dir>] [--rollback --confirm] [--rebuild-4h]',
    );
    process.exit(2);
  }
  if (!inspect && !backupDir && !rollback) {
    cliLogger.error('Specify at least one of --inspect, --backup <dir>, or --rollback --confirm');
    process.exit(2);
  }
  if (rollback && !confirm) {
    cliLogger.error('Destructive --rollback requires --confirm');
    process.exit(2);
  }
  return { fromYmd, toYmd, inspect, backupDir, rollback, confirm, rebuild4h };
}

type AggDoc = {
  _id: unknown;
  date?: string;
  aggregateType?: string;
  equipmentMode?: string;
  generatedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  data?: Record<string, unknown>;
  perf?: Record<string, unknown>;
};

function isEmptyPayload(data: Record<string, unknown> | undefined): boolean {
  if (!data || typeof data !== 'object') return true;
  const keys = Object.keys(data);
  if (keys.length === 0) return true;
  if (data.flights && Array.isArray(data.flights) && data.flights.length === 0) {
    const hasMeta =
      Number((data.partitionMeta as Record<string, unknown>)?.row3cTotalCount ?? 0) > 0;
    if (hasMeta) return false;
  }
  if (data.total !== undefined && Number(data.total) === 0 && keys.length <= 3) return true;
  return false;
}

async function loadAffected(
  conn: Connection,
  fromYmd: string,
  toYmd: string,
): Promise<AggDoc[]> {
  return conn.db!.collection('dashboard_daily_aggregates')
    .find({ date: { $gte: fromYmd, $lte: toYmd } })
    .sort({ date: 1, aggregateType: 1, equipmentMode: 1 })
    .toArray() as Promise<AggDoc[]>;
}

function analyze(docs: AggDoc[]) {
  const byTypeMode = new Map<string, number>();
  const collisions = new Map<string, Set<string>>();
  let emptyPayloads = 0;
  let legacyGlobal = 0;

  for (const d of docs) {
    const mode = d.equipmentMode ?? '';
    const key = `${d.date}|${d.aggregateType}|${mode}`;
    byTypeMode.set(key, (byTypeMode.get(key) ?? 0) + 1);
    if (mode === '') legacyGlobal += 1;
    if (isEmptyPayload(d.data)) emptyPayloads += 1;

    const sharedKey = `${d.date}|${d.aggregateType}`;
    if (d.aggregateType !== 'equipmentUtilization') {
      const modes = collisions.get(sharedKey) ?? new Set<string>();
      modes.add(mode);
      collisions.set(sharedKey, modes);
    }
  }

  const sharedCollisions = [...collisions.entries()].filter(
    ([, modes]) => modes.has('') && (modes.has('4h') || modes.has('6h')),
  );

  return { byTypeMode, emptyPayloads, legacyGlobal, sharedCollisions, total: docs.length };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const dates = enumerateYmdInclusive(args.fromYmd, args.toYmd);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const conn = app.get<Connection>(getConnectionToken());
    const docs = await loadAffected(conn, args.fromYmd, args.toYmd);
    const analysis = analyze(docs);

    if (args.inspect) {
      const typeSummary = new Map<string, number>();
      for (const d of docs) {
        const k = `${d.aggregateType}|${d.equipmentMode ?? ''}`;
        typeSummary.set(k, (typeSummary.get(k) ?? 0) + 1);
      }
      cliLogger.log(
        JSON.stringify({
          event: 'rollback_inspect',
          from: args.fromYmd,
          to: args.toYmd,
          expectedDays: dates.length,
          totalDocs: analysis.total,
          emptyPayloads: analysis.emptyPayloads,
          legacyGlobalModeDocs: analysis.legacyGlobal,
          typeModeCounts: Object.fromEntries(typeSummary),
          sharedKeyCollisions: analysis.sharedCollisions.length,
          duplicateKeys: [...analysis.byTypeMode.entries()]
            .filter(([, c]) => c > 1)
            .map(([k, c]) => ({ key: k, count: c })),
        }),
      );
    }

    if (args.backupDir) {
      mkdirSync(args.backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outPath = join(args.backupDir, `dashboard_daily_aggregates_${args.fromYmd}_${args.toYmd}_${stamp}.json`);
      writeFileSync(
        outPath,
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            from: args.fromYmd,
            to: args.toYmd,
            count: docs.length,
            analysis: {
              emptyPayloads: analysis.emptyPayloads,
              legacyGlobalModeDocs: analysis.legacyGlobal,
            },
            documents: docs,
          },
          null,
          2,
        ),
      );
      cliLogger.log(JSON.stringify({ event: 'rollback_backup', path: outPath, count: docs.length }));
    }

    if (args.rollback) {
      const result = await conn.db!.collection('dashboard_daily_aggregates').deleteMany({
        date: { $gte: args.fromYmd, $lte: args.toYmd },
      });
      cliLogger.log(
        JSON.stringify({
          event: 'rollback_delete',
          from: args.fromYmd,
          to: args.toYmd,
          deletedCount: result.deletedCount ?? 0,
          note: 'Removed all aggregate shards in range (migration + 4h/6h rebuild side effects). FHR untouched.',
        }),
      );
    }

    if (args.rebuild4h) {
      if (!args.rollback) {
        cliLogger.warn('--rebuild-4h without --rollback: rebuilding on top of existing docs');
      }
      const worker = app.get(DashboardSummaryWorkerService);
      cliLogger.log(`Rebuilding ${dates.length} day(s) mode=4h ONLY (safe recovery path)`);
      const results = await rebuildDashboardShards(worker, dates, {
        equipmentMode: '4h',
        concurrency: 4,
        invalidateFhrCache: false,
      });
      cliLogger.log(
        JSON.stringify({
          event: 'rollback_rebuild_4h',
          days: results.length,
          totalMs: results.reduce((s, r) => s + r.ms, 0),
        }),
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  cliLogger.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
