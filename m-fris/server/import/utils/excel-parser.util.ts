import * as XLSX from 'xlsx';
import { MAX_EXCEL_DATA_ROWS } from '../constants/flight-import.constants';
import { validateExcelHeaders } from '../validators/header.validator';

export interface ParsedExcelSheet {
  headers: string[];
  rows: Record<string, string>[];
  headerValidation: ReturnType<typeof validateExcelHeaders>;
}

export interface ExcelParseResult {
  success: boolean;
  message?: string;
  sheet?: ParsedExcelSheet;
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) {
    const d = value.getDate().toString().padStart(2, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return String(value).trim();
}

export function parseExcelBuffer(buffer: Buffer): ExcelParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  } catch {
    return { success: false, message: 'Unable to parse Excel workbook.' };
  }

  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) {
    return { success: false, message: 'Workbook has no worksheets.' };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(
    sheet,
    { header: 1, defval: '', raw: false },
  );

  if (!matrix.length) {
    return { success: false, message: 'Worksheet is empty.' };
  }

  const headerRow = (matrix[0] ?? []).map((h) => cellToString(h));
  const headerValidation = validateExcelHeaders(headerRow);
  if (!headerValidation.valid) {
    return {
      success: false,
      message: headerValidation.error?.message ?? 'Header validation failed',
      sheet: { headers: headerRow, rows: [], headerValidation },
    };
  }

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? [];
    if (cells.every((c) => !cellToString(c))) continue;

    const row: Record<string, string> = {};
    for (const canonical of headerValidation.canonicalHeaders) {
      const idx = headerValidation.headerIndexByCanonical.get(canonical);
      row[canonical] = idx == null ? '' : cellToString(cells[idx]);
    }
    rows.push(row);

    if (rows.length > MAX_EXCEL_DATA_ROWS) {
      return {
        success: false,
        message: `Excel exceeds maximum of ${MAX_EXCEL_DATA_ROWS} data rows.`,
      };
    }
  }

  if (rows.length === 0) {
    return { success: false, message: 'No data rows found in worksheet.' };
  }

  return {
    success: true,
    sheet: { headers: headerRow, rows, headerValidation },
  };
}
