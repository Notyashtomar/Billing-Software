import type { CellValue } from 'exceljs';
import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';

export type AircraftImportPayload = {
  aircraft: string;
  manufacturer?: string;
  icaoCode?: string;
  aircraftBody?: string;
  wingspan?: number | null;
  mtow?: string;
  passengerCapacity?: number | null;
  description?: string;
  category?: string;
  active?: boolean;
  universalRow?: Record<string, string>;
};

export type ParsedAircraftExcelRow = {
  rowNumber: number;
  payload: AircraftImportPayload;
};

export type AircraftExcelParseResult = {
  rows: ParsedAircraftExcelRow[];
  skipped: { rowNumber: number; reason: string }[];
};

export const AIRCRAFT_EXCEL_HEADERS = [
  'Aircraft Type',
  'Manufacturer',
  'ICAO Code',
  'Aircraft Body',
  'Wingspan (m)',
  'MTOW (kg)',
  'Passenger Capacity',
  'Description',
  'Category',
  'Active',
] as const;

type AircraftField =
  | 'aircraft'
  | 'manufacturer'
  | 'icaoCode'
  | 'aircraftBody'
  | 'wingspan'
  | 'mtow'
  | 'passengerCapacity'
  | 'description'
  | 'category'
  | 'active';

const HEADER_FIELD_MAP: Record<string, AircraftField> = {
  aircraft: 'aircraft',
  'aircraft type': 'aircraft',
  type: 'aircraft',
  manufacturer: 'manufacturer',
  'icao code': 'icaoCode',
  icao: 'icaoCode',
  'aircraft body': 'aircraftBody',
  body: 'aircraftBody',
  'wingspan (m)': 'wingspan',
  wingspan: 'wingspan',
  'mtow (kg)': 'mtow',
  mtow: 'mtow',
  'passenger capacity': 'passengerCapacity',
  capacity: 'passengerCapacity',
  pax: 'passengerCapacity',
  description: 'description',
  desc: 'description',
  category: 'category',
  active: 'active',
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

function mapHeaderToField(header: string): AircraftField | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  return HEADER_FIELD_MAP[normalized] ?? null;
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseActive(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (['false', 'no', 'n', '0', 'inactive'].includes(v)) return false;
  if (['true', 'yes', 'y', '1', 'active'].includes(v)) return true;
  return undefined;
}

function normalizeCategory(raw: string): string | undefined {
  const c = raw.trim().toUpperCase();
  if (['A', 'B', 'C', 'D', 'E'].includes(c)) return c;
  return undefined;
}

function normalizeBody(raw: string): string | undefined {
  const v = raw.trim().toUpperCase();
  if (v === 'NB' || v === 'WB') return v;
  if (v === 'NARROW' || v === 'NARROW BODY') return 'NB';
  if (v === 'WIDE' || v === 'WIDE BODY') return 'WB';
  return undefined;
}

export async function parseAdvanceAircraftExcel(
  file: File,
): Promise<AircraftExcelParseResult> {
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
  const columnFields = new Map<number, AircraftField>();
  const columnHeaders = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const headerText = cellToString(cell.value);
    columnHeaders.set(colNumber, headerText);
    const field = mapHeaderToField(headerText);
    if (field) columnFields.set(colNumber, field);
  });

  if (![...columnFields.values()].includes('aircraft')) {
    return {
      rows: [],
      skipped: [
        {
          rowNumber: 1,
          reason:
            'No Aircraft Type column found. Expected a header like "Aircraft Type" or "Aircraft".',
        },
      ],
    };
  }

  const rows: ParsedAircraftExcelRow[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber);
    const raw: Partial<Record<AircraftField, string>> = {};
    const universalRow: Record<string, string> = {};

    columnHeaders.forEach((header, colNumber) => {
      const value = cellToString(excelRow.getCell(colNumber).value);
      if (header.trim()) universalRow[header.trim()] = value;
    });

    columnFields.forEach((field, colNumber) => {
      raw[field] = cellToString(excelRow.getCell(colNumber).value);
    });

    const aircraft = raw.aircraft?.trim() ?? '';
    if (!aircraft) continue;

    const body = normalizeBody(raw.aircraftBody ?? '');
    const category = normalizeCategory(raw.category ?? '');
    const active = parseActive(raw.active ?? '');
    const passengerCapacity = parseOptionalNumber(raw.passengerCapacity ?? '');
    if (passengerCapacity != null && passengerCapacity >= 1000) {
      skipped.push({
        rowNumber,
        reason: 'Passenger capacity must be less than 1000.',
      });
      continue;
    }

    rows.push({
      rowNumber,
      payload: {
        aircraft,
        manufacturer: raw.manufacturer?.trim() || undefined,
        icaoCode: raw.icaoCode?.trim().toUpperCase() || undefined,
        aircraftBody: body,
        wingspan: (() => {
          const span = parseOptionalNumber(raw.wingspan ?? '');
          return span != null && span > 0 ? span : null;
        })(),
        mtow: raw.mtow?.trim() || undefined,
        passengerCapacity,
        description: raw.description?.trim() || undefined,
        category,
        active,
        universalRow,
      },
    });
  }

  if (rows.length === 0 && skipped.length === 0) {
    skipped.push({
      rowNumber: 2,
      reason: 'No data rows with an aircraft type found below the header.',
    });
  }

  return { rows, skipped };
}

export async function downloadAircraftExcelTemplate(): Promise<void> {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Aircraft');
  sheet.addRow([...AIRCRAFT_EXCEL_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [
    { width: 16 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 18 },
    { width: 28 },
    { width: 10 },
    { width: 10 },
  ];
  sheet.addRow([
    'A320',
    'Airbus',
    'A320',
    'NB',
    '35',
    '78000',
    '180',
    'Narrow-body twin jet',
    'B',
    'Yes',
  ]);
  sheet.addRow([
    'B777-300ER',
    'Boeing',
    'B77W',
    'WB',
    '65',
    '351534',
    '396',
    'Wide-body twin jet',
    'E',
    'Yes',
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    'aircraft-import-template.xlsx',
  );
}
