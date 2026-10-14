import * as XLSX from 'xlsx';

/** Mongo subdoc metadata — never copy from Excel or overwrite intentionally. */
export const MAIN_DETAILS_EMBED_META_KEYS = new Set([
  '_id',
  '__v',
  'createdAt',
  'updatedAt',
]);

/** Navision export flags — preserve when reseeding blank business fields. */
export const MAIN_DETAILS_PRESERVE_KEYS = new Set([
  'exportedNAV',
  'navisionDataExportStatus',
]);

export type FhrMainDetailsReseedSummary = {
  dryRun: boolean;
  sheetName: string;
  filePath: string;
  totalRowsRead: number;
  rowsSkippedInvalidSerial: number;
  fhrDocsNotFound: number;
  fhrDocsUpdated: number;
  fhrDocsUnchanged: number;
  fieldsFilled: number;
  sampleUpdates: Array<{ serialNo: number; fields: string[] }>;
  rowErrors: Array<{ rowIndex: number; serialNo?: number; message: string }>;
};

export function normalizeReseedCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : '';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return '';
    if (v > 20000 && v < 100000) {
      try {
        const d = XLSX.SSF.parse_date_code(v);
        if (d?.y && d?.m && d?.d) {
          return `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}`;
        }
      } catch {
        /* ignore */
      }
    }
    return String(v);
  }
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') {
    return '';
  }
  return s;
}

export function parseReseedSerial(raw: unknown): number | null {
  const s = normalizeReseedCell(raw).replace(/^FL-/i, '').replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function isBlankMainDetailsValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'boolean') return false;
  if (typeof v === 'number') return false;
  if (typeof v === 'object') {
    return Object.keys(v as object).length === 0;
  }
  return false;
}

/** Direct Excel column → `mainDetails` schema key. */
const EXCEL_COLUMN_TO_MAIN_KEY: Record<string, string> = {
  Airline: 'Airline',
  Arline_Code: 'Arline_Code',
  Regn: 'Regn',
  Route: 'Route',
  Typeofflight: 'Typeofflight',
  TypeofHandling: 'TypeofHandling',
  TypeCraft: 'TypeCraft',
  ATADate: 'ATADate',
  ATATime: 'ATATime',
  ATDDate: 'ATDDate',
  ATDTime: 'ATDTime',
  ETDtime: 'ETDtime',
  ETDdate: 'etdDate',
  Delay: 'departureStatus',
  ActualDelay: 'ActualDelay',
  Cate_of_Flight: 'Cate_of_Flight',
  Terminal: 'Terminal',
  'Arrival Flt No': 'ArrivalFltNo',
  'Departure Flt No': 'DepartureFltNo',
  IPosDate: 'IPosDate',
  IPosTime: 'IPosTime',
  airrep: 'airrep',
  MTOW: 'MTOW',
  aircraftBody: 'aircraftBody',
  departureDelay: 'departureDelay',
  PAX_Airline_SignByDate: 'PAX_Airline_SignByDate',
};

export function mainDetailsFromExcelRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [col, key] of Object.entries(EXCEL_COLUMN_TO_MAIN_KEY)) {
    const val = normalizeReseedCell(row[col]);
    if (val) out[key] = val;
  }

  const airline = normalizeReseedCell(row.Airline);
  const code = normalizeReseedCell(row.Arline_Code);
  if (airline) out.Airline = airline;
  if (code) out.Arline_Code = code;

  const reason = normalizeReseedCell(row.ReasonofDelay);
  const delay = normalizeReseedCell(row.ActualDelay);
  if (reason || delay) {
    out.arrivalDelays = [
      {
        Delay: delay || '',
        ReasonofDelay: reason || '',
        gh: false,
        oth: false,
      },
    ];
  }

  const fltCancelled = row.fltcancelled ?? row.flightCancelled;
  if (typeof fltCancelled === 'boolean') {
    out.flightCancelled = fltCancelled;
  } else {
    const fc = normalizeReseedCell(fltCancelled).toLowerCase();
    if (fc === 'true' || fc === 'yes' || fc === 'y' || fc === '1') {
      out.flightCancelled = true;
    } else if (fc === 'false' || fc === 'no' || fc === 'n' || fc === '0') {
      out.flightCancelled = false;
    }
  }

  return out;
}

export function mergeBlankMainDetailsFields(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
  serialNo: number,
): { merged: Record<string, unknown>; changedFields: string[] } {
  const base =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : {};

  for (const key of MAIN_DETAILS_EMBED_META_KEYS) {
    delete base[key];
  }

  base.SerialNo = serialNo;
  base.flightSerialNumber = serialNo;

  const changedFields: string[] = [];

  for (const [key, val] of Object.entries(incoming)) {
    if (MAIN_DETAILS_EMBED_META_KEYS.has(key)) continue;
    if (key === 'SerialNo' || key === 'flightSerialNumber') continue;
    if (isBlankMainDetailsValue(val)) continue;

    const current = base[key];
    if (isBlankMainDetailsValue(current)) {
      base[key] = val;
      changedFields.push(key);
    }
  }

  for (const key of MAIN_DETAILS_PRESERVE_KEYS) {
    if (existing?.[key] != null && !isBlankMainDetailsValue(existing[key])) {
      base[key] = existing[key];
    }
  }

  return { merged: base, changedFields };
}

export function readExcelSheetRows(
  absolutePath: string,
  sheetName: string,
): Record<string, unknown>[] {
  const wb = XLSX.readFile(absolutePath, { cellDates: false, raw: true });
  const name =
    wb.SheetNames.find((n) => n.trim() === sheetName.trim()) ??
    wb.SheetNames.find((n) =>
      n.trim().toLowerCase() === sheetName.trim().toLowerCase(),
    );
  if (!name) {
    throw new Error(
      `Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`,
    );
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], {
    defval: '',
  });
}
