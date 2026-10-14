/**
 * CLI: seed Hyderabad (HYD) August 2026 RAF flights + equipment usage.
 *
 * Workbook: `data/raf_hyd_aug_2026.xlsx` (convert from HTML `.xls` first if needed).
 * Every upsert stamps `stationCode: HYD` so billed-services RAF only shows for HYD.
 *
 * Usage (from BWMS/apps/api, MONGO_URI in .env):
 *   npm run seed:hyd-raf-aug:dry-run
 *   npm run seed:hyd-raf-aug:import
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaRafExcelSeedService } from './maa-raf-excel-seed.service';

const cliLogger = new Logger('SeedHydRafAugExcelCli');

const STATION_CODE = 'HYD';
const DEFAULT_FROM = '2026-08-01';
const DEFAULT_TO = '2026-08-31';

const DEFAULT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'raf_hyd_aug_2026.xlsx',
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
  const sheetName = readArg('--sheet');

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Convert HTML dump first, then re-run:',
        '  node scripts/convert-raf-hyd-aug-html.js',
        '  npm run seed:hyd-raf-aug:dry-run',
        '  npm run seed:hyd-raf-aug:import',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  cliLogger.log(
    `Station: ${STATION_CODE} | STD window: ${fromYmd} .. ${toYmd}`,
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
      station: STATION_CODE,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0) process.exitCode = 1;
    if (
      res.skippedOutsideWindow > 0 ||
      res.unresolvedEquipmentCodes.length > 0
    ) {
      cliLogger.warn(
        `Window skips=${res.skippedOutsideWindow}; unresolved codes=${res.unresolvedEquipmentCodes.join(',') || 'none'}`,
      );
    }
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `HYD RAF Aug seed complete — ${res.creationInserted} created, ${res.creationUpdated} updated, ${res.equipmentLines} equipment lines, stationCode=${STATION_CODE}.`,
      );
    }
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
