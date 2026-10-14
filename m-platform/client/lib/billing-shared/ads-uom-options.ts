/**
 * Full UOM list for Service Catalog, ADS contract rules, and rate cards.
 * Includes standard short codes (FLIGHT, HR, MIN, EA, TRIP, ULD)
 * and Adhoc Charges List / operational bill units.
 */
export const ADS_UOM_OPTIONS = [
  // Standard short codes
  'FLIGHT',
  'HR',
  'MIN',
  'EA',
  'TRIP',
  'ULD',
  // Operational & adhoc billing units
  'Per Hour',
  'Per Half Hour',
  'Per 15 Minutes',
  'Per Usage',
  'Per start',
  'Per push/tow',
  'Per Tow',
  'Per Turnaround',
  'Per turnaround',
  'Per Trip',
  'Per service',
  'Per Service',
  'Per Unit',
  'Per unit',
  'Per Flight',
  'Per flight',
  'Per Month',
  'Per month',
  'Per personnel/hr',
  'Per passenger',
  'Per minor',
  'Per refill',
  'Per clearance',
  'Per AVI',
  'Per day',
  'Per stack per day',
  'Per valet/shift',
] as const;

/** Merge known system UOMs with any values present on catalog / rules / rate cards. */
export function buildAdsUomOptions(
  ...extraSources: Array<Iterable<string | null | undefined>>
): string[] {
  const map = new Map<string, string>();
  for (const uom of ADS_UOM_OPTIONS) {
    const trimmed = uom.trim();
    if (trimmed && !map.has(trimmed.toLowerCase())) {
      map.set(trimmed.toLowerCase(), trimmed);
    }
  }
  for (const source of extraSources) {
    if (!source) continue;
    for (const value of source) {
      const trimmed = String(value ?? '').trim();
      if (trimmed && !map.has(trimmed.toLowerCase())) {
        map.set(trimmed.toLowerCase(), trimmed);
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

