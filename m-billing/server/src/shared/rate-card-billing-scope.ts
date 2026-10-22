export const RATE_CARD_BILLING_SCOPES = ['inclusive', 'exclusive'] as const;

export type RateCardBillingScope = (typeof RATE_CARD_BILLING_SCOPES)[number];

export function normalizeBillingScope(value: unknown): RateCardBillingScope {
  return value === 'exclusive' ? 'exclusive' : 'inclusive';
}

export function rateCardMatchesHandlingScope(
  billingScope: string | undefined,
  handling: 'BHS' | 'ADS' | 'RAF',
): boolean {
  if (handling === 'ADS') return normalizeBillingScope(billingScope) === 'exclusive';
  return true;
}

/** True when UOM is billed by the started hour. Half-hour and 15-minute units are separate. */
export function isAdsHourlyUom(uom: unknown): boolean {
  const raw = String(uom ?? '').trim();
  if (!raw) return false;
  if (isAdsHalfHourUom(raw) || isAdsFifteenMinuteUom(raw)) return false;
  if (/^hr$/i.test(raw)) return true;
  if (/per\s*hour/i.test(raw)) return true;
  return /\bhour\b/i.test(raw);
}

export function isAdsTimeBasedUom(uom: unknown): boolean {
  return isAdsFifteenMinuteUom(uom) || isAdsHalfHourUom(uom) || isAdsHourlyUom(uom);
}

/** True when UOM is billed per half hour (30-minute blocks). */
export function isAdsHalfHourUom(uom: unknown): boolean {
  const raw = String(uom ?? '').trim();
  if (!raw) return false;
  return /half\s*(?:an?\s*)?hour|half\s*hr|per\s*30\s*min(?:ute)?s?|\b30\s*min(?:ute)?s?\b/i.test(
    raw,
  );
}

/** True when UOM is billed per 15-minute block (1 unit per started 15 minutes). */
export function isAdsFifteenMinuteUom(uom: unknown): boolean {
  const raw = String(uom ?? '').trim();
  if (!raw) return false;
  return /per\s*15\s*min(?:ute)?s?|\b15\s*min(?:ute)?s?\b/i.test(raw);
}

/** Overage tolerated (minutes) before the next hour block is charged (Per Hour only). */
export const ADS_HOURLY_GRACE_MINUTES = 5;

/**
 * Whole billable units for a time-based ADS UOM from engagement minutes.
 * - Per 15 Minutes: round up to the next started 15-minute block (no grace).
 * - Per Half Hour: round up to the next started 30-minute block (no grace).
 * - Per Hour: charge per started hour, tolerating up to ADS_HOURLY_GRACE_MINUTES
 *   of overage before charging the next hour.
 * Minimum one unit when the equipment was engaged at all. Quantity is intentionally
 * ignored — time-based equipment bills by engagement time (block count), not units.
 * Returns null when the UOM is not time-based (caller falls back to quantity).
 */
export function adsTimeBasedUnits(
  uom: unknown,
  engagementMinutes: number | null | undefined,
): number | null {
  const minutes =
    typeof engagementMinutes === 'number' &&
    Number.isFinite(engagementMinutes) &&
    engagementMinutes > 0
      ? Math.round(engagementMinutes)
      : null;

  // 15-minute and half-hour must be checked before the generic hour test below.
  if (isAdsFifteenMinuteUom(uom)) {
    if (minutes == null) return null;
    return Math.max(1, Math.ceil(minutes / 15));
  }
  if (isAdsHalfHourUom(uom)) {
    if (minutes == null) return null;
    return Math.max(1, Math.ceil(minutes / 30));
  }
  if (isAdsHourlyUom(uom)) {
    if (minutes == null) return null;
    const fullHours = Math.floor(minutes / 60);
    const remainder = minutes - fullHours * 60;
    const blocks = fullHours + (remainder > ADS_HOURLY_GRACE_MINUTES ? 1 : 0);
    return Math.max(1, blocks);
  }
  return null;
}

/**
 * Free units covered by the airline aircraft package **per flight**.
 * - Missing / null serviceCount on an inclusive card ⇒ fully package-included (not billed on ADS).
 * - Numeric serviceCount ⇒ that many free units per flight (extras are chargeable).
 * Exclusive serviceCount also contributes free units per flight when set.
 * Hourly UOMs and alwaysChargeable never receive free allowance on ADS.
 */
export function resolveAdsPackageFreeAllowance(opts: {
  inclusiveServiceCount?: number | null;
  exclusiveServiceCount?: number | null;
  hasInclusiveCard: boolean;
  /** Exclusive and/or inclusive UOM — hourly forces zero free allowance. */
  uom?: string | null;
  /** Bill all used units even if listed on the BHS package. */
  alwaysChargeable?: boolean;
}): { freeAllowance: number; fullyPackageIncluded: boolean } {
  if (
    opts.alwaysChargeable ||
    isAdsHourlyUom(opts.uom) ||
    isAdsFifteenMinuteUom(opts.uom)
  ) {
    return { freeAllowance: 0, fullyPackageIncluded: false };
  }

  let freeAllowance = 0;
  let fullyPackageIncluded = false;

  if (opts.hasInclusiveCard) {
    const inclusive = Number(opts.inclusiveServiceCount);
    if (opts.inclusiveServiceCount != null && Number.isFinite(inclusive) && inclusive >= 0) {
      freeAllowance = Math.max(freeAllowance, inclusive);
    } else {
      // Inclusive card with no count = equipment is in the aircraft package (fully free).
      fullyPackageIncluded = true;
      freeAllowance = Number.MAX_SAFE_INTEGER;
    }
  }

  const exclusive = Number(opts.exclusiveServiceCount);
  if (
    opts.exclusiveServiceCount != null &&
    Number.isFinite(exclusive) &&
    exclusive > 0
  ) {
    freeAllowance = Math.max(freeAllowance, exclusive);
  }

  return { freeAllowance, fullyPackageIncluded };
}
