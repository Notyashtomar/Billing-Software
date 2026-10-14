/**
 * Seed Hyderabad (HYD) Advance → Schedule Setup from the 03/09/2026
 * Flight Schedule PDF, using the same save path as the New Scheduled form.
 *
 * Usage (from BWMS/apps/api):
 *   npm run seed:hyd-sep2026-schedule
 *   npm run seed:hyd-sep2026-schedule -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AdvanceAirlineService } from '../advance-airline/services/advance-airline.service';
import { AdvanceAircraftService } from '../advance-aircraft/services/advance-aircraft.service';
import { fixedStationScope } from '../common/station/station-scope';
import {
  HYD_SEP_2026_AIRLINES_TO_ENSURE,
  HYD_SEP_2026_SCHEDULE_SEED,
  type HydScheduleSeedRow,
} from './data/hyd-sep-2026-schedule.seed';
import { RawFlightDataService } from './services/raw-flight-data.service';

const cliLogger = new Logger('SeedHydSep2026ScheduleCli');
const STATION_CODE = 'HYD';
const SKIP_AIRLINE_CODES = new Set(['AK']);

function toFormPayload(
  row: HydScheduleSeedRow,
  airlineName: string,
  aircraftBody: 'NB' | 'WB',
): Record<string, unknown> {
  const flightNo = row.flightNo;
  const routing = row.routing;
  const sta = row.staTime;
  const std = row.stdTime;
  return {
    Airline: airlineName,
    'Airline Code': row.airlineCode,
    airline: airlineName,
    airlineCode: row.airlineCode,
    'Flight No': flightNo,
    flightNo,
    'Flight Type': row.flightType,
    'Type of flight': row.flightType,
    flight: row.flightType,
    'STA Time': sta,
    'STD Time': std,
    staTime: sta,
    stdTime: std,
    Routing: routing,
    route: routing,
    routing,
    Aircraft: row.aircraft,
    TypeCraft: row.aircraft,
    aircraft: row.aircraft,
    'Aircraft Body': aircraftBody,
    aircraftBody,
    Freighter: row.freighter ? 'Yes' : 'No',
    freighter: row.freighter ? 'Yes' : 'No',
    'Type of Handling': row.typeOfHandling,
    typeOfHandling: row.typeOfHandling,
    'Next Day': row.nextDay ? 'True' : 'False',
    nextDay: row.nextDay ? 'true' : 'false',
    'Valid From': row.validFrom,
    'Valid To': row.validTo,
    validFrom: row.validFrom,
    validTo: row.validTo,
    'Operation Split': 'No',
    ifOperationSplit: false,
    'Arrival Flight No': row.arrivalFlightNo,
    arrivalFlightNo: row.arrivalFlightNo,
    'Departure Flight No': row.departureFlightNo,
    departureFlightNo: row.departureFlightNo,
    scheduleDays: row.scheduleDays,
    Active: 'Yes',
    active: true,
    scheduleSource: 'advance_schedule_setup',
    exportedNAV: 'No',
    rampLocked: 'No',
    paxLocked: 'No',
    gsdLocked: 'No',
  };
}

function dayFlags(days: HydScheduleSeedRow['scheduleDays']): string {
  return Object.entries(days)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .join(',');
}

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const station = fixedStationScope(STATION_CODE);
  const rows = HYD_SEP_2026_SCHEDULE_SEED.filter(
    (r) => !SKIP_AIRLINE_CODES.has(r.airlineCode),
  );

  if (dryRun) {
    cliLogger.log(
      `Dry run – would upsert ${rows.length} HYD schedule rows (skip AK Air Asia Berhard).`,
    );
    for (const r of rows) {
      cliLogger.log(
        `  ${r.airlineCode.padEnd(4)} ${r.flightNo.padEnd(12)} ${r.routing.padEnd(11)} ${r.flightType.padEnd(13)} ${r.staTime}→${r.stdTime} ${r.validFrom}–${r.validTo} ${dayFlags(r.scheduleDays)}`,
      );
    }
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const airlineSvc = app.get(AdvanceAirlineService);
    const aircraftSvc = app.get(AdvanceAircraftService);
    const scheduleSvc = app.get(RawFlightDataService);

    for (const airline of HYD_SEP_2026_AIRLINES_TO_ENSURE) {
      const existing = (await airlineSvc.findAll(airline.code, station)).find(
        (doc) => String(doc.code ?? '').toUpperCase() === airline.code,
      );
      if (existing) {
        cliLogger.log(`Airline exists ${airline.code} ${existing.name}`);
        continue;
      }
      await airlineSvc.create(
        { name: airline.name, code: airline.code },
        station,
      );
      cliLogger.log(`Created airline ${airline.code} ${airline.name}`);
    }

    const airlineDocs = await airlineSvc.findAll(undefined, station);
    const airlineByCode = new Map(
      airlineDocs.map((doc) => [
        String(doc.code ?? '').trim().toUpperCase(),
        String(doc.name ?? '').trim(),
      ]),
    );

    const aircraftDocs = await aircraftSvc.findAll(undefined, station);
    const aircraftBodyByType = new Map(
      aircraftDocs.map((doc) => [
        String(doc.aircraft ?? '').trim().toUpperCase(),
        doc.aircraftBody === 'WB' ? ('WB' as const) : ('NB' as const),
      ]),
    );

    let upserted = 0;
    let failed = 0;

    for (const row of rows) {
      const airlineName = airlineByCode.get(row.airlineCode);
      if (!airlineName) {
        failed += 1;
        cliLogger.error(`No HYD airline master for code ${row.airlineCode}`);
        continue;
      }
      const body =
        aircraftBodyByType.get(row.aircraft.toUpperCase()) ?? row.aircraftBody;
      try {
        const result = await scheduleSvc.saveAdvanceScheduleSetup(
          toFormPayload(row, airlineName, body),
          station,
        );
        upserted += 1;
        cliLogger.log(
          `  ✓ ${row.flightNo.padEnd(12)} ${row.routing} ${row.flightType} ${(result as { serialNo?: string }).serialNo ?? ''} ${row.notes ?? ''}`,
        );
      } catch (err) {
        failed += 1;
        cliLogger.error(
          `  ✗ ${row.flightNo}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    cliLogger.log(
      `Done – station=${STATION_CODE} upserted=${upserted} failed=${failed} skippedAK=2`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  cliLogger.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
