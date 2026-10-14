/**
 * ADS MIS indexes (same pattern as BHS MIS).
 * Sources: FHR ADS usage + ADS price cards + ADS invoices.
 * Excel writes by row/col index. Does not copy BHS revenue formulas.
 */

import { adsEquipmentFamilyKey } from '../shared/ads-equipment-inclusion.util';
import { computeAdsUsedUnits } from '../shared/fhr-equipment-to-ads-row';
import type { FhrAdsMappedRow } from '../shared/fhr-equipment-to-ads-row';
import type { BillingSourceRow } from '../shared/billing-sources';

export const ADS_BILLING_HEADER_ROW = 2;
export const ADS_BILLING_FIRST_ROW = 3;
export const ADS_BILLING_COL = {
  label: 1,
  used: 2,
  chargeable: 3,
  revenue: 4,
  royalty: 5,
  gst: 6,
  total: 7,
  remark: 8,
  invoiceValue: 9,
  invoiceNo: 10,
} as const;

export const ADS_WORKING_FIRST_ROW = 2;
export const ADS_WORKING_COL = {
  serial: 1,
  customerName: 2,
  customerCode: 3,
  flightNo: 4,
  stdDate: 5,
  atdDate: 6,
  equipmentNo: 7,
  unitType: 8,
  quantity: 9,
} as const;

export const ADS_BILLING_HEADERS = [
  'Row Labels',
  'Used units',
  'Chargeable units',
  'Revenue',
  'Royalty',
  'GST',
  'Total Invoice Amount',
  'Remark',
  'Invoice Value',
  'Invoice No',
] as const;

export const ADS_WORKING_HEADERS = [
  'S.No',
  'Customer Name',
  'Customer Code',
  'Flight No',
  'STD',
  'ATD',
  'Equipment',
  'UOM',
  'Used units',
] as const;

/** Excel column width so the header label is fully visible (Calibri). */
export function adsMisHeaderColumnWidth(header: string): number {
  const n = String(header ?? '').trim().length;
  return Math.max(12, Math.min(42, n + 4));
}

function compactKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

export function adsMisMappedLabel(row: FhrAdsMappedRow): string {
  const snap = row.operationalData ?? {};
  const family = adsEquipmentFamilyKey(
    snap.particular ?? snap.equipment ?? snap.equipment_name ?? row.serviceCode,
  );
  if (family) return family;
  const raw = String(
    snap.abbr ?? snap.particular ?? snap.equipment ?? snap.equipment_name ?? 'EQ',
  ).trim();
  return raw || 'EQ';
}

export function adsMisRateIndexKey(
  customerCode: string,
  label: string,
  aircraftType?: string,
): string {
  return `${String(customerCode ?? '').trim().toUpperCase()}|${compactKey(label)}|${compactKey(aircraftType)}`;
}

export function adsMisMappedDedupKey(row: FhrAdsMappedRow): string {
  const usageId = String(row.sourceRef?.usageRowId ?? '').trim();
  if (usageId) return `u:${usageId}`;
  return `s:${String(row.sourceRef?.serialNo ?? '')}|${compactKey(adsMisMappedLabel(row))}|${String(row.billingDate ?? '')}|${String(row.sourceRef?.flightNo ?? '')}`;
}

/** Unique (airline × equipment × aircraft) samples used to look up contract rates. */
export function indexAdsMisRateSamples(rows: FhrAdsMappedRow[]): FhrAdsMappedRow[] {
  const unique = new Map<string, FhrAdsMappedRow>();
  for (const row of rows) {
    const customerCode = String(row.customerCode ?? row.operationalData?.customerCode ?? '')
      .trim()
      .toUpperCase();
    if (!customerCode) continue;
    const label = adsMisMappedLabel(row);
    const ac = String(row.operationalData?.aircraftType ?? row.operationalData?.TypeCraft ?? '');
    const key = adsMisRateIndexKey(customerCode, label, ac);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

export function dedupeAdsMappedRows(rows: FhrAdsMappedRow[]): FhrAdsMappedRow[] {
  const unique = new Map<string, FhrAdsMappedRow>();
  for (const row of rows) {
    unique.set(adsMisMappedDedupKey(row), row);
  }
  return [...unique.values()];
}

export function adsMisRateMap(
  samples: FhrAdsMappedRow[],
  enriched: BillingSourceRow[],
): Map<string, BillingSourceRow> {
  const map = new Map<string, BillingSourceRow>();
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const rate = enriched[i];
    if (!sample || !rate) continue;
    const customerCode = String(
      sample.customerCode ?? sample.operationalData?.customerCode ?? '',
    )
      .trim()
      .toUpperCase();
    map.set(
      adsMisRateIndexKey(
        customerCode,
        adsMisMappedLabel(sample),
        String(
          sample.operationalData?.aircraftType ?? sample.operationalData?.TypeCraft ?? '',
        ),
      ),
      rate,
    );
  }
  return map;
}

export function applyIndexedAdsRatesToUsage(
  usage: FhrAdsMappedRow[],
  rateByKey: Map<string, BillingSourceRow>,
): BillingSourceRow[] {
  return usage.map((row) => {
    const customerCode = String(row.customerCode ?? row.operationalData?.customerCode ?? '')
      .trim()
      .toUpperCase();
    const key = adsMisRateIndexKey(
      customerCode,
      adsMisMappedLabel(row),
      String(row.operationalData?.aircraftType ?? row.operationalData?.TypeCraft ?? ''),
    );
    return applyIndexedAdsRates(row, rateByKey.get(key));
  });
}

export function applyIndexedAdsRates(
  usage: FhrAdsMappedRow,
  rateRow: BillingSourceRow | undefined,
): BillingSourceRow {
  const snap = usage.operationalData ?? {};
  const qty = Number(snap.qty ?? snap.quantity ?? 1);
  const used = computeAdsUsedUnits({
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    usageHours: Number(snap.usageHours) > 0 ? Number(snap.usageHours) : null,
    uom: rateRow?.rateMatch?.uom,
    remarksQuantity:
      Number(snap.remarksQuantity) > 0 ? Number(snap.remarksQuantity) : null,
  });
  const rateMatch = {
    ...(rateRow?.rateMatch ?? { matched: false }),
    usedUnits: used,
  };
  return {
    sourceType: 'ads',
    sourceRef: usage.sourceRef,
    operationalData: {
      ...snap,
      ...(rateRow?.operationalData ?? {}),
      ...snap,
      customerCode: usage.customerCode,
      customerName:
        snap.customerName ??
        rateRow?.operationalData?.customerName ??
        usage.customerCode,
      adsUsedUnits: used,
      adsParticular: adsMisMappedLabel(usage),
    },
    billingEligibility: rateRow?.billingEligibility ?? { eligible: true },
    contractMatch: rateRow?.contractMatch ?? { matched: false },
    rateMatch,
    validationStatus: rateRow?.validationStatus ?? { passed: true, errors: [] },
  };
}
