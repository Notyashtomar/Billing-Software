import { stripCancelledFlightPrefix } from './billing-flight-no.util';

/**
 * Normalize MAA/FHR customer identifiers.
 * `mainDetails.Arline_Code` is often a flight number (IX2718), not airline code (IX).
 */
export function normalizeBillingCustomerCode(raw: unknown): string {
  const text = stripCancelledFlightPrefix(String(raw ?? '').trim()).toUpperCase();
  if (!text) return '';

  const fromCancelledFlight = text.match(/(?:CANC\s*-\s*)?([A-Z]{2,3})\d{2,5}/);
  if (fromCancelledFlight?.[1]) return fromCancelledFlight[1];

  // "IX 1498/ IX 1604" (space between carrier and number) — common in IXC FHR seeds
  const fromSpacedFlight = text.match(/\b([A-Z]{2,3})\s+\d{2,5}\b/);
  if (fromSpacedFlight?.[1]) return fromSpacedFlight[1];

  const fromFlight = text.match(/\b([A-Z]{2,3})\d{2,5}\b/);
  if (fromFlight?.[1]) return fromFlight[1];

  // Standalone airline / customer codes (IX, SG, AI, 3K, …)
  if (/^[A-Z0-9]{2,10}$/.test(text)) return text;

  return '';
}

/** Saved billing name and the operational airline name are the same carrier. */
export function sameBillingAirlineName(
  savedName: string,
  operationalName: string,
): boolean {
  const saved = savedName.trim().toLowerCase().replace(/\s+/g, ' ');
  const operational = operationalName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (saved.length < 6 || operational.length < 6) return false;
  if (saved === operational) return true;
  return operational.includes(saved) || saved.includes(operational);
}

/**
 * ICAO on the flight (SMR) can differ from the billing customer (IATA SZ).
 * A direct code that already exists on the station master always wins.
 * An unknown direct code is replaced by the flight carrier only when that
 * carrier is a saved customer and the airline names are the same.
 *
 * Exception: a saved direct code whose contract was retired (Delhi CIF,
 * replaced by CI) gives way to the flight carrier when that carrier is the
 * same airline and has a live contract. Otherwise the flight re-prices at 0.
 */
export function resolveKnownBillingCustomerCode(input: {
  directCodes: Array<string | undefined>;
  flightCodes: Array<string | undefined>;
  isKnown: (code: string) => boolean;
  customerName?: (code: string) => string;
  operationalName?: string;
  /** Has a contract that is not expired for the flight date. Omit to skip the check. */
  hasLiveContract?: (code: string) => boolean;
}): string {
  const direct = input.directCodes
    .map((code) => normalizeBillingCustomerCode(code))
    .filter((code): code is string => Boolean(code));
  const flight = input.flightCodes
    .map((code) => normalizeBillingCustomerCode(code))
    .filter((code): code is string => Boolean(code));
  const operationalName = String(input.operationalName ?? '');

  for (const code of direct) {
    if (!input.isKnown(code)) continue;
    const hasLiveContract = input.hasLiveContract;
    if (!hasLiveContract || hasLiveContract(code)) return code;
    const directName = input.customerName?.(code) ?? '';
    const replacement = flight.find((candidate) => {
      if (candidate === code || !input.isKnown(candidate)) return false;
      if (!hasLiveContract(candidate)) return false;
      const candidateName = input.customerName?.(candidate) ?? '';
      return (
        sameBillingAirlineName(candidateName, operationalName) ||
        sameBillingAirlineName(candidateName, directName)
      );
    });
    return replacement ?? code;
  }

  const cargoHint = /\bcargo\b|\bfreight\b/i.test(operationalName);
  for (const code of flight) {
    if (direct.includes(code) || !input.isKnown(code)) continue;
    const savedName = input.customerName?.(code) ?? '';
    if (sameBillingAirlineName(savedName, operationalName)) return code;
    // FHR sometimes stores airline code with a cargo suffix (EYF) while the
    // saved billing customer is the base carrier (EY). Prefer the known base
    // code when the flight number already resolves to it.
    if (
      cargoHint &&
      direct.some(
        (raw) =>
          raw !== code &&
          raw.startsWith(code) &&
          raw.length === code.length + 1 &&
          /[FC]$/i.test(raw),
      )
    ) {
      return code;
    }
  }

  return direct[0] ?? flight[0] ?? '';
}

/** Resolve airline code from FHR main + optional raw daily + flight no. */
export function resolveBillingCustomerCode(
  main: Record<string, unknown>,
  daily: Record<string, unknown> = {},
  flightNo?: string,
): string {
  const candidates = [
    daily.customerCode,
    daily['Airline Code'],
    daily.airlineCode,
    daily.AirlineCode,
    daily['Arline Code'],
    main.Arline_Code,
    main.airlineCode,
    main.AirlineCode,
    main.customerCode,
    flightNo,
  ];
  for (const candidate of candidates) {
    const code = normalizeBillingCustomerCode(candidate);
    if (code) return code;
  }
  return '';
}
