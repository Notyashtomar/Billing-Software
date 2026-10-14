/**
 * Consolidate Advance Schedule Setup masters: one row per flight per season.
 *
 * Merges monthly splits (e.g. Apr/May/Jun 2026 → 01/04/2026–30/06/2026)
 * for the target station. Winter rows (Oct–Mar) stay separate from Summer.
 *
 * Usage (from server/):
 *   npm run consolidate:advance-schedule-seasons
 *   npm run consolidate:advance-schedule-seasons -- --station=MAA
 *   npm run consolidate:advance-schedule-seasons -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { fixedStationScope } from '../common/station/station-scope';
import { RawFlightDataService } from './services/raw-flight-data.service';

const cliLogger = new Logger('ConsolidateAdvanceScheduleSeasonsCli');

function readStationArg(): string {
  const raw = process.argv.find((a) => a.startsWith('--station='));
  if (!raw) return 'MAA';
  const code = raw.slice('--station='.length).trim().toUpperCase();
  return code || 'MAA';
}

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const stationCode = readStationArg();
  const station = fixedStationScope(stationCode);

  if (dryRun) {
    cliLogger.log(
      `Dry run – would consolidate same-season advance schedules for ${stationCode}`,
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const svc = app.get(RawFlightDataService);
    const result = await svc.consolidateAdvanceSchedulesBySeason(station);

    cliLogger.log(
      `Done – station=${stationCode} groups=${result.groupsProcessed} kept=${result.mastersKept} removed=${result.mastersRemoved} merges=${result.merged.length}`,
    );
    for (const row of result.merged) {
      cliLogger.log(
        `  ✓ ${row.season} ${row.airline} ${row.flightNo} → ${row.keptSerial} ${row.validFrom}–${row.validTo} (removed ${row.removedSerials.join(',') || 'none'})`,
      );
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  cliLogger.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
