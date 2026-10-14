/**
 * Airlines that store one BHS price-card row per slash-grouped aircraft label
 * (must match server `BHS_GROUPED_AIRCRAFT_CUSTOMERS` in bhs-aircraft-row.mjs).
 */
export const BHS_GROUPED_AIRCRAFT_CUSTOMERS = new Set([
  'UL',
  'AY',
  'CA',
  'VJ',
  'AF',
  'C6',
  'XJ',
  'VS',
]);

type BillingPriceCardAirlineLike = {
  customerCode: string;
  aircraftType: string;
  category: string;
};

export function splitGroupedAircraftType(raw: string): string[] {
  return raw
    .split(/[,;/|]+/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

/** UI + add-row matching: expand slash groups for grouped airlines. */
export function displayAircraftTypesForPriceCardEntry(entry: BillingPriceCardAirlineLike): string[] {
  const code = entry.customerCode.trim().toUpperCase();
  const raw = entry.aircraftType.trim();
  if (!raw) return [''];
  if (BHS_GROUPED_AIRCRAFT_CUSTOMERS.has(code) && /[,;/|]/.test(raw)) {
    const tokens = splitGroupedAircraftType(raw);
    if (tokens.length > 1) return tokens;
  }
  return [raw.toUpperCase()];
}

export function priceCardAirlineRowKeys(entry: BillingPriceCardAirlineLike): string[] {
  return displayAircraftTypesForPriceCardEntry(entry).map((aircraftType) =>
    `${aircraftType}|${entry.category}`,
  );
}
