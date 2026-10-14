import { IMPORT_ERROR_TYPES } from '../constants/flight-import.constants';
import type { FlightImportDto } from '../dto/flight-import.dto';
import type { ImportValidationError } from '../utils/import-error-collector';
import { parseRoutingAirports } from '../utils/routing.util';

export interface FlightImportMasterSnapshot {
  airlineByName: Map<string, { name: string; code: string }>;
  airlineByCode: Map<string, { name: string; code: string }>;
  aircraftTypes: Set<string>;
  airportCodes: Set<string>;
}

export interface FileDuplicateTracker {
  flightDateKeys: Set<string>;
  serialNos: Set<string>;
}

export function validateBusinessRules(
  rowNumber: number,
  dto: FlightImportDto,
  masters: FlightImportMasterSnapshot,
  tracker: FileDuplicateTracker,
): ImportValidationError[] {
  const errors: ImportValidationError[] = [];

  const dupKey = `${dto.flightNo.toUpperCase()}|${dto.date}`;
  if (tracker.flightDateKeys.has(dupKey)) {
    errors.push({
      row: rowNumber,
      column: 'flightNo',
      value: dto.flightNo,
      message: 'Duplicate flightNo + date within uploaded file.',
      type: IMPORT_ERROR_TYPES.BUSINESS_VALIDATION_FAILED,
    });
  } else {
    tracker.flightDateKeys.add(dupKey);
  }

  if (tracker.serialNos.has(dto.serialNo)) {
    errors.push({
      row: rowNumber,
      column: 'serialNo',
      value: dto.serialNo,
      message: 'Duplicate serialNo within uploaded file.',
      type: IMPORT_ERROR_TYPES.BUSINESS_VALIDATION_FAILED,
    });
  } else {
    tracker.serialNos.add(dto.serialNo);
  }

  const airlineKey = dto.airline.trim().toLowerCase();
  const masterAirline =
    masters.airlineByName.get(airlineKey) ??
    masters.airlineByCode.get(dto.airlineCode.toUpperCase());

  if (!masterAirline) {
    errors.push({
      row: rowNumber,
      column: 'airline',
      value: dto.airline,
      message: 'Airline does not exist in master data.',
      type: IMPORT_ERROR_TYPES.BUSINESS_VALIDATION_FAILED,
    });
  } else if (masterAirline.code.toUpperCase() !== dto.airlineCode.toUpperCase()) {
    errors.push({
      row: rowNumber,
      column: 'airlineCode',
      value: dto.airlineCode,
      message: `airlineCode does not match airline "${masterAirline.name}" (${masterAirline.code}).`,
      type: IMPORT_ERROR_TYPES.BUSINESS_VALIDATION_FAILED,
    });
  }

  const acKey = dto.acType.trim().toLowerCase();
  if (!masters.aircraftTypes.has(acKey)) {
    errors.push({
      row: rowNumber,
      column: 'acType',
      value: dto.acType,
      message: 'Aircraft type does not exist in master data.',
      type: IMPORT_ERROR_TYPES.BUSINESS_VALIDATION_FAILED,
    });
  }

  for (const airport of parseRoutingAirports(dto.routing)) {
    if (!masters.airportCodes.has(airport)) {
      errors.push({
        row: rowNumber,
        column: 'routing',
        value: dto.routing,
        message: `Airport "${airport}" does not exist in master data.`,
        type: IMPORT_ERROR_TYPES.BUSINESS_VALIDATION_FAILED,
      });
      break;
    }
  }

  return errors;
}
