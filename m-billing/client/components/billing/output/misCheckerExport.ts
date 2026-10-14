// @ts-nocheck
import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';
import { formatMonthYearToken } from './misCheckerDateRange';
import type { MisCheckerAggRow, MisCheckerAggTotals } from './misCheckerAggregate';

const HEADERS = [
  'Airline',
  'Flights',
  'Rate',
  'Amount',
  'Consession',
  'Total',
  'Cgst',
  'Sgst',
  'USD',
  'INR',
] as const;

const C = {
  titleBg: 'FFF1F5F9',
  titleFg: 'FF0F172A',
  metaFg: 'FF64748B',
  headerBg: 'FFE2E8F0',
  headerFg: 'FF1E293B',
  groupBg: 'FFDBEAFE',
  groupFg: 'FF1E3A8A',
  zebra: 'FFF8FAFC',
  white: 'FFFFFFFF',
  border: 'FFCBD5E1',
  usdCol: 'FFEFF6FF',
  inrCol: 'FFFFFBEB',
  totalBg: 'FFE2E8F0',
  totalFg: 'FF0F172A',
} as const;

type ExcelBorder = {
  top: { style: 'thin'; color: { argb: string } };
  left: { style: 'thin'; color: { argb: string } };
  bottom: { style: 'thin'; color: { argb: string } };
  right: { style: 'thin'; color: { argb: string } };
};

function thinBorder(argb = C.border): ExcelBorder {
  const edge = { style: 'thin' as const, color: { argb } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function solidFill(argb: string) {
  return {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb },
  };
}

function toBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const plain = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([plain], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function downloadRbhsBillCheckExcel(opts: {
  stationCode: string;
  from: string;
  to: string;
  rows: MisCheckerAggRow[];
  totals: MisCheckerAggTotals;
}): Promise<void> {
  const { stationCode, from, to, rows, totals } = opts;
  const station = (stationCode || 'STN').trim().toUpperCase() || 'STN';
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BWMS Billing';
  const sheet = workbook.addWorksheet('RBHS_Bill_Check_Analysis', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  const title = `${station} - BILL CHECK ANALYSIS - RBHS`;
  const titleRow = sheet.addRow([title]);
  sheet.mergeCells(1, 1, 1, 10);
  titleRow.height = 28;
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: C.titleFg } };
  titleRow.getCell(1).fill = solidFill(C.titleBg);
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  const metaRow = sheet.addRow([`Period: ${from} to ${to}`]);
  sheet.mergeCells(2, 1, 2, 10);
  metaRow.getCell(1).font = { size: 10, color: { argb: C.metaFg } };
  metaRow.getCell(1).fill = solidFill(C.white);

  sheet.addRow([]);

  const groupRow = sheet.addRow([
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'Inv. Amt - Application',
    '',
  ]);
  sheet.mergeCells(4, 9, 4, 10);
  for (let c = 1; c <= 8; c++) {
    const cell = groupRow.getCell(c);
    cell.fill = solidFill(C.white);
    cell.border = thinBorder();
  }
  const groupCell = groupRow.getCell(9);
  groupCell.font = { bold: true, color: { argb: C.groupFg }, size: 11 };
  groupCell.fill = solidFill(C.groupBg);
  groupCell.alignment = { horizontal: 'center', vertical: 'middle' };
  groupCell.border = thinBorder('FF93C5FD');
  groupRow.getCell(10).fill = solidFill(C.groupBg);
  groupRow.getCell(10).border = thinBorder('FF93C5FD');

  const headerRow = sheet.addRow([...HEADERS]);
  headerRow.height = 22;
  headerRow.eachCell((cell, col) => {
    const isInv = col >= 9;
    cell.font = {
      bold: true,
      color: { argb: isInv ? C.groupFg : C.headerFg },
      size: 10,
    };
    cell.fill = solidFill(isInv ? C.groupBg : C.headerBg);
    cell.alignment = {
      horizontal: col === 1 ? 'left' : 'right',
      vertical: 'middle',
    };
    cell.border = thinBorder(isInv ? 'FF93C5FD' : C.border);
  });

  rows.forEach((row, index) => {
    const dataRow = sheet.addRow([
      row.airline,
      row.flights,
      row.rate,
      row.amount,
      row.consession,
      row.total,
      row.cgst,
      row.sgst,
      row.usd > 0 ? row.usd : '',
      row.inr,
    ]);
    const zebra = index % 2 === 1;
    dataRow.eachCell((cell, col) => {
      let fill = zebra ? C.zebra : C.white;
      if (col === 9) fill = C.usdCol;
      if (col === 10) fill = C.inrCol;
      cell.fill = solidFill(fill);
      cell.border = thinBorder();
      cell.font = {
        bold: col === 1 || col >= 9,
        color: { argb: C.titleFg },
        size: 10,
      };
      cell.alignment = {
        horizontal: col === 1 ? 'left' : 'right',
        vertical: 'middle',
      };
      if (col >= 2 && typeof cell.value === 'number') {
        cell.numFmt = col === 2 ? '#,##0' : '#,##0.00';
      }
    });
  });

  const totalRow = sheet.addRow([
    'TOTAL',
    totals.flights,
    '',
    totals.amount,
    totals.consession,
    totals.total,
    totals.cgst,
    totals.sgst,
    totals.usd > 0 ? totals.usd : '',
    totals.inr,
  ]);
  totalRow.height = 24;
  totalRow.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: C.totalFg }, size: 10 };
    cell.fill = solidFill(C.totalBg);
    cell.border = thinBorder('FF94A3B8');
    cell.alignment = {
      horizontal: col === 1 ? 'left' : 'right',
      vertical: 'middle',
    };
    if (col >= 2 && typeof cell.value === 'number') {
      cell.numFmt = col === 2 ? '#,##0' : '#,##0.00';
    }
  });

  const widths = [28, 10, 12, 14, 14, 14, 12, 12, 12, 14];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    toBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    `${station}_RBHS_Bill_Check_Analysis_${formatMonthYearToken(from)}.xlsx`,
  );
}
