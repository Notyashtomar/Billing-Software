import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CreationAdditionalFlights,
  CreationAdditionalFlightsDocument,
} from '../../creation/schema/creation-additional-flights.schema';
import { IMPORT_ERROR_TYPES } from '../constants/flight-import.constants';
import type { FlightImportDto } from '../dto/flight-import.dto';
import type { ImportValidationError } from '../utils/import-error-collector';

export interface DbDuplicateSnapshot {
  flightDateKeys: Set<string>;
  serialNos: Set<string>;
}

@Injectable()
export class FlightImportDbValidationService {
  constructor(
    @InjectModel(CreationAdditionalFlights.name)
    private readonly additionalFlightsModel: Model<CreationAdditionalFlightsDocument>,
  ) {}

  async loadDuplicateSnapshot(
    rows: Array<{ rowNumber: number; dto: FlightImportDto }>,
  ): Promise<DbDuplicateSnapshot> {
    const flightPairs = rows.map((r) => ({
      airline: String(r.dto.airline ?? '').trim(),
      flightNo: r.dto.flightNo.toUpperCase(),
      date: r.dto.date,
    }));
    const serialNos = rows.map((r) => r.dto.serialNo);

    const existing = await this.additionalFlightsModel
      .find(
        {
          $or: [
            { serialNo: { $in: serialNos } },
            ...flightPairs.map((p) => ({
              flightNo: new RegExp(`^${escapeRegex(p.flightNo)}$`, 'i'),
              $or: [
                { date: p.date },
                { operationDate: p.date },
              ],
              ...(p.airline
                ? {
                    airlines: new RegExp(
                      `^${escapeRegex(p.airline)}$`,
                      'i',
                    ),
                  }
                : {}),
            })),
          ],
        },
        { serialNo: 1, flightNo: 1, date: 1, operationDate: 1, airlines: 1 },
      )
      .lean();

    const flightDateKeys = new Set<string>();
    const serialSet = new Set<string>();
    for (const doc of existing) {
      const fn = String(doc.flightNo ?? '').trim().toUpperCase();
      const dt = String(doc.operationDate ?? doc.date ?? '').trim();
      const al = String(doc.airlines ?? '').trim().toUpperCase();
      if (fn && dt) {
        flightDateKeys.add(`${al}|${fn}|${dt}`);
        // Legacy excel key (flight+date) — keep rejecting without airline when al empty
        flightDateKeys.add(`${fn}|${dt}`);
      }
      const sn = String(doc.serialNo ?? '').trim();
      if (sn) serialSet.add(sn);
    }

    return { flightDateKeys, serialNos: serialSet };
  }

  validateAgainstDatabase(
    rowNumber: number,
    dto: FlightImportDto,
    snapshot: DbDuplicateSnapshot,
  ): ImportValidationError[] {
    const errors: ImportValidationError[] = [];
    const airline = String(dto.airline ?? '').trim().toUpperCase();
    const flightKey = `${dto.flightNo.toUpperCase()}|${dto.date}`;
    const airlineFlightKey = `${airline}|${flightKey}`;

    if (
      snapshot.flightDateKeys.has(airlineFlightKey) ||
      snapshot.flightDateKeys.has(flightKey)
    ) {
      errors.push({
        row: rowNumber,
        column: 'flightNo',
        value: dto.flightNo,
        message:
          'An additional flight with the same airline, flight number, and date already exists.',
        type: IMPORT_ERROR_TYPES.DATABASE_VALIDATION_FAILED,
      });
    }

    if (snapshot.serialNos.has(dto.serialNo)) {
      errors.push({
        row: rowNumber,
        column: 'serialNo',
        value: dto.serialNo,
        message: 'serialNo already exists in database.',
        type: IMPORT_ERROR_TYPES.DATABASE_VALIDATION_FAILED,
      });
    }

    return errors;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
