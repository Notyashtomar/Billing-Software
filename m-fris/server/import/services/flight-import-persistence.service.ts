import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  CreationAdditionalFlights,
  CreationAdditionalFlightsDocument,
} from '../../creation/schema/creation-additional-flights.schema';
import { buildAdditionalFlightScheduleId } from '../../creation/utils/additional-flight.util';
import { invalidateListDailyFromAdvanceCache } from '../../raw-flight-data/utils/list-daily-from-advance-cache.util';
import { IMPORT_BATCH_SIZE } from '../constants/flight-import.constants';
import type { FlightImportDto } from '../dto/flight-import.dto';

function mapDtoToDocument(dto: FlightImportDto): Record<string, string | boolean> {
  const operationDate = dto.date;
  const scheduleId = buildAdditionalFlightScheduleId({
    airline: dto.airline,
    flightNo: dto.flightNo,
    operationDateDdMmYyyy: operationDate,
  });
  return {
    serialNo: dto.serialNo,
    airlines: dto.airline,
    flightNo: dto.flightNo.toUpperCase(),
    acType: dto.acType,
    aBody: dto.aBody === 'Y' ? 'WB' : 'NB',
    airlineCode: dto.airlineCode.toUpperCase(),
    routing: dto.routing.toUpperCase(),
    staTime: dto.staTime,
    stdTime: dto.stdTime,
    date: dto.date,
    date2: dto.date2,
    operationDate,
    ...(scheduleId ? { scheduleId } : {}),
    opsType: dto.opsType,
    skdNonSkd: dto.skdNsnkdr || 'Additional',
    categoryOfFlight: dto.category,
    freighter: dto.freighter === 'Y' ? 'Yes' : 'No',
    flightType: 'Additional',
    isAdditionalFlight: true,
  };
}

@Injectable()
export class FlightImportPersistenceService {
  private readonly logger = new Logger(FlightImportPersistenceService.name);

  constructor(
    @InjectModel(CreationAdditionalFlights.name)
    private readonly additionalFlightsModel: Model<CreationAdditionalFlightsDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async insertValidRows(
    rows: Array<{ rowNumber: number; dto: FlightImportDto }>,
  ): Promise<number> {
    if (!rows.length) return 0;

    const session = await this.connection.startSession();
    let inserted = 0;

    try {
      await session.withTransaction(async () => {
        for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
          const chunk = rows.slice(i, i + IMPORT_BATCH_SIZE);
          const docs = chunk.map((r) => mapDtoToDocument(r.dto));
          const result = await this.additionalFlightsModel.insertMany(docs, {
            session,
            ordered: false,
          });
          inserted += result.length;
          this.logger.log(
            `Inserted chunk ${i / IMPORT_BATCH_SIZE + 1}: ${result.length} rows`,
          );
        }
      });
    } finally {
      await session.endSession();
    }

    if (inserted > 0) {
      invalidateListDailyFromAdvanceCache();
    }

    return inserted;
  }
}
