import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';

const HEADER_FILL = 'FFD1FAE5';
const HEADER_BORDER = 'FF10B981';

function xlsxArrayBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const view =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return new Blob([view as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function columnWidthForExport(header: string, values: string[]): number {
  const maxLen = Math.max(header.length, ...values.map((v) => v.length));
  return Math.min(48, Math.max(10, maxLen + 2));
}

export function advanceBoolLabel(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export type AdvanceGatewayExportParams = {
  sheetName: string;
  fileName: string;
  headers: string[];
  rows: string[][];
};

export async function downloadAdvanceGatewayExcel({
  sheetName,
  fileName,
  headers,
  rows,
}: AdvanceGatewayExportParams): Promise<number> {
  if (rows.length === 0) {
    throw new Error('No records to export.');
  }

  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.addRow(headers);
  rows.forEach((row) => worksheet.addRow(row));

  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF0F172A' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: HEADER_BORDER } },
      left: { style: 'thin', color: { argb: HEADER_BORDER } },
      bottom: { style: 'thin', color: { argb: HEADER_BORDER } },
      right: { style: 'thin', color: { argb: HEADER_BORDER } },
    };
  });

  headers.forEach((header, index) => {
    const columnValues = rows.map((row) => String(row[index] ?? ''));
    worksheet.getColumn(index + 1).width = columnWidthForExport(header, columnValues);
  });

  rows.forEach((_, rowIndex) => {
    const dataRow = worksheet.getRow(rowIndex + 2);
    dataRow.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
  );
  return rows.length;
}
