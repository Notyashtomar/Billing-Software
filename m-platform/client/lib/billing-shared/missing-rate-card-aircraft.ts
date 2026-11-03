/**
 * Compares FHR flights for one airline and billing month with the aircraft
 * already saved on that airline's rate card. Missing types are reported only.
 */

export type RateCardAircraftRow = {
  aircraftType?: string | null;
  active?: boolean | null;
  validFrom?: string | null;
  validTo?: string | null;
  openEnded?: boolean | null;
};

export type ScheduledFlightAircraft = {
  airlineName?: string | null;
  flightNo?: string | null;
  aircraftType?: string | null;
  cancelled?: boolean | null;
};

export type MissingRateCardAircraftGap = {
  airlineName: string;
  customerCode: string;
  aircraftType: string;
  flightNumbers: string[];
  /** Flights seen for this aircraft, including ones past the listed sample. */
  flightCount: number;
};

/** IATA equipment codes on FHR rows that mean the same type as a rate-card label. */
const AIRCRAFT_CODE_ALIASES: Record<string, string> = {
  '77F': 'B777F',
  B77F: 'B777F',
  '77L': 'B777',
  B77L: 'B777',
  '772': 'B777',
  B772: 'B777',
  '773': 'B777',
  B773: 'B777',
  '77W': 'B777',
  B77W: 'B777',
};

export function compactAircraftType(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function canonicalAircraftType(value: string): string {
  const compact = compactAircraftType(value);
  return AIRCRAFT_CODE_ALIASES[compact] ?? compact;
}

/** "A330/A350" and notes in parentheses become separate aircraft tokens. */
export function rateCardAircraftTokens(aircraftType: string): string[] {
  const aircraft = aircraftType.trim();
  if (!aircraft) return [];
  const withoutNotes = aircraft.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, ' ').trim();
  const parts = withoutNotes
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  return [withoutNotes || aircraft];
}

function rowCoversBillingMonth(
  row: RateCardAircraftRow,
  periodFrom: string,
  periodTo: string,
): boolean {
  if (row.active === false) return false;
  const start = String(row.validFrom ?? '').slice(0, 10);
  const end = row.openEnded ? '9999-12-31' : String(row.validTo ?? '').slice(0, 10);
  if (!start || !end) return true;
  return start <= periodTo && end >= periodFrom;
}

function flightCoveredByRateCard(
  flightAircraft: string,
  rows: RateCardAircraftRow[],
): boolean {
  const flightKey = canonicalAircraftType(flightAircraft);
  if (!flightKey) return true;
  return rows.some((row) => {
    const tokens = rateCardAircraftTokens(String(row.aircraftType ?? ''));
    if (tokens.length === 0) return true;
    return tokens.some((token) => canonicalAircraftType(token) === flightKey);
  });
}

const MAX_FLIGHT_NUMBERS = 40;

/**
 * Aircraft that flew for this airline in the billing month and have no
 * matching rate-card row. Rows are not created.
 */
export function findFlightsMissingRateCardAircraft(input: {
  airlineName: string;
  customerCode: string;
  periodFrom: string;
  periodTo: string;
  rateCardRows: RateCardAircraftRow[];
  flights: ScheduledFlightAircraft[];
}): MissingRateCardAircraftGap[] {
  const covering = input.rateCardRows.filter((row) =>
    rowCoversBillingMonth(row, input.periodFrom, input.periodTo),
  );
  const byAircraft = new Map<string, MissingRateCardAircraftGap>();

  for (const flight of input.flights) {
    if (flight.cancelled) continue;
    const aircraftType = String(flight.aircraftType ?? '').trim();
    if (!aircraftType) continue;
    if (flightCoveredByRateCard(aircraftType, covering)) continue;

    const flightNo = String(flight.flightNo ?? '').trim();
    const key = canonicalAircraftType(aircraftType);
    const existing = byAircraft.get(key);
    if (!existing) {
      byAircraft.set(key, {
        airlineName: input.airlineName.trim() || String(flight.airlineName ?? '').trim(),
        customerCode: input.customerCode.trim().toUpperCase(),
        aircraftType,
        flightNumbers: flightNo ? [flightNo] : [],
        flightCount: 1,
      });
      continue;
    }
    existing.flightCount += 1;
    if (
      flightNo &&
      existing.flightNumbers.length < MAX_FLIGHT_NUMBERS &&
      !existing.flightNumbers.some((item) => item.toUpperCase() === flightNo.toUpperCase())
    ) {
      existing.flightNumbers.push(flightNo);
    }
  }

  return [...byAircraft.values()].sort((a, b) =>
    a.aircraftType.localeCompare(b.aircraftType),
  );
}
