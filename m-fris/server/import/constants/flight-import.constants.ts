export const IMPORT_BATCH_SIZE = 500;

export const MAX_EXCEL_FILE_BYTES = 5 * 1024 * 1024;

export const MAX_EXCEL_DATA_ROWS = 10_000;

export const ALLOWED_EXCEL_EXTENSIONS = ['.xlsx', '.xls'] as const;

export const ALLOWED_EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

export const REQUIRED_HEADERS = [
  'airline',
  'flightNo',
  'serialNo',
  'acType',
  'routing',
  'staTime',
  'aBody',
  'stdTime',
  'opsType',
  'skdNsnkdr',
  'airlineCode',
  'freighter',
  'date',
  'date2',
  'category',
] as const;

/** Header aliases mapped to canonical REQUIRED_HEADERS keys. */
export const HEADER_ALIASES: Record<string, (typeof REQUIRED_HEADERS)[number]> = {
  airline: 'airline',
  airlines: 'airline',
  flightno: 'flightNo',
  'flight no': 'flightNo',
  serialno: 'serialNo',
  'serial no': 'serialNo',
  slno: 'serialNo',
  'sl no': 'serialNo',
  actype: 'acType',
  'ac type': 'acType',
  aircraft: 'acType',
  routing: 'routing',
  statime: 'staTime',
  'sta time': 'staTime',
  sta: 'staTime',
  abody: 'aBody',
  'a body': 'aBody',
  'aircraft body': 'aBody',
  stdtime: 'stdTime',
  'std time': 'stdTime',
  std: 'stdTime',
  opstype: 'opsType',
  'ops type': 'opsType',
  skdnsnkdr: 'skdNsnkdr',
  skdnonSkd: 'skdNsnkdr',
  'skd/non skd': 'skdNsnkdr',
  'skd non skd': 'skdNsnkdr',
  airlinecode: 'airlineCode',
  'airline code': 'airlineCode',
  code: 'airlineCode',
  freighter: 'freighter',
  date: 'date',
  'sta date': 'date',
  stadate: 'date',
  date2: 'date2',
  'std date': 'date2',
  stddate: 'date2',
  category: 'category',
  'category of flight': 'category',
  categoryofflight: 'category',
};

export const OPS_TYPE_VALUES = ['Arrival', 'Departure', 'Turnaround'] as const;

export const CATEGORY_VALUES = ['Domestic', 'International'] as const;

export const YN_VALUES = ['Y', 'N'] as const;

/** Single leg (AI101 / AI-101) or turnaround pair (IX1089/IX1685). */
export const FLIGHT_NO_REGEX =
  /^(?:[A-Z0-9]{2,16}|[A-Z0-9]{1,4}-[A-Z0-9]{1,12}|[A-Z0-9-]{2,16}\/[A-Z0-9-]{2,16})$/i;

export const ROUTING_REGEX = /^[A-Z]{3}-[A-Z]{3}$/;

export const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const SERIAL_NO_REGEX = /^\d{6}$/;

export const IATA_CODE_REGEX = /^[A-Z]{3}$/;

export const IMPORT_ERROR_TYPES = {
  FILE_VALIDATION_FAILED: 'FILE_VALIDATION_FAILED',
  HEADER_VALIDATION_FAILED: 'HEADER_VALIDATION_FAILED',
  ROW_VALIDATION_FAILED: 'ROW_VALIDATION_FAILED',
  BUSINESS_VALIDATION_FAILED: 'BUSINESS_VALIDATION_FAILED',
  DATABASE_VALIDATION_FAILED: 'DATABASE_VALIDATION_FAILED',
} as const;

export const IMPORT_HISTORY_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  FAILED: 'failed',
} as const;

export type ImportHistoryStatus =
  (typeof IMPORT_HISTORY_STATUS)[keyof typeof IMPORT_HISTORY_STATUS];
