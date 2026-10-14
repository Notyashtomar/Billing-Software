console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed MongoDB `advance-manpower` for Chandigarh (IXC).
 *
 * Usage (from server/):
 *   npm run seed:ixc-manpower
 *   npm run seed:ixc-manpower -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IXC_MANPOWER_SEED } from './data/ixc-manpower.seed';
import { AdvanceManpowerService } from './services/advance-manpower.service';
import { fixedStationScope } from '../common/station/station-scope';

const cliLogger = new Logger('SeedIxcManpowerCli');
const STATION_CODE = 'IXC';

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const station = fixedStationScope(STATION_CODE);

  if (dryRun) {
    cliLogger.log(
      `Dry run: would upsert ${IXC_MANPOWER_SEED.length} manpower rows for ${STATION_CODE}`,
    );
    cliLogger.log(JSON.stringify(IXC_MANPOWER_SEED, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(AdvanceManpowerService);
    const res = await svc.createBulk([...IXC_MANPOWER_SEED], station);
    cliLogger.log(`Seeded ${STATION_CODE} manpower: ${JSON.stringify(res)}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
