console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed Chennai (MAA) Advance Schedule Setup for April 2026.
 *
 * Inserts / upserts 26 scheduled-airline entries (serials 420001-420026) into
 * the `advance_schedule_setup` collection, then merges them into
 * `raw_flight_data` exactly as if they had been entered through the UI.
 *
 * Usage (from server/):
 *   npm run seed:maa-apr2026-schedule              # live run
 *   npm run seed:maa-apr2026-schedule -- --dry-run  # preview only
 *
 * The operation is idempotent: re-running overwrites the same serial numbers.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { fixedStationScope } from '../common/station/station-scope';
import { RawFlightDataService } from './services/raw-flight-data.service';
import { MAA_APRIL_2026_SCHEDULE_SEED } from './data/maa-april-2026-schedule.seed';

const cliLogger = new Logger('SeedMaaApr2026ScheduleCli');
const STATION_CODE = 'MAA';

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const station = fixedStationScope(STATION_CODE);

  if (dryRun) {
    cliLogger.log(
      `Dry run – would upsert ${MAA_APRIL_2026_SCHEDULE_SEED.length} schedule rows for ${STATION_CODE} (April 2026)`,
    );
    cliLogger.log(
      JSON.stringify(
        MAA_APRIL_2026_SCHEDULE_SEED.map((r) => ({
          serial: r.serialNo,
          flight: r.flightNo,
          route: r.routing,
          sta: r.staTime,
          std: r.stdTime,
          days: Object.entries(r.scheduleDays)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(','),
        })),
        null,
        2,
      ),
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const svc = app.get(RawFlightDataService);
    let upserted = 0;
    let failed = 0;

    for (const row of MAA_APRIL_2026_SCHEDULE_SEED) {
      try {
        await svc.saveAdvanceScheduleSetup(
          { ...row } as Record<string, unknown>,
          station,
        );
        upserted++;
        cliLogger.log(
          `  ✓ [${row.serialNo}] ${row.flightNo}  ${row.routing}  ${row.staTime}→${row.stdTime}`,
        );
      } catch (err) {
        failed++;
        cliLogger.error(
          `  ✗ [${row.serialNo}] ${row.flightNo}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    cliLogger.log(
      `Seed complete – station=${STATION_CODE}  upserted=${upserted}  failed=${failed}`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
