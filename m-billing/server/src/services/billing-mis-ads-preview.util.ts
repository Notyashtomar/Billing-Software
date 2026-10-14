import { isWheelchairAdsServiceCode } from '../shared/ads-equipment-inclusion.util';
import {
  ADS_MIS_MISSING,
  adsMisCellNumber,
  adsMisSanitizeMoney,
  adsMisSanitizeUsed,
  adsMisTextOrHyphen,
  flattenAdsMisBillingRows,
  type AdsMisBillingSheetPayload,
  type AdsMisCell,
} from './billing-mis-ads-billing-sheet.util';
import { ADS_BILLING_HEADERS, ADS_WORKING_HEADERS } from './billing-mis-ads-source.util';

export type AdsMisPreviewSheet = {
  id: string;
  label: string;
  headers: string[];
  rows: AdsMisCell[][];
  rowKinds: Array<'airline' | 'equipment' | 'normal'>;
};

type PreviewEquipmentRow = {
  serialNumber?: number;
  customerName: string;
  customerCode: string;
  flightNo: string;
  stdDate?: string;
  atdDate?: string;
  equipmentNo: string;
  unitType?: string;
  quantity?: number;
};

function money(value: unknown): AdsMisCell {
  return adsMisSanitizeMoney(value);
}

function used(value: unknown): AdsMisCell {
  return adsMisSanitizeUsed(value);
}

function text(value: unknown): string {
  return adsMisTextOrHyphen(value);
}

function billingCells(row: Record<string, unknown>): AdsMisCell[] {
  const kind = String(row.kind ?? 'equipment');
  const revenue = adsMisCellNumber(row.revenue);
  const total = adsMisCellNumber(row.total);
  const invoiceValue =
    kind === 'airline' || (revenue != null && revenue > 0)
      ? total ?? ADS_MIS_MISSING
      : ADS_MIS_MISSING;
  return [
    text(row.label),
    used(row.used),
    used(row.chargeable),
    money(row.revenue),
    money(row.royalty),
    money(row.gst),
    money(row.total),
    text(row.remark),
    invoiceValue,
    text(row.invoiceNumbers),
  ];
}

function workingCells(row: PreviewEquipmentRow, index: number): AdsMisCell[] {
  return [
    row.serialNumber ?? index + 1,
    text(row.customerName),
    text(row.customerCode),
    text(row.flightNo),
    text(row.stdDate),
    text(row.atdDate),
    text(row.equipmentNo),
    text(row.unitType ?? 'Unit'),
    used(row.quantity),
  ];
}

function uniqueEquipmentLabels(payload: AdsMisBillingSheetPayload): string[] {
  const labels = new Set<string>();
  for (const group of payload.groups) {
    for (const line of group.lines) {
      if (line.label) labels.add(line.label);
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}

/**
 * Sheet tables that match the ADS MIS workbook layout (station × airline × month rows).
 */
export function buildAdsMisPreviewSheets(opts: {
  billing: AdsMisBillingSheetPayload;
  equipmentRows: PreviewEquipmentRow[];
  roeToInr: number;
}): AdsMisPreviewSheet[] {
  const billingRows = flattenAdsMisBillingRows(opts.billing);
  const airlines = opts.billing.groups;
  const labels = uniqueEquipmentLabels(opts.billing);
  const workingRows = opts.equipmentRows.map((row, i) => workingCells(row, i));
  const workingKinds: AdsMisPreviewSheet['rowKinds'] = workingRows.map(() => 'normal');

  const billingSheet: AdsMisPreviewSheet = {
    id: 'billing-sheet',
    label: 'Billing Sheet',
    headers: [...ADS_BILLING_HEADERS],
    rows: billingRows.map(billingCells),
    rowKinds: billingRows.map((row) =>
      String(row.kind) === 'airline' ? 'airline' : 'equipment',
    ),
  };

  const workingSheet: AdsMisPreviewSheet = {
    id: 'working-sheet',
    label: 'WorkingSheet',
    headers: [...ADS_WORKING_HEADERS],
    rows: workingRows,
    rowKinds: workingKinds,
  };

  const exportedSheet: AdsMisPreviewSheet = {
    id: 'exported-eq-data',
    label: 'Exported EQ Data',
    headers: [...ADS_WORKING_HEADERS],
    rows: workingRows,
    rowKinds: workingKinds,
  };

  const checkEquipHeaders = ['Equipment', ...airlines.map((g) => g.customerName), 'Total'];
  const checkEquipRows: AdsMisCell[][] = labels.map((label) => {
    const cells: AdsMisCell[] = [label];
    let total = 0;
    let any = false;
    for (const group of airlines) {
      const line = group.lines.find((l) => l.label === label);
      const cell = line ? used(line.used) : ADS_MIS_MISSING;
      cells.push(cell);
      const n = adsMisCellNumber(cell);
      if (n != null) {
        total += n;
        any = true;
      }
    }
    cells.push(any ? used(total) : ADS_MIS_MISSING);
    return cells;
  });

  const checkRevenueHeaders = ['Equipment', ...airlines.map((g) => g.customerName), 'Total'];
  const checkRevenueRows: AdsMisCell[][] = labels.map((label) => {
    const cells: AdsMisCell[] = [label];
    let total = 0;
    let any = false;
    for (const group of airlines) {
      const line = group.lines.find((l) => l.label === label);
      const cell = line ? money(line.revenue) : ADS_MIS_MISSING;
      cells.push(cell);
      const n = adsMisCellNumber(cell);
      if (n != null) {
        total += n;
        any = true;
      }
    }
    cells.push(any ? money(total) : ADS_MIS_MISSING);
    return cells;
  });

  const revenueWorking: AdsMisPreviewSheet = {
    id: 'revenue-working',
    label: 'Revenue Working',
    headers: [
      'Airline',
      'Used units',
      'Chargeable units',
      'Revenue',
      'Royalty',
      'GST',
      'Total',
      'Invoice No',
      'ROE to INR',
    ],
    rows: airlines.map((group) => [
      text(group.customerName),
      used(group.used),
      used(group.chargeable),
      money(group.revenue),
      money(group.royalty),
      money(group.gst),
      money(group.total),
      text(group.invoiceNumbers.join(', ')),
      adsMisSanitizeMoney(opts.roeToInr),
    ]),
    rowKinds: airlines.map(() => 'airline'),
  };

  const sheet2Buckets = new Map<string, { used: number; chargeable: number; revenue: number }>();
  for (const group of airlines) {
    for (const line of group.lines) {
      const key = isWheelchairAdsServiceCode(line.label)
        ? 'Wheelchair'
        : /clean/i.test(line.label)
          ? 'Cleaning'
          : line.label.split('-')[0] || line.label;
      const prev = sheet2Buckets.get(key) ?? { used: 0, chargeable: 0, revenue: 0 };
      prev.used += line.used;
      prev.chargeable += line.chargeable;
      prev.revenue += line.revenue;
      sheet2Buckets.set(key, prev);
    }
  }

  const sheet2Rows = [...sheet2Buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([label, agg]) =>
        [label, used(agg.used), used(agg.chargeable), money(agg.revenue)] as AdsMisCell[],
    );

  const wchRows: AdsMisCell[][] = airlines.map((group) => {
    const wchr = group.lines.find((l) => /WCHR/i.test(l.label));
    const wchs = group.lines.find((l) => /WCHS/i.test(l.label));
    const wchc = group.lines.find((l) => /WCHC/i.test(l.label));
    return [
      text(group.customerName),
      wchr ? used(wchr.used) : ADS_MIS_MISSING,
      wchs ? used(wchs.used) : ADS_MIS_MISSING,
      wchc ? used(wchc.used) : ADS_MIS_MISSING,
      wchr ? money(wchr.revenue) : ADS_MIS_MISSING,
      wchs ? money(wchs.revenue) : ADS_MIS_MISSING,
      wchc ? money(wchc.revenue) : ADS_MIS_MISSING,
    ];
  });

  return [
    workingSheet,
    exportedSheet,
    billingSheet,
    {
      id: 'check-equip',
      label: 'Check Equip',
      headers: checkEquipHeaders,
      rows: checkEquipRows,
      rowKinds: checkEquipRows.map(() => 'normal'),
    },
    {
      id: 'check-revenue',
      label: 'Check Revenue',
      headers: checkRevenueHeaders,
      rows: checkRevenueRows,
      rowKinds: checkRevenueRows.map(() => 'normal'),
    },
    revenueWorking,
    {
      id: 'sheet2',
      label: 'Sheet2',
      headers: ['Service family', 'Used units', 'Chargeable units', 'Revenue'],
      rows: sheet2Rows,
      rowKinds: sheet2Rows.map(() => 'normal'),
    },
    {
      id: 'check-wch',
      label: 'check for wch',
      headers: ['Airline', 'WCHR used', 'WCHS used', 'WCHC used', 'WCHR revenue', 'WCHS revenue', 'WCHC revenue'],
      rows: wchRows,
      rowKinds: airlines.map(() => 'airline'),
    },
  ];
}
