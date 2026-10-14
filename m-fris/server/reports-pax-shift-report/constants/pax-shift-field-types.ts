/**
 * Pax Shift Report field types (aligned with PDF / Open sidebar forms).
 * Counts and metrics → number; labels, times, dates, codes → string.
 */

/** Flight Details (`PaxShiftFlightHandlingForm`) — numeric count fields. */
export const PAX_SHIFT_FLIGHT_DETAILS_NUMERIC_KEYS = new Set([
  'uhCounters',
  'delayMins',
  'level4Bags',
  'mhbPir',
  'mhbBag1',
  'mhbDpr',
  'mhbBag2',
  'mhbOhd',
  'mhbAoc',
  'mhbBagClmcFig',
  'mhbBagShort',
  'addTeleChk',
  'addWebChk',
  'addMilesMore',
  'addDepu',
  'addDepa',
  'addInad',
  'addOffloadImmig',
  'addGateNoShow',
  'addCussCheckin',
]);

const PAX_ROW_PREFIX = /^pax_(arrivals|departures)_/;

/** 24-hour times stored as `HH:mm`. */
export const PAX_SHIFT_FLIGHT_DETAILS_TIME_KEYS = new Set([
  'sta',
  'std',
  'eta',
  'ata',
  'etd',
  'atd',
  'gt',
  'agt',
  'groundTime',
  'addCabinDoorClosed',
  'addHoldClosed',
  'addCrewBoarded',
]);

/** Calendar dates stored as `yyyy-MM-dd`. */
export const PAX_SHIFT_FLIGHT_DETAILS_DATE_KEYS = new Set([
  'flightDate',
  'compiledDate',
]);

export function isPaxShiftFlightDetailsTimeKey(key: string): boolean {
  return PAX_SHIFT_FLIGHT_DETAILS_TIME_KEYS.has(key.trim());
}

export function isPaxShiftFlightDetailsDateKey(key: string): boolean {
  return PAX_SHIFT_FLIGHT_DETAILS_DATE_KEYS.has(key.trim());
}

export function isPaxShiftFlightDetailsNumericKey(key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  if (PAX_SHIFT_FLIGHT_DETAILS_NUMERIC_KEYS.has(k)) return true;
  return PAX_ROW_PREFIX.test(k);
}

export type PaxShiftFlightDetailsValue = string | number;

export type PaxShiftFlightDetailsRecord = Record<string, PaxShiftFlightDetailsValue>;
