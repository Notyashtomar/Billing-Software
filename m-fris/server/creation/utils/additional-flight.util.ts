/**
 * Creation → Additional Flights helpers.
 *
 * Business rule: one-time operational flights for a single date.
 * Never create/mutate Advance → Schedule Setup (`advance_schedule_setup`).
 */

import { ddMmYyyyToCompactYmd } from './daily-flight-override.util';

/** Daily-list / find marker for rows born from Additional Flights. */
export const ADDITIONAL_FLIGHT_SCHEDULE_SOURCE = 'creation_additional_flights';

/** Prefix for synthetic scheduleId used by flight_instance_index (not a master serial). */
export const ADDITIONAL_FLIGHT_SCHEDULE_ID_PREFIX = 'ADD|';

export function normalizeAirlineKey(airline: string): string {
  return String(airline ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Align with Schedule Airlines find: strip spaces/dashes/slashes for compare. */
export function normalizeFlightKey(flightNo: string): string {
  return String(flightNo ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-/]/g, '');
}

/**
 * Stable synthetic master id for one additional flight day.
 * Used as `scheduleId` / `scheduleMasterSerial` so attachStableSerials and
 * daily overrides can treat it like any other schedule identity — without
 * writing to `advance_schedule_setup`.
 */
export function buildAdditionalFlightScheduleId(input: {
  airline: string;
  flightNo: string;
  operationDateDdMmYyyy: string;
}): string {
  const ymd = ddMmYyyyToCompactYmd(input.operationDateDdMmYyyy);
  const airline = normalizeAirlineKey(input.airline).replace(/\|/g, ' ');
  const flight = normalizeFlightKey(input.flightNo);
  if (!ymd || !airline || !flight) return '';
  return `${ADDITIONAL_FLIGHT_SCHEDULE_ID_PREFIX}${ymd}|${airline}|${flight}`;
}

export function isAdditionalFlightScheduleId(scheduleId: unknown): boolean {
  return String(scheduleId ?? '')
    .trim()
    .startsWith(ADDITIONAL_FLIGHT_SCHEDULE_ID_PREFIX);
}

export function isAdditionalFlightScheduleSource(source: unknown): boolean {
  const src = String(source ?? '').trim();
  return (
    src === ADDITIONAL_FLIGHT_SCHEDULE_SOURCE ||
    src.includes(ADDITIONAL_FLIGHT_SCHEDULE_SOURCE)
  );
}
