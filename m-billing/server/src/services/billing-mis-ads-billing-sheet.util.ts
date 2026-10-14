import { adsEquipmentFamilyKey } from '../shared/ads-equipment-inclusion.util';
import type { BillingSourceRow } from '../shared/billing-sources';

export type AdsMisBillingInvoiceHint = {
  customerCode: string;
  customerName?: string;
  invoiceNumber?: string;
  concessionFeeAmount?: number;
  taxTotal?: number;
  totalInclTax?: number;
};

const DEFAULT_GST_RATE = 0.18;
/** FHR used-units above this are not real monthly counts (timestamps / concatenated clocks). */
export const ADS_MIS_MAX_USED_UNITS = 100_000;
export const ADS_MIS_MISSING = '-';

export type AdsMisCell = string | number;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function adsMisSanitizeUsed(value: unknown): AdsMisCell {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > ADS_MIS_MAX_USED_UNITS) return ADS_MIS_MISSING;
  return round2(n);
}

export function adsMisSanitizeMoney(value: unknown): AdsMisCell {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e11) return ADS_MIS_MISSING;
  return round2(n);
}

export function adsMisTextOrHyphen(value: unknown): string {
  const text = String(value ?? '').trim();
  return text || ADS_MIS_MISSING;
}

export function adsMisCellNumber(value: AdsMisCell | unknown): number | null {
  if (value === ADS_MIS_MISSING || value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type AdsMisBillingEquipmentLine = {
  kind: 'equipment';
  label: string;
  used: number;
  unitPrice: number;
  chargeable: number;
  revenue: number;
  royalty: number;
  gst: number;
  total: number;
  invoiceNumbers: string[];
};

export type AdsMisBillingAirlineGroup = {
  kind: 'airline';
  customerCode: string;
  customerName: string;
  used: number;
  chargeable: number;
  revenue: number;
  royalty: number;
  gst: number;
  total: number;
  invoiceNumbers: string[];
  lines: AdsMisBillingEquipmentLine[];
};

export type AdsMisBillingSheetPayload = {
  groups: AdsMisBillingAirlineGroup[];
};

function compactKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

export function adsMisEquipmentLabel(row: BillingSourceRow): string {
  const snap = row.operationalData ?? {};
  const rate = row.rateMatch ?? {};
  const family = adsEquipmentFamilyKey(
    rate.particular ?? snap.adsParticular ?? snap.equipment_name ?? rate.serviceCode,
  );
  if (family) return family;
  const raw = String(
    snap.abbr ??
      rate.particular ??
      snap.adsParticular ??
      snap.equipment_name ??
      rate.serviceCode ??
      'EQ',
  ).trim();
  return raw || 'EQ';
}

export function adsMisUsageDedupKey(row: BillingSourceRow): string {
  const usageId = String(row.sourceRef?.usageRowId ?? '').trim();
  if (usageId) return `u:${usageId}`;
  const serial = String(row.sourceRef?.serialNo ?? '').trim();
  const date = String(
    row.operationalData?.billingDateYmd ??
      row.operationalData?.staDate ??
      row.rateMatch?.aircraftType ??
      '',
  ).trim();
  return `s:${serial}|${compactKey(adsMisEquipmentLabel(row))}|${date}|${String(row.sourceRef?.flightNo ?? '')}`;
}

function concessionRate(row: BillingSourceRow): number {
  const royalty = Number(row.contractMatch?.royaltyAtGross ?? 0);
  if (Number.isFinite(royalty) && royalty > 0) {
    return royalty > 1 ? royalty / 100 : royalty;
  }
  const fees = row.contractMatch?.concessionRates;
  const cat = String(row.operationalData?.categoryOfFlight ?? '').toLowerCase();
  const picked =
    cat.startsWith('dom') ? fees?.dom : cat.startsWith('int') ? fees?.int : fees?.int ?? fees?.dom;
  const n = Number(picked ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

function usedUnits(row: BillingSourceRow): number | null {
  const n = Number(
    row.rateMatch?.usedUnits ??
      row.operationalData?.adsUsedUnits ??
      row.operationalData?.quantity ??
      1,
  );
  if (!Number.isFinite(n) || n < 0 || n > ADS_MIS_MAX_USED_UNITS) return null;
  return n;
}

function chargeableUnits(row: BillingSourceRow, used: number): number {
  const basis = String(row.rateMatch?.pricingBasis ?? '');
  const price = Number(row.rateMatch?.unitPrice ?? 0);
  if (
    basis === 'package_inclusive' ||
    basis === 'ads_excluded' ||
    basis === 'not_on_contract' ||
    !(price > 0)
  ) {
    return 0;
  }
  const free = Number(row.rateMatch?.freeAllowance ?? row.operationalData?.adsFreeAllowance ?? 0);
  const freeQty = Number.isFinite(free) && free > 0 ? free : 0;
  return Math.max(0, used - freeQty);
}

function customerNameOf(row: BillingSourceRow): string {
  return String(
    row.operationalData?.customerName ??
      row.operationalData?.airlineName ??
      row.operationalData?.customerCode ??
      '',
  ).trim();
}

/**
 * Airline groups for Billing Sheet. One equipment row per airline × label.
 * Usage is de-duplicated so the same FHR line cannot inflate used/chargeable.
 */
export function buildAdsMisBillingSheet(
  rows: BillingSourceRow[],
  invoices: AdsMisBillingInvoiceHint[],
): AdsMisBillingSheetPayload {
  const unique = new Map<string, BillingSourceRow>();
  for (const row of rows) {
    unique.set(adsMisUsageDedupKey(row), row);
  }

  type Agg = {
    customerCode: string;
    customerName: string;
    label: string;
    concession: number;
    used: number;
    chargeable: number;
    unitPrice: number;
  };

  const byAirlineEquip = new Map<string, Agg>();
  for (const row of unique.values()) {
    const customerCode = String(row.operationalData?.customerCode ?? '').trim().toUpperCase();
    if (!customerCode) continue;
    const label = adsMisEquipmentLabel(row);
    const used = usedUnits(row) ?? 0;
    const chargeable = chargeableUnits(row, used);
    const unitPrice = Number(row.rateMatch?.unitPrice ?? 0);
    const key = `${customerCode}|${compactKey(label)}`;
    const prev = byAirlineEquip.get(key);
    if (prev) {
      prev.used += used;
      prev.chargeable += chargeable;
      if (unitPrice > prev.unitPrice) prev.unitPrice = unitPrice;
      if (!prev.customerName) prev.customerName = customerNameOf(row);
      continue;
    }
    byAirlineEquip.set(key, {
      customerCode,
      customerName: customerNameOf(row) || customerCode,
      label,
      concession: concessionRate(row),
      used,
      chargeable,
      unitPrice: unitPrice > 0 ? unitPrice : 0,
    });
  }

  const invoicesByCustomer = new Map<string, AdsMisBillingInvoiceHint[]>();
  for (const inv of invoices) {
    const code = String(inv.customerCode ?? '').trim().toUpperCase();
    if (!code) continue;
    const list = invoicesByCustomer.get(code) ?? [];
    list.push(inv);
    invoicesByCustomer.set(code, list);
  }

  const groupsMap = new Map<string, AdsMisBillingAirlineGroup>();
  for (const agg of byAirlineEquip.values()) {
    const revenue = round2(agg.chargeable * (agg.unitPrice > 0 ? agg.unitPrice : 0));
    const royalty = round2(revenue * agg.concession);
    const gst = round2((revenue + royalty) * DEFAULT_GST_RATE);
    const total = round2(revenue + royalty + gst);
    const invs = invoicesByCustomer.get(agg.customerCode) ?? [];
    const invoiceNumbers =
      revenue > 0
        ? [
            ...new Set(
              invs
                .map((i) => String(i.invoiceNumber ?? '').trim())
                .filter(Boolean),
            ),
          ]
        : [];

    const line: AdsMisBillingEquipmentLine = {
      kind: 'equipment',
      label: agg.label,
      used: round2(agg.used),
      unitPrice: round2(agg.unitPrice),
      chargeable: round2(agg.chargeable),
      revenue,
      royalty,
      gst,
      total,
      invoiceNumbers,
    };

    const group =
      groupsMap.get(agg.customerCode) ??
      ({
        kind: 'airline',
        customerCode: agg.customerCode,
        customerName: agg.customerName,
        used: 0,
        chargeable: 0,
        revenue: 0,
        royalty: 0,
        gst: 0,
        total: 0,
        invoiceNumbers: [],
        lines: [],
      } satisfies AdsMisBillingAirlineGroup);

    group.customerName = group.customerName || agg.customerName;
    group.lines.push(line);
    groupsMap.set(agg.customerCode, group);
  }

  for (const inv of invoices) {
    const code = String(inv.customerCode ?? '').trim().toUpperCase();
    if (!code || groupsMap.has(code)) continue;
    const royalty = Number(inv.concessionFeeAmount ?? 0);
    const gst = Number(inv.taxTotal ?? 0);
    const total = Number(inv.totalInclTax ?? 0);
    groupsMap.set(code, {
      kind: 'airline',
      customerCode: code,
      customerName: String(inv.customerName ?? code).trim() || code,
      used: 0,
      chargeable: 0,
      revenue: 0,
      royalty: Number.isFinite(royalty) ? royalty : 0,
      gst: Number.isFinite(gst) ? gst : 0,
      total: Number.isFinite(total) ? total : 0,
      invoiceNumbers: String(inv.invoiceNumber ?? '').trim()
        ? [String(inv.invoiceNumber).trim()]
        : [],
      lines: [],
    });
  }

  const groups = [...groupsMap.values()]
    .map((group) => {
      group.lines.sort((a, b) => a.label.localeCompare(b.label));
      applyInvoiceTotals(group, invoicesByCustomer.get(group.customerCode) ?? []);
      if (group.lines.length > 0) {
        group.used = round2(group.lines.reduce((s, l) => s + l.used, 0));
        group.chargeable = round2(group.lines.reduce((s, l) => s + l.chargeable, 0));
        group.revenue = round2(group.lines.reduce((s, l) => s + l.revenue, 0));
        group.royalty = round2(group.lines.reduce((s, l) => s + l.royalty, 0));
        group.gst = round2(group.lines.reduce((s, l) => s + l.gst, 0));
        group.total = round2(group.lines.reduce((s, l) => s + l.total, 0));
      }
      group.invoiceNumbers = [
        ...new Set([
          ...group.invoiceNumbers,
          ...group.lines.flatMap((l) => l.invoiceNumbers),
        ]),
      ];
      return group;
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName));

  return { groups };
}

/** When an ADS invoice exists, scale royalty/GST so sheet totals match the invoice. */
function applyInvoiceTotals(
  group: AdsMisBillingAirlineGroup,
  invoices: AdsMisBillingInvoiceHint[],
) {
  if (invoices.length !== 1) return;
  const inv = invoices[0];
  const charged = group.lines.filter((l) => l.revenue > 0);
  const revenueSum = charged.reduce((s, l) => s + l.revenue, 0);
  if (!(revenueSum > 0)) return;
  const royaltyTotal = Number(inv.concessionFeeAmount ?? 0);
  const gstTotal = Number(inv.taxTotal ?? 0);
  if (!(royaltyTotal > 0) && !(gstTotal > 0)) return;
  for (const line of charged) {
    const share = line.revenue / revenueSum;
    line.royalty = royaltyTotal > 0 ? round2(royaltyTotal * share) : line.royalty;
    line.gst = gstTotal > 0 ? round2(gstTotal * share) : line.gst;
    line.total = round2(line.revenue + line.royalty + line.gst);
  }
}

/** Unique airline × equipment rows for Working / Exported EQ (BHS-style index, not every FHR line). */
export function adsMisIndexedEquipmentRows(
  payload: AdsMisBillingSheetPayload,
  stationCode: string,
): Array<{
  serialNumber: number;
  customerName: string;
  customerCode: string;
  flightNo: string;
  equipmentNo: string;
  quantity: number;
  unitType: string;
  route: string;
}> {
  const out: Array<{
    serialNumber: number;
    customerName: string;
    customerCode: string;
    flightNo: string;
    equipmentNo: string;
    quantity: number;
    unitType: string;
    route: string;
  }> = [];
  let serial = 1;
  for (const group of payload.groups) {
    for (const line of group.lines) {
      out.push({
        serialNumber: serial,
        customerName: group.customerName,
        customerCode: group.customerCode,
        flightNo: '',
        equipmentNo: line.label,
        quantity: line.used,
        unitType: 'Unit',
        route: stationCode,
      });
      serial += 1;
    }
  }
  return out;
}

export function flattenAdsMisBillingRows(
  payload: AdsMisBillingSheetPayload,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const group of payload.groups) {
    out.push({
      kind: 'airline',
      label: group.customerName,
      used: adsMisSanitizeUsed(group.used),
      chargeable: adsMisSanitizeUsed(group.chargeable),
      revenue: adsMisSanitizeMoney(group.revenue),
      royalty: adsMisSanitizeMoney(group.royalty),
      gst: adsMisSanitizeMoney(group.gst),
      total: adsMisSanitizeMoney(group.total),
      remark: ADS_MIS_MISSING,
      invoiceNumbers: adsMisTextOrHyphen(group.invoiceNumbers.join(', ')),
    });
    for (const line of group.lines) {
      const charged = line.revenue > 0 || line.chargeable > 0;
      out.push({
        kind: 'equipment',
        label: line.label,
        used: adsMisSanitizeUsed(line.used),
        unitPrice: adsMisSanitizeMoney(line.unitPrice),
        chargeable: adsMisSanitizeUsed(line.chargeable),
        revenue: adsMisSanitizeMoney(line.revenue),
        royalty: charged ? adsMisSanitizeMoney(line.royalty) : 0,
        gst: charged ? adsMisSanitizeMoney(line.gst) : 0,
        total: adsMisSanitizeMoney(line.total),
        remark: ADS_MIS_MISSING,
        invoiceNumbers: adsMisTextOrHyphen(line.invoiceNumbers.join(', ')),
      });
    }
  }
  return out;
}
