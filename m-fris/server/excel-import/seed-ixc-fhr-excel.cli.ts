console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * CLI: seed Chandigarh (IXC) scheduled FHR workbook into MongoDB.
 *
 * Workbook layouts:
 *   May–June (`Chandigarh_may-june-skd-flights.xlsx`, sheet `Sheet1 (2)`):
 *     - Row 3 = schema keys, row 5 = display headers, row 6+ = data
 *   July (`maa-ixc-july-data.xlsx`, sheet `ixc`):
 *     - Row 3 = schema keys, row 2 = display headers, row 6+ = data
 *
 * Every upsert stamps `stationCode: IXC` on form collections and mirrors into
 * `fhr_collection`, so rows only appear when logged into Chandigarh.
 *
 * Usage (after build, from `server/`):
 *   npm run seed:ixc-fhr:dry-run
 *   npm run seed:ixc-fhr:import
 *   npm run seed:ixc-fhr-july:dry-run
 *   npm run seed:ixc-fhr-july:import
 *   npm run seed:ixc-fhr -- --dry-run --from=2026-07-01 --to=2026-07-31 data/maa-ixc-july-data.xlsx --sheet=ixc
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaExcelImportService } from './maa-excel-import.service';

const cliLogger = new Logger('SeedIxcFhrExcelCli');

const DEFAULT_IXC_MAY_JUNE_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'Chandigarh_may-june-skd-flights.xlsx',
);

const DEFAULT_IXC_JULY_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'maa-ixc-july-data.xlsx',
);

const STATION_CODE = 'IXC';

type IxcSeedProfile = {
  workbook: string;
  sheetName: string;
  schemaKeyRow: number;
  displayHeaderRow: number;
  dataStartRow: number;
  defaultFromYmd: string;
  defaultToYmd: string;
};

const IXC_PROFILES: Record<'may-june' | 'july', IxcSeedProfile> = {
  'may-june': {
    workbook: DEFAULT_IXC_MAY_JUNE_WORKBOOK,
    sheetName: 'Sheet1 (2)',
    schemaKeyRow: 3,
    displayHeaderRow: 5,
    dataStartRow: 6,
    defaultFromYmd: '2026-05-01',
    defaultToYmd: '2026-06-30',
  },
  july: {
    workbook: DEFAULT_IXC_JULY_WORKBOOK,
    sheetName: 'ixc',
    schemaKeyRow: 3,
    displayHeaderRow: 2,
    dataStartRow: 6,
    defaultFromYmd: '2026-07-01',
    defaultToYmd: '2026-07-31',
  },
};

function readArg(flag: string): string | null {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

function resolveProfile(): IxcSeedProfile {
  const profileArg = readArg('--profile')?.toLowerCase();
  if (profileArg === 'july' || process.argv.includes('--july')) {
    return IXC_PROFILES.july;
  }
  if (profileArg === 'may-june') {
    return IXC_PROFILES['may-june'];
  }

  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) {
    const lower = first.toLowerCase();
    if (lower.includes('july')) return IXC_PROFILES.july;
    if (lower.includes('may-june') || lower.includes('chandigarh')) {
      return IXC_PROFILES['may-june'];
    }
  }

  return IXC_PROFILES['may-june'];
}

function resolveWorkbookPath(profile: IxcSeedProfile): string {
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
  const fromYmd = readArg('--from') || profile.defaultFromYmd;
  const toYmd = readArg('--to') || profile.defaultToYmd;
  const sheetName = readArg('--sheet') || profile.sheetName;

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Place the file under server/data/ or pass a path:',
        '  npm run seed:ixc-fhr-july -- data/maa-ixc-july-data.xlsx --dry-run',
        '',
        'Options:',
        '  --dry-run              Parse and validate only (no MongoDB writes)',
        '  --from=YYYY-MM-DD      Inclusive STA date filter (staDate / stdDate)',
        '  --to=YYYY-MM-DD        Inclusive STA date filter',
        '  --sheet=ixc            Worksheet name',
        '  --profile=july         July 2026 IXC seed defaults',
        '  --july                 Shorthand for --profile=july',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  cliLogger.log(
    `Station: ${STATION_CODE} | sheet: ${sheetName} | window: ${fromYmd}..${toYmd}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(MaaExcelImportService);
    const res = await svc.importFlatSheetFromFilePath(filePath, {
      dryRun,
      fromYmd,
      toYmd,
      sheetName,
      stationCode: STATION_CODE,
      schemaKeyRow: profile.schemaKeyRow,
      displayHeaderRow: profile.displayHeaderRow,
      dataStartRow: profile.dataStartRow,
      skipIfFhrComplete: true,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0) {
      process.exitCode = 1;
    }
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `IXC seed complete — ${res.flightsProcessed} flights written to fhr_collection (stationCode=${STATION_CODE}, skippedComplete=${res.skippedCompleteRows}).`,
      );
    } else if (!dryRun && res.skippedCompleteRows > 0) {
      cliLogger.log(
        `IXC seed complete — all ${res.skippedCompleteRows} matching flights already had complete FHR data (stationCode=${STATION_CODE}).`,
      );
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
