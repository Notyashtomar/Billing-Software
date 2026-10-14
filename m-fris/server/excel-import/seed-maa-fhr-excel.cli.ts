console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * CLI: seed MAA flat FHR workbook (single sheet, schema-key headers) into MongoDB.
 *
 * Upserts mainDetails, terminalDetails, rampDetails1, loadControlDetails, remarks
 * for station MAA — each save mirrors into `fhr_collection`.
 *
 * Default workbook: `server/data/seedingof3months.xlsx`
 * July 2026: `server/data/maa-ixc-july-data.xlsx` (sheet `maa`, row-1 display headers)
 *
 * Usage (after build, from `server/`):
 *   npm run seed:maa-fhr:dry-run
 *   npm run seed:maa-fhr:import
 *   npm run seed:maa-fhr-july:dry-run
 *   npm run seed:maa-fhr-july:import
 *   npm run seed:maa-fhr -- --dry-run --from=2026-04-01 --to=2026-06-30
 *   npm run seed:maa-fhr -- data/other.xlsx --dry-run
 *
 * Re-seed specific rows only (bypasses the STA date window for these `slNo`s):
 *   npm run seed:maa-fhr -- --dry-run --only-serials=17632,17655,17656
 *   npm run seed:maa-fhr:missed-mar31:dry-run
 *   npm run seed:maa-fhr:missed-mar31:import
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaExcelImportService } from './maa-excel-import.service';

const cliLogger = new Logger('SeedMaaFhrExcelCli');

/** `dist/excel-import` → `server/data/seedingof3months.xlsx` */
const DEFAULT_MAA_FHR_SEED_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'seedingof3months.xlsx',
);

const DEFAULT_MAA_JULY_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'maa-ixc-july-data.xlsx',
);

type MaaSeedProfile = {
  workbook: string;
  sheetName?: string;
  defaultFromYmd?: string;
  defaultToYmd?: string;
  skipIfFhrComplete?: boolean;
};

const MAA_PROFILES: Record<'default' | 'july', MaaSeedProfile> = {
  default: {
    workbook: DEFAULT_MAA_FHR_SEED_WORKBOOK,
  },
  july: {
    workbook: DEFAULT_MAA_JULY_WORKBOOK,
    sheetName: 'maa',
    defaultFromYmd: '2026-07-01',
    defaultToYmd: '2026-07-31',
    skipIfFhrComplete: false,
  },
};

function readArg(flag: string): string | null {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

/** Parses `--only-serials=17632,17655,17656` into a de-duplicated number list. */
function readOnlySerials(): number[] | null {
  const raw = readArg('--only-serials');
  if (!raw) return null;
  const serials = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return serials.length > 0 ? [...new Set(serials)] : null;
}

function resolveProfile(): MaaSeedProfile {
  const profileArg = readArg('--profile')?.toLowerCase();
  if (profileArg === 'july' || process.argv.includes('--july')) {
    return MAA_PROFILES.july;
  }
  if (profileArg === 'default') {
    return MAA_PROFILES.default;
  }

  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) {
    const lower = first.toLowerCase();
    if (lower.includes('july') && lower.includes('maa')) return MAA_PROFILES.july;
    if (lower.includes('maa-ixc-july')) return MAA_PROFILES.july;
  }

  return MAA_PROFILES.default;
}

function resolveWorkbookPath(profile: MaaSeedProfile): string {
  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) {
    return first;
  }
  return profile.workbook;
}

async function bootstrap() {
  const profile = resolveProfile();
  const filePath = resolveWorkbookPath(profile);
  const dryRun = process.argv.includes('--dry-run');
  const fromYmd = readArg('--from') ?? profile.defaultFromYmd ?? null;
  const toYmd = readArg('--to') ?? profile.defaultToYmd ?? null;
  const sheetName = readArg('--sheet') ?? profile.sheetName ?? undefined;
  const onlySerials = readOnlySerials();

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Place the file at server/data/seedingof3months.xlsx or pass a path:',
        '  npm run seed:maa-fhr -- data/seedingof3months.xlsx --dry-run',
        '',
        'Options:',
        '  --dry-run              Parse and validate only (no MongoDB writes)',
        '  --from=YYYY-MM-DD      Inclusive STA date filter (staDate / stdDate)',
        '  --to=YYYY-MM-DD        Inclusive STA date filter',
        '  --sheet=Sheet1         Worksheet name (default: Sheet1 or first tab)',
        '  --only-serials=a,b,c   Only import these slNo values (bypasses the STA date filter for them)',
        '',
        'After a successful import:',
        '  npm run backfill:staDates',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  if (sheetName) cliLogger.log(`Sheet: ${sheetName}`);
  if (fromYmd || toYmd) {
    cliLogger.log(`STA window: ${fromYmd ?? '…'} .. ${toYmd ?? '…'}`);
  }
  if (onlySerials) {
    cliLogger.log(
      `Whitelist mode: only slNo ∈ {${onlySerials.join(', ')}} (STA date filter bypassed for these).`,
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(MaaExcelImportService);
    const res = await svc.importFlatSheetFromFilePath(filePath, {
      dryRun,
      fromYmd,
      toYmd,
      sheetName: sheetName ?? undefined,
      onlySerials,
      skipIfFhrComplete: profile.skipIfFhrComplete ?? false,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `MAA seed complete — ${res.flightsProcessed} flights written to fhr_collection (stationCode=${res.stationCode}, skippedComplete=${res.skippedCompleteRows}).`,
      );
    } else if (!dryRun && res.skippedCompleteRows > 0 && res.flightsProcessed === 0) {
      cliLogger.log(
        `MAA seed complete — all ${res.skippedCompleteRows} matching flights already had complete FHR data (stationCode=${res.stationCode}).`,
      );
    }
    if (!dryRun && res.flightsProcessed > 0 && !profile.skipIfFhrComplete) {
      cliLogger.log(
        'Next step: npm run backfill:staDates  (indexes staDates on fhr_collection for date-window queries)',
      );
    }
    if (res.rowErrors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    try {
      await app.close();
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const msg = err instanceof Error ? err.message : String(err);
      if (name === 'MongoClientClosedError' || /client was closed/i.test(msg)) {
        cliLogger.warn(`Ignored Mongo shutdown race: ${msg}`);
      } else {
        throw err;
      }
    }
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
