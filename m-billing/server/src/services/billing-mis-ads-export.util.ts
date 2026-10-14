import ExcelJS from 'exceljs';
import {
  formatMisMonthToken,
  getAdsMisStationProfile,
} from './billing-mis-ads-profile.util';
import {
  ADS_MIS_MISSING,
  type AdsMisBillingSheetPayload,
  type AdsMisCell,
} from './billing-mis-ads-billing-sheet.util';
import { buildAdsMisPreviewSheets } from './billing-mis-ads-preview.util';
import {
  ADS_BILLING_COL,
  ADS_BILLING_FIRST_ROW,
  ADS_BILLING_HEADER_ROW,
  ADS_BILLING_HEADERS,
  ADS_WORKING_COL,
  ADS_WORKING_FIRST_ROW,
  ADS_WORKING_HEADERS,
  adsMisHeaderColumnWidth,
} from './billing-mis-ads-source.util';

function formatMisMonthDisplay(fromYmd: string): string {
  const [yearStr, monthStr] = (fromYmd || '').split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) return '';
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[month - 1]}-${String(year).slice(-2)}`;
}

export type AdsMisEquipmentRow = {
  serialNumber?: number;
  customerName: string;
  customerCode: string;
  flightNo: string;
  stdDate?: string;
  atdDate?: string;
  equipmentNo: string;
  unitType?: string;
  quantity?: number;
  weight?: number;
  route?: string;
  usageTime?: string;
  fromDate?: string;
  toDate?: string;
  remarks?: string;
  typeCraft?: string;
  categoryOfFlight?: string;
  registrationNo?: string;
};

export type AdsMisInvoiceRow = {
  customerCode: string;
  billToCustomerCode?: string;
  customerName: string;
  invoiceNumber: string;
  status: string;
  totalInclTax: number;
  concessionFeeAmount?: number;
  taxTotal?: number;
  currency: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
};

export type AdsMisExportInput = {
  stationCode: string;
  from: string;
  to: string;
  equipmentRows: AdsMisEquipmentRow[];
  invoices: AdsMisInvoiceRow[];
  billingRows?: Array<Record<string, unknown>>;
  billingSheet?: AdsMisBillingSheetPayload;
  roeToInr: number;
};

function setIndexed(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
): void {
  ws.getCell(row, col).value = value;
}

function fitColumnsToHeaders(
  ws: ExcelJS.Worksheet,
  headers: readonly string[],
  headerRow: number,
): void {
  headers.forEach((title, i) => {
    const col = i + 1;
    const cell = ws.getCell(headerRow, col);
    cell.font = { name: 'Calibri', size: 11, bold: true };
    cell.alignment = { wrapText: false, vertical: 'middle', horizontal: 'left' };
    ws.getColumn(col).width = adsMisHeaderColumnWidth(title);
  });
  ws.getRow(headerRow).height = 18;
}

function excelCell(value: AdsMisCell | unknown): ExcelJS.CellValue {
  if (value == null || value === '') return ADS_MIS_MISSING;
  if (typeof value === 'number' && !Number.isFinite(value)) return ADS_MIS_MISSING;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return ADS_MIS_MISSING;
}

function populateBillingSheet(
  ws: ExcelJS.Worksheet,
  billingRows: Array<Record<string, unknown>>,
): void {
  ADS_BILLING_HEADERS.forEach((title, i) => {
    setIndexed(ws, ADS_BILLING_HEADER_ROW, i + 1, title);
  });
  billingRows.forEach((row, idx) => {
    const r = ADS_BILLING_FIRST_ROW + idx;
    const kind = String(row.kind ?? 'equipment');
    const revenueNum = typeof row.revenue === 'number' ? row.revenue : Number(row.revenue);
    setIndexed(ws, r, ADS_BILLING_COL.label, excelCell(row.label));
    setIndexed(ws, r, ADS_BILLING_COL.used, excelCell(row.used));
    setIndexed(ws, r, ADS_BILLING_COL.chargeable, excelCell(row.chargeable));
    setIndexed(ws, r, ADS_BILLING_COL.revenue, excelCell(row.revenue));
    setIndexed(ws, r, ADS_BILLING_COL.royalty, excelCell(row.royalty));
    setIndexed(ws, r, ADS_BILLING_COL.gst, excelCell(row.gst));
    setIndexed(ws, r, ADS_BILLING_COL.total, excelCell(row.total));
    setIndexed(ws, r, ADS_BILLING_COL.remark, excelCell(row.remark));
    const invoiceValue =
      kind === 'airline' || (Number.isFinite(revenueNum) && revenueNum > 0)
        ? excelCell(row.total)
        : ADS_MIS_MISSING;
    setIndexed(ws, r, ADS_BILLING_COL.invoiceValue, invoiceValue);
    setIndexed(ws, r, ADS_BILLING_COL.invoiceNo, excelCell(row.invoiceNumbers));
    const font = { name: 'Calibri', size: kind === 'airline' ? 11 : 10, bold: kind === 'airline' };
    for (let c = 1; c <= 10; c += 1) {
      const cell = ws.getCell(r, c);
      cell.font = font;
      cell.alignment = { wrapText: false, vertical: 'middle' };
    }
    ws.getRow(r).height = 15;
  });
  fitColumnsToHeaders(ws, ADS_BILLING_HEADERS, ADS_BILLING_HEADER_ROW);
}

function populateIndexedEquipmentSheet(
  ws: ExcelJS.Worksheet,
  rows: AdsMisEquipmentRow[],
): void {
  setIndexed(ws, 1, ADS_WORKING_COL.serial, 'S.No');
  setIndexed(ws, 1, ADS_WORKING_COL.customerName, 'Customer Name');
  setIndexed(ws, 1, ADS_WORKING_COL.customerCode, 'Customer Code');
  setIndexed(ws, 1, ADS_WORKING_COL.flightNo, 'Flight No');
  setIndexed(ws, 1, ADS_WORKING_COL.stdDate, 'STD');
  setIndexed(ws, 1, ADS_WORKING_COL.atdDate, 'ATD');
  setIndexed(ws, 1, ADS_WORKING_COL.equipmentNo, 'Equipment');
  setIndexed(ws, 1, ADS_WORKING_COL.unitType, 'UOM');
  setIndexed(ws, 1, ADS_WORKING_COL.quantity, 'Used units');
  rows.forEach((row, idx) => {
    const r = ADS_WORKING_FIRST_ROW + idx;
    setIndexed(ws, r, ADS_WORKING_COL.serial, row.serialNumber ?? idx + 1);
    setIndexed(ws, r, ADS_WORKING_COL.customerName, excelCell(row.customerName));
    setIndexed(ws, r, ADS_WORKING_COL.customerCode, excelCell(row.customerCode));
    setIndexed(ws, r, ADS_WORKING_COL.flightNo, excelCell(row.flightNo));
    setIndexed(ws, r, ADS_WORKING_COL.stdDate, excelCell(row.stdDate));
    setIndexed(ws, r, ADS_WORKING_COL.atdDate, excelCell(row.atdDate));
    setIndexed(ws, r, ADS_WORKING_COL.equipmentNo, excelCell(row.equipmentNo));
    setIndexed(ws, r, ADS_WORKING_COL.unitType, excelCell(row.unitType ?? 'Unit'));
    setIndexed(ws, r, ADS_WORKING_COL.quantity, excelCell(row.quantity));
  });
  fitColumnsToHeaders(ws, ADS_WORKING_HEADERS, 1);
}

/**
 * BHS-style indexed workbook. Writes Billing Sheet + unique airline×equipment
 * working rows by cell index. Skips the giant ADS template (ExcelJS load + 20k
 * dump blocked Nest and left the MIS ADS page on an infinite loader).
 */
export async function buildAdsMisWorkbook(input: AdsMisExportInput): Promise<Buffer> {
  const profile = getAdsMisStationProfile(input.stationCode);
  const token = formatMisMonthToken(input.from);
  const display = formatMisMonthDisplay(input.from);
  const workbook = new ExcelJS.Workbook();

  const title = workbook.addWorksheet('Billing Sheet');
  title.getCell('A1').value = `ADS WORKING FOR THE MONTH OF ${display || token} FOR ${profile.stationLabel}`;
  title.getCell('A1').font = { name: 'Calibri', size: 14, bold: true };
  populateBillingSheet(title, input.billingRows ?? []);

  const working = workbook.addWorksheet('WorkingSheet');
  populateIndexedEquipmentSheet(working, input.equipmentRows);

  const exported = workbook.addWorksheet('Exported EQ Data');
  populateIndexedEquipmentSheet(exported, input.equipmentRows);

  const previewSheets = buildAdsMisPreviewSheets({
    billing: input.billingSheet ?? { groups: [] },
    equipmentRows: input.equipmentRows,
    roeToInr: input.roeToInr,
  });
  for (const sheet of previewSheets) {
    if (
      sheet.id === 'billing-sheet' ||
      sheet.id === 'working-sheet' ||
      sheet.id === 'exported-eq-data'
    ) {
      continue;
    }
    const ws = workbook.addWorksheet(sheet.label);
    sheet.headers.forEach((header, i) => setIndexed(ws, 1, i + 1, header));
    sheet.rows.forEach((row, idx) => {
      row.forEach((cell, col) => setIndexed(ws, idx + 2, col + 1, excelCell(cell)));
    });
    fitColumnsToHeaders(ws, sheet.headers, 1);
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outBuffer as unknown as Uint8Array);
}

export { getAdsMisStationProfile };
