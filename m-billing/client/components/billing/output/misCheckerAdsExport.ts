import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';
import { formatMonthYearToken } from './misCheckerDateRange';
import type {
  MisCheckerAdsAirlineRow,
  MisCheckerAdsTotals,
} from './misCheckerAdsAggregate';

const C = {
  titleBg: 'FFF1F5F9',
  titleFg: 'FF0F172A',
  metaFg: 'FF64748B',
  headerBg: 'FFE2E8F0',
  headerFg: 'FF1E293B',
  qtyBg: 'FFEFF6FF',
  inrBg: 'FFFFFBEB',
  airlineBg: 'FFFEF9C3',
  airlineFg: 'FF713F12',
  serviceBg: 'FFFFFFFF',
  serviceAlt: 'FFF8FAFC',
  totalBg: 'FFFDE68A',
  totalFg: 'FF78350F',
  border: 'FFCBD5E1',
  white: 'FFFFFFFF',
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

function styleDataCells(
  row: { eachCell: (cb: (cell: { value: unknown; font?: unknown; fill?: unknown; border?: unknown; alignment?: unknown; numFmt?: string }, col: number) => void) => void },
  opts: {
    fillName: string;
    fillQty: string;
    fillCharge: string;
    fillInr: string;
    bold?: boolean;
    fg?: string;
    indentService?: boolean;
  },
) {
  row.eachCell((cell, col) => {
    const fills = [opts.fillName, opts.fillQty, opts.fillCharge, opts.fillInr];
    cell.fill = solidFill(fills[col - 1] ?? C.white);
    cell.border = thinBorder();
    cell.font = {
      bold: Boolean(opts.bold) || col === 1,
      color: { argb: opts.fg ?? C.titleFg },
      size: 10,
    };
    cell.alignment = {
      horizontal: col === 1 ? 'left' : 'right',
      vertical: 'middle',
      indent: opts.indentService && col === 1 ? 1 : 0,
    };
    if (col > 1 && typeof cell.value === 'number') {
      cell.numFmt = col === 4 ? '#,##0.00' : '#,##0';
    }
  });
}

export async function downloadAdsMisCheckerExcel(opts: {
  stationCode: string;
  from: string;
  to: string;
  airlines: MisCheckerAdsAirlineRow[];
  totals: MisCheckerAdsTotals;
}): Promise<void> {
  const { stationCode, from, to, airlines, totals } = opts;
  const station = (stationCode || 'STN').trim().toUpperCase() || 'STN';
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BWMS Billing';
  const sheet = workbook.addWorksheet('ADS_Bill_Check', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  const titleRow = sheet.addRow([`${station} - BILL CHECK ANALYSIS - ADS`]);
  sheet.mergeCells(1, 1, 1, 4);
  titleRow.height = 28;
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: C.titleFg } };
  titleRow.getCell(1).fill = solidFill(C.titleBg);
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  const metaRow = sheet.addRow([`Period: ${from} to ${to}`]);
  sheet.mergeCells(2, 1, 2, 4);
  metaRow.getCell(1).font = { size: 10, color: { argb: C.metaFg } };
  metaRow.getCell(1).fill = solidFill(C.white);

  sheet.addRow([]);

  const headerRow = sheet.addRow([
    'Service name',
    'Total quantity',
    'Chargeable units',
    'Total in local currency (INR)',
  ]);
  headerRow.height = 22;
  headerRow.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: C.headerFg }, size: 10 };
    cell.fill = solidFill(
      col === 2 ? C.qtyBg : col === 4 ? C.inrBg : C.headerBg,
    );
    cell.alignment = {
      horizontal: col === 1 ? 'left' : 'right',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = thinBorder();
  });

  let serviceIndex = 0;
  for (const airline of airlines) {
    const airlineRow = sheet.addRow([
      airline.serviceName,
      airline.totalQuantity || '',
      airline.chargeableUnits || '',
      airline.totalInr || '',
    ]);
    airlineRow.height = 20;
    styleDataCells(airlineRow, {
      fillName: C.airlineBg,
      fillQty: C.airlineBg,
      fillCharge: C.airlineBg,
      fillInr: C.airlineBg,
      bold: true,
      fg: C.airlineFg,
    });

    for (const svc of airline.services) {
      const svcRow = sheet.addRow([
        svc.serviceName,
        svc.totalQuantity || '',
        svc.chargeableUnits || '',
        svc.totalInr || '',
      ]);
      const alt = serviceIndex % 2 === 1;
      serviceIndex += 1;
      styleDataCells(svcRow, {
        fillName: alt ? C.serviceAlt : C.serviceBg,
        fillQty: C.qtyBg,
        fillCharge: alt ? C.serviceAlt : C.serviceBg,
        fillInr: C.inrBg,
        indentService: true,
      });
    }
  }

  const totalRow = sheet.addRow([
    'Grand Total',
    totals.totalQuantity || '',
    totals.chargeableUnits || '',
    totals.totalInr || '',
  ]);
  totalRow.height = 24;
  styleDataCells(totalRow, {
    fillName: C.totalBg,
    fillQty: C.totalBg,
    fillCharge: C.totalBg,
    fillInr: C.totalBg,
    bold: true,
    fg: C.totalFg,
  });

  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 30;

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    toBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    `${station}_ADS_Bill_Check_Analysis_${formatMonthYearToken(from)}.xlsx`,
  );
}
