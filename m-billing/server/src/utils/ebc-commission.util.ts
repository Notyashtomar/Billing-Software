import type { BillingSourceRow } from '../shared/billing-sources';

export type EbcCommissionMode = 'all' | 'cash' | 'card' | 'upi';

export type EbcCommissionRule = {
  percent: number;
  /** When true, card, UPI, and mixed payments are not commissioned. */
  cashOnly: boolean;
  /** All collections, or one payment mode. Omitted rules follow `cashOnly`. */
  mode?: EbcCommissionMode;
};

/** Airline commission on excess-baggage collections. */
export const EBC_COMMISSION_RULES: Record<string, EbcCommissionRule> = {
  QP: { percent: 7, cashOnly: false },
  VJ: { percent: 7, cashOnly: false },
  UL: { percent: 5, cashOnly: true },
};

export type EbcCommissionQuote = {
  amount: number;
  percent: number;
  cashOnly: boolean;
  mode: EbcCommissionMode;
  billable: boolean;
  message: string;
};

function normalizePaymentMode(paymentMode: string | null | undefined): string {
  return String(paymentMode ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function isEbcCashPayment(paymentMode: string | null | undefined): boolean {
  const mode = normalizePaymentMode(paymentMode);
  return mode === 'CASH' || mode === 'CSH' || mode === 'CCASH';
}

export function isEbcCardPayment(paymentMode: string | null | undefined): boolean {
  const mode = normalizePaymentMode(paymentMode);
  return mode === 'CARD' || mode === 'CC' || mode === 'CREDITCARD' || mode === 'DEBITCARD';
}

export function isEbcUpiPayment(paymentMode: string | null | undefined): boolean {
  const mode = normalizePaymentMode(paymentMode);
  return mode === 'UPI';
}

export function ebcCommissionMode(rule: EbcCommissionRule): EbcCommissionMode {
  if (rule.mode === 'cash' || rule.mode === 'card' || rule.mode === 'upi' || rule.mode === 'all') {
    return rule.mode;
  }
  return rule.cashOnly ? 'cash' : 'all';
}

export function paymentMatchesEbcMode(
  mode: EbcCommissionMode,
  paymentMode: string | null | undefined,
): boolean {
  if (mode === 'all') return true;
  if (mode === 'cash') return isEbcCashPayment(paymentMode);
  if (mode === 'card') return isEbcCardPayment(paymentMode);
  return isEbcUpiPayment(paymentMode);
}

/**
 * Customer master wins when it has been saved. `undefined` keeps the built-in
 * airline rule. `null` means the customer was saved with no EBC percentage.
 */
export function ebcRuleFromCustomer(customer: {
  ebcCommissionEnabled?: boolean;
  ebcCommissionPercent?: number;
  ebcCommissionMode?: string;
} | null | undefined): EbcCommissionRule | null | undefined {
  if (!customer || typeof customer.ebcCommissionEnabled !== 'boolean') return undefined;
  if (customer.ebcCommissionEnabled !== true) return null;
  const percent = Number(customer.ebcCommissionPercent);
  if (!Number.isFinite(percent) || percent <= 0) return null;
  const mode: EbcCommissionMode =
    customer.ebcCommissionMode === 'cash' ||
    customer.ebcCommissionMode === 'card' ||
    customer.ebcCommissionMode === 'upi'
      ? customer.ebcCommissionMode
      : 'all';
  return { percent, cashOnly: mode === 'cash', mode };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function emptyQuote(code: string): EbcCommissionQuote {
  return {
    amount: 0,
    percent: 0,
    cashOnly: false,
    mode: 'all',
    billable: false,
    message: `No EBC commission rule for ${code || 'this airline'}`,
  };
}

function modeLabel(mode: EbcCommissionMode): string {
  if (mode === 'cash') return 'cash';
  if (mode === 'card') return 'card';
  if (mode === 'upi') return 'UPI';
  return 'the amount';
}

/**
 * Commission the airline is charged for one collection.
 * A saved customer rule is used when passed. Otherwise QP and VJ are 7% of
 * every receipt and UL is 5% of cash receipts only.
 */
export function quoteEbcCommission(
  airline: string,
  paymentMode: string | null | undefined,
  collected: number,
  override?: EbcCommissionRule | null,
): EbcCommissionQuote {
  const code = String(airline ?? '').trim().toUpperCase();
  const rule = override === undefined ? EBC_COMMISSION_RULES[code] : (override ?? undefined);
  const amountCollected = Number(collected);
  if (!rule) return emptyQuote(code);
  const mode = ebcCommissionMode(rule);
  if (!Number.isFinite(amountCollected) || amountCollected <= 0) {
    return {
      amount: 0,
      percent: rule.percent,
      cashOnly: mode === 'cash',
      mode,
      billable: false,
      message: 'Nothing collected on this receipt',
    };
  }
  if (!paymentMatchesEbcMode(mode, paymentMode)) {
    return {
      amount: 0,
      percent: rule.percent,
      cashOnly: mode === 'cash',
      mode,
      billable: false,
      message: `${code} commission is ${rule.percent}% of ${modeLabel(mode)} collections only`,
    };
  }
  const amount = round2((amountCollected * rule.percent) / 100);
  const scope = mode === 'all' ? ' of the amount collected' : ` of ${modeLabel(mode)} collected`;
  return {
    amount,
    percent: rule.percent,
    cashOnly: mode === 'cash',
    mode,
    billable: amount > 0,
    message: `${rule.percent}%${scope}`,
  };
}

/** Replace the rate-card price with the airline's collection commission. */
export function applyEbcCommission(
  row: BillingSourceRow,
  override?: EbcCommissionRule | null,
): BillingSourceRow {
  if (String(row.sourceType ?? '').trim().toLowerCase() !== 'ebc') return row;
  const airline = String(row.operationalData.customerCode ?? '').trim().toUpperCase();
  const collected = Number(row.operationalData.collectedAmount ?? 0);
  const quote = quoteEbcCommission(
    airline,
    String(row.operationalData.paymentMode ?? ''),
    collected,
    override,
  );
  const keptErrors = (row.validationStatus?.errors ?? []).filter(
    (entry) => entry.rule !== 'rate_match' && entry.rule !== 'ceiling_rate',
  );
  const errors = [
    ...keptErrors,
    {
      rule: 'rate_match',
      passed: quote.billable,
      message: quote.message,
    },
    {
      rule: 'ceiling_rate',
      passed: true,
      message: 'EBC commission is a percent of the amount collected',
    },
  ];
  const contractMatched = Boolean(row.contractMatch?.matched);
  return {
    ...row,
    operationalData: {
      ...row.operationalData,
      commissionPercent: quote.percent,
      commissionAmount: quote.amount,
      cashOnlyCommission: quote.cashOnly,
      commissionMode: quote.mode,
    },
    billingEligibility: {
      eligible: quote.billable && contractMatched,
      reason: !quote.billable
        ? quote.message
        : contractMatched
          ? undefined
          : 'No active contract for this airline',
    },
    rateMatch: {
      ...row.rateMatch,
      matched: quote.billable,
      serviceCode: 'EBC',
      unitPrice: quote.amount,
      currency: 'INR',
      uom: 'Per receipt',
      pricingBasis: 'row',
      particular: quote.percent > 0 ? `EBC collection commission ${quote.percent}%` : 'EBC',
      message: quote.message,
    },
    validationStatus: {
      passed: quote.billable && contractMatched && keptErrors.every((entry) => entry.passed !== false),
      errors,
    },
  };
}
