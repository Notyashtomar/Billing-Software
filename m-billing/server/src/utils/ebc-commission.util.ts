import type { BillingSourceRow } from '../shared/billing-sources';

export type EbcCommissionRule = {
  percent: number;
  /** When true, card, UPI, and mixed payments are not commissioned. */
  cashOnly: boolean;
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
  billable: boolean;
  message: string;
};

export function isEbcCashPayment(paymentMode: string | null | undefined): boolean {
  const mode = String(paymentMode ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return mode === 'CASH' || mode === 'CSH' || mode === 'CCASH';
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Commission the airline is charged for one collection.
 * QP and VJ: 7% of the amount collected. UL: 5% of cash collections only.
 */
export function quoteEbcCommission(
  airline: string,
  paymentMode: string | null | undefined,
  collected: number,
): EbcCommissionQuote {
  const code = String(airline ?? '').trim().toUpperCase();
  const rule = EBC_COMMISSION_RULES[code];
  const amountCollected = Number(collected);
  if (!rule) {
    return {
      amount: 0,
      percent: 0,
      cashOnly: false,
      billable: false,
      message: `No EBC commission rule for ${code || 'this airline'}`,
    };
  }
  if (!Number.isFinite(amountCollected) || amountCollected <= 0) {
    return {
      amount: 0,
      percent: rule.percent,
      cashOnly: rule.cashOnly,
      billable: false,
      message: 'Nothing collected on this receipt',
    };
  }
  if (rule.cashOnly && !isEbcCashPayment(paymentMode)) {
    return {
      amount: 0,
      percent: rule.percent,
      cashOnly: true,
      billable: false,
      message: `${code} commission is ${rule.percent}% of cash collections only`,
    };
  }
  const amount = round2((amountCollected * rule.percent) / 100);
  const scope = rule.cashOnly ? ' of cash collected' : ' of the amount collected';
  return {
    amount,
    percent: rule.percent,
    cashOnly: rule.cashOnly,
    billable: amount > 0,
    message: `${rule.percent}%${scope}`,
  };
}

/** Replace the rate-card price with the airline's collection commission. */
export function applyEbcCommission(row: BillingSourceRow): BillingSourceRow {
  if (String(row.sourceType ?? '').trim().toLowerCase() !== 'ebc') return row;
  const airline = String(row.operationalData.customerCode ?? '').trim().toUpperCase();
  const collected = Number(row.operationalData.collectedAmount ?? 0);
  const quote = quoteEbcCommission(airline, String(row.operationalData.paymentMode ?? ''), collected);
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
