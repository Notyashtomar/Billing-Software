import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import { domesticInternationalBucketFromCateOfFlight } from '@/utils/dataProcessor';
import { scheduledFlightCustomer } from '../sources/billingScheduledFlightDisplay';

/** Mirror invoice-engine defaults (INVOICE_CGST/SGST_PERCENT). */
export const MIS_CGST_PERCENT = 9;
export const MIS_SGST_PERCENT = 9;

export type MisCheckerAggRow = {
  key: string;
  airline: string;
  customerCode: string;
  flights: number;
  rate: number;
  amount: number;
  consession: number;
  concessionPercent: number;
  total: number;
  cgst: number;
  sgst: number;
  usd: number;
  inr: number;
  currency: 'INR' | 'USD';
};

export type MisCheckerAggTotals = {
  flights: number;
  amount: number;
  consession: number;
  total: number;
  cgst: number;
  sgst: number;
  usd: number;
  inr: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function toFinite(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAirlineCode(raw: unknown): string {
  const text = String(raw ?? '').trim().toUpperCase();
  if (!text) return '';
  const fromFlight = text.match(/(?:CANC\s*-\s*)?([A-Z]{2,3})\d{2,5}/);
  if (fromFlight?.[1]) return fromFlight[1];
  if (/^[A-Z0-9]{2,10}$/.test(text)) return text;
  return text.slice(0, 10);
}

function pickOp(op: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = String(op[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function positiveRate(value: unknown): number {
  const n = toFinite(value);
  return n > 0 ? n : 0;
}

/**
 * Resolve SGHA / fee concession % for a scheduled flight from enriched contractMatch.
 * Dom/Int (and cargo) scenarios mirror server invoice-concession.util.
 */
export function resolveFlightConcessionPercent(row: BillingSourceRow): number {
  const rates = row.contractMatch?.concessionRates ?? {};
  const royalty = positiveRate(row.contractMatch?.royaltyAtGross);
  const category = pickOp(
    row.operationalData,
    'categoryOfFlight',
    'Cate_of_Flight',
    'flightCategory',
  );
  const categoryLower = category.toLowerCase();
  const bucket = domesticInternationalBucketFromCateOfFlight(category);
  const isDom =
    bucket === 'domestic' ||
    (/domestic/.test(categoryLower) && !/international/.test(categoryLower));
  const isCargo = /cargo/.test(categoryLower);
  const isDiverted = /divert/.test(categoryLower);

  if (isDiverted && isDom) {
    return positiveRate(rates.divertedDom) || royalty;
  }
  if (isDiverted) {
    return positiveRate(rates.divertedInt) || royalty;
  }
  if (isCargo && isDom) {
    return positiveRate(rates.domesticCargo) || royalty;
  }
  if (isCargo) {
    return positiveRate(rates.internationalCargo) || royalty;
  }
  if (isDom) {
    return positiveRate(rates.dom) || royalty;
  }
  return positiveRate(rates.int) || royalty;
}

function resolveCustomerCode(row: BillingSourceRow): string {
  const op = row.operationalData;
  return (
    normalizeAirlineCode(
      pickOp(op, 'customerCode', 'airlineCode', 'AirlineCode', 'Arline_Code'),
    ) ||
    normalizeAirlineCode(row.sourceRef?.flightNo) ||
    'UNKNOWN'
  );
}

function resolveAirlineLabel(
  row: BillingSourceRow,
  customerDirectory?: ReadonlyMap<string, string>,
): string {
  const label = scheduledFlightCustomer(row, customerDirectory);
  if (label && label !== '—') return label;
  return resolveCustomerCode(row);
}

/**
 * Per-group money math (mirrors calculateInvoiceConcessionTotals):
 * Amount = Flights × Rate
 * Consession = Amount × pct/100 (SGHA fee, additive)
 * Total = Amount + Consession
 * Tax on INR gross (ROE convert when currency is USD)
 * INR = Total(INR) + CGST + SGST
 * USD = application amt in USD when billed USD, else 0
 */
export function computeGroupAmounts(input: {
  flights: number;
  rate: number;
  concessionPercent: number;
  currency: 'INR' | 'USD';
  roeToInr: number;
  cgstPercent?: number;
  sgstPercent?: number;
}): Omit<
  MisCheckerAggRow,
  'key' | 'airline' | 'customerCode' | 'flights' | 'rate' | 'concessionPercent' | 'currency'
> {
  const cgstPct = input.cgstPercent ?? MIS_CGST_PERCENT;
  const sgstPct = input.sgstPercent ?? MIS_SGST_PERCENT;
  const amount = roundMoney(input.flights * input.rate);
  const consession =
    input.concessionPercent > 0 && amount > 0
      ? roundMoney(amount * (input.concessionPercent / 100))
      : 0;
  const total = roundMoney(amount + consession);
  const currency = input.currency;
  const roe = input.roeToInr > 0 ? input.roeToInr : 1;

  if (currency === 'USD') {
    const grossInr = roundMoney(total * roe);
    const cgst = grossInr > 0 ? roundMoney(grossInr * (cgstPct / 100)) : 0;
    const sgst = grossInr > 0 ? roundMoney(grossInr * (sgstPct / 100)) : 0;
    const inr = roundMoney(grossInr + cgst + sgst);
    return {
      amount,
      consession,
      total,
      cgst,
      sgst,
      // Inv. Amt - Application (USD): billing-currency gross (pre-INR tax).
      usd: total,
      inr,
    };
  }

  const cgst = total > 0 ? roundMoney(total * (cgstPct / 100)) : 0;
  const sgst = total > 0 ? roundMoney(total * (sgstPct / 100)) : 0;
  const inr = roundMoney(total + cgst + sgst);
  return {
    amount,
    consession,
    total,
    cgst,
    sgst,
    usd: 0,
    inr,
  };
}

type Bucket = {
  airline: string;
  customerCode: string;
  rate: number;
  concessionPercent: number;
  currency: 'INR' | 'USD';
  flights: number;
};

/**
 * Aggregate RBHS source rows by (airline/customerCode, unit rate, concession %).
 */
export function aggregateRbhsBillCheckRows(
  rows: BillingSourceRow[],
  opts: {
    customerDirectory?: ReadonlyMap<string, string>;
    roeToInr?: number;
    cgstPercent?: number;
    sgstPercent?: number;
  } = {},
): MisCheckerAggRow[] {
  const roeToInr = opts.roeToInr && opts.roeToInr > 0 ? opts.roeToInr : 1;
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    if (!row.billingEligibility?.eligible) continue;
    const rate = toFinite(row.rateMatch?.unitPrice);
    if (rate <= 0) continue;

    const customerCode = resolveCustomerCode(row);
    const currencyRaw = String(row.rateMatch?.currency ?? 'INR').trim().toUpperCase();
    const currency: 'INR' | 'USD' = currencyRaw === 'USD' ? 'USD' : 'INR';
    const concessionPercent = roundMoney(resolveFlightConcessionPercent(row));
    const rateKey = roundMoney(rate);
    const key = `${customerCode}|${rateKey.toFixed(2)}|${concessionPercent.toFixed(2)}|${currency}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.flights += 1;
    } else {
      buckets.set(key, {
        airline: resolveAirlineLabel(row, opts.customerDirectory),
        customerCode,
        rate: rateKey,
        concessionPercent,
        currency,
        flights: 1,
      });
    }
  }

  const out: MisCheckerAggRow[] = [];
  for (const [key, bucket] of buckets) {
    const money = computeGroupAmounts({
      flights: bucket.flights,
      rate: bucket.rate,
      concessionPercent: bucket.concessionPercent,
      currency: bucket.currency,
      roeToInr,
      cgstPercent: opts.cgstPercent,
      sgstPercent: opts.sgstPercent,
    });
    out.push({
      key,
      airline: bucket.airline,
      customerCode: bucket.customerCode,
      flights: bucket.flights,
      rate: bucket.rate,
      concessionPercent: bucket.concessionPercent,
      currency: bucket.currency,
      ...money,
    });
  }

  out.sort((a, b) => {
    const byAirline = a.airline.localeCompare(b.airline, undefined, { sensitivity: 'base' });
    if (byAirline !== 0) return byAirline;
    return a.rate - b.rate;
  });

  return out;
}

export function sumMisCheckerAggRows(rows: MisCheckerAggRow[]): MisCheckerAggTotals {
  return rows.reduce<MisCheckerAggTotals>(
    (acc, row) => ({
      flights: acc.flights + row.flights,
      amount: roundMoney(acc.amount + row.amount),
      consession: roundMoney(acc.consession + row.consession),
      total: roundMoney(acc.total + row.total),
      cgst: roundMoney(acc.cgst + row.cgst),
      sgst: roundMoney(acc.sgst + row.sgst),
      usd: roundMoney(acc.usd + row.usd),
      inr: roundMoney(acc.inr + row.inr),
    }),
    {
      flights: 0,
      amount: 0,
      consession: 0,
      total: 0,
      cgst: 0,
      sgst: 0,
      usd: 0,
      inr: 0,
    },
  );
}

export function formatInAmount(value: number, fractionDigits = 2): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatInInteger(value: number): string {
  return value.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
}
