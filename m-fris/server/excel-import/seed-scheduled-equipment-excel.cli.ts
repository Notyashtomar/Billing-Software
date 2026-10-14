/**
 * CLI: seed the "Scheduled equipment data" workbook into `fhr_collection.equipmentDetails[]` for MAA.
 *
 * Workbook layouts:
 *   Apr–Jun (`maa-equipment-april-june.xlsx`, sheet `Sheet1`): all STD dates
 *   July GSE (`maa-ixc-gse-july.xlsb`, sheet `maa-gse`): STD Date 2026-07-01 … 2026-07-31
 *   July 31 (`maa-31st-july-equip_data.xlsb`, sheet `Recovered_Sheet1`): STD Date 2026-07-31
 *   August (`equip-data-aug-maa-2026.xlsx`, sheet `Sheet1`): STD Date 2026-08-01 … 2026-08-31
 *   September (`MAA_SKD_EQUIP-SEPT-2026.xls`, sheet `Sheet1`): STD Date 2026-08-31 … 2026-09-30
 *
 * Expects flight/FHR data already seeded — rows whose `Serial Number` has no matching
 * `fhr_collection` doc are skipped unless `--allow-create-flight` is passed.
 *
 * Usage (from `BWMS/apps/api/`):
 *   npm run seed:equipment:dry-run
 *   npm run seed:equipment:import
 *   npm run seed:equipment-july:dry-run
 *   npm run seed:equipment-july:import
 *   npm run seed:equipment-july31:dry-run
 *   npm run seed:equipment-july31:import
 *   npm run seed:equipment-aug:dry-run
 *   npm run seed:equipment-aug:import
 *   npm run seed:equipment-sept:dry-run
 *   npm run seed:equipment-sept:import
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ScheduledEquipmentImportService } from './scheduled-equipment-import.service';

const cliLogger = new Logger('SeedScheduledEquipmentExcelCli');

const STATION_CODE = 'MAA';

/** `dist/excel-import` → `data/maa-equipment-april-june.xlsx` */
const DEFAULT_MAA_APR_JUN_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'maa-equipment-april-june.xlsx',
);

const DEFAULT_MAA_JULY_GSE_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'maa-ixc-gse-july.xlsb',
);

const DEFAULT_MAA_JULY31_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'maa-31st-july-equip_data.xlsb',
);

const DEFAULT_MAA_AUG_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'equip-data-aug-maa-2026.xlsx',
);

const DEFAULT_MAA_SEPT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'MAA_SKD_EQUIP-SEPT-2026.xls',
);

type MaaEquipmentSeedProfile = {
  workbook: string;
  sheetName: string;
  defaultFromYmd: string | null;
  defaultToYmd: string | null;
};

type MaaEquipmentProfileKey = 'apr-jun' | 'july' | 'july-31' | 'aug' | 'sept';

const MAA_EQUIPMENT_PROFILES: Record<MaaEquipmentProfileKey, MaaEquipmentSeedProfile> = {
  'apr-jun': {
    workbook: DEFAULT_MAA_APR_JUN_WORKBOOK,
    sheetName: 'Sheet1',
    defaultFromYmd: null,
    defaultToYmd: null,
  },
  july: {
    workbook: DEFAULT_MAA_JULY_GSE_WORKBOOK,
    sheetName: 'maa-gse',
    defaultFromYmd: '2026-07-01',
    defaultToYmd: '2026-07-31',
  },
  'july-31': {
    workbook: DEFAULT_MAA_JULY31_WORKBOOK,
    sheetName: 'Recovered_Sheet1',
    defaultFromYmd: '2026-07-31',
    defaultToYmd: '2026-07-31',
  },
  aug: {
    workbook: DEFAULT_MAA_AUG_WORKBOOK,
    sheetName: 'Sheet1',
    defaultFromYmd: '2026-08-01',
    defaultToYmd: '2026-08-31',
  },
  sept: {
    workbook: DEFAULT_MAA_SEPT_WORKBOOK,
    sheetName: 'Sheet1',
    defaultFromYmd: '2026-08-31',
    defaultToYmd: '2026-09-30',
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

function resolveProfile(): MaaEquipmentSeedProfile {
  const profileArg = readArg('--profile')?.toLowerCase();
  if (
    profileArg === 'sept' ||
    profileArg === 'september' ||
    process.argv.includes('--sept')
  ) {
    return MAA_EQUIPMENT_PROFILES.sept;
  }
  if (profileArg === 'aug' || profileArg === 'august' || process.argv.includes('--aug')) {
    return MAA_EQUIPMENT_PROFILES.aug;
  }
  if (profileArg === 'july-31' || process.argv.includes('--july-31')) {
    return MAA_EQUIPMENT_PROFILES['july-31'];
  }
  if (profileArg === 'july' || process.argv.includes('--july')) {
    return MAA_EQUIPMENT_PROFILES.july;
  }
  if (profileArg === 'apr-jun') {
    return MAA_EQUIPMENT_PROFILES['apr-jun'];
  }

  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) {
    const lower = first.toLowerCase();
    if (lower.includes('equip-sept') || lower.includes('skd_equip-sept')) {
      return MAA_EQUIPMENT_PROFILES.sept;
    }
    if (lower.includes('equip-data-aug') || lower.includes('aug-maa-2026')) {
      return MAA_EQUIPMENT_PROFILES.aug;
    }
    if (lower.includes('31st-july') || lower.includes('july-equip_data')) {
      return MAA_EQUIPMENT_PROFILES['july-31'];
    }
    if (lower.includes('gse-july') || lower.includes('maa-ixc-gse-july')) {
      return MAA_EQUIPMENT_PROFILES.july;
    }
    if (lower.includes('april-june') || lower.includes('maa-equipment-april')) {
      return MAA_EQUIPMENT_PROFILES['apr-jun'];
    }
  }

  return MAA_EQUIPMENT_PROFILES['apr-jun'];
}

function resolveWorkbookPath(profile: MaaEquipmentSeedProfile): string {
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
  const append = process.argv.includes('--append');
  const strict = process.argv.includes('--strict');
  const allowCreateFlight = process.argv.includes('--allow-create-flight');
  const sheetName = readArg('--sheet') || profile.sheetName;
  const station = readArg('--station') || STATION_CODE;
  const fromYmd = readArg('--from') ?? profile.defaultFromYmd ?? undefined;
  const toYmd = readArg('--to') ?? profile.defaultToYmd ?? undefined;
  const onlySerials = readOnlySerials();

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Place the file under data/ or pass a path:',
        '  npm run seed:equipment-aug -- data/equip-data-aug-maa-2026.xlsx --dry-run',
        '',
        'Note: Excel HTML frameset exports (tiny .xls + companion *_files/sheet001.htm)',
        'must be converted to a real .xlsx first — the seed CLI cannot read framesets.',
        '',
        'Options:',
        '  --dry-run                Parse and validate only (no MongoDB writes)',
        '  --sheet=Sheet1           Worksheet name',
        '  --from=YYYY-MM-DD        Inclusive STD Date filter',
        '  --to=YYYY-MM-DD          Inclusive STD Date filter',
        '  --profile=sept           Sep 2026 MAA GSE seed defaults',
        '  --sept                   Shorthand for --profile=sept',
        '  --profile=aug            Aug 2026 MAA GSE seed defaults',
        '  --aug                    Shorthand for --profile=aug',
        '  --profile=july-31        31 Jul 2026 MAA GSE seed defaults',
        '  --july-31                Shorthand for --profile=july-31',
        '  --append                 Merge onto existing equipmentDetails instead of replacing per flight',
        '  --strict                 Skip flights whose Customer/Flight/Date/Route/Type Craft/Category mismatch',
        '  --allow-create-flight    Create a bare fhr_collection doc when Serial Number has no existing flight',
        '  --station=MAA            Station for lookup + create (default MAA)',
        '  --only-serials=a,b,c     Only import these Serial Number values',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  cliLogger.log(
    `Station: ${station} | sheet: ${sheetName}${
      fromYmd || toYmd ? ` | STD Date: ${fromYmd ?? '…'} … ${toYmd ?? '…'}` : ''
    }`,
  );
  if (onlySerials) {
    cliLogger.log(`Whitelist mode: only Serial Number ∈ {${onlySerials.join(', ')}}.`);
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
      station,
      lookupStation: station,
      fromYmd,
      toYmd,
      onlySerials,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0 || res.flightsSkippedNotFound > 0) {
      process.exitCode = 1;
    }
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `MAA equipment seed complete — ${res.flightsProcessed} flights, ${res.equipmentLinesWritten} equipment lines (stationCode=${station}).`,
      );
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
