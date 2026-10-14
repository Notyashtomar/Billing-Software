/**
 * CLI: seed Hyderabad (HYD) July 2026 scheduled flights into fhr_collection.
 *
 * Workbook: `data/HYD_july_skd_flights.xls` (row 1 display headers).
 * Every upsert stamps `stationCode: HYD` so rows only appear for Hyderabad.
 *
 * Usage (from BWMS/apps/api, MONGO_URI in .env):
 *   npm run seed:hyd-fhr:dry-run
 *   npm run seed:hyd-fhr:import
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { HydJulyFhrSeedService } from './hyd-july-fhr-seed.service';

const cliLogger = new Logger('SeedHydFhrExcelCli');

const DEFAULT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'HYD_july_skd_flights.xls',
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
  const fromYmd = readArg('--from');
  const toYmd = readArg('--to');
  const sheetName = readArg('--sheet');

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Place HYD_july_skd_flights.xls under BWMS/apps/api/data/ or pass a path.',
        '  npm run seed:hyd-fhr:dry-run',
        '  npm run seed:hyd-fhr:import',
        '  npm run seed:hyd-fhr -- --from=2026-06-30 --to=2026-07-31',
      ].join('\n'),
    );
    process.exit(1);
  }

  const stationCode = (readArg('--station') ?? 'HYD').toUpperCase();

  cliLogger.log(`Using workbook: ${filePath}`);
  cliLogger.log(
    `Station: ${stationCode} | window: ${fromYmd ?? 'workbook'} .. ${toYmd ?? 'workbook'}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(HydJulyFhrSeedService);
    const res = await svc.importFromFilePath(filePath, {
      dryRun,
      fromYmd,
      toYmd,
      sheetName: sheetName ?? undefined,
      stationCode,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0) process.exitCode = 1;
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `HYD seed complete — ${res.inserted} inserted, ${res.updated} updated, stationCode=${stationCode}.`,
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
