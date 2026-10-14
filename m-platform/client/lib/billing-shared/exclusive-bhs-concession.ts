import type { BillingContract } from './types';

/** Exclusive (non-comprehensive) BHS: invoice concession is max(this % of flight total, ceiling × flights). */
export const EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT = 18;

export type BhsPricingMode = 'comprehensive' | 'non_comprehensive';

/** Inclusive — concession is inside the BHS package; no separate invoice concession line. */
export function isInclusiveBhsConcessionContract(
  contract: Pick<BillingContract, 'bhsConcessionCoverage'> | null | undefined,
): boolean {
  return contract?.bhsConcessionCoverage === 'comprehensive';
}

export function isExclusiveBhsConcessionContract(
  contract: Pick<BillingContract, 'bhsConcessionCoverage'> | null | undefined,
): boolean {
  return contract?.bhsConcessionCoverage === 'non_comprehensive';
}

export function bhsPricingModeFromContract(
  contract: Pick<BillingContract, 'bhsConcessionCoverage'> | null | undefined,
): BhsPricingMode {
  return isExclusiveBhsConcessionContract(contract) ? 'non_comprehensive' : 'comprehensive';
}

/** Price-card label for the contract's stored BHS pricing mode. */
export function bhsPriceTypeLabel(
  coverage: BillingContract['bhsConcessionCoverage'] | null | undefined,
): 'Inclusive' | 'Exclusive' | 'Mixed' | '—' {
  if (coverage === 'comprehensive') return 'Inclusive';
  if (coverage === 'non_comprehensive') return 'Exclusive';
  if (coverage === 'mixed') return 'Mixed';
  return '—';
}

export function contractHasSavedCeilingRate(
  contract: Pick<BillingContract, 'ceilingRatePerFlightINR' | 'ceilingRatePerFlightUSD'> | null | undefined,
): boolean {
  if (!contract) return false;
  const inr = Number(contract.ceilingRatePerFlightINR);
  const usd = Number(contract.ceilingRatePerFlightUSD);
  return (Number.isFinite(inr) && inr > 0) || (Number.isFinite(usd) && usd > 0);
}

export function exclusiveBhsContractsMissingCeiling(
  contracts: BillingContract[],
): BillingContract[] {
  return contracts.filter(
    (row) => isExclusiveBhsConcessionContract(row) && !contractHasSavedCeilingRate(row),
  );
}
