export type BillingCurrency = 'INR' | 'USD';

/** Primary contract customer when the billed code is only an additional customer on that contract. */
export function commercialCustomerCode(
  billedCustomerCode: string | null | undefined,
  contract?: {
    customerCode?: string | null;
    additionalCustomerCodes?: string[] | null;
  } | null,
): string {
  const billed = String(billedCustomerCode ?? '').trim().toUpperCase();
  const primary = String(contract?.customerCode ?? '').trim().toUpperCase();
  if (!primary) return billed;
  if (!billed || billed === primary) return primary;
  const extras = (contract?.additionalCustomerCodes ?? []).map((code) =>
    String(code ?? '').trim().toUpperCase(),
  );
  return extras.includes(billed) ? primary : billed;
}

export function resolveBillingCurrency(
  customerCurrency?: string | null,
  rateCardCurrency?: string | null,
): BillingCurrency {
  const fromCustomer = customerCurrency?.trim().toUpperCase();
  if (fromCustomer === 'INR' || fromCustomer === 'USD') return fromCustomer;

  const fromRate = rateCardCurrency?.trim().toUpperCase();
  if (fromRate === 'INR' || fromRate === 'USD') return fromRate;

  return 'INR';
}

export function unitPriceForBillingCurrency(
  rateCard:
    | {
        unitPriceINR?: number | null;
        unitPriceUSD?: number | null;
      }
    | null
    | undefined,
  currency: BillingCurrency,
): number | undefined {
  if (!rateCard) return undefined;
  const price = currency === 'USD' ? rateCard.unitPriceUSD : rateCard.unitPriceINR;
  return price != null && Number.isFinite(Number(price)) ? Number(price) : undefined;
}

export function prepUnitPricesStoredInInr(
  records: Array<{ rateMatch?: { currency?: string | null } }> | undefined,
): boolean {
  if (!records?.length) return true;
  return records.some(
    (rec) => String(rec.rateMatch?.currency ?? 'INR').trim().toUpperCase() !== 'USD',
  );
}

/**
 * BHS/ADS prep rows priced in INR are divided by ROE when composing USD invoices.
 * USD-native prep (e.g. Sri Lankan BHS rate cards) must not be divided again.
 */
export function shouldApplyUsdRoeToLineAmounts(
  currencyCode: string | undefined,
  invoiceCategory: string | undefined,
  records?: Array<{ rateMatch?: { currency?: string | null } }>,
): boolean {
  const category = String(invoiceCategory ?? '').trim().toUpperCase();
  if (category === 'CUSTOM') return false;
  if (String(currencyCode ?? '').trim().toUpperCase() !== 'USD') return false;
  return prepUnitPricesStoredInInr(records);
}

export function ceilingRateForBillingCurrency(
  rateCard:
    | {
        ceilingRateINR?: number | null;
        ceilingRateUSD?: number | null;
      }
    | null
    | undefined,
  currency: BillingCurrency,
): number | undefined {
  if (!rateCard) return undefined;
  const ceiling = currency === 'USD' ? rateCard.ceilingRateUSD : rateCard.ceilingRateINR;
  return ceiling != null && Number.isFinite(Number(ceiling)) ? Number(ceiling) : undefined;
}
