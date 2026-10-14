console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * CLI: seed MAA non-scheduled equipment workbook into `ns_fhr_collection.equipmentDetails`
 * (and `equipmentManpower.entries`) per flight `Serial Number`.
 *
 * Expands `Equipment No` short codes to full names (Equipment Master + MAA March map).
 *
 * Default workbook: `server/data/Non-skd-equipment-data-maa.xlsx`
 *
 * Usage (from `server/`):
 *   npm run seed:maa-ns-equipment:dry-run
 *   npm run seed:maa-ns-equipment:import
 *   npm run seed:maa-ns-equipment -- --only-serials=1823,2237
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaNsEquipmentExcelSeedService } from './services/maa-ns-equipment-excel-seed.service';
import { clearNsEquipmentFullNameLookupCache } from './services/maa-ns-equipment-name-map';

const cliLogger = new Logger('SeedMaaNsEquipmentExcelCli');

const DEFAULT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'Non-skd-equipment-data-maa.xlsx',
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
  clearNsEquipmentFullNameLookupCache();

  const filePath = resolveWorkbookPath();
  const dryRun = process.argv.includes('--dry-run');
  const append = process.argv.includes('--append');
  const allowCreateFlight = process.argv.includes('--allow-create-flight');
  const sheetName = readArg('--sheet');
  const station = readArg('--station');
  const onlySerials = readOnlySerials();

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        'Place Non-skd-equipment-data-maa.xlsx under server/data/ or pass a path.',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(MaaNsEquipmentExcelSeedService);
    const res = await svc.importFromFilePath(filePath, {
      dryRun,
      append,
      allowCreateFlight,
      sheetName: sheetName ?? undefined,
      station: station ?? undefined,
      onlySerials,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0 || res.flightsSkippedNotFound > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void bootstrap().catch((err) => {
  cliLogger.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
