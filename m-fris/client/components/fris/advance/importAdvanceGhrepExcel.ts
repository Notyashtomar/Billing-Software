import type { CellValue } from 'exceljs';
import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';

export type GhRepImportPayload = {
  employeeName?: string;
  employeeCode?: string;
  emailId?: string;
  active?: boolean;
  signatureUrl?: string;
};

export type ParsedGhRepExcelRow = {
  rowNumber: number;
  payload: GhRepImportPayload;
};

export type GhRepExcelParseResult = {
  rows: ParsedGhRepExcelRow[];
  skipped: { rowNumber: number; reason: string }[];
};

export const GH_REP_EXCEL_HEADERS = [
  'Employee Name',
  'Employee Code',
  'Email ID',
  'Active',
] as const;

const HEADER_FIELD_MAP: Record<string, keyof GhRepImportPayload> = {
  'employee name': 'employeeName',
  name: 'employeeName',
  'emp name': 'employeeName',
  'employee code': 'employeeCode',
  'emp code': 'employeeCode',
  code: 'employeeCode',
  'email id': 'emailId',
  email: 'emailId',
  'e-mail': 'emailId',
  'mail id': 'emailId',
  active: 'active',
  status: 'active',
  signature: 'signatureUrl',
  'signature url': 'signatureUrl',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellToString(value: CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('').trim();
    }
    if ('text' in value && value.text != null) {
      return String(value.text).trim();
    }
    if ('result' in value && value.result != null) {
      return cellToString(value.result as CellValue);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
  }
  return String(value).trim();
}

function parseBoolLike(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!s) return undefined;
  if (s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'active') return true;
  if (s === 'false' || s === 'no' || s === 'n' || s === '0' || s === 'inactive') return false;
  return undefined;
}

function xlsxArrayBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const plainBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([plainBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function mapHeaderToField(header: string): keyof GhRepImportPayload | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  return HEADER_FIELD_MAP[normalized] ?? null;
}

function rowHasAnyValue(values: Record<string, string>): boolean {
  return Object.values(values).some((v) => String(v).trim());
}

export async function parseAdvanceGhrepExcel(
  file: File,
): Promise<GhRepExcelParseResult> {
  const buffer = await file.arrayBuffer();
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 1) {
    return {
      rows: [],
      skipped: [{ rowNumber: 1, reason: 'Workbook is empty or has no data sheet.' }],
    };
  }

  const headerRow = sheet.getRow(1);
  const columnFields = new Map<number, keyof GhRepImportPayload>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const field = mapHeaderToField(cellToString(cell.value));
    if (field) columnFields.set(colNumber, field);
  });

  if (columnFields.size === 0) {
    return {
      rows: [],
      skipped: [
        {
          rowNumber: 1,
          reason:
            'No recognized columns found. Expected headers like Employee Name, Employee Code, Email ID, Active.',
        },
      ],
    };
  }

  const rows: ParsedGhRepExcelRow[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber);
    const raw: Partial<Record<keyof GhRepImportPayload, string>> = {};

    columnFields.forEach((field, colNumber) => {
      raw[field] = cellToString(excelRow.getCell(colNumber).value);
    });

    const stringValues: Record<string, string> = {
      employeeName: raw.employeeName ?? '',
      employeeCode: raw.employeeCode ?? '',
      emailId: raw.emailId ?? '',
      signatureUrl: raw.signatureUrl ?? '',
    };

    if (!rowHasAnyValue(stringValues)) continue;

    const payload: GhRepImportPayload = {
      employeeName: stringValues.employeeName,
      employeeCode: stringValues.employeeCode,
      emailId: stringValues.emailId,
      signatureUrl: stringValues.signatureUrl,
    };

    const activeParsed = parseBoolLike(raw.active);
    if (activeParsed !== undefined) {
      payload.active = activeParsed;
    }

    const employeeName = stringValues.employeeName.trim().replace(/\s+/g, ' ');
    if (employeeName && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(employeeName)) {
      skipped.push({
        rowNumber,
        reason: 'Employee name may only contain letters.',
      });
      continue;
    }

    if (!payload.employeeCode?.trim()) {
      skipped.push({
        rowNumber,
        reason: 'Employee Code is required for import rows.',
      });
      continue;
    }

    rows.push({ rowNumber, payload });
  }

  return { rows, skipped };
}

export async function downloadGhRepExcelTemplate(): Promise<void> {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('GH Representatives');
  sheet.addRow([...GH_REP_EXCEL_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [
    { width: 28 },
    { width: 18 },
    { width: 32 },
    { width: 12 },
  ];
  sheet.addRow(['Jane Doe', 'GH001', 'jane.doe@example.com', 'Yes']);
  sheet.addRow(['John Smith', 'GH002', '', 'Yes']);

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    'gh-representative-import-template.xlsx',
  );
}
