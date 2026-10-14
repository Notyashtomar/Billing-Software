import { isAdsFifteenMinuteUom, isAdsHourlyUom } from './ads-hourly-uom';

export const RATE_CARD_BILLING_SCOPES = ['inclusive', 'exclusive'] as const;

export type RateCardBillingScope = (typeof RATE_CARD_BILLING_SCOPES)[number];

export function normalizeBillingScope(value: unknown): RateCardBillingScope {
  return value === 'exclusive' ? 'exclusive' : 'inclusive';
}

export function formatBillingScope(scope?: string | null): string {
  return normalizeBillingScope(scope) === 'exclusive' ? 'Exclusive' : 'Inclusive';
}

export function rateCardMatchesHandlingScope(
  billingScope: string | undefined,
  handling: 'BHS' | 'ADS' | 'RAF',
): boolean {
  if (handling === 'ADS') return normalizeBillingScope(billingScope) === 'exclusive';
  return true;
}

export { isAdsFifteenMinuteUom, isAdsHourlyUom } from './ads-hourly-uom';

/**
 * Free units covered by the airline aircraft package **per flight**.
 * - Missing / null serviceCount on an inclusive card ⇒ fully package-included (not billed on ADS).
 * - Numeric serviceCount ⇒ that many free units per flight.
 * Hourly / 15-minute UOMs and alwaysChargeable never receive free allowance on ADS.
 */
export function resolveAdsPackageFreeAllowance(opts: {
  inclusiveServiceCount?: number | null;
  exclusiveServiceCount?: number | null;
  hasInclusiveCard: boolean;
  uom?: string | null;
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
