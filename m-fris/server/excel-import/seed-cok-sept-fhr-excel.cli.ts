/**
 * CLI: seed Cochin (COK) August–September 2026 scheduled flights into fhr_collection.
 *
 * Workbook: `data/COK_SEPT_SKD-FLIGHTS_2026.xlsx` (sheet `Customers`).
 * Row-1 headers are flat FHR keys plus Cochin aliases (`STATIME`, `FlightCancelled`,
 * `Freighter`, `delaycode31`). Every upsert stamps `stationCode: COK`.
 * STA spans 2026-08-01 .. 2026-09-30 (2,375 serials). The window includes that
 * full range so no serial is dropped.
 *
 * Usage (from BWMS/apps/api, MONGO_URI in .env):
 *   npm run seed:cok-sept-fhr:dry-run
 *   npm run seed:cok-sept-fhr:import
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaExcelImportService } from './maa-excel-import.service';

const cliLogger = new Logger('SeedCokSeptFhrExcelCli');

const STATION_CODE = 'COK';
/** Inclusive STA window covering every row in the workbook. */
const DEFAULT_FROM = '2026-08-01';
const DEFAULT_TO = '2026-09-30';
const DEFAULT_SHEET = 'Customers';

/** `dist/excel-import` → `BWMS/apps/api/data/COK_SEPT_SKD-FLIGHTS_2026.xlsx` */
const DEFAULT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'COK_SEPT_SKD-FLIGHTS_2026.xlsx',
);

function readArg(flag: string): string | null {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

function resolveWorkbookPath(): string {
  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) return first;
  return DEFAULT_WORKBOOK;
}

async function bootstrap() {
  const filePath = resolveWorkbookPath();
  const dryRun = process.argv.includes('--dry-run');
  const fromYmd = readArg('--from') ?? DEFAULT_FROM;
  const toYmd = readArg('--to') ?? DEFAULT_TO;
  const sheetName = readArg('--sheet') ?? DEFAULT_SHEET;

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Place COK_SEPT_SKD-FLIGHTS_2026.xlsx under BWMS/apps/api/data/ or pass a path.',
        '  npm run seed:cok-sept-fhr:dry-run',
        '  npm run seed:cok-sept-fhr:import',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  cliLogger.log(
    `Station: ${STATION_CODE} | sheet: ${sheetName} | STA window: ${fromYmd} .. ${toYmd}`,
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
      skipIfFhrComplete: false,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0) process.exitCode = 1;
    if (res.skippedRows > 0) {
      cliLogger.error(
        `COK seed skipped ${res.skippedRows} row(s). Expected 0 — every serial must be written.`,
      );
      process.exitCode = 1;
    }
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `COK seed complete — ${res.flightsProcessed} flights written (stationCode=${STATION_CODE}).`,
      );
      cliLogger.log(
        'Next: npm run rebuild:dashboard-aggregates -- --from 2026-08-01 --to 2026-09-30 --station COK --mode 4h --bust-cache',
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
