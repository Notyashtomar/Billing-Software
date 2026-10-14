/**
 * Surgical rollback for bad `dashboard_daily_aggregates` rows from a 6h rebuild.
 *
 * Root cause: only `equipmentUtilization` is mode-partitioned (4h/6h). All other
 * aggregate types share `{ equipmentMode: "" }`. A 6h rebuild upserts the same
 * keys and overwrites healthy 4h shared shards.
 *
 * Usage (from server/):
 *   npm run rollback:6h-dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --inspect
 *   npm run rollback:6h-dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --dry-run --backup ./backups/6h-rollback
 *   npm run rollback:6h-dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --confirm --backup ./backups/6h-rollback
 *   npm run rollback:6h-dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --confirm --restore-shared-from ./backups/dashboard-aggregates-pre-rollback/dashboard_daily_aggregates_2026-02-28_2026-03-31_2026-06-08T04-40-39-521Z.json
 *   npm run rollback:6h-dashboard-aggregates -- --from 2026-02-28 --to 2026-03-31 --confirm --rebuild-4h-shared
 */

import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import type { Collection, Document } from 'mongodb';
import * as dotenv from 'dotenv';
import { Logger } from '@nestjs/common';

dotenv.config({ path: join(__dirname, '../.env') });

const logger = new Logger('Rollback6hDashboardAggregates');

const COLLECTION = 'dashboard_daily_aggregates';
const MODE_SCOPED_TYPE = 'equipmentUtilization';
const SHARED_TYPES = [
  'airlineRemarks',
  'airlineRemarksDrill',
  'aircraftAnalysis',
  'performanceReport',
  'performanceDrilldown',
  'ghaImprovement',
  'onTimePerformance',
  'kpiStrip',
] as const;

type CliArgs = {
  fromYmd: string;
  toYmd: string;
  inspect: boolean;
  dryRun: boolean;
  confirm: boolean;
  backupDir: string;
  restoreSharedFrom: string;
  rebuild4hShared: boolean;
};

type AggDoc = {
  _id: unknown;
  date?: string;
  aggregateType?: string;
  equipmentMode?: string;
  generatedAt?: Date | string;
  updatedAt?: Date | string;
  createdAt?: Date | string;
  data?: Record<string, unknown>;
  perf?: Record<string, unknown>;
  isStale?: boolean;
};

type BackupFile = {
  documents?: AggDoc[];
};

function parseYmd(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function enumerateYmdInclusive(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromYmd}T00:00:00`);
  const end = new Date(`${toYmd}T00:00:00`);
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let fromRaw = '';
  let toRaw = '';
  let inspect = false;
  let dryRun = true;
  let confirm = false;
  let backupDir = '';
  let restoreSharedFrom = '';
  let rebuild4hShared = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i + 1]) fromRaw = argv[++i];
    else if (a === '--to' && argv[i + 1]) toRaw = argv[++i];
    else if (a === '--inspect') inspect = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--confirm') {
      confirm = true;
      dryRun = false;
    } else if (a === '--backup' && argv[i + 1]) backupDir = argv[++i];
    else if (a === '--restore-shared-from' && argv[i + 1]) {
      restoreSharedFrom = argv[++i];
    } else if (a === '--rebuild-4h-shared') rebuild4hShared = true;
  }

  const fromYmd = parseYmd(fromRaw) ?? '';
  const toYmd = parseYmd(toRaw) ?? '';
  if (!fromYmd || !toYmd) {
    logger.error(
      'Usage: rollback-6h-dashboard-aggregates --from <date> --to <date> [--inspect] [--dry-run] [--confirm] [--backup <dir>] [--restore-shared-from <json>] [--rebuild-4h-shared]',
    );
    process.exit(2);
  }

  if (!inspect && !backupDir && !confirm && !restoreSharedFrom && !rebuild4hShared) {
    inspect = true;
    dryRun = true;
  }

  return {
    fromYmd,
    toYmd,
    inspect,
    dryRun,
    confirm,
    backupDir,
    restoreSharedFrom,
    rebuild4hShared,
  };
}

function dateRangeFilter(fromYmd: string, toYmd: string) {
  return { date: { $gte: fromYmd, $lte: toYmd } };
}

function delete6hFilter(fromYmd: string, toYmd: string) {
  return {
    ...dateRangeFilter(fromYmd, toYmd),
    equipmentMode: '6h',
  };
}

function countByTypeMode(docs: AggDoc[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) {
    const k = `${d.aggregateType ?? '?'}|${d.equipmentMode ?? ''}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function isEmptyPayload(data: Record<string, unknown> | undefined): boolean {
  if (!data || typeof data !== 'object') return true;
  const keys = Object.keys(data);
  if (keys.length === 0) return true;
  if (data.total !== undefined && Number(data.total) === 0 && keys.length <= 3) return true;
  return false;
}

async function loadDocs(
  coll: Collection<Document>,
  filter: Record<string, unknown>,
): Promise<AggDoc[]> {
  return coll
    .find(filter)
    .sort({ date: 1, aggregateType: 1, equipmentMode: 1 })
    .toArray() as Promise<AggDoc[]>;
}

async function auditRange(
  coll: Collection<Document>,
  fromYmd: string,
  toYmd: string,
  expectedDays: number,
) {
  const allInRange = await loadDocs(coll, dateRangeFilter(fromYmd, toYmd));
  const sixH = await loadDocs(coll, delete6hFilter(fromYmd, toYmd));
  const fourHEquip = await loadDocs(coll, {
    ...dateRangeFilter(fromYmd, toYmd),
    aggregateType: MODE_SCOPED_TYPE,
    equipmentMode: '4h',
  });
  const shared = await loadDocs(coll, {
    ...dateRangeFilter(fromYmd, toYmd),
    equipmentMode: '',
  });

  const sharedByType = countByTypeMode(shared);
  const emptyShared = shared.filter((d) => isEmptyPayload(d.data)).length;
  const missingSharedTypes = SHARED_TYPES.filter((t) => !(sharedByType[`${t}|`] > 0));

  const expectedSharedPerType = expectedDays;
  const expectedFourHEquip = expectedDays;
  const coverageIssues: string[] = [];
  for (const t of SHARED_TYPES) {
    const have = sharedByType[`${t}|`] ?? 0;
    if (have !== expectedSharedPerType) {
      coverageIssues.push(`${t}|"" expected=${expectedSharedPerType} have=${have}`);
    }
  }
  if (fourHEquip.length !== expectedFourHEquip) {
    coverageIssues.push(
      `${MODE_SCOPED_TYPE}|4h expected=${expectedFourHEquip} have=${fourHEquip.length}`,
    );
  }

  const sixHByType = countByTypeMode(sixH);
  const unexpectedSixH = sixH.filter((d) => d.aggregateType !== MODE_SCOPED_TYPE);

  return {
    allInRange,
    sixH,
    fourHEquip,
    shared,
    counts: {
      totalInRange: allInRange.length,
      sixH: sixH.length,
      fourHEquip: fourHEquip.length,
      shared: shared.length,
      emptyShared,
    },
    typeModeCounts: countByTypeMode(allInRange),
    sixHByType,
    sharedByType,
    missingSharedTypes,
    coverageIssues,
    unexpectedSixH,
    overwriteLikely:
      sixH.length > 0 &&
      (emptyShared > 0 || coverageIssues.length > 0 || unexpectedSixH.length > 0),
  };
}

function verifyQuery(fromYmd: string, toYmd: string) {
  return {
    remaining6h: delete6hFilter(fromYmd, toYmd),
    fourHEquipment: {
      ...dateRangeFilter(fromYmd, toYmd),
      aggregateType: MODE_SCOPED_TYPE,
      equipmentMode: '4h',
    },
    shared: {
      ...dateRangeFilter(fromYmd, toYmd),
      equipmentMode: '',
    },
  };
}

async function exportBackup(
  backupDir: string,
  fromYmd: string,
  toYmd: string,
  docs: AggDoc[],
  label: string,
): Promise<string> {
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(
    backupDir,
    `${label}_${fromYmd}_${toYmd}_${stamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        from: fromYmd,
        to: toYmd,
        label,
        count: docs.length,
        deleteFilter: delete6hFilter(fromYmd, toYmd),
        typeModeCounts: countByTypeMode(docs),
        documents: docs,
      },
      null,
      2,
    ),
  );
  return outPath;
}

async function restoreSharedFromBackup(
  coll: Collection<Document>,
  backupPath: string,
  fromYmd: string,
  toYmd: string,
  dryRun: boolean,
): Promise<{ restored: number; skipped6h: number }> {
  const raw = readFileSync(backupPath, 'utf8');
  const parsed = JSON.parse(raw) as BackupFile;
  const docs = (parsed.documents ?? []).filter((d) => {
    const date = String(d.date ?? '');
    if (date < fromYmd || date > toYmd) return false;
    const mode = d.equipmentMode ?? '';
    if (mode === '6h') return false;
    if (d.aggregateType === MODE_SCOPED_TYPE && mode === '4h') return true;
    if (mode === '') return true;
    return false;
  });

  const skipped6h = (parsed.documents ?? []).filter(
    (d) => (d.equipmentMode ?? '') === '6h',
  ).length;

  if (dryRun) {
    logger.log(
      JSON.stringify({
        event: 'restore_shared_dry_run',
        backupPath,
        wouldRestore: docs.length,
        skipped6hInBackup: skipped6h,
        byType: countByTypeMode(docs),
      }),
    );
    return { restored: docs.length, skipped6h };
  }

  let restored = 0;
  for (const d of docs) {
    const filter = {
      date: String(d.date),
      aggregateType: d.aggregateType,
      equipmentMode: d.equipmentMode ?? '',
    };
    const { _id, createdAt, updatedAt, ...rest } = d;
    await coll.replaceOne(
      filter,
      { ...rest, ...filter, generatedAt: d.generatedAt ?? new Date() },
      { upsert: true },
    );
    restored += 1;
  }

  return { restored, skipped6h };
}

function runRebuild4hShared(fromYmd: string, toYmd: string): void {
  const cmd = `npm run rebuild:dashboard-aggregates -- --from ${fromYmd} --to ${toYmd} --mode 4h`;
  logger.log(JSON.stringify({ event: 'rollback_6h_rebuild_4h_shared_spawn', cmd }));
  execSync(cmd, { cwd: join(__dirname, '..'), stdio: 'inherit' });
}

async function main(): Promise<void> {
  const args = parseArgs();
  const expectedDays = enumerateYmdInclusive(args.fromYmd, args.toYmd).length;

  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI in .env');
    process.exit(2);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(2);
  }
  const coll = db.collection(COLLECTION);

  try {
    const audit = await auditRange(coll, args.fromYmd, args.toYmd, expectedDays);

    if (args.inspect || args.dryRun) {
      logger.log(
        JSON.stringify(
          {
            event: 'rollback_6h_audit',
            from: args.fromYmd,
            to: args.toYmd,
            expectedDays,
            dryRun: args.dryRun && !args.confirm,
            counts: audit.counts,
            typeModeCounts: audit.typeModeCounts,
            sixHByType: audit.sixHByType,
            sharedByType: audit.sharedByType,
            missingSharedTypes: audit.missingSharedTypes,
            coverageIssues: audit.coverageIssues,
            unexpectedSixHTypes: audit.unexpectedSixH.map(
              (d) => `${d.date}|${d.aggregateType}`,
            ),
            overwriteLikely: audit.overwriteLikely,
            deleteFilter: delete6hFilter(args.fromYmd, args.toYmd),
            rootCause:
              '6h rebuild upserts shared keys with equipmentMode "" (overwrite). Only equipmentUtilization|6h rows are unique 6h inserts.',
            recoveryHint: audit.overwriteLikely
              ? 'After deleting 6h rows, run --restore-shared-from <pre-6h-backup.json> OR --rebuild-4h-shared --confirm'
              : 'Delete 6h rows only; shared shards appear intact.',
          },
          null,
          2,
        ),
      );
    }

    let backupPath = '';
    if (args.backupDir && audit.sixH.length > 0) {
      backupPath = await exportBackup(
        args.backupDir,
        args.fromYmd,
        args.toYmd,
        audit.sixH,
        'dashboard_daily_aggregates_6h_delete_targets',
      );
      logger.log(JSON.stringify({ event: 'rollback_6h_backup', path: backupPath }));
    } else if (args.backupDir) {
      logger.warn('No equipmentMode=6h documents to back up in range');
    }

    let deletedCount = 0;
    if (args.confirm) {
      if (audit.sixH.length === 0) {
        logger.warn('No equipmentMode=6h documents to delete');
      } else {
        const result = await coll.deleteMany(delete6hFilter(args.fromYmd, args.toYmd));
        deletedCount = result.deletedCount ?? 0;
        logger.log(
          JSON.stringify({
            event: 'rollback_6h_delete',
            deleteQuery: delete6hFilter(args.fromYmd, args.toYmd),
            deletedCount,
            deletedByType: audit.sixHByType,
          }),
        );
      }
    } else if (audit.sixH.length > 0) {
      logger.log(
        JSON.stringify({
          event: 'rollback_6h_delete_dry_run',
          wouldDelete: audit.sixH.length,
          deleteQuery: delete6hFilter(args.fromYmd, args.toYmd),
          deletedByType: audit.sixHByType,
        }),
      );
    }

    if (args.restoreSharedFrom) {
      const restore = await restoreSharedFromBackup(
        coll,
        args.restoreSharedFrom,
        args.fromYmd,
        args.toYmd,
        args.dryRun && !args.confirm,
      );
      logger.log(JSON.stringify({ event: 'rollback_6h_restore_shared', ...restore }));
    }

    if (args.rebuild4hShared && args.confirm) {
      await mongoose.disconnect();
      runRebuild4hShared(args.fromYmd, args.toYmd);
      await mongoose.connect(uri);
    } else if (args.rebuild4hShared && !args.confirm) {
      logger.log(
        JSON.stringify({
          event: 'rollback_6h_rebuild_4h_shared_dry_run',
          note: 'Pass --confirm with --rebuild-4h-shared to run npm run rebuild:dashboard-aggregates --mode 4h',
        }),
      );
    }

    const post = await auditRange(coll, args.fromYmd, args.toYmd, expectedDays);
    const vq = verifyQuery(args.fromYmd, args.toYmd);
    const remaining6h = await coll.countDocuments(vq.remaining6h);
    const fourHEquip = await coll.countDocuments(vq.fourHEquipment);
    const shared = await coll.countDocuments(vq.shared);

    logger.log(
      JSON.stringify(
        {
          event: 'rollback_6h_verify',
          backupPath: backupPath || null,
          deletedCount,
          verificationQueries: vq,
          remaining6h,
          fourHEquipmentDocs: fourHEquip,
          sharedDocs: shared,
          expectedFourHEquipment: expectedDays,
          expectedSharedDocs: expectedDays * SHARED_TYPES.length,
          fourHSurvived: fourHEquip >= expectedDays,
          sharedCoverageOk:
            post.coverageIssues.length === 0 && post.counts.emptyShared === 0,
          postTypeModeCounts: post.typeModeCounts,
          dashboardReady:
            remaining6h === 0 &&
            fourHEquip >= expectedDays &&
            post.coverageIssues.length === 0 &&
            post.counts.emptyShared === 0,
        },
        null,
        2,
      ),
    );

    if (audit.overwriteLikely && !args.restoreSharedFrom && !args.rebuild4hShared) {
      logger.warn(
        'Shared aggregates may still be corrupted after 6h delete-only rollback. Re-run with --restore-shared-from <backup.json> or --rebuild-4h-shared --confirm',
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
