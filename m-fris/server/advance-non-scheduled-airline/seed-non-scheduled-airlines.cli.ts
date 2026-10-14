console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed MongoDB `ns-advance-non-scheduled-airline` for Chandigarh (IXC).
 *
 * Usage (from server/):
 *   npm run seed:non-scheduled-airlines
 *   npm run seed:non-scheduled-airlines -- --station=DEL
 *   npm run seed:non-scheduled-airlines -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NON_SCHEDULED_AIRLINES_SEED } from './data/non-scheduled-airlines.seed';
import { AdvanceNonScheduledAirlineService } from './services/advance-non-scheduled-airline.service';
import { fixedStationScope } from '../common/station/station-scope';
import { normalizeAirlineCode } from './utils/airline-code.util';

const cliLogger = new Logger('SeedNonScheduledAirlinesCli');
const DEFAULT_STATION_CODE = 'IXC';

function readStationArg(): string {
  const flag = process.argv.find((a) => a.startsWith('--station='));
  if (flag) {
    const code = flag.split('=')[1]?.trim().toUpperCase();
    if (code) return code;
  }
  return DEFAULT_STATION_CODE;
}

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const stationCode = readStationArg();
  const station = fixedStationScope(stationCode);

  if (dryRun) {
    cliLogger.log(
      `Dry run: would upsert ${NON_SCHEDULED_AIRLINES_SEED.length} airlines for ${stationCode}`,
    );
    cliLogger.log(
      JSON.stringify(
        NON_SCHEDULED_AIRLINES_SEED.slice(0, 5).map((row) => ({
          airline: row.airline,
          airlineCode: normalizeAirlineCode(row.airlineCode),
        })),
        null,
        2,
      ),
    );
    cliLogger.log('…');
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(AdvanceNonScheduledAirlineService);
    const res = await svc.createBulk([...NON_SCHEDULED_AIRLINES_SEED], station);
    cliLogger.log(
      `Seeded ${stationCode} non-scheduled airlines: ${JSON.stringify(res)}`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
