/**
 * CLI: seed Delhi (DEL) September 2026 scheduled equipment into
 * `fhr_collection.equipmentDetails[]`.
 *
 * Workbook: `data/DEL_SKD_EQUIP-SEPT-2026.xls` (sheet `Sheet1`).
 * Matches existing flights by Serial Number and stamps equipment only when
 * `stationCode` is DEL. Displayed STD dates are read as dd/mm/yyyy.
 * Equipment No values are stored as billing full names for the GSE report.
 *
 * Usage (from `BWMS/apps/api/`, MONGO_URI in `.env`):
 *   npm run seed:del-sept-equipment:dry-run
 *   npm run seed:del-sept-equipment:import
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ScheduledEquipmentImportService } from './scheduled-equipment-import.service';

const cliLogger = new Logger('SeedDelSeptEquipmentExcelCli');

const STATION_CODE = 'DEL';
const DEFAULT_FROM = '2026-09-01';
const DEFAULT_TO = '2026-09-30';
const DEFAULT_SHEET = 'Sheet1';

const DEFAULT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'DEL_SKD_EQUIP-SEPT-2026.xls',
);

function readArg(flag: string): string | null {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

function readOnlySerials(): number[] | null {
  const raw = readArg('--only-serials');
  if (!raw) return null;
  const serials = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return serials.length > 0 ? [...new Set(serials)] : null;
}

function resolveWorkbookPath(): string {
  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) return first;
  return DEFAULT_WORKBOOK;
}

async function bootstrap() {
  const filePath = resolveWorkbookPath();
  const dryRun = process.argv.includes('--dry-run');
  const append = process.argv.includes('--append');
  const strict = process.argv.includes('--strict');
  const allowCreateFlight = process.argv.includes('--allow-create-flight');
  const sheetName = readArg('--sheet') || DEFAULT_SHEET;
  const fromYmd = readArg('--from') || DEFAULT_FROM;
  const toYmd = readArg('--to') || DEFAULT_TO;
  const onlySerials = readOnlySerials();

  if (!existsSync(filePath)) {
    cliLogger.error(`Workbook not found: ${filePath}`);
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  cliLogger.log(
    `Station: ${STATION_CODE} | sheet: ${sheetName} | STD Date: ${fromYmd} … ${toYmd}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(ScheduledEquipmentImportService);
    const res = await svc.importFromFilePath(filePath, {
      dryRun,
      append,
      strict,
      allowCreateFlight,
      sheetName,
      station: STATION_CODE,
      lookupStation: STATION_CODE,
      fromYmd,
      toYmd,
      onlySerials,
      preferDisplayedDmyDates: true,
    });
    cliLogger.log(JSON.stringify(res, null, 2));

    const unexpectedRowErrors = res.rowErrors.filter(
      (e) => !/no fhr_collection document found/i.test(e.message),
    );
    if (unexpectedRowErrors.length > 0 || res.rowsSkippedOutOfRange > 0) {
      process.exitCode = 1;
    } else if (res.flightsSkippedNotFound > 0) {
      cliLogger.warn(
        `Skipped ${res.flightsSkippedNotFound} serial(s) with no DEL fhr_collection doc.`,
      );
    }

    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `DEL Sept equipment seed complete — ${res.flightsProcessed} flights, ${res.equipmentLinesWritten} equipment lines (stationCode=${STATION_CODE}).`,
      );
      cliLogger.log(
        'Next: npm run rebuild:dashboard-aggregates -- --from 2026-09-01 --to 2026-09-30 --station DEL --mode 4h --bust-cache',
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
