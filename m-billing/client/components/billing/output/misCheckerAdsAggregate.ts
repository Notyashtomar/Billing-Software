import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import {
  adsRowChargedQuantity,
  adsRowUsedUnits,
} from '../sources/billingAdsBriefStats';
import { scheduledFlightCustomer } from '../sources/billingScheduledFlightDisplay';

export type MisCheckerAdsServiceRow = {
  key: string;
  kind: 'service';
  airlineKey: string;
  serviceName: string;
  totalQuantity: number;
  chargeableUnits: number;
  totalInr: number;
};

export type MisCheckerAdsAirlineRow = {
  key: string;
  kind: 'airline';
  airlineKey: string;
  serviceName: string;
  totalQuantity: number;
  chargeableUnits: number;
  totalInr: number;
  services: MisCheckerAdsServiceRow[];
};

export type MisCheckerAdsDisplayRow =
  | MisCheckerAdsAirlineRow
  | MisCheckerAdsServiceRow;

export type MisCheckerAdsTotals = {
  totalQuantity: number;
  chargeableUnits: number;
  totalInr: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function toFinite(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pickOp(op: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = String(op[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function normalizeAirlineCode(raw: unknown): string {
  const text = String(raw ?? '').trim().toUpperCase();
  if (!text) return '';
  const fromFlight = text.match(/(?:CANC\s*-\s*)?([A-Z]{2,3})\d{2,5}/);
  if (fromFlight?.[1]) return fromFlight[1];
  if (/^[A-Z0-9]{2,10}$/.test(text)) return text;
  return text.slice(0, 10);
}

function resolveAirlineKey(row: BillingSourceRow): string {
  const op = row.operationalData;
  return (
    normalizeAirlineCode(
      pickOp(op, 'customerCode', 'airlineCode', 'AirlineCode', 'Arline_Code'),
    ) ||
    normalizeAirlineCode(row.sourceRef?.flightNo) ||
    'UNKNOWN'
  );
}

/** Prefer full airline name for yellow group rows (matches MIS export). */
function resolveAirlineLabel(
  row: BillingSourceRow,
  customerDirectory?: ReadonlyMap<string, string>,
): string {
  const code = resolveAirlineKey(row);
  if (customerDirectory && code) {
    const name = String(customerDirectory.get(code) ?? '').trim();
    if (name) {
      const cleaned = name
        .replace(new RegExp(`^${code}\\s*[—–\\-]\\s*`, 'i'), '')
        .trim();
      if (cleaned) return cleaned;
    }
  }
  const label = scheduledFlightCustomer(row, customerDirectory);
  if (label && label !== '—') {
    const withoutCode = label.replace(/^[A-Z0-9]{2,3}\s*[—–\-]\s*/i, '').trim();
    return withoutCode || label;
  }
  return code;
}

function resolveServiceCode(row: BillingSourceRow): string {
  const op = row.operationalData;
  const rate = (row.rateMatch ?? {}) as Record<string, unknown>;
  const raw =
    pickOp(op, 'adsParticular', 'particular', 'equipment', 'equipment_name') ||
    String(rate.particular ?? '').trim() ||
    String(rate.serviceCode ?? '').trim() ||
    String(row.sourceRef?.flightNo ?? '').trim() ||
    'OTHER';
  // Prefer short token before long description (e.g. "WCH - Wheelchair" → WCH).
  const upper = raw.toUpperCase();
  const short = upper.match(/^([A-Z0-9]{1,6})(?:\b|[_\-\s/])/);
  if (short?.[1] && short[1].length <= 6) return short[1];
  if (upper.length <= 8) return upper;
  return upper.slice(0, 8);
}

function lineAmountInr(row: BillingSourceRow, roeToInr: number): number {
  const charged = adsRowChargedQuantity(row);
  if (charged <= 0) return 0;
  const unitPrice = toFinite(row.rateMatch?.unitPrice);
  if (unitPrice <= 0) return 0;
  const currency = String(row.rateMatch?.currency ?? 'INR').trim().toUpperCase();
  const amount = charged * unitPrice;
  if (currency === 'USD') {
    const roe = roeToInr > 0 ? roeToInr : 1;
    return roundMoney(amount * roe);
  }
  return roundMoney(amount);
}

type ServiceBucket = {
  serviceName: string;
  totalQuantity: number;
  chargeableUnits: number;
  totalInr: number;
};

type AirlineBucket = {
  airlineKey: string;
  serviceName: string;
  services: Map<string, ServiceBucket>;
};

/**
 * Aggregate ADS usage into airline groups → service-code lines
 * (matches MIS spreadsheet: yellow airline subtotals + white service rows).
 */
export function aggregateAdsMisCheckerRows(
  rows: BillingSourceRow[],
  opts: {
    customerDirectory?: ReadonlyMap<string, string>;
    roeToInr?: number;
  } = {},
): MisCheckerAdsAirlineRow[] {
  const roeToInr = opts.roeToInr && opts.roeToInr > 0 ? opts.roeToInr : 1;
  const airlines = new Map<string, AirlineBucket>();

  for (const row of rows) {
    const qty = adsRowUsedUnits(row);
    const charged = adsRowChargedQuantity(row);
    const amountInr = lineAmountInr(row, roeToInr);
    if (qty <= 0 && charged <= 0 && amountInr <= 0) continue;

    const airlineKey = resolveAirlineKey(row);
    let airline = airlines.get(airlineKey);
    if (!airline) {
      airline = {
        airlineKey,
        serviceName: resolveAirlineLabel(row, opts.customerDirectory),
        services: new Map(),
      };
      airlines.set(airlineKey, airline);
    }

    const serviceName = resolveServiceCode(row);
    const serviceKey = serviceName.toUpperCase();
    const existing = airline.services.get(serviceKey);
    if (existing) {
      existing.totalQuantity += qty;
      existing.chargeableUnits += charged;
      existing.totalInr = roundMoney(existing.totalInr + amountInr);
    } else {
      airline.services.set(serviceKey, {
        serviceName,
        totalQuantity: qty,
        chargeableUnits: charged,
        totalInr: amountInr,
      });
    }
  }

  const out: MisCheckerAdsAirlineRow[] = [];
  for (const airline of airlines.values()) {
    const services: MisCheckerAdsServiceRow[] = [...airline.services.values()]
      .map((svc) => ({
        key: `${airline.airlineKey}|${svc.serviceName}`,
        kind: 'service' as const,
        airlineKey: airline.airlineKey,
        serviceName: svc.serviceName,
        totalQuantity: svc.totalQuantity,
        chargeableUnits: svc.chargeableUnits,
        totalInr: svc.totalInr,
      }))
      .sort((a, b) => a.serviceName.localeCompare(b.serviceName));

    const totalQuantity = services.reduce((s, r) => s + r.totalQuantity, 0);
    const chargeableUnits = services.reduce((s, r) => s + r.chargeableUnits, 0);
    const totalInr = roundMoney(services.reduce((s, r) => s + r.totalInr, 0));

    out.push({
      key: `airline|${airline.airlineKey}`,
      kind: 'airline',
      airlineKey: airline.airlineKey,
      serviceName: airline.serviceName,
      totalQuantity,
      chargeableUnits,
      totalInr,
      services,
    });
  }

  out.sort((a, b) =>
    a.serviceName.localeCompare(b.serviceName, undefined, { sensitivity: 'base' }),
  );
  return out;
}

export function flattenAdsMisCheckerRows(
  airlines: MisCheckerAdsAirlineRow[],
): MisCheckerAdsDisplayRow[] {
  const out: MisCheckerAdsDisplayRow[] = [];
  for (const airline of airlines) {
    out.push(airline);
    out.push(...airline.services);
  }
  return out;
}

export function sumAdsMisCheckerRows(
  airlines: MisCheckerAdsAirlineRow[],
): MisCheckerAdsTotals {
  return airlines.reduce<MisCheckerAdsTotals>(
    (acc, row) => ({
      totalQuantity: acc.totalQuantity + row.totalQuantity,
      chargeableUnits: acc.chargeableUnits + row.chargeableUnits,
      totalInr: roundMoney(acc.totalInr + row.totalInr),
    }),
    { totalQuantity: 0, chargeableUnits: 0, totalInr: 0 },
  );
}

export function formatAdsQty(value: number): string {
  if (!value) return '';
  return value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatAdsInr(value: number): string {
  if (!value) return '';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
