/**
 * Seed Delhi (DEL) Advance → Schedule Setup from August 2026 FHR.
 *
 * Writes `advance_schedule_setup` + `raw_flight_data` masters with
 * `stationCode: DEL`. Does not mint or rewrite `fhr_collection` daily rows
 * (those already hold Aug 2026 flight numbers).
 *
 * Usage (from BWMS/apps/api):
 *   npm run seed:del-aug2026-schedule
 *   npm run seed:del-aug2026-schedule -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AdvanceAircraftService } from '../advance-aircraft/services/advance-aircraft.service';
import { AdvanceAirlineService } from '../advance-airline/services/advance-airline.service';
import { fixedStationScope } from '../common/station/station-scope';
import { FhrCollection } from '../fhr-collection/schema/fhr-collection.schema';
import {
  AdvanceScheduleSetup,
  AdvanceScheduleSetupDocument,
} from './schema/advance-schedule-setup.schema';
import { RawFlightData } from './schema/raw-flight-data.schema';
import { buildScheduleIdentityKey } from './utils/schedule-season.util';
import {
  aircraftToEnsureFromRows,
  airlinesToEnsureFromRows,
  buildDelAug2026ScheduleRowsFromFhr,
  type DelScheduleSeedRow,
} from './data/del-aug-2026-schedule-from-fhr.util';

const cliLogger = new Logger('SeedDelAug2026ScheduleCli');
const STATION_CODE = 'DEL';
const SERIAL_FLOOR = 100000;

function toMasterData(row: DelScheduleSeedRow, serial: string): Record<string, unknown> {
  return {
    serialNo: serial,
    airline: row.airlineName,
    Airline: row.airlineName,
    airlineCode: row.airlineCode,
    'Airline Code': row.airlineCode,
    flightNo: row.flightNo,
    'Flight No': row.flightNo,
    flightType: row.flightType,
    'Flight Type': row.flightType,
    'Type of flight': row.flightType,
    staTime: row.staTime,
    'STA Time': row.staTime,
    stdTime: row.stdTime,
    'STD Time': row.stdTime,
    routing: row.routing,
    Routing: row.routing,
    route: row.routing,
    aircraft: row.aircraft,
    Aircraft: row.aircraft,
    TypeCraft: row.aircraft,
    aircraftBody: row.aircraftBody,
    'Aircraft Body': row.aircraftBody,
    freighter: row.freighter ? 'Yes' : 'No',
    Freighter: row.freighter ? 'Yes' : 'No',
    typeOfHandling: row.typeOfHandling,
    'Type of Handling': row.typeOfHandling,
    nextDay: row.nextDay ? 'true' : 'false',
    'Next Day': row.nextDay ? 'True' : 'False',
    validFrom: row.validFrom,
    'Valid From': row.validFrom,
    validTo: row.validTo,
    'Valid To': row.validTo,
    ifOperationSplit: row.ifOperationSplit,
    'Operation Split': row.ifOperationSplit ? 'Yes' : 'No',
    ArrivalFltNo: row.arrivalFlightNo,
    arrivalFlightNo: row.arrivalFlightNo,
    DepartureFltNo: row.departureFlightNo,
    departureFlightNo: row.departureFlightNo,
    scheduleDays: row.scheduleDays,
    active: true,
    Active: 'Yes',
    flightStatus: 'Open',
    flightCancelled: false,
    isCancelled: false,
    scheduleSource: 'advance_schedule_setup',
    exportedNAV: 'No',
    rampLocked: 'No',
    paxLocked: 'No',
    gsdLocked: 'No',
    season: row.season,
    Season: row.season,
    seasonKey: row.seasonKey,
    identityKey: row.identityKey,
  };
}

function nextSerial(existing: Array<{ serialNo?: string }>, used: Set<string>): string {
  let max = SERIAL_FLOOR;
  for (const d of existing) {
    const s = String(d.serialNo ?? '').trim();
    if (!/^\d{6}$/.test(s)) continue;
    const n = Number(s);
    if (n > max) max = n;
  }
  for (const s of used) {
    if (!/^\d{6}$/.test(s)) continue;
    const n = Number(s);
    if (n > max) max = n;
  }
  const next = String(max + 1).padStart(6, '0');
  used.add(next);
  return next;
}

function dayFlags(days: DelScheduleSeedRow['scheduleDays']): string {
  return Object.entries(days)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .join(',');
}

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const station = fixedStationScope(STATION_CODE);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const fhrModel = app.get<Model<FhrCollection>>(
      getModelToken(FhrCollection.name),
    );
    const scheduleModel = app.get<Model<AdvanceScheduleSetupDocument>>(
      getModelToken(AdvanceScheduleSetup.name),
    );
    const rawModel = app.get<Model<RawFlightData>>(
      getModelToken(RawFlightData.name),
    );
    const airlineSvc = app.get(AdvanceAirlineService);
    const aircraftSvc = app.get(AdvanceAircraftService);

    const fhrDocs = await fhrModel
      .find({ stationCode: STATION_CODE })
      .select({ mainDetails: 1 })
      .lean();
    const rows = buildDelAug2026ScheduleRowsFromFhr(
      fhrDocs.map((d) => ({
        mainDetails:
          d.mainDetails && typeof d.mainDetails === 'object'
            ? (d.mainDetails as unknown as Record<string, unknown>)
            : null,
      })),
    );
    const airlines = airlinesToEnsureFromRows(rows);
    const aircraft = aircraftToEnsureFromRows(rows);

    cliLogger.log(
      `DEL FHR=${fhrDocs.length} scheduleMasters=${rows.length} airlines=${airlines.length}`,
    );

    if (dryRun) {
      for (const r of rows.slice(0, 25)) {
        cliLogger.log(
          `  ${r.airlineCode.padEnd(4)} ${r.flightNo.padEnd(15)} ${r.routing.padEnd(12)} ${r.staTime}→${r.stdTime} ${r.validFrom}–${r.validTo} ${dayFlags(r.scheduleDays)} n=${r.fhrCount}`,
        );
      }
      if (rows.length > 25) {
        cliLogger.log(`  … ${rows.length - 25} more`);
      }
      return;
    }

    for (const airline of airlines) {
      const existing = (await airlineSvc.findAll(airline.code, station)).find(
        (doc) => String(doc.code ?? '').toUpperCase() === airline.code,
      );
      if (existing) {
        cliLogger.log(`Airline exists ${airline.code} ${existing.name}`);
        continue;
      }
      const created = await airlineSvc.create(
        { name: airline.name, code: airline.code },
        station,
      );
      cliLogger.log(`Created airline ${created.code} ${created.name}`);
    }

    const airlineDocs = await airlineSvc.findAll(undefined, station);
    const airlineNameByCode = new Map(
      airlineDocs.map((doc) => [
        String(doc.code ?? '').trim().toUpperCase(),
        String(doc.name ?? '').trim(),
      ]),
    );

    for (const ac of aircraft) {
      try {
        await aircraftSvc.create({
          aircraft: ac.aircraft,
          aircraftBody: ac.aircraftBody,
          category: ac.aircraftBody === 'WB' ? 'E' : 'C',
          active: true,
        });
        cliLogger.log(`Created aircraft ${ac.aircraft}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists/i.test(msg)) {
          cliLogger.warn(`Aircraft ${ac.aircraft}: ${msg}`);
        }
      }
    }

    const existingMasters = await scheduleModel
      .find({}, { serialNo: 1, identityKey: 1, stationCode: 1 })
      .lean();
    const usedSerials = new Set(
      existingMasters.map((d) => String(d.serialNo ?? '').trim()).filter(Boolean),
    );
    const existingDelByKey = new Map(
      existingMasters
        .filter((d) => String(d.stationCode ?? '').toUpperCase() === STATION_CODE)
        .map((d) => [String(d.identityKey ?? ''), String(d.serialNo ?? '')]),
    );

    let upserted = 0;
    let failed = 0;

    for (const row of rows) {
      const airlineName = airlineNameByCode.get(row.airlineCode) ?? row.airlineName;
      const identityKey = buildScheduleIdentityKey({
        seasonKey: row.seasonKey,
        airline: airlineName,
        flightNo: row.flightNo,
        routing: row.routing,
      });
      const payloadRow = { ...row, airlineName, identityKey };
      const existingSerial = existingDelByKey.get(identityKey);
      const serial =
        existingSerial && /^\d{6}$/.test(existingSerial)
          ? existingSerial
          : nextSerial(existingMasters, usedSerials);
      const data = toMasterData(payloadRow, serial);
      try {
        await scheduleModel.findOneAndUpdate(
          { stationCode: STATION_CODE, identityKey },
          {
            $set: {
              serialNo: serial,
              data,
              identityKey,
              seasonKey: row.seasonKey,
              stationCode: STATION_CODE,
            },
          },
          { upsert: true, returnDocument: 'after' },
        );
        const rawFilter = {
          stationCode: STATION_CODE,
          $or: [
            { 'data.serialNo': serial },
            { 'data.SlNo': serial },
            { 'data.Serial No': serial },
          ],
        };
        const rawData = {
          ...data,
          SlNo: serial,
          'Serial No': serial,
          SerialNo: Number(serial),
        };
        const existingRaw = await rawModel.findOne(rawFilter).lean();
        if (existingRaw?._id) {
          await rawModel.updateOne({ _id: existingRaw._id }, { $set: { data: rawData } });
        } else {
          await rawModel.create({ data: rawData, stationCode: STATION_CODE });
        }
        upserted += 1;
        cliLogger.log(
          `  ✓ ${serial} ${row.flightNo.padEnd(15)} ${row.routing} ${airlineName}`,
        );
      } catch (err) {
        failed += 1;
        cliLogger.error(
          `  ✗ ${row.flightNo}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    cliLogger.log(
      `Done – station=${STATION_CODE} upserted=${upserted} failed=${failed}`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  cliLogger.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
