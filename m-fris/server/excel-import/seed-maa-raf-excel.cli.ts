/**
 * CLI: seed MAA (Chennai) RAF flights + equipment usage from Excel.
 *
 * Workbooks:
 *   Mar–Jul: `data/MAA_RAF_MARCH-JULY.xlsx` (default window 2026-03-01 .. 2026-07-31)
 *   August:  `data/raf_maa_august_2026.xlsx` (window 2026-08-01 .. 2026-08-31)
 *
 * Usage (from BWMS/apps/api, MONGO_URI in .env):
 *   npm run seed:maa-raf:dry-run
 *   npm run seed:maa-raf
 *   npm run seed:maa-raf-aug:dry-run
 *   npm run seed:maa-raf-aug:import
 *   npm run seed:maa-raf -- --from=2026-03-01 --to=2026-07-31
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaRafExcelSeedService } from './maa-raf-excel-seed.service';

const cliLogger = new Logger('SeedMaaRafExcelCli');

const DEFAULT_MARCH_JULY_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'MAA_RAF_MARCH-JULY.xlsx',
);

const DEFAULT_AUG_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'raf_maa_august_2026.xlsx',
);

type RafSeedProfile = {
  workbook: string;
  fromYmd: string;
  toYmd: string;
  label: string;
};

function readArg(flag: string): string | null {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

function resolveProfile(): RafSeedProfile {
  const profileArg = readArg('--profile')?.toLowerCase();
  if (
    profileArg === 'aug' ||
    profileArg === 'august' ||
    process.argv.includes('--aug')
  ) {
    return {
      workbook: DEFAULT_AUG_WORKBOOK,
      fromYmd: '2026-08-01',
      toYmd: '2026-08-31',
      label: 'aug',
    };
  }

  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) {
    const lower = first.toLowerCase();
    if (lower.includes('raf_maa_august') || lower.includes('aug-maa-raf')) {
      return {
        workbook: first,
        fromYmd: '2026-08-01',
        toYmd: '2026-08-31',
        label: 'aug',
      };
    }
  }

  return {
    workbook: DEFAULT_MARCH_JULY_WORKBOOK,
    fromYmd: '2026-03-01',
    toYmd: '2026-07-31',
    label: 'mar-jul',
  };
}

function resolveWorkbookPath(profile: RafSeedProfile): string {
  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) return first;
  return profile.workbook;
}

async function bootstrap() {
  const profile = resolveProfile();
  const filePath = resolveWorkbookPath(profile);
  const dryRun = process.argv.includes('--dry-run');
  const fromYmd = readArg('--from') ?? profile.fromYmd;
  const toYmd = readArg('--to') ?? profile.toYmd;
  const sheetName = readArg('--sheet');
  const station = readArg('--station') ?? 'MAA';

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Place the file under BWMS/apps/api/data/ or pass a path.',
        '  npm run seed:maa-raf:dry-run',
        '  npm run seed:maa-raf-aug:dry-run',
        '',
        'Note: HTML table exports named *.xls must be converted to .xlsx first',
        '(see scripts/convert-raf-maa-aug-html.js).',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  cliLogger.log(
    `Profile: ${profile.label} | Station: ${station} | window: ${fromYmd} .. ${toYmd}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(MaaRafExcelSeedService);
    const res = await svc.importFromFilePath(filePath, {
      dryRun,
      fromYmd,
      toYmd,
      sheetName: sheetName ?? undefined,
      station,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0) process.exitCode = 1;
    if (res.skippedOutsideWindow > 0 || res.unresolvedEquipmentCodes.length > 0) {
      cliLogger.warn(
        `Window skips=${res.skippedOutsideWindow}; unresolved codes=${res.unresolvedEquipmentCodes.join(',') || 'none'}`,
      );
    }
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `MAA RAF seed complete — ${res.creationInserted} created, ${res.creationUpdated} updated, ${res.equipmentLines} equipment lines, stationCode=${station}.`,
      );
    }
    // Fail hard if any equipment row was dropped outside the window (critical for billing).
    if (!dryRun && res.skippedOutsideWindow > 0) {
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
