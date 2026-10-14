import {
  augmentKeyToModulesForSheet1,
  ImportTarget,
  schemaWhitelistFor,
} from './maa-excel-mapping';
import { FLAT_IMPORT_DROP_KEYS } from './maa-flat-import.util';

const FORM_TARGETS: ImportTarget[] = [
  'main',
  'terminal',
  'ramp',
  'loadControl',
  'remarks',
];

/**
 * Keys handled in `buildMainDto` / flat row normalizer but not always present in
 * whitelist sets (or routed only via raw reads).
 */
const MAIN_RAW_KEYS = new Set([
  'airline',
  'airlineName',
  'Airline',
  'flightNo',
  'FlightNo',
  'flightNumber',
  'delay',
  'Delay',
  'departureStatus',
  'reasonOfDelay',
  'ReasonofDelay',
  'arrivalFlightNo',
  'departureFlightNo',
  'ArrivalFltNo',
  'DepartureFltNo',
  'ata',
  'ataTime',
  'acType',
  'aircraftType',
  'AircraftBody',
  'Cgo',
  'Return_To_Ramp',
  'fltcancelled',
  'IsSplit',
  'IsStationBased',
  'Medical_Passenger',
]);

/**
 * Build Sheet2-equivalent routing for a single-sheet workbook whose row-1 headers
 * are canonical FHR schema keys (`slNo`, `staDate`, `bayPlanned`, …).
 */
export function buildKeyToModulesFromFlatHeaders(
  headers: string[],
): Map<string, Set<ImportTarget>> {
  const map = new Map<string, Set<ImportTarget>>();

  const add = (key: string, target: ImportTarget) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(target);
  };

  for (const header of headers) {
    const key = String(header ?? '').trim();
    if (!key || key === 'slNo') continue;

    for (const target of FORM_TARGETS) {
      const whitelist = schemaWhitelistFor(target);
      if (whitelist?.has(key)) add(key, target);
    }

    if (MAIN_RAW_KEYS.has(key)) add(key, 'main');
  }

  augmentKeyToModulesForSheet1(headers, map);
  return map;
}

export function flatHeadersWithoutMapping(
  headers: string[],
  keyToModules: Map<string, Set<ImportTarget>>,
): string[] {
  const aliasOrIgnored = new Set<string>([
    'ETDdate',
    'mtow',
    'SerialNo',
    'SlNo',
    'SNO',
    'STATIME',
    'FlightCancelled',
    'Freighter',
    ...FLAT_IMPORT_DROP_KEYS,
  ]);

  return headers.filter((h) => {
    const key = String(h ?? '').trim();
    if (!key || key === 'slNo') return false;
    if (aliasOrIgnored.has(key)) return false;
    return !keyToModules.has(key);
  });
}
