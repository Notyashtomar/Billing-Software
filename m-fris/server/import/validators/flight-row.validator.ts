import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FlightImportDto } from '../dto/flight-import.dto';
import {
  IMPORT_ERROR_TYPES,
} from '../constants/flight-import.constants';
import {
  compareDisplayDates,
  compareTimes,
  normalizeImportDate,
} from '../utils/date.util';
import type { ImportValidationError } from '../utils/import-error-collector';

export interface ValidatedFlightRow {
  rowNumber: number;
  dto: FlightImportDto;
  raw: Record<string, string>;
}

export async function validateFlightImportRow(
  rowNumber: number,
  raw: Record<string, string>,
): Promise<{ valid: boolean; dto?: FlightImportDto; errors: ImportValidationError[] }> {
  const errors: ImportValidationError[] = [];

  const date = normalizeImportDate(raw.date ?? '');
  if (!date) {
    errors.push({
      row: rowNumber,
      column: 'date',
      value: raw.date,
      message: 'Invalid date. Use dd/MM/yyyy or yyyy-MM-dd.',
      type: IMPORT_ERROR_TYPES.ROW_VALIDATION_FAILED,
    });
  }

  const date2 = normalizeImportDate(raw.date2 ?? '');
  if (!date2) {
    errors.push({
      row: rowNumber,
      column: 'date2',
      value: raw.date2,
      message: 'Invalid date2. Use dd/MM/yyyy or yyyy-MM-dd.',
      type: IMPORT_ERROR_TYPES.ROW_VALIDATION_FAILED,
    });
  }

  const normalizedRaw = {
    ...raw,
    ...(date ? { date } : {}),
    ...(date2 ? { date2 } : {}),
  };

  const dto = plainToInstance(FlightImportDto, normalizedRaw);
  const validationErrors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  for (const ve of validationErrors) {
    const column = ve.property;
    const constraints = ve.constraints ?? {};
    for (const message of Object.values(constraints)) {
      errors.push({
        row: rowNumber,
        column,
        value: (normalizedRaw as Record<string, unknown>)[column],
        message,
        type: IMPORT_ERROR_TYPES.ROW_VALIDATION_FAILED,
      });
    }
  }

  if (date && date2 && compareDisplayDates(date, date2) > 0) {
    errors.push({
      row: rowNumber,
      column: 'date2',
      value: date2,
      message: 'date2 cannot be before date.',
      type: IMPORT_ERROR_TYPES.ROW_VALIDATION_FAILED,
    });
  }

  if (
    date &&
    date2 &&
    date === date2 &&
    dto.staTime &&
    dto.stdTime &&
    compareTimes(dto.stdTime, dto.staTime) < 0
  ) {
    errors.push({
      row: rowNumber,
      column: 'stdTime',
      value: dto.stdTime,
      message: 'stdTime cannot be earlier than staTime on the same date.',
      type: IMPORT_ERROR_TYPES.BUSINESS_VALIDATION_FAILED,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, dto, errors: [] };
}
