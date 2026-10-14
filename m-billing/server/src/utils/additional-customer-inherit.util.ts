export const ADDITIONAL_INHERIT_KEYS = [
  'concessions',
  'rateCards',
  'contract',
  'conversionRates',
  'customer',
] as const;

export type AdditionalInheritKey = (typeof ADDITIONAL_INHERIT_KEYS)[number];

export type AdditionalCustomerInherit = {
  customerCode: string;
  concessions: boolean;
  rateCards: boolean;
  contract: boolean;
  conversionRates: boolean;
  customer: boolean;
};

type InheritContract = {
  customerCode?: string | null;
  additionalCustomerCodes?: string[] | null;
  additionalCustomerInherit?: Array<Partial<AdditionalCustomerInherit>> | null;
  concessionRates?: unknown;
  royaltyAtGross?: number | null;
  ceilingRatePerFlightINR?: number | null;
  ceilingRatePerFlightUSD?: number | null;
  adsEquipmentRules?: unknown;
  adsBillingEnabled?: boolean;
  bhsVolumeSchedules?: unknown;
  bhsConcessionCoverage?: string;
  extendedRoyaltyEnabled?: boolean;
  fortnightBillingEnabled?: boolean;
  fortnightBillingMonthRates?: unknown;
  fortnightBillingRanges?: Array<{ exchangeRatePerUsd?: number }>;
};

const EMPTY_FLAGS = {
  concessions: false,
  rateCards: false,
  contract: false,
  conversionRates: false,
  customer: false,
};

export function emptyAdditionalInherit(customerCode: string): AdditionalCustomerInherit {
  return { customerCode: customerCode.trim().toUpperCase(), ...EMPTY_FLAGS };
}

export function isAdditionalContractCustomer(
  billedCustomerCode: string | null | undefined,
  contract?: { customerCode?: string | null; additionalCustomerCodes?: string[] | null } | null,
): boolean {
  const billed = String(billedCustomerCode ?? '').trim().toUpperCase();
  const primary = String(contract?.customerCode ?? '').trim().toUpperCase();
  if (!billed || !primary || billed === primary) return false;
  return (contract?.additionalCustomerCodes ?? []).some(
    (code) => String(code ?? '').trim().toUpperCase() === billed,
  );
}

export function inheritForCustomer(
  billedCustomerCode: string | null | undefined,
  contract?: InheritContract | null,
): AdditionalCustomerInherit & { isAdditional: boolean } {
  const billed = String(billedCustomerCode ?? '').trim().toUpperCase();
  const isAdditional = isAdditionalContractCustomer(billed, contract);
  if (!isAdditional) {
    return { customerCode: billed, isAdditional: false, ...EMPTY_FLAGS };
  }
  const row = (contract?.additionalCustomerInherit ?? []).find(
    (entry) => String(entry?.customerCode ?? '').trim().toUpperCase() === billed,
  );
  return {
    customerCode: billed,
    isAdditional: true,
    concessions: Boolean(row?.concessions),
    rateCards: Boolean(row?.rateCards),
    contract: Boolean(row?.contract),
    conversionRates: Boolean(row?.conversionRates),
    customer: Boolean(row?.customer),
  };
}

export function normalizeAdditionalCustomerInherit(
  primary: string,
  codes: string[],
  rows: Array<Partial<AdditionalCustomerInherit>> | undefined,
): AdditionalCustomerInherit[] {
  const allowed = new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean));
  const owner = primary.trim().toUpperCase();
  allowed.delete(owner);
  const byCode = new Map<string, AdditionalCustomerInherit>();
  for (const raw of rows ?? []) {
    const customerCode = String(raw?.customerCode ?? '').trim().toUpperCase();
    if (!customerCode || !allowed.has(customerCode)) continue;
    byCode.set(customerCode, {
      customerCode,
      concessions: Boolean(raw.concessions),
      rateCards: Boolean(raw.rateCards),
      contract: Boolean(raw.contract),
      conversionRates: Boolean(raw.conversionRates),
      customer: Boolean(raw.customer),
    });
  }
  return [...allowed].map((customerCode) => byCode.get(customerCode) ?? emptyAdditionalInherit(customerCode));
}

/** Contract object passed into invoice compose. Unchecked masters are stripped. */
export function shapeContractForAdditionalCustomer<T extends InheritContract>(
  contract: T | null | undefined,
  billedCustomerCode: string,
): T | null {
  if (!contract) return contract ?? null;
  const flags = inheritForCustomer(billedCustomerCode, contract);
  if (!flags.isAdditional) return contract;
  const shaped = { ...contract } as T;
  if (!flags.concessions) {
    shaped.concessionRates = undefined;
    shaped.royaltyAtGross = undefined;
    shaped.ceilingRatePerFlightINR = undefined;
    shaped.ceilingRatePerFlightUSD = undefined;
  }
  if (!flags.contract) {
    shaped.adsEquipmentRules = [];
    shaped.adsBillingEnabled = false;
    shaped.bhsVolumeSchedules = [];
    shaped.bhsConcessionCoverage = undefined;
    shaped.extendedRoyaltyEnabled = false;
  }
  if (!flags.contract && !flags.conversionRates) {
    shaped.fortnightBillingEnabled = false;
  }
  if (!flags.conversionRates) {
    shaped.fortnightBillingMonthRates = [];
    if (Array.isArray(shaped.fortnightBillingRanges)) {
      shaped.fortnightBillingRanges = shaped.fortnightBillingRanges.map((range) => ({
        ...range,
        exchangeRatePerUsd: undefined,
      }));
    }
  }
  return shaped;
}
