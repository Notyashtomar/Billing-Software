console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * CLI: seed MAA non-scheduled FHR workbook into `ns_fhr_collection`.
 *
 * Default workbook: `server/data/Non-skd-data-MAA.xlsx`
 *
 * Usage (from `server/`):
 *   npm run seed:maa-ns-fhr:dry-run
 *   npm run seed:maa-ns-fhr:import
 *   npm run seed:maa-ns-fhr -- --from=2026-03-01 --to=2026-06-30
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaNsFhrExcelSeedService } from './services/maa-ns-fhr-excel-seed.service';

const cliLogger = new Logger('SeedMaaNsFhrExcelCli');

const DEFAULT_WORKBOOK = join(
  __dirname,
  '..',
  '..',
  'data',
  'Non-skd-data-MAA.xlsx',
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
  const fromYmd = readArg('--from');
  const toYmd = readArg('--to');
  const sheetName = readArg('--sheet');
  const onlySerials = readOnlySerials();

  if (!existsSync(filePath)) {
    cliLogger.error(
      [
        `Workbook not found: ${filePath}`,
        'Place Non-skd-data-MAA.xlsx under server/data/ or pass a path.',
      ].join('\n'),
    );
    process.exit(1);
  }

  cliLogger.log(`Using workbook: ${filePath}`);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(MaaNsFhrExcelSeedService);
    const res = await svc.importFromFilePath(filePath, {
      dryRun,
      fromYmd,
      toYmd,
      sheetName: sheetName ?? undefined,
      onlySerials,
    });
    cliLogger.log(JSON.stringify(res, null, 2));
    if (res.rowErrors.length > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap().catch((err) => {
  cliLogger.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
