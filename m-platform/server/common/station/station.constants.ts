/**
 * Multi-station data-segregation constants.
 *
 * Every station-owned collection carries a `stationCode` (clean IATA code such
 * as `DEL`, `IXC`, `MAA`). The value is always derived from the authenticated
 * user's active station — never trusted from the client.
 */

/** The field name stamped on every station-owned document. */
export const STATION_CODE_FIELD = 'stationCode' as const;

/**
 * The station that all data belonged to before the multi-station rollout.
 * Legacy documents are backfilled with this value by the migration scripts.
 */
export const LEGACY_STATION_CODE = 'MAA' as const;

/**
 * Station code for the global aircraft master catalog. Aircraft types are shared
 * across all FRIS stations — not owned by a single airport.
 */
export const GLOBAL_AIRCRAFT_STATION_CODE = 'GLOBAL' as const;

/**
 * Virtual FRIS station for testing. Not an airport and not in the station map.
 * Operational data stays on this code. Advance → Gateway reads are the exception:
 * the testing station lists gateway masters from every station.
 */
export const TESTING_STATION_CODE = 'TEST' as const;

export const LEGACY_STATION_CODE_ALIASES = [
  LEGACY_STATION_CODE,
  'CHENNAI',
  'CHENNAI AIRPORT',
  'CHENNAI INTERNATIONAL AIRPORT',
  'MADRAS',
] as const;

const STATION_CODE_ALIASES: Record<string, string> = {
  CHENNAI: LEGACY_STATION_CODE,
  'CHENNAI AIRPORT': LEGACY_STATION_CODE,
  'CHENNAI INTERNATIONAL AIRPORT': LEGACY_STATION_CODE,
  MADRAS: LEGACY_STATION_CODE,
};

/** Normalize any raw station code input to the canonical stored form. */
export function normalizeStationCode(
  raw: string | null | undefined,
): string | undefined {
  const input = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!input) return undefined;
  const code = input.split('-')[0]?.trim() || input;
  const aliased = STATION_CODE_ALIASES[code] ?? code;
  return aliased || undefined;
}

export function isTestingStationCode(
  raw: string | null | undefined,
): boolean {
  return normalizeStationCode(raw) === TESTING_STATION_CODE;
}
