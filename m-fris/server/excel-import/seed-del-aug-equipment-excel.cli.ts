/**
 * CLI: seed Delhi (DEL) August 2026 scheduled equipment into
 * `fhr_collection.equipmentDetails[]`.
 *
 * Workbook: `data/DEL-EQP-DATA-AUG-2026.xls` (sheet `Sheet1`) — GSE export layout
 * matching MAA/HYD scheduled equipment columns. Only writes equipment lines onto
 * Serial Numbers that already exist in `fhr_collection` with `stationCode: DEL`
 * (no bare-flight create). Overnight STD=31/07 rows are included via the default
 * date window. Equipment No short codes expand to billing-trackable full names.
 *
 * Surfaces after seed:
 *   - GSE report (Scheduled FHR/GSE) — reads `equipmentDetails`
 *   - Billing → ADS / Equipment / Manpower — DEL is FHR-backed (not ads_usage_data)
 *
 * Usage (from `BWMS/apps/api/`, MONGO_URI in `.env`):
 *   npm run seed:del-aug-equipment:dry-run
 *   npm run seed:del-aug-equipment:import
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { resolveDelhiScheduledEquipmentName } from './delhi-equipment-name-map';
import { ScheduledEquipmentImportService } from './scheduled-equipment-import.service';

const cliLogger = new Logger('SeedDelAugEquipmentExcelCli');

const STATION_CODE = 'DEL';
/** Inclusive STD Date window — includes overnight STD=31/07 ATD=01/08 rows. */
const DEFAULT_FROM = '2026-07-31';
const DEFAULT_TO = '2026-08-31';
const DEFAULT_SHEET = 'Sheet1';

/** `dist/excel-import` → `BWMS/apps/api/data/DEL-EQP-DATA-AUG-2026.xls` */
const DEFAULT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'DEL-EQP-DATA-AUG-2026.xls',
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
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Place DEL-EQP-DATA-AUG-2026.xls under BWMS/apps/api/data/ or pass a path:',
        '  npm run seed:del-aug-equipment -- data/DEL-EQP-DATA-AUG-2026.xls --dry-run',
        '',
        'Prerequisites: seed DEL Aug FHR first (`npm run seed:del-aug-fhr:import`).',
        '',
        'Options:',
        '  --dry-run                Parse and validate only (no MongoDB writes)',
        '  --sheet=Sheet1           Worksheet name',
        '  --from=YYYY-MM-DD        Inclusive STD Date filter (default 2026-07-31)',
        '  --to=YYYY-MM-DD          Inclusive STD Date filter (default 2026-08-31)',
        '  --append                 Merge onto existing equipmentDetails instead of replacing',
        '  --strict                 Skip flights whose match keys mismatch',
        '  --allow-create-flight    Create bare fhr_collection when Serial Number missing (off by default)',
        '  --only-serials=a,b,c     Only import these Serial Number values',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  cliLogger.log(
    `Station: ${STATION_CODE} | sheet: ${sheetName} | STD Date: ${fromYmd} … ${toYmd}`,
  );
  if (onlySerials) {
    cliLogger.log(`Whitelist mode: only Serial Number ∈ {${onlySerials.join(', ')}}.`);
  }
  if (allowCreateFlight) {
    cliLogger.warn(
      'allowCreateFlight is ON — prefer seeding FHR first so only existing DEL serials get equipment.',
    );
  }

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
      resolveEquipmentName: resolveDelhiScheduledEquipmentName,
    });
    cliLogger.log(JSON.stringify(res, null, 2));

    const unexpectedRowErrors = res.rowErrors.filter(
      (e) => !/no fhr_collection document found/i.test(e.message),
    );
    if (unexpectedRowErrors.length > 0) {
      process.exitCode = 1;
    } else if (res.flightsSkippedNotFound > 0) {
      cliLogger.warn(
        `Skipped ${res.flightsSkippedNotFound} serial(s) with no DEL fhr_collection doc (expected when workbook has serials outside the FHR seed window).`,
      );
    }

    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `DEL Aug equipment seed complete — ${res.flightsProcessed} flights, ${res.equipmentLinesWritten} equipment lines (stationCode=${STATION_CODE}).`,
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
