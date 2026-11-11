import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';
import {
  PRICE_CARD_AIRLINE_CATEGORIES,
  PRICE_CARD_AIRLINE_CATEGORY_LABELS,
  type PriceCardAirlineCategory,
  type PriceCardHandlingType,
} from '@/lib/billing-shared/enums';
import type { BillingCustomer } from '@/lib/billing-shared/types';

/**
 * Rate card import workbook.
 *
 * The system only accepts files produced by `downloadPriceCardImportTemplate` (the
 * "Download format" button). The header row is matched exactly, and a hidden marker
 * cell identifies the handling type the template was generated for.
 */

const SHEET_NAME = 'Rate cards';
const MARKER_PREFIX = 'FRIS-RATE-CARD-IMPORT:';
/** Row that holds the column headers; row 1 is the title. */
const HEADER_ROW = 2;
const FIRST_DATA_ROW = HEADER_ROW + 1;
/** Typing "Open" (or leaving Valid to blank) stores this open-ended end date. */
const OPEN_ENDED_DATE = '2099-12-31';

const BHS_HEADERS = [
  'Airline code',
  'Airline name',
  'Aircraft type',
  'Flight category',
  'Price',
  'Flight operation',
  'Valid from',
  'Valid to',
  'Remarks',
] as const;

const ADS_HEADERS = [
  'Airline code',
  'Airline name',
  'Aircraft type',
  'Flight category',
  'Valid from',
  'Valid to',
  'Remarks',
] as const;

const CATEGORY_LABELS = PRICE_CARD_AIRLINE_CATEGORIES.map(
  (category) => PRICE_CARD_AIRLINE_CATEGORY_LABELS[category],
);
const FLIGHT_OPERATION_LABELS = ['Scheduled', 'Additional'] as const;

const HEADER_FILL = 'FF1C0770';
const TITLE_FILL = 'FF261CC1';
const WHITE = 'FFFFFFFF';

export const PRICE_CARD_IMPORT_INVALID_MESSAGE =
  'This file is not in the rate card import format. Click "Download format", fill that file, then upload it.';

export type PriceCardImportRow = {
  customerCode: string;
  airlineName: string;
  aircraftType: string;
  category: PriceCardAirlineCategory;
  price?: number;
  flightOperation?: 'scheduled' | 'additional';
  validFrom: string;
  validTo: string;
  remarks?: string;
};

export type PriceCardImportResult = {
  rows: PriceCardImportRow[];
  /** Human readable warnings that do not block the import. */
  warnings: string[];
};

function headersFor(handling: PriceCardHandlingType): readonly string[] {
  return handling === 'BHS' ? BHS_HEADERS : ADS_HEADERS;
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

function textOf(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') {
    const record = value as {
      text?: string;
      result?: unknown;
      richText?: Array<{ text?: string }>;
    };
    if (typeof record.text === 'string') return record.text.trim();
    if (record.result != null) return textOf(record.result);
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => part.text ?? '').join('').trim();
    }
  }
  return String(value).trim();
}

function isoDate(date: Date): string {
  // ExcelJS returns dates at UTC midnight; use UTC parts so the day does not shift.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Accepts YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD-MMM-YYYY and real Excel dates. */
function parseDateCell(raw: unknown, row: number, column: string): string {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      throw new Error(`Row ${row}, ${column}: this is not a valid date.`);
    }
    return isoDate(raw);
  }
  const text = textOf(raw);
  if (!text) throw new Error(`Row ${row}, ${column}: a date is required.`);

  let y = 0;
  let m = 0;
  let d = 0;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  } else if ((match = text.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,4})[-/\s](\d{4})$/))) {
    d = Number(match[1]);
    m = MONTHS[match[2].toLowerCase()] ?? 0;
    y = Number(match[3]);
  }
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    !y || !m || !d ||
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new Error(
      `Row ${row}, ${column}: "${text}" is not a valid date. Use YYYY-MM-DD (for example 2026-04-01).`,
    );
  }
  return isoDate(probe);
}

function parseCategory(raw: string, row: number): PriceCardAirlineCategory {
  const normalized = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) throw new Error(`Row ${row}, Flight category: this column is required.`);
  for (const category of PRICE_CARD_AIRLINE_CATEGORIES) {
    const label = PRICE_CARD_AIRLINE_CATEGORY_LABELS[category].toLowerCase().replace(/[\s_-]+/g, '');
    if (normalized === category.toLowerCase() || normalized === label) return category;
  }
  throw new Error(
    `Row ${row}, Flight category: "${raw}" is not accepted. Choose one of ${CATEGORY_LABELS.join(', ')}.`,
  );
}

function parseFlightOperation(raw: string, row: number): 'scheduled' | 'additional' {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === 'scheduled') return 'scheduled';
  if (normalized === 'additional') return 'additional';
  throw new Error(
    `Row ${row}, Flight operation: "${raw}" is not accepted. Write Scheduled or Additional (blank = Scheduled).`,
  );
}

function parsePrice(raw: unknown, row: number): number {
  const text = textOf(raw).replace(/[,\s₹$]/g, '');
  if (!text) throw new Error(`Row ${row}, Price: a price is required for BHS rate cards.`);
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Row ${row}, Price: "${textOf(raw)}" is not a number 0 or greater.`);
  }
  return Math.round(n * 100) / 100;
}

function templateFileName(handling: PriceCardHandlingType, stationCode: string): string {
  const station = stationCode.trim().toUpperCase() || 'station';
  return `${handling.toLowerCase()}-rate-card-import-format-${station}.xlsx`;
}

/**
 * Builds and downloads the blank import workbook. The user fills this file and uploads
 * it through the Import dialog. Only this layout is accepted by `parsePriceCardImportWorkbook`.
 */
export async function downloadPriceCardImportTemplate(opts: {
  handling: PriceCardHandlingType;
  stationCode: string;
  customers: BillingCustomer[];
}): Promise<void> {
  const { handling, stationCode } = opts;
  const headers = headersFor(handling);
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';

  const sheet = workbook.addWorksheet(SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: true }],
  });

  const title = sheet.addRow([`${handling} rate card import — ${stationCode.toUpperCase()}`]);
  sheet.mergeCells(1, 1, 1, headers.length);
  title.height = 26;
  title.getCell(1).font = { bold: true, size: 15, color: { argb: WHITE }, name: 'Calibri' };
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } };
  title.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const headerRow = sheet.addRow([...headers]);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF150558' } } };
  });

  // Hidden marker so uploads of arbitrary spreadsheets are rejected.
  const markerCell = sheet.getCell(1, headers.length + 2);
  markerCell.value = `${MARKER_PREFIX}${handling}`;
  markerCell.font = { color: { argb: WHITE }, size: 1 };
  sheet.getColumn(headers.length + 2).hidden = true;

  const widths: Record<string, number> = {
    'Airline code': 14,
    'Airline name': 30,
    'Aircraft type': 16,
    'Flight category': 20,
    Price: 14,
    'Flight operation': 18,
    'Valid from': 14,
    'Valid to': 14,
    Remarks: 36,
  };
  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = widths[header] ?? 16;
  });

  const col = (header: string) => String.fromCharCode(65 + headers.indexOf(header));
  const lastRow = 2000;
  const validations = sheet as unknown as {
    dataValidations: { add: (ref: string, rule: object) => void };
  };
  validations.dataValidations.add(
    `${col('Flight category')}${FIRST_DATA_ROW}:${col('Flight category')}${lastRow}`,
    {
      type: 'list',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Flight category',
      error: `Choose one of: ${CATEGORY_LABELS.join(', ')}`,
      formulae: [`"${CATEGORY_LABELS.join(',')}"`],
    },
  );
  if (handling === 'BHS') {
    validations.dataValidations.add(
      `${col('Flight operation')}${FIRST_DATA_ROW}:${col('Flight operation')}${lastRow}`,
      {
        type: 'list',
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Flight operation',
        error: 'Write Scheduled or Additional',
        formulae: [`"${FLIGHT_OPERATION_LABELS.join(',')}"`],
      },
    );
    sheet.getColumn(headers.indexOf('Price') + 1).numFmt = '#,##0.00';
  }
  for (const header of ['Valid from', 'Valid to'] as const) {
    sheet.getColumn(headers.indexOf(header) + 1).numFmt = 'yyyy-mm-dd';
  }
  sheet.getColumn(1).numFmt = '@';
  sheet.getColumn(headers.indexOf('Aircraft type') + 1).numFmt = '@';

  // Example row to make the expected values obvious; it is skipped on import.
  const example = sheet.addRow(
    handling === 'BHS'
      ? ['EXAMPLE', 'Example Airways (delete this row)', 'A320', 'International', 1250, 'Scheduled', '2026-04-01', 'Open', 'Example row — delete before uploading']
      : ['EXAMPLE', 'Example Airways (delete this row)', 'A320', 'International', '2026-04-01', 'Open', 'Example row — delete before uploading'],
  );
  example.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { italic: true, size: 11, color: { argb: 'FF6B7280' }, name: 'Calibri' };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(toBlob(buffer), templateFileName(handling, stationCode));
}

/**
 * Reads a filled template and returns rows ready for `createPriceCardAirlinesBulk`.
 * Throws with all row-level problems joined by newlines when anything is wrong.
 */
export async function parsePriceCardImportWorkbook(
  file: File,
  handling: PriceCardHandlingType,
  customers: BillingCustomer[],
): Promise<PriceCardImportResult> {
  const name = String(file?.name ?? '').toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xlsm')) {
    throw new Error(`${PRICE_CARD_IMPORT_INVALID_MESSAGE} Only .xlsx files are accepted.`);
  }

  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load((await file.arrayBuffer()) as never);
  } catch {
    throw new Error(PRICE_CARD_IMPORT_INVALID_MESSAGE);
  }

  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) throw new Error(PRICE_CARD_IMPORT_INVALID_MESSAGE);

  const headers = headersFor(handling);
  const headerRow = sheet.getRow(HEADER_ROW);
  const actual = headers.map((_, index) => textOf(headerRow.getCell(index + 1).value));
  const headersMatch = headers.every(
    (expected, index) => actual[index].toLowerCase() === expected.toLowerCase(),
  );
  if (!headersMatch) {
    const otherHandling = handling === 'BHS' ? 'ADS' : 'BHS';
    const otherMatches = headersFor(otherHandling).every(
      (expected, index) =>
        textOf(headerRow.getCell(index + 1).value).toLowerCase() === expected.toLowerCase(),
    );
    throw new Error(
      otherMatches
        ? `This is the ${otherHandling} import format. Download the ${handling} format and use that file.`
        : `${PRICE_CARD_IMPORT_INVALID_MESSAGE} Expected columns: ${headers.join(', ')}.`,
    );
  }
  const marker = textOf(sheet.getCell(1, headers.length + 2).value);
  if (marker && marker !== `${MARKER_PREFIX}${handling}`) {
    throw new Error(PRICE_CARD_IMPORT_INVALID_MESSAGE);
  }

  const customersByCode = new Map<string, BillingCustomer>();
  for (const customer of customers) {
    const code = String(customer.customerCode ?? '').trim().toUpperCase();
    if (code) customersByCode.set(code, customer);
  }

  const idx = (header: string) => headers.indexOf(header);
  const rows: PriceCardImportRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();

  for (let index = FIRST_DATA_ROW; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const raw = (header: string) => row.getCell(idx(header) + 1).value;
    const cells = headers.map((header) => textOf(raw(header)));
    if (cells.every((cell) => cell === '')) continue;

    const customerCode = cells[idx('Airline code')].toUpperCase();
    if (customerCode === 'EXAMPLE') continue;

    try {
      if (!customerCode) throw new Error(`Row ${index}, Airline code: this column is required.`);
      const customer = customersByCode.get(customerCode);
      if (!customer) {
        throw new Error(
          `Row ${index}, Airline code: "${customerCode}" is not a customer at this station. Create the customer first.`,
        );
      }
      const aircraftType = cells[idx('Aircraft type')].toUpperCase();
      if (!aircraftType) throw new Error(`Row ${index}, Aircraft type: this column is required.`);
      const category = parseCategory(cells[idx('Flight category')], index);

      const validFrom = parseDateCell(raw('Valid from'), index, 'Valid from');
      const validToText = cells[idx('Valid to')].toLowerCase();
      const validTo =
        !validToText || validToText === 'open' || validToText === 'open-ended' || validToText === 'open ended'
          ? OPEN_ENDED_DATE
          : parseDateCell(raw('Valid to'), index, 'Valid to');
      if (validTo < validFrom) {
        throw new Error(`Row ${index}: Valid to (${validTo}) is before Valid from (${validFrom}).`);
      }

      const key = [customerCode, aircraftType, category, validFrom, validTo].join('|');
      if (seen.has(key)) {
        throw new Error(
          `Row ${index}: ${customerCode} · ${aircraftType} · ${PRICE_CARD_AIRLINE_CATEGORY_LABELS[category]} for the same dates is repeated (first on row ${seen.get(key)}).`,
        );
      }
      seen.set(key, index);

      const airlineName = cells[idx('Airline name')] || customer.name || customerCode;
      const remarks = cells[idx('Remarks')] || undefined;
      const entry: PriceCardImportRow = {
        customerCode,
        airlineName,
        aircraftType,
        category,
        validFrom,
        validTo,
        remarks,
      };
      if (handling === 'BHS') {
        entry.price = parsePrice(raw('Price'), index);
        entry.flightOperation = parseFlightOperation(cells[idx('Flight operation')], index);
      }
      rows.push(entry);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Row ${index}: could not read this line.`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  if (rows.length === 0) {
    throw new Error(
      'The file has the header but no rate card rows. Add one row per airline and aircraft type under the header.',
    );
  }
  return { rows, warnings };
}
