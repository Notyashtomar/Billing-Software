import type { CellValue } from 'exceljs';
import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';

export type StaffImportPayload = {
  employeeCode: string;
  employeeName: string;
  designation?: string;
  manpower?: string;
  manpowerCode?: string;
  gseAssigned?: { code: string; name: string }[];
  status?: 'Active' | 'Inactive';
};

export type ParsedStaffExcelRow = {
  rowNumber: number;
  payload: StaffImportPayload;
};

export type StaffExcelParseResult = {
  rows: ParsedStaffExcelRow[];
  skipped: { rowNumber: number; reason: string }[];
};

export const STAFF_EXCEL_HEADERS = [
  'Employee ID',
  'Employee Name',
  'Designation',
  'Manpower',
  'Manpower Code',
  'GSE Assigned',
  'Status',
] as const;

type StaffField =
  | 'employeeCode'
  | 'employeeName'
  | 'designation'
  | 'manpower'
  | 'manpowerCode'
  | 'gseAssigned'
  | 'status';

const HEADER_FIELD_MAP: Record<string, StaffField> = {
  'employee id': 'employeeCode',
  'employee code': 'employeeCode',
  'emp id': 'employeeCode',
  'emp code': 'employeeCode',
  code: 'employeeCode',
  'employee name': 'employeeName',
  'emp name': 'employeeName',
  name: 'employeeName',
  designation: 'designation',
  'job title': 'designation',
  title: 'designation',
  manpower: 'manpower',
  'manpower name': 'manpower',
  'manpower code': 'manpowerCode',
  'gse assigned': 'gseAssigned',
  gse: 'gseAssigned',
  'gse list': 'gseAssigned',
  status: 'status',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Never use String(object) — that becomes the literal "[object Object]" in Mongo. */
function cellToString(value: CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((part) => cellToString(part as CellValue)).filter(Boolean).join(' ').trim();
    }
    const obj = value as unknown as Record<string, unknown>;
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((part) => part.text ?? '')
        .join('')
        .trim();
    }
    if (obj.text != null && typeof obj.text !== 'object') {
      return String(obj.text).trim();
    }
    if (obj.result != null) {
      return cellToString(obj.result as CellValue);
    }
    // Nested person-name shapes from some HR exports
    const nested =
      obj.fullName ??
      obj.employeeName ??
      obj.displayName ??
      [obj.firstName ?? obj.first, obj.lastName ?? obj.last]
        .filter((p) => p != null && typeof p !== 'object')
        .join(' ');
    if (nested != null && typeof nested !== 'object') {
      const s = String(nested).trim();
      if (s && s !== '[object Object]') return s;
    }
    // Formula / sharedFormula with no usable result — do not stringify the object
    if ('formula' in obj || 'sharedFormula' in obj || 'error' in obj || 'hyperlink' in obj) {
      return '';
    }
    return '';
  }
  return '';
}

function readCellDisplay(cell: { text?: string; value: CellValue }): string {
  const display = typeof cell.text === 'string' ? cell.text.trim() : '';
  if (display && display !== '[object Object]') return display;
  return cellToString(cell.value);
}

function isUsablePersonName(name: string): boolean {
  const s = name.trim().replace(/\s+/g, ' ');
  if (!s) return false;
  if (s === '[object Object]') return false;
  if (/^\[object\s+/i.test(s)) return false;
  return /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(s);
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

function mapHeaderToField(header: string): StaffField | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  return HEADER_FIELD_MAP[normalized] ?? null;
}

function parseStatus(raw: string): 'Active' | 'Inactive' | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (s === 'inactive' || s === 'no' || s === 'n' || s === '0' || s === 'false') {
    return 'Inactive';
  }
  if (s === 'active' || s === 'yes' || s === 'y' || s === '1' || s === 'true') {
    return 'Active';
  }
  return undefined;
}

/** Parse "Name (CODE), Other (OT2)" or plain codes/names. */
function parseGseList(raw: string): { code: string; name: string }[] {
  if (!raw.trim()) return [];
  const out: { code: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;|]/)) {
    const token = part.trim();
    if (!token) continue;
    const m = token.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    let code = '';
    let name = '';
    if (m) {
      name = m[1]?.trim() ?? '';
      code = m[2]?.trim().toUpperCase() ?? '';
    } else if (/^[A-Z0-9_-]+$/i.test(token)) {
      code = token.toUpperCase();
      name = token;
    } else {
      name = token;
    }
    const key = (code || name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ code, name });
  }
  return out;
}

function rowHasAnyValue(values: Record<string, string>): boolean {
  return Object.values(values).some((v) => String(v).trim());
}

export async function parseAdvanceStaffExcel(
  file: File,
): Promise<StaffExcelParseResult> {
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
  const columnFields = new Map<number, StaffField>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const field = mapHeaderToField(readCellDisplay(cell));
    if (field) columnFields.set(colNumber, field);
  });

  if (columnFields.size === 0) {
    return {
      rows: [],
      skipped: [
        {
          rowNumber: 1,
          reason:
            'No recognized columns. Expected: Employee ID, Employee Name, Designation, Manpower, Manpower Code, GSE Assigned, Status.',
        },
      ],
    };
  }

  const rowsByCode = new Map<string, ParsedStaffExcelRow>();
  const skipped: { rowNumber: number; reason: string }[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber);
    const raw: Partial<Record<StaffField, string>> = {};

    columnFields.forEach((field, colNumber) => {
      raw[field] = readCellDisplay(excelRow.getCell(colNumber));
    });

    const stringValues: Record<string, string> = {
      employeeCode: raw.employeeCode ?? '',
      employeeName: raw.employeeName ?? '',
      designation: raw.designation ?? '',
      manpower: raw.manpower ?? '',
      manpowerCode: raw.manpowerCode ?? '',
      gseAssigned: raw.gseAssigned ?? '',
      status: raw.status ?? '',
    };

    if (!rowHasAnyValue(stringValues)) continue;

    const employeeCode = stringValues.employeeCode.trim().toUpperCase();
    const employeeName = stringValues.employeeName.trim();

    if (!employeeCode) {
      skipped.push({ rowNumber, reason: 'Employee ID is required.' });
      continue;
    }
    const designation = stringValues.designation.trim();
    if (designation && !isUsablePersonName(designation)) {
      skipped.push({
        rowNumber,
        reason: 'Designation may only contain letters and spaces.',
      });
      continue;
    }
    if (!isUsablePersonName(employeeName)) {
      skipped.push({
        rowNumber,
        reason:
          employeeName === '[object Object]' || /^\[object\s+/i.test(employeeName)
            ? 'Employee Name cell is not plain text (re-save Excel values as text).'
            : employeeName
              ? 'Employee Name may only contain letters and spaces.'
              : 'Employee Name is required.',
      });
      continue;
    }

    const payload: StaffImportPayload = {
      employeeCode,
      employeeName,
      designation: designation || undefined,
      manpower: stringValues.manpower.trim() || undefined,
      manpowerCode: stringValues.manpowerCode.trim().toUpperCase() || undefined,
      gseAssigned: parseGseList(stringValues.gseAssigned),
      status: parseStatus(stringValues.status) ?? 'Active',
    };

    const existing = rowsByCode.get(employeeCode);
    if (existing) {
      skipped.push({
        rowNumber: existing.rowNumber,
        reason: `Duplicate Employee ID ${employeeCode} in file — kept last row (${rowNumber}).`,
      });
    }
    rowsByCode.set(employeeCode, { rowNumber, payload });
  }

  return { rows: Array.from(rowsByCode.values()), skipped };
}

/** Sample Excel for Advance → Gateway → Staff import. */
export async function downloadStaffExcelTemplate(): Promise<void> {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Staff');
  sheet.addRow([...STAFF_EXCEL_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [
    { width: 16 },
    { width: 24 },
    { width: 22 },
    { width: 16 },
    { width: 14 },
    { width: 36 },
    { width: 12 },
  ];
  sheet.addRow([
    'IXC001',
    'Asha Sharma',
    'Technician',
    'Skilled',
    'SKL',
    'Belt Loader (BL01), Pushback (PB02)',
    'Active',
  ]);
  sheet.addRow([
    'IXC002',
    'Ravi Kumar',
    'Supervisor',
    'Supervisor',
    'SUP',
    'GPU (GPU01)',
    'Active',
  ]);

  const notes = workbook.addWorksheet('Instructions');
  notes.addRow(['Advance → Gateway → Staff — Excel import']);
  notes.getRow(1).font = { bold: true };
  notes.addRow([]);
  notes.addRow(['• Import saves to the logged-in station only.']);
  notes.addRow(['• Employee ID + Employee Name are required.']);
  notes.addRow(['• Existing Employee ID in the same station is updated (upsert) — no duplicates.']);
  notes.addRow(['• Duplicate Employee IDs in the same Excel file: last row wins.']);
  notes.addRow(['• Employee Name must be plain text (not formula objects / hyperlinks only).']);
  notes.addRow([
    '• GSE Assigned: comma-separated, use "Name (CODE)" or plain code/name.',
  ]);
  notes.addRow(['• Status: Active or Inactive (default Active).']);
  notes.columns = [{ width: 72 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    'advance-staff-import-template.xlsx',
  );
}
