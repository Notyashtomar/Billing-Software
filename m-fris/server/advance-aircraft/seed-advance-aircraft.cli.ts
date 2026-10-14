console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed MongoDB `advance-aircraft` (global gateway aircraft master).
 *
 * Usage (from server/):
 *   npm run seed:advance-aircraft
 *   npm run seed:advance-aircraft -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ADVANCE_AIRCRAFT_SEED } from './data/advance-aircraft.seed';
import { AdvanceAircraftService } from './services/advance-aircraft.service';

const cliLogger = new Logger('SeedAdvanceAircraftCli');

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    cliLogger.log(
      `Dry run: would upsert ${ADVANCE_AIRCRAFT_SEED.length} aircraft types into advance-aircraft`,
    );
    cliLogger.log(
      JSON.stringify(
        ADVANCE_AIRCRAFT_SEED.slice(0, 8).map((row) => ({
          aircraft: row.aircraft,
          aircraftBody: row.aircraftBody,
          category: row.category,
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
    const svc = app.get(AdvanceAircraftService);
    const res = await svc.createBulk([...ADVANCE_AIRCRAFT_SEED]);
    cliLogger.log(`Seeded advance-aircraft: ${JSON.stringify(res)}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
