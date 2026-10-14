console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Reseed blank `fhr_collection.mainDetails` fields from updated_seeding_data_2.xlsx.
 * Does NOT touch other FHR embeds or standalone form collections.
 *
 * Usage (from server/):
 *   npm run reseed:fhr-main-details
 *   npm run reseed:fhr-main-details -- --dry-run
 *   npm run reseed:fhr-main-details -- --file data/updated_seeding_data_2.xlsx --sheet "CORRECTED VERSION"
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FhrMainDetailsReseedService } from './fhr-main-details-reseed.service';

const cliLogger = new Logger('ReseedFhrMainDetailsCli');

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim() || undefined;
}

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const filePath = argValue('--file');
  const sheetName = argValue('--sheet');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(FhrMainDetailsReseedService);
    const res = await svc.reseedFromExcel({ dryRun, filePath, sheetName });
    cliLogger.log(JSON.stringify(res, null, 2));
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
