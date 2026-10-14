/**
 * Fields that must match between legacy `listDailyFromAdvance` and the
 * materialized `scheduled_daily_rows` projection (CP-01 parity harness).
 *
 * Compared on `row.data` (and top-level helpers where noted).
 */
export const SCHEDULED_DAILY_PARITY_DATA_FIELDS = [
  'SlNo',
  'slNo',
  'serialNo',
  'SerialNo',
  'legacySlNo',
  'scheduleMasterSerial',
  'scheduleId',
  'airline',
  'Airline',
  'airlineCode',
  'flightNo',
  'FlightNo',
  'aircraft',
  'Aircraft',
  'staDate',
  'STADate',
  'staTime',
  'STATime',
  'stdDate',
  'STDDate',
  'stdTime',
  'STDTime',
  'exportedNAV',
  'Exported NAV',
  'rowStatus',
  'status',
  'flightCancelled',
  'TypeofHandling',
  'cateOfFlight',
  'categoryOfFlight',
] as const;

export type ScheduledDailyParityDataField =
  (typeof SCHEDULED_DAILY_PARITY_DATA_FIELDS)[number];
