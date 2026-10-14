console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * CLI: seed Chandigarh (IXC) scheduled equipment workbook into
 * `fhr_collection.equipmentDetails[]`.
 *
 * - Matches flights by `Serial Number` (unique FHR key) within `stationCode: IXC`
 * - Verifies Excel `Flight No` / dates against the existing FHR doc (warnings)
 * - Expands `Equipment No` short codes → full names via IXC equipment master
 *
 * Workbook layouts:
 *   May–June (`ixc-equipment-data-may-june-2026.xlsb`, sheet `Sheet2`):
 *     STD Date window 2026-05-01 … 2026-06-30
 *   July (`maa-ixc-gse-july.xlsb`, sheet `ixc-gse`):
 *     STD Date window 2026-07-01 … 2026-07-31
 *
 * Expects IXC FHR flights already seeded (`npm run seed:ixc-fhr:import` / `seed:ixc-fhr-july:import`).
 *
 * Usage (from `BWMS/apps/api/`):
 *   npm run seed:ixc-fhr-equipment:dry-run
 *   npm run seed:ixc-fhr-equipment:import
 *   npm run seed:ixc-fhr-equipment-july:dry-run
 *   npm run seed:ixc-fhr-equipment-july:import
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { toBillingTrackableFullName } from 'src/common/billing-trackable-equipment-name';
import { ScheduledEquipmentImportService } from './scheduled-equipment-import.service';
import {
  clearIxcEquipmentFullNameLookupCache,
  loadIxcEquipmentFullNameLookup,
  resolveIxcEquipmentFullName,
} from './ixc-equipment-name-map';

const cliLogger = new Logger('SeedIxcFhrEquipmentExcelCli');

const DEFAULT_IXC_MAY_JUNE_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'ixc-equipment-data-may-june-2026.xlsb',
);

const DEFAULT_IXC_JULY_GSE_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'maa-ixc-gse-july.xlsb',
);

const STATION_CODE = 'IXC';

type IxcEquipmentSeedProfile = {
  workbook: string;
  sheetName: string;
  defaultFromYmd: string;
  defaultToYmd: string;
};

const IXC_EQUIPMENT_PROFILES: Record<'may-june' | 'july', IxcEquipmentSeedProfile> = {
  'may-june': {
    workbook: DEFAULT_IXC_MAY_JUNE_WORKBOOK,
    sheetName: 'Sheet2',
    defaultFromYmd: '2026-05-01',
    defaultToYmd: '2026-06-30',
  },
  july: {
    workbook: DEFAULT_IXC_JULY_GSE_WORKBOOK,
    sheetName: 'ixc-gse',
    defaultFromYmd: '2026-07-01',
    defaultToYmd: '2026-07-31',
  },
};

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

function resolveProfile(): IxcEquipmentSeedProfile {
  const profileArg = readArg('--profile')?.toLowerCase();
  if (profileArg === 'july' || process.argv.includes('--july')) {
    return IXC_EQUIPMENT_PROFILES.july;
  }
  if (profileArg === 'may-june') {
    return IXC_EQUIPMENT_PROFILES['may-june'];
  }

  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) {
    const lower = first.toLowerCase();
    if (lower.includes('gse-july') || lower.includes('maa-ixc-gse-july')) {
      return IXC_EQUIPMENT_PROFILES.july;
    }
    if (lower.includes('may-june') || lower.includes('ixc-equipment-data')) {
      return IXC_EQUIPMENT_PROFILES['may-june'];
    }
  }

  return IXC_EQUIPMENT_PROFILES['may-june'];
}

function resolveWorkbookPath(profile: IxcEquipmentSeedProfile): string {
  const first = process.argv[2]?.trim();
  if (first && !first.startsWith('-')) return first;
  return profile.workbook;
}

async function bootstrap() {
  clearIxcEquipmentFullNameLookupCache();

  const profile = resolveProfile();
  const filePath = resolveWorkbookPath(profile);
  const dryRun = process.argv.includes('--dry-run');
  const append = process.argv.includes('--append');
  const strict = process.argv.includes('--strict');
  const allowCreateFlight = process.argv.includes('--allow-create-flight');
  const sheetName = readArg('--sheet') || profile.sheetName;
  const fromYmd = readArg('--from') || profile.defaultFromYmd;
  const toYmd = readArg('--to') || profile.defaultToYmd;
  const onlySerials = readOnlySerials();
  const nameLookup = loadIxcEquipmentFullNameLookup();

  const resolveEquipmentName = (code: string): string => {
    const billed = toBillingTrackableFullName(code);
    if (billed && billed !== code) return billed;
    return resolveIxcEquipmentFullName(code, nameLookup);
  };

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        '',
        'Place the file under data/ or pass a path:',
        '  npm run seed:ixc-fhr-equipment-july -- data/maa-ixc-gse-july.xlsb --dry-run',
        '',
        'Options:',
        '  --dry-run              Parse and validate only (no MongoDB writes)',
        '  --sheet=ixc-gse        Worksheet name (July default: ixc-gse)',
        '  --from=YYYY-MM-DD      Inclusive STD Date filter',
        '  --to=YYYY-MM-DD        Inclusive STD Date filter',
        '  --profile=july         July 2026 GSE seed defaults',
        '  --july                 Shorthand for --profile=july',
        '  --append               Merge onto existing equipmentDetails instead of replacing',
        '  --strict               Skip flights whose match keys mismatch',
        '  --allow-create-flight  Create a bare fhr_collection doc when Serial Number missing',
        '  --only-serials=a,b,c   Only import these Serial Number values',
      ].join('\n'),
    );
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
      resolveEquipmentName,
    });
    // Surface codes that were not in the IXC master map (kept as raw Excel value).
    const known = new Set(
      [...nameLookup.keys()].map((k) => k.trim().toLowerCase()),
    );
    res.unresolvedEquipmentCodes = res.unresolvedEquipmentCodes.filter(
      (c) => !known.has(String(c).trim().toLowerCase()),
    );
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0 || res.flightsSkippedNotFound > 0) {
      process.exitCode = 1;
    }
    if (!dryRun && res.flightsProcessed > 0) {
      cliLogger.log(
        `IXC equipment seed complete — ${res.flightsProcessed} flights, ${res.equipmentLinesWritten} equipment lines (stationCode=${STATION_CODE}).`,
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
