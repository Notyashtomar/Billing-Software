/**
 * Seed MAA RAF flights from Excel:
 * - `creation-raf` (FRIS Flights → RAF tab)
 * - `raf_collection` (equipment / manpower / cleaning — no longer on fhr_collection)
 * - `advance-raf-airline` (billing Customer filter / eligibility)
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';
import { CreationRaf, CreationRafDocument } from '../creation/schema/creation-raf.schema';
import {
  AdvanceRafAirline,
  AdvanceRafAirlineDocument,
} from '../advance-raf-airline/schema/advance-raf-airline.schema';
import { FhrCollectionService } from '../fhr-collection/services/fhr-collection.service';
import { RawFlightDataService } from '../raw-flight-data/services/raw-flight-data.service';
import {
  buildCreationRafScheduleId,
  CREATION_RAF_SCHEDULE_SOURCE,
} from '../creation/utils/creation-raf.util';
import {
  StationScope,
  fixedStationScope,
  type StationScopeContext,
} from '../common/station/station-scope';
import {
  hoursToHhMm,
  parseMaaRafWorkbook,
  type MaaRafExcelFlight,
} from './maa-raf-excel.util';

export type MaaRafSeedOptions = {
  dryRun?: boolean;
  fromYmd?: string | null;
  toYmd?: string | null;
  sheetName?: string;
  station?: string;
};

export type MaaRafSeedSummary = {
  dryRun: boolean;
  stationCode: string;
  sheetName: string;
  totalFlights: number;
  flightsProcessed: number;
  creationInserted: number;
  creationUpdated: number;
  fhrUpserted: number;
  airlinesUpserted: number;
  equipmentLines: number;
  skippedRows: number;
  skippedOutsideWindow: number;
  unresolvedEquipmentCodes: string[];
  rowErrors: { excelSerial: number; message: string }[];
  notes: string[];
};

@Injectable()
export class MaaRafExcelSeedService {
  private readonly log = new Logger(MaaRafExcelSeedService.name);

  constructor(
    @InjectModel(CreationRaf.name)
    private readonly creationRafModel: Model<CreationRafDocument>,
    @InjectModel(AdvanceRafAirline.name)
    private readonly rafAirlineModel: Model<AdvanceRafAirlineDocument>,
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly rawFlightDataService: RawFlightDataService,
  ) {}

  async importFromFilePath(
    absolutePath: string,
    opts: MaaRafSeedOptions = {},
  ): Promise<MaaRafSeedSummary> {
    const wb = XLSX.readFile(absolutePath, { cellDates: false, raw: true });
    return this.importWorkbook(wb, opts);
  }

  async importWorkbook(
    wb: XLSX.WorkBook,
    opts: MaaRafSeedOptions = {},
  ): Promise<MaaRafSeedSummary> {
    const dryRun = !!opts.dryRun;
    const stationCode = String(opts.station ?? 'MAA').trim().toUpperCase() || 'MAA';
    const station = fixedStationScope(stationCode);

    const parsed = parseMaaRafWorkbook(wb, {
      sheetName: opts.sheetName,
      fromYmd: opts.fromYmd,
      toYmd: opts.toYmd,
    });

    const summary: MaaRafSeedSummary = {
      dryRun,
      stationCode,
      sheetName: parsed.sheetName,
      totalFlights: parsed.flights.length,
      flightsProcessed: 0,
      creationInserted: 0,
      creationUpdated: 0,
      fhrUpserted: 0,
      airlinesUpserted: 0,
      equipmentLines: 0,
      skippedRows: parsed.skippedRows,
      skippedOutsideWindow: parsed.skippedOutsideWindow,
      unresolvedEquipmentCodes: parsed.unresolvedEquipmentCodes,
      rowErrors: [],
      notes: [
        'Writes creation-raf + raf_collection + advance-raf-airline.',
        'Operational serials allocated via flight_instance_index (idempotent on scheduleId).',
        'Billing RAF page lists equipment/manpower lines from raf_collection.rafAdhocDetails.services.',
        'Rates: RAF contract rate cards (RAF - Equipment/Manpower - …) then RAF adhoc tariff.',
      ],
    };

    // Workbook may use multiple Excel serials for one airline+flight+date —
    // merge equipment lines so later upserts do not wipe earlier services.
    const flights = mergeFlightsByScheduleKey(parsed.flights);
    summary.totalFlights = flights.length;
    summary.notes.push(
      `Merged ${parsed.flights.length} Excel serial groups → ${flights.length} unique RAF flights.`,
    );

    if (dryRun) {
      summary.flightsProcessed = flights.length;
      summary.equipmentLines = flights.reduce((n, f) => n + f.services.length, 0);
      summary.notes.push(
        `Dry run sample: ${flights
          .slice(0, 3)
          .map(
            (f) =>
              `#${f.excelSerial} ${f.customerCode} ${f.flightNo} ${f.operationDate} (${f.services.length} lines)`,
          )
          .join(' | ')}`,
      );
      return summary;
    }

    const airlineKeys = new Map<string, { airline: string; airlineCode: string }>();
    for (const flight of flights) {
      const code = flight.customerCode || flight.customerName.slice(0, 4).toUpperCase();
      const key = code || flight.customerName.toUpperCase();
      if (!key) continue;
      if (!airlineKeys.has(key)) {
        airlineKeys.set(key, {
          airline: flight.customerName || code,
          airlineCode: code,
        });
      }
    }

    for (const row of airlineKeys.values()) {
      await this.upsertRafAirline(row, station);
      summary.airlinesUpserted += 1;
    }

    for (const flight of flights) {
      try {
        const result = await this.upsertFlight(flight, station);
        summary.flightsProcessed += 1;
        summary.equipmentLines += flight.services.length;
        summary.fhrUpserted += 1;
        if (result.created) summary.creationInserted += 1;
        else summary.creationUpdated += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.warn(`RAF seed failed excelSerial=${flight.excelSerial}: ${message}`);
        summary.rowErrors.push({ excelSerial: flight.excelSerial, message });
      }
    }

    return summary;
  }

  private async upsertRafAirline(
    row: { airline: string; airlineCode: string },
    station: StationScopeContext,
  ): Promise<void> {
    const filter = StationScope.filter(
      {
        $or: [
          { airlineCode: row.airlineCode },
          { airline: row.airline },
        ],
      },
      station,
    );
    const existing = await this.rafAirlineModel.findOne(filter).lean();
    if (existing) {
      await this.rafAirlineModel.updateOne(
        { _id: existing._id },
        {
          $set: {
            airline: row.airline,
            airlineCode: row.airlineCode,
            // Keep existing cleaning flags; equipment billing does not require them.
          },
        },
      );
      return;
    }
    await this.rafAirlineModel.create({
      airline: row.airline,
      airlineCode: row.airlineCode,
      deepCleaning: false,
      nightHaltCleaning: false,
      exteriorCleaning: false,
      stationCode: station.stationCode,
    });
  }

  private async upsertFlight(
    flight: MaaRafExcelFlight,
    station: StationScopeContext,
  ): Promise<{ created: boolean; serialNo: string }> {
    const airline = flight.customerName || flight.customerCode;
    const flightNo = flight.flightNo;
    const operationDate = flight.operationDate;
    if (!airline || !flightNo || !operationDate) {
      throw new Error('Missing airline / flightNo / operationDate');
    }

    const scheduleId = buildCreationRafScheduleId({
      airline,
      flightNo,
      operationDateDdMmYyyy: operationDate,
    });
    if (!scheduleId) {
      throw new Error('Could not build RAF scheduleId');
    }

    const existing = await this.creationRafModel
      .findOne(
        StationScope.filter(
          {
            $or: [
              { scheduleId },
              {
                airlines: airline,
                flightNo,
                $or: [
                  { operationDate },
                  { date: operationDate },
                  { date2: operationDate },
                ],
              },
            ],
          },
          station,
        ),
      )
      .lean();

    let serialNo: string;
    let created = false;

    if (existing?.serialNo) {
      serialNo = String(existing.serialNo);
      await this.creationRafModel.updateOne(
        { _id: existing._id },
        {
          $set: {
            airlines: airline,
            airlineCode: flight.customerCode,
            flightNo,
            acType: flight.typeCraft,
            categoryOfFlight: flight.categoryOfFlight,
            date: operationDate,
            date2: flight.stdDate || operationDate,
            operationDate,
            scheduleId,
            skdNonSkd: 'Non-Schedule',
            flightType: 'RAF',
            isRafFlight: true,
            scheduleSource: CREATION_RAF_SCHEDULE_SOURCE,
            opsType: 'Ramp Handling Only',
            stationCode: station.stationCode,
            modifiedBy: 'seed:maa-raf',
          },
        },
      );
    } else {
      const allocated =
        await this.rawFlightDataService.ensureOperationalSerialForScheduleDay(
          scheduleId,
          operationDate,
        );
      serialNo = allocated.serialNo;
      try {
        await this.creationRafModel.create({
          serialNo,
          airlines: airline,
          airlineCode: flight.customerCode,
          flightNo,
          acType: flight.typeCraft,
          categoryOfFlight: flight.categoryOfFlight,
          date: operationDate,
          date2: flight.stdDate || operationDate,
          operationDate,
          scheduleId,
          skdNonSkd: 'Non-Schedule',
          flightType: 'RAF',
          isRafFlight: true,
          scheduleSource: CREATION_RAF_SCHEDULE_SOURCE,
          opsType: 'Ramp Handling Only',
          stationCode: station.stationCode,
          createdBy: 'seed:maa-raf',
          modifiedBy: 'seed:maa-raf',
        });
        created = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/E11000|duplicate/i.test(msg)) {
          const raced = await this.creationRafModel
            .findOne(StationScope.filter({ scheduleId }, station))
            .lean();
          if (raced?.serialNo) {
            serialNo = String(raced.serialNo);
            created = false;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    const serialNum = Number(serialNo);
    if (!Number.isFinite(serialNum) || serialNum <= 0) {
      throw new Error(`Invalid allocated serial ${serialNo}`);
    }

    const listType = flight.services.some((s) => s.kind === 'manpower')
      ? flight.services.every((s) => s.kind === 'manpower')
        ? 'Manpower'
        : 'Equipment'
      : 'Equipment';

    const services = flight.services.map((s, idx) => ({
      id: `seed-maa-raf-${flight.excelSerial}-${idx + 1}`,
      service: s.particular,
      equipmentCode: s.equipmentCode,
      serviceCode: s.serviceCode,
      kind: s.kind,
      unit: s.uom,
      quantity: s.usageHours > 0 ? String(s.usageHours) : '1',
      weight: '0.00',
      fromDate: s.fromDate,
      fromTime: s.fromTime,
      toDate: s.toDate,
      toTime: s.toTime,
      uses: s.uses || hoursToHhMm(s.usageHours),
      usageHours: s.usageHours,
      remarks: s.remarks,
      from: `${s.fromDate} ${s.fromTime}`.trim(),
      to: `${s.toDate} ${s.toTime}`.trim(),
    }));

    const mainDetails = {
      SerialNo: serialNum,
      flightSerialNumber: serialNum,
      Airline: airline,
      airlineName: airline,
      Arline_Code: flight.customerCode,
      FlightNo: flightNo,
      flightCode: flightNo,
      ArrivalFltNo: flightNo,
      DepartureFltNo: flightNo,
      TypeCraft: flight.typeCraft,
      aircraftType: flight.typeCraft,
      TypeofHandling: 'Ramp Handling Only',
      Typeofflight: flight.categoryOfFlight,
      Cate_of_Flight: flight.categoryOfFlight,
      STADate: operationDate,
      STDDate: flight.stdDate || operationDate,
      ATADate: operationDate,
      ATDDate: flight.atdDate || flight.stdDate || operationDate,
      STATime: '00:00',
      STDTime: '00:00',
      ATATime: '00:00',
      ATDTime: '00:00',
    };

    const rafAdhocDetails = {
      airline,
      airlineCode: flight.customerCode,
      flightNo,
      aircraft: flight.typeCraft,
      operation: 'Ramp Handling Only',
      typeOfFlight: flight.categoryOfFlight,
      staDate: operationDate,
      stdDate: flight.stdDate || operationDate,
      ataDate: operationDate,
      atdDate: flight.atdDate || flight.stdDate || operationDate,
      staTime: '00:00',
      stdTime: '00:00',
      ataTime: '00:00',
      atdTime: '00:00',
      listType,
      excelSerial: flight.excelSerial,
      seededFrom: 'MAA_RAF_MARCH-JULY',
      services,
    };

    await this.fhrCollectionService.upsertMerge(
      serialNum,
      {
        mainDetails,
        rafAdhocDetails,
      },
      'seed_maa_raf_excel',
      station,
    );

    return { created, serialNo };
  }
}

/** Collapse Excel serial groups that share airline + flight + operating day. */
function mergeFlightsByScheduleKey(
  flights: MaaRafExcelFlight[],
): MaaRafExcelFlight[] {
  const byKey = new Map<string, MaaRafExcelFlight>();
  for (const flight of flights) {
    const airline = String(flight.customerName || flight.customerCode)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const flightNo = String(flight.flightNo)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const key = `${airline}|${flightNo}|${flight.operationDate}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...flight,
        services: [...flight.services],
      });
      continue;
    }
    existing.services.push(...flight.services);
    if (!existing.customerCode && flight.customerCode) {
      existing.customerCode = flight.customerCode;
    }
    if (!existing.typeCraft && flight.typeCraft) {
      existing.typeCraft = flight.typeCraft;
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.operationYmd.localeCompare(b.operationYmd) ||
      a.excelSerial - b.excelSerial,
  );
}
