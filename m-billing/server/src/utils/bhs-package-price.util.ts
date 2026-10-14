import {
  normalizeFlightCategory,
  pickBestRateCardForFlight,
} from './aircraft-type-match.util';
import type { BillingCurrency } from './billing-currency.util';

export type BhsPackagePriceRow = {
  aircraftType: string;
  category: string;
  price?: number | null;
  validFrom?: Date | string;
  /** Band / package wording when aircraftType holds the real aircraft name. */
  remarks?: string | null;
  /** Missing means scheduled, so older cards keep pricing turnaround flights. */
  flightOperation?: 'scheduled' | 'additional' | null;
  incrementalFlightsActive?: boolean | null;
  incrementalPrice?: number | null;
};

function compactAircraft(value: string): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** B737-800 / B737-DOM / B787-900 → B737 / B787 family token. B77F → B777F. */
export function bhsAircraftFamily(raw: string): string {
  const compact = compactAircraft(raw);
  if (compact === 'B77F' || compact === '77F' || compact === 'B777F') return 'B777F';
  const match = compact.match(/^(A3\d{2}|A380|A350|B7\d{2}|Q400|ATR\d{2,3}|CRJ\d{0,3}|E1\d{2})/);
  return match?.[1] ?? '';
}

function isAncillaryBhsLabel(label: string): boolean {
  return /PAX\s*COACH|CREW\s*COACH|WATER|DEEP\s*CLEAN|DISINFECT|HEADSET|DEPORT|ULD|CARGO\s*SUPER|CLEANING/i.test(
    label,
  );
}

function isHandlingBandLabel(label: string): boolean {
  return /FLIGHT\s*PER\s*MONTH|RAMP\s*HANDLING|COMPREHENSIVE|TERMINAL\s*HANDLING|LOAD\s*CONTROL/i.test(
    label,
  );
}

function latestPriced(rows: BhsPackagePriceRow[]): BhsPackagePriceRow {
  return [...rows].sort((a, b) => String(b.validFrom ?? '').localeCompare(String(a.validFrom ?? '')))[0];
}

function packageSearchText(entry: BhsPackagePriceRow): string {
  return `${entry.aircraftType ?? ''} ${entry.remarks ?? ''}`;
}

function isComprehensiveLabel(label: string): boolean {
  return /COMPREHENSIVE/i.test(label) && !/\bRAMP\b/i.test(label);
}

function isRampLabel(label: string): boolean {
  return /\bRAMP\b/i.test(label);
}

/** Cargo freighter cards: TRND / Turnaround is the base package; Transit/Technical are variants. */
function isTurnaroundPackageLabel(label: string): boolean {
  return (
    (/\bTRND\b/i.test(label) || /TURNAROUND/i.test(label)) &&
    !/TRANSIT|TANSIT|TRNSIT|TECHNICAL/i.test(label)
  );
}

function isVariantHandlingPackageLabel(label: string): boolean {
  return /TRANSIT|TANSIT|TRNSIT|TECHNICAL/i.test(label);
}

/** AF-style volume notes left on remarks — prefer the plain group rate for matching. */
function isFlightCountConditionLabel(label: string): boolean {
  return (
    /flight\s*(s)?\s*(less|greater|more)\s*than\s*\d+/i.test(label) ||
    /\[\s*\d+\s*[-–]\s*\d+/i.test(label) ||
    /\d+\s*[-–]\s*\d+\s*flt/i.test(label) ||
    /\d+\s*[-–]\s*above/i.test(label) ||
    /\d+\s+and\s+above/i.test(label) ||
    /\d+\s*-\s*above/i.test(label) ||
    /\b\d+\s*flt\b/i.test(label)
  );
}

/** "1-500" / "1–150". Higher bands such as 501-600 are not the base package. */
function openingVolumeBand(label: string): { to: number } | null {
  const match = label.match(/(?:^|[^\d])1\s*[-–]\s*(\d+)/);
  if (!match) return null;
  const to = Number(match[1]);
  return Number.isFinite(to) ? { to } : null;
}

function sameFlightCategory(entryCategory: string, flightCategory: string): boolean {
  const flight = normalizeFlightCategory(flightCategory);
  const card = normalizeFlightCategory(entryCategory);
  if (!flight || !card) return true;
  return flight === card;
}

/**
 * Base BHS package when several rows share one aircraft (or band labels).
 * Prefers comprehensive opening band with the widest cap (Dom 1-500 ahead of
 * 1-400). Step bands stay on the card for the contract volume schedule.
 * Freighter cards: prefer TRND/Turnaround over Transit/Technical variants.
 */
function pickBaseHandlingBand(rows: BhsPackagePriceRow[], flightCategory: string): BhsPackagePriceRow {
  const sameCategory = rows.filter((entry) => sameFlightCategory(entry.category, flightCategory));
  const pool = sameCategory.length > 0 ? sameCategory : rows;
  const opening = pool.filter((entry) => {
    const text = packageSearchText(entry);
    if (!isComprehensiveLabel(text) || isRampLabel(text)) return false;
    return openingVolumeBand(text) != null;
  });
  if (opening.length > 0) {
    return [...opening].sort((a, b) => {
      const span =
        (openingVolumeBand(packageSearchText(b))?.to ?? 0) -
        (openingVolumeBand(packageSearchText(a))?.to ?? 0);
      if (span !== 0) return span;
      return String(b.validFrom ?? '').localeCompare(String(a.validFrom ?? ''));
    })[0];
  }
  const comprehensive = pool.filter((entry) => {
    const text = packageSearchText(entry);
    return isComprehensiveLabel(text) && !isRampLabel(text);
  });
  if (comprehensive.length > 0) return latestPriced(comprehensive);

  const turnaround = pool.filter((entry) => isTurnaroundPackageLabel(packageSearchText(entry)));
  if (turnaround.length > 0) return latestPriced(turnaround);

  const withoutFlightCountCondition = pool.filter(
    (entry) => !isFlightCountConditionLabel(packageSearchText(entry)),
  );
  if (withoutFlightCountCondition.length > 0) {
    const nonVariant = withoutFlightCountCondition.filter(
      (entry) => !isVariantHandlingPackageLabel(packageSearchText(entry)),
    );
    if (nonVariant.length > 0) return latestPriced(nonVariant);
    return latestPriced(withoutFlightCountCondition);
  }

  const nonVariant = pool.filter((entry) => !isVariantHandlingPackageLabel(packageSearchText(entry)));
  if (nonVariant.length > 0) return latestPriced(nonVariant);

  return latestPriced(pool);
}

function collectAircraftMatches(
  priced: BhsPackagePriceRow[],
  flightAircraft: string,
  categoryOfFlight: string,
): BhsPackagePriceRow[] {
  return priced.filter((entry) => {
    const hit = pickBestRateCardForFlight([entry], flightAircraft, categoryOfFlight);
    return hit != null;
  });
}

/** FHR type of handling "Additional" — not a remarks mention of additional charges. */
export function isAdditionalBhsFlight(operationalData: Record<string, unknown>): boolean {
  const handling = [
    operationalData.typeOfHandling,
    operationalData.TypeofHandling,
    operationalData.typeofHandling,
    operationalData.ops,
    operationalData.opsType,
    operationalData.typeOfFlight,
    operationalData.Typeofflight,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  return /\badditional\b/.test(handling);
}

export function selectBhsEntriesForFlightOperation<T extends { flightOperation?: string | null }>(
  entries: T[],
  additionalFlight: boolean,
): T[] {
  const additional = entries.filter((entry) => entry.flightOperation === 'additional');
  const scheduled = entries.filter((entry) => entry.flightOperation !== 'additional');
  if (additionalFlight) return additional.length > 0 ? additional : scheduled;
  return scheduled;
}

/** BHS turnaround price lives on the price-card airline row (columns D/E), not on service rate cards. */
export function pickBhsPackagePriceEntry(
  entries: BhsPackagePriceRow[],
  flightAircraft: string,
  categoryOfFlight: string,
): BhsPackagePriceRow | null {
  const priced = entries.filter(
    (entry) => entry.price != null && Number.isFinite(Number(entry.price)) && Number(entry.price) > 0,
  );
  if (priced.length === 0) return null;

  const aircraftMatches = collectAircraftMatches(priced, flightAircraft, categoryOfFlight);
  if (aircraftMatches.length === 1) return aircraftMatches[0];
  if (aircraftMatches.length > 1) {
    return pickBaseHandlingBand(aircraftMatches, categoryOfFlight);
  }

  const ignoreCategory = priced.map((entry) => ({ ...entry, category: '' }));
  const anyCategoryMatches = collectAircraftMatches(ignoreCategory, flightAircraft, '');
  if (anyCategoryMatches.length === 1) {
    return (
      priced.find((entry) => entry.aircraftType === anyCategoryMatches[0].aircraftType) ??
      anyCategoryMatches[0]
    );
  }
  if (anyCategoryMatches.length > 1) {
    const restored = anyCategoryMatches.map(
      (hit) => priced.find((entry) => entry.aircraftType === hit.aircraftType) ?? hit,
    );
    return pickBaseHandlingBand(restored, categoryOfFlight);
  }

  const family = bhsAircraftFamily(flightAircraft);
  if (family) {
    const familyHits = priced.filter((entry) => {
      const entryFamily = bhsAircraftFamily(entry.aircraftType);
      return entryFamily === family || compactAircraft(entry.aircraftType).includes(family);
    });
    if (familyHits.length === 1) return familyHits[0];
    if (familyHits.length > 1) return pickBaseHandlingBand(familyHits, categoryOfFlight);
  }

  const handling = priced.filter(
    (entry) =>
      (isHandlingBandLabel(entry.aircraftType) || isHandlingBandLabel(entry.remarks ?? '')) &&
      !isAncillaryBhsLabel(entry.aircraftType) &&
      !isAncillaryBhsLabel(entry.remarks ?? ''),
  );
  if (handling.length > 0) return pickBaseHandlingBand(handling, categoryOfFlight);

  return null;
}

export function packagePriceFromEntry(entry: BhsPackagePriceRow | null): number | undefined {
  if (entry?.price == null) return undefined;
  const price = Number(entry.price);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

export type BhsScheduledPricingBasis = 'bhs_package' | 'rate_card';

/**
 * BHS scheduled-flight unit price:
 * - USD airlines: BHS rate cards (unitPriceUSD) are authoritative; package D/E may hold stale INR.
 * - INR airlines: package turnaround price (D/E) wins when set; else rate card.
 */
export function resolveBhsScheduledUnitPrice(opts: {
  bhsPackagePrice?: number | null;
  unitPriceFromRateCard?: number | null;
  billingCurrency: BillingCurrency;
}): { unitPrice?: number; pricingBasis?: BhsScheduledPricingBasis } {
  const packagePrice =
    opts.bhsPackagePrice != null &&
    Number.isFinite(Number(opts.bhsPackagePrice)) &&
    Number(opts.bhsPackagePrice) > 0
      ? Number(opts.bhsPackagePrice)
      : undefined;
  const rateCardPrice =
    opts.unitPriceFromRateCard != null &&
    Number.isFinite(Number(opts.unitPriceFromRateCard)) &&
    Number(opts.unitPriceFromRateCard) > 0
      ? Number(opts.unitPriceFromRateCard)
      : undefined;

  if (rateCardPrice != null && opts.billingCurrency === 'USD') {
    return { unitPrice: rateCardPrice, pricingBasis: 'rate_card' };
  }
  if (packagePrice != null) {
    return { unitPrice: packagePrice, pricingBasis: 'bhs_package' };
  }
  if (rateCardPrice != null) {
    return { unitPrice: rateCardPrice, pricingBasis: 'rate_card' };
  }
  return {};
}
