/**
 * CLI: seed Delhi (DEL) August 2026 scheduled flights into fhr_collection.
 *
 * Workbook: `data/DEL-AUG-2026-SKD-FLIGHTS.xlsx` (sheet `Customers`, row-1
 * schema-key headers — same layout as MAA/HYD Aug SKD export). Every upsert
 * stamps `stationCode: DEL` so rows only appear for Delhi (dashboard, flights,
 * billing ADS/BHS/RAF, FHR / GSE / Teams reports).
 *
 * Usage (from BWMS/apps/api, MONGO_URI in .env):
 *   npm run seed:del-aug-fhr:dry-run
 *   npm run seed:del-aug-fhr:import
 *   npm run seed:del-aug-fhr -- --from=2026-07-31 --to=2026-08-31
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaExcelImportService } from './maa-excel-import.service';

const cliLogger = new Logger('SeedDelAugFhrExcelCli');

const STATION_CODE = 'DEL';
/**
 * Inclusive STA window. Starts 2026-07-31 so overnight STA=31/07 STD=01/08
 * rows in the Aug workbook are not dropped by `rowStaDateInRange` (STA-first).
 */
const DEFAULT_FROM = '2026-07-31';
const DEFAULT_TO = '2026-08-31';
const DEFAULT_SHEET = 'Customers';

/** `dist/excel-import` → `BWMS/apps/api/data/DEL-AUG-2026-SKD-FLIGHTS.xlsx` */
const DEFAULT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'DEL-AUG-2026-SKD-FLIGHTS.xlsx',
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
        'Place DEL-AUG-2026-SKD-FLIGHTS.xlsx under BWMS/apps/api/data/ or pass a path.',
        '  npm run seed:del-aug-fhr:dry-run',
        '  npm run seed:del-aug-fhr:import',
        '  npm run seed:del-aug-fhr -- data/DEL-AUG-2026-SKD-FLIGHTS.xlsx --dry-run',
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
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `DEL Aug seed complete — ${res.flightsProcessed} flights written (stationCode=${STATION_CODE}).`,
      );
      cliLogger.log(
        'Next: npm run rebuild:dashboard-aggregates -- --from 2026-08-01 --to 2026-08-31 --station DEL --mode 4h --bust-cache',
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
