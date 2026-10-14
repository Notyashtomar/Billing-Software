console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed MongoDB `advance-staff` for Chandigarh (IXC).
 *
 * Usage (from server/):
 *   npm run seed:ixc-gateway-staff
 *   npm run seed:ixc-gateway-staff -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IXC_GATEWAY_STAFF_SEED } from './data/ixc-gateway-staff.seed';
import { AdvanceStaffService } from './services/advance-staff.service';
import { fixedStationScope } from '../common/station/station-scope';

const cliLogger = new Logger('SeedIxcGatewayStaffCli');
const STATION_CODE = 'IXC';

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const station = fixedStationScope(STATION_CODE);

  if (dryRun) {
    cliLogger.log(
      `Dry run: would upsert ${IXC_GATEWAY_STAFF_SEED.length} staff rows for ${STATION_CODE}`,
    );
    cliLogger.log(JSON.stringify(IXC_GATEWAY_STAFF_SEED, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(AdvanceStaffService);
    const res = await svc.createBulk([...IXC_GATEWAY_STAFF_SEED], station);
    cliLogger.log(`Seeded ${STATION_CODE} gateway staff: ${JSON.stringify(res)}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
