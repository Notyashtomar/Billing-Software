/**
 * Creation → RAF (Ramp Assistance Forms) helpers.
 *
 * One-time non-customer operational flights. Never mutate Advance → Schedule Setup.
 */

import { ddMmYyyyToCompactYmd } from './daily-flight-override.util';
import {
  normalizeAirlineKey,
  normalizeFlightKey,
} from './additional-flight.util';

/** Daily-list / FHR marker for rows born from Creation → RAF. */
export const CREATION_RAF_SCHEDULE_SOURCE = 'creation_raf';

/** Prefix for synthetic scheduleId used by flight_instance_index. */
export const CREATION_RAF_SCHEDULE_ID_PREFIX = 'RAF|';

export function buildCreationRafScheduleId(input: {
  airline: string;
  flightNo: string;
  operationDateDdMmYyyy: string;
}): string {
  const ymd = ddMmYyyyToCompactYmd(input.operationDateDdMmYyyy);
  const airline = normalizeAirlineKey(input.airline).replace(/\|/g, ' ');
  const flight = normalizeFlightKey(input.flightNo);
  if (!ymd || !airline || !flight) return '';
  return `${CREATION_RAF_SCHEDULE_ID_PREFIX}${ymd}|${airline}|${flight}`;
}

export function isCreationRafScheduleId(scheduleId: unknown): boolean {
  return String(scheduleId ?? '')
    .trim()
    .startsWith(CREATION_RAF_SCHEDULE_ID_PREFIX);
}

export function isCreationRafScheduleSource(source: unknown): boolean {
  const src = String(source ?? '').trim();
  return src === CREATION_RAF_SCHEDULE_SOURCE || src.includes(CREATION_RAF_SCHEDULE_SOURCE);
}
