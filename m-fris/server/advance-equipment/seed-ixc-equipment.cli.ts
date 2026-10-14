console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed MongoDB `advance-equipment` for Chandigarh (IXC).
 *
 * Usage (from server/):
 *   npm run seed:ixc-equipment
 *   npm run seed:ixc-equipment -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IXC_EQUIPMENT_SEED } from './data/ixc-equipment.seed';
import { AdvanceEquipmentService } from './services/advance-equipment.service';
import { fixedStationScope } from '../common/station/station-scope';

const cliLogger = new Logger('SeedIxcEquipmentCli');
const STATION_CODE = 'IXC';

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const station = fixedStationScope(STATION_CODE);

  if (dryRun) {
    cliLogger.log(
      `Dry run: would upsert ${IXC_EQUIPMENT_SEED.length} equipment rows for ${STATION_CODE}`,
    );
    cliLogger.log(JSON.stringify(IXC_EQUIPMENT_SEED, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(AdvanceEquipmentService);
    const res = await svc.createBulk([...IXC_EQUIPMENT_SEED], station);
    cliLogger.log(`Seeded ${STATION_CODE} equipment: ${JSON.stringify(res)}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
