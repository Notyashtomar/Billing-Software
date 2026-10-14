import type { CellValue } from 'exceljs';
import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';

export type ContactImportPayload = {
  email?: string;
  contact?: string;
  airline?: string;
  airlineRepresentative?: string;
  mobileNo?: string;
  companyName?: string;
  signatureUrl?: string;
};

export type ParsedContactExcelRow = {
  rowNumber: number;
  payload: ContactImportPayload;
};

export type ContactExcelParseResult = {
  rows: ParsedContactExcelRow[];
  skipped: { rowNumber: number; reason: string }[];
};

export const CONTACT_EXCEL_HEADERS = [
  'Email',
  'Contact',
  'Airline',
  'Airline Representative',
  'Mobile No.',
  'Company Name',
] as const;

const HEADER_FIELD_MAP: Record<string, keyof ContactImportPayload> = {
  email: 'email',
  'e-mail': 'email',
  'mail id': 'email',
  contact: 'contact',
  'contact type': 'contact',
  airline: 'airline',
  'airline name': 'airline',
  'airline representative': 'airlineRepresentative',
  representative: 'airlineRepresentative',
  'rep name': 'airlineRepresentative',
  'mobile no': 'mobileNo',
  'mobile no.': 'mobileNo',
  mobile: 'mobileNo',
  'phone no': 'mobileNo',
  'phone number': 'mobileNo',
  'company name': 'companyName',
  company: 'companyName',
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

function mapHeaderToField(header: string): keyof ContactImportPayload | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  return HEADER_FIELD_MAP[normalized] ?? null;
}

function rowHasAnyValue(values: Record<string, string>): boolean {
  return Object.values(values).some((v) => String(v).trim());
}

export async function parseAdvanceContactExcel(
  file: File,
): Promise<ContactExcelParseResult> {
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
  const columnFields = new Map<number, keyof ContactImportPayload>();
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
            'No recognized columns found. Expected headers like Email, Contact, Airline, Airline Representative.',
        },
      ],
    };
  }

  const rows: ParsedContactExcelRow[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber);
    const raw: Partial<Record<keyof ContactImportPayload, string>> = {};

    columnFields.forEach((field, colNumber) => {
      raw[field] = cellToString(excelRow.getCell(colNumber).value);
    });

    const stringValues: Record<string, string> = {
      email: raw.email ?? '',
      contact: raw.contact ?? '',
      airline: raw.airline ?? '',
      airlineRepresentative: raw.airlineRepresentative ?? '',
      mobileNo: raw.mobileNo ?? '',
      companyName: raw.companyName ?? '',
      signatureUrl: raw.signatureUrl ?? '',
    };

    if (!rowHasAnyValue(stringValues)) continue;

    rows.push({
      rowNumber,
      payload: { ...stringValues },
    });
  }

  if (rows.length === 0 && skipped.length === 0) {
    skipped.push({ rowNumber: 2, reason: 'No data rows found below the header.' });
  }

  return { rows, skipped };
}

export async function downloadContactExcelTemplate(): Promise<void> {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Airline Contacts');
  sheet.addRow([...CONTACT_EXCEL_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [
    { width: 30 },
    { width: 28 },
    { width: 22 },
    { width: 26 },
    { width: 16 },
    { width: 24 },
  ];
  sheet.addRow([
    'ops@airline.com',
    'Invoice Pending Notification',
    'AERO NOMAD',
    'John Smith',
    '+911234567890',
    'Aero Nomad Airlines',
  ]);
  sheet.addRow(['', 'RAF', 'Sample Air', 'Jane Doe', '', '']);

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    'airline-contact-import-template.xlsx',
  );
}
