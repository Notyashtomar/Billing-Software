export const MAG_FULL_HANDLING = 'Full Handling (Pax+Ramp)';
export const MAG_PAX_TERMINAL = 'Pax Terminal Services';
export const MAG_RAMP = 'Ramp Services';
export const MAG_CARGO_RAMP = 'Cargo Ramp Handling';

export type MagRateRow = {
  aircraftCode: string;
  serviceType: string;
  amount: number;
};

export type MagFlightInput = {
  aircraftType?: string;
  handling?: string;
  cargo?: boolean;
};

const BANDS = new Set(['B', 'C', 'D', 'E', 'F']);

/** Aircraft tariff band B–F. A single letter is used as-is. */
export function aircraftTariffBand(
  aircraftType: string,
  categoryByType: ReadonlyMap<string, string>,
): string {
  const raw = aircraftType.trim().toUpperCase();
  if (BANDS.has(raw)) return raw;
  const mapped = categoryByType.get(raw) ?? '';
  const letter = mapped.trim().toUpperCase().match(/\b([B-F])\b/)?.[1] ?? '';
  return BANDS.has(letter) ? letter : '';
}

/**
 * MAG column for the handling on the flight. Scheduled turnarounds use full handling.
 */
export function magServiceTypeForFlight(flight: MagFlightInput): string {
  const handling = String(flight.handling ?? '').trim().toLowerCase();
  const cargo =
    flight.cargo === true || /cargo|freighter/.test(handling);
  if (cargo) return MAG_CARGO_RAMP;
  if (/pax|passenger|terminal/.test(handling) && !/ramp|full|turn/.test(handling)) {
    return MAG_PAX_TERMINAL;
  }
  if (/ramp/.test(handling) && !/pax|passenger|full|turn/.test(handling)) {
    return MAG_RAMP;
  }
  return MAG_FULL_HANDLING;
}

export function magRateForFlight(
  rates: readonly MagRateRow[],
  band: string,
  serviceType: string,
): number {
  const code = band.trim().toUpperCase();
  const service = serviceType.trim().toLowerCase();
  const hit = rates.find(
    (rate) =>
      rate.aircraftCode.trim().toUpperCase() === code &&
      rate.serviceType.trim().toLowerCase() === service,
  );
  const amount = Number(hit?.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/** Sum of each flight's MAG rate. Same band and service is that rate times the flight count. */
export function magFloorForFlights(
  rates: readonly MagRateRow[],
  flights: readonly MagFlightInput[],
  categoryByType: ReadonlyMap<string, string>,
): number {
  let total = 0;
  for (const flight of flights) {
    const band = aircraftTariffBand(String(flight.aircraftType ?? ''), categoryByType);
    if (!band) continue;
    total += magRateForFlight(rates, band, magServiceTypeForFlight(flight));
  }
  return total;
}
