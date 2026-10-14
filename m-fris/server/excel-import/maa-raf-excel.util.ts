/**
 * Parse MAA RAF equipment-usage workbook (`MAA_RAF_MARCH-JULY.xlsx`).
 * One Excel serial → one RAF flight; multiple equipment rows → rafAdhocDetails.services[].
 */
import * as XLSX from 'xlsx';

export type RafEquipKind = 'equipment' | 'manpower' | 'service';

export type RafEquipmentCatalogEntry = {
  code: string;
  kind: RafEquipKind;
  /** Catalog / rate-card service code (RAF - Equipment - …). */
  serviceCode: string;
  /** Display + adhoc tariff match label. */
  particular: string;
  uom: string;
};

/** Short codes from MAA RAF export → RAF catalog + adhoc particular labels. */
export const MAA_RAF_EQUIPMENT_CATALOG: Record<string, RafEquipmentCatalogEntry> = {
  'GPU-140KV': {
    code: 'GPU-140KV',
    kind: 'equipment',
    serviceCode: 'RAF - Equipment - GPU-140KV',
    particular: 'Ground Power Unit (GPU) 140 KV',
    uom: 'Per Hour',
  },
  'GPU-NB': {
    code: 'GPU-NB',
    kind: 'equipment',
    serviceCode: 'RAF - Equipment - GPU-NB',
    particular: 'Ground Power Unit (GPU) 90 KV',
    uom: 'Per Hour',
  },
  PBNB: {
    code: 'PBNB',
    kind: 'equipment',
    serviceCode: 'RAF - Equipment - PBNB',
    particular: 'Push Back (Tow Bar included) Narrow Body',
    uom: 'Per service',
  },
  ISTNB: {
    code: 'ISTNB',
    kind: 'equipment',
    serviceCode: 'RAF - Equipment - ISTNB',
    particular: 'Tow Inter Stand - Narrow Body',
    uom: 'Per Tow',
  },
  RC: {
    code: 'RC',
    kind: 'equipment',
    serviceCode: 'RAF - Equipment - RC',
    particular: 'Ramp to Flight Deck Communication- Narrow Body',
    uom: 'Per Turnaround',
  },
  /** HYD Aug RAF export uses spaced label; matches billing catalog `RAF - Equipment - PAX Coach`. */
  'PAX COACH': {
    code: 'PAX Coach',
    kind: 'equipment',
    serviceCode: 'RAF - Equipment - PAX Coach',
    particular: 'PAX Coach',
    uom: 'Per Trip',
  },
  WC: {
    code: 'WC',
    kind: 'equipment',
    serviceCode: 'RAF - Equipment - WC',
    particular: 'Water service',
    uom: 'Per service',
  },
  EBT: {
    code: 'EBT',
    kind: 'equipment',
    serviceCode: 'RAF - Equipment - EBT',
    particular: 'Conveyor belt loader',
    uom: 'Per Hour',
  },
  UH: {
    code: 'UH',
    kind: 'manpower',
    serviceCode: 'RAF - Manpower - UH',
    particular: 'Floor Walkers/Welcome staff',
    uom: 'per personnel/hr',
  },
};

export type MaaRafExcelServiceLine = {
  excelRowIndex: number;
  equipmentCode: string;
  kind: RafEquipKind;
  serviceCode: string;
  particular: string;
  uom: string;
  usageHours: number;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  uses: string;
  remarks: string;
};

export type MaaRafExcelFlight = {
  excelSerial: number;
  customerName: string;
  customerCode: string;
  flightNo: string;
  typeCraft: string;
  categoryOfFlight: string;
  /** dd/MM/yyyy */
  operationDate: string;
  stdDate: string;
  atdDate: string;
  /** yyyy-MM-dd for window filter */
  operationYmd: string;
  services: MaaRafExcelServiceLine[];
};

function cellText(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).replace(/\r\n|\r/g, '\n').trim();
}

function headerKey(raw: string): string {
  return cellText(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ExcelDateParts = {
  ymd: string;
  ddMmYyyy: string;
  hhMm: string;
};

/**
 * Chennai MAA RAF workbook dates are dd/MM/yyyy in the sheet UI, but Excel often
 * stores US-locale serials (m/d/y). Prefer the formatted `cell.w` text as dd/MM.
 */
export function parseMaaRafDisplayDateText(text: string): ExcelDateParts | null {
  const s = text.trim();
  const m = s.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const hh = m[4] != null ? Number(m[4]) : 0;
  const mm = m[5] != null ? Number(m[5]) : 0;
  if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return {
    ymd: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    ddMmYyyy: `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`,
    hhMm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
}

/** Read a date/datetime cell — formatted dd/MM display wins over US serial storage. */
export function readMaaRafWorkbookDateCell(
  ws: XLSX.WorkSheet,
  rowIndex: number,
  colIdx: number | undefined,
  rawFallback: unknown,
): ExcelDateParts | null {
  if (colIdx != null && colIdx >= 0) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIdx });
    const cell = ws[addr];
    if (cell?.w) {
      const fromDisplay = parseMaaRafDisplayDateText(String(cell.w));
      if (fromDisplay) return fromDisplay;
    }
    if (cell?.v != null && cell.v !== '') {
      return excelSerialToParts(cell.v);
    }
  }
  return excelSerialToParts(rawFallback);
}

/** Excel serial day / datetime → { ymd, ddMmYyyy, hhMm }. */
export function excelSerialToParts(value: unknown): ExcelDateParts | null {
  if (value == null || value === '') return null;

  if (typeof value === 'string') {
    const s = value.trim();
    const m = s.match(
      /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?/,
    );
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = Number(m[3]);
      const hh = m[4] != null ? Number(m[4]) : 0;
      const mm = m[5] != null ? Number(m[5]) : 0;
      if (y >= 2000 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return {
          ymd: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          ddMmYyyy: `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`,
          hhMm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        };
      }
    }
    const iso = s.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/,
    );
    if (iso) {
      const y = Number(iso[1]);
      const mo = Number(iso[2]);
      const d = Number(iso[3]);
      const hh = iso[4] != null ? Number(iso[4]) : 0;
      const mm = iso[5] != null ? Number(iso[5]) : 0;
      return {
        ymd: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        ddMmYyyy: `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`,
        hhMm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      };
    }
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  const y = parsed.y;
  const mo = parsed.m;
  const d = parsed.d;
  const hh = parsed.H ?? 0;
  const mm = parsed.M ?? 0;
  if (!y || !mo || !d) return null;
  return {
    ymd: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    ddMmYyyy: `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`,
    hhMm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
}

/** Excel day-fraction (or hours number) → decimal hours. */
export function excelUsageToHours(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Day fractions are typically < 1 for sub-day usages; hours can be 1–24+.
    if (value > 0 && value < 1) return Math.round(value * 24 * 10000) / 10000;
    if (value >= 1 && value < 48) return Math.round(value * 10000) / 10000;
    if (value >= 48) {
      // Large serial mistaken for duration — ignore.
      return 0;
    }
  }
  const text = cellText(value);
  if (!text) return 0;
  const hm = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hm) {
    return Number(hm[1]) + Number(hm[2]) / 60 + (hm[3] ? Number(hm[3]) / 3600 : 0);
  }
  const n = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1) return Math.round(n * 24 * 10000) / 10000;
  return n;
}

export function hoursToHhMm(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '';
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function resolveRafEquipment(codeRaw: string): RafEquipmentCatalogEntry {
  const code = cellText(codeRaw).toUpperCase();
  const hit = MAA_RAF_EQUIPMENT_CATALOG[code];
  if (hit) return hit;
  return {
    code: code || 'UNKNOWN',
    kind: 'equipment',
    serviceCode: code ? `RAF - Equipment - ${code}` : 'RAF - Equipment',
    particular: code || 'Unknown equipment',
    uom: 'Per Hour',
  };
}

type ColMap = {
  serial?: number;
  customerName?: number;
  customerCode?: number;
  flightNo?: number;
  stdDate?: number;
  atdDate?: number;
  equipmentNo?: number;
  usagesTime?: number;
  fromDate?: number;
  toDate?: number;
  remarks?: number;
  typeCraft?: number;
  category?: number;
};

function mapHeaders(headerRow: unknown[]): ColMap {
  const map: ColMap = {};
  headerRow.forEach((cell, idx) => {
    const key = headerKey(String(cell ?? ''));
    if (!key) return;
    if (key === 'serial number' || key === 'serial no' || key === 'serial') {
      map.serial = idx;
    } else if (key === 'customer name' || key === 'airline' || key === 'airline name') {
      map.customerName = idx;
    } else if (key === 'customer code' || key === 'airline code') {
      map.customerCode = idx;
    } else if (key === 'flight no' || key === 'flight number' || key === 'flt no') {
      map.flightNo = idx;
    } else if (key === 'std date') {
      map.stdDate = idx;
    } else if (key === 'atd date') {
      map.atdDate = idx;
    } else if (key === 'equipment no' || key === 'equipment' || key === 'equip no') {
      map.equipmentNo = idx;
    } else if (key === 'usages time' || key === 'usage time' || key === 'usage hours') {
      map.usagesTime = idx;
    } else if (key === 'from date') {
      map.fromDate = idx;
    } else if (key === 'to date') {
      map.toDate = idx;
    } else if (key === 'remarks') {
      map.remarks = idx;
    } else if (key === 'type craft' || key === 'aircraft type' || key === 'ac type') {
      map.typeCraft = idx;
    } else if (
      key === 'category of flight' ||
      key === 'category' ||
      key === 'cate of flight'
    ) {
      map.category = idx;
    }
  });
  return map;
}

function pick(row: unknown[], idx: number | undefined): unknown {
  if (idx == null || idx < 0 || idx >= row.length) return '';
  return row[idx];
}

/**
 * Read Recovered_Sheet1 (preferred) or Sheet1 → grouped flights.
 */
export function parseMaaRafWorkbook(
  wb: XLSX.WorkBook,
  opts?: { sheetName?: string; fromYmd?: string | null; toYmd?: string | null },
): {
  sheetName: string;
  flights: MaaRafExcelFlight[];
  skippedRows: number;
  skippedOutsideWindow: number;
  unresolvedEquipmentCodes: string[];
} {
  const preferred =
    opts?.sheetName ||
    (wb.SheetNames.includes('Recovered_Sheet1')
      ? 'Recovered_Sheet1'
      : wb.SheetNames[0]);
  const sheetName =
    preferred && wb.Sheets[preferred] ? preferred : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: true,
  });
  if (!matrix.length) {
    return {
      sheetName,
      flights: [],
      skippedRows: 0,
      skippedOutsideWindow: 0,
      unresolvedEquipmentCodes: [],
    };
  }

  const cols = mapHeaders(matrix[0] ?? []);
  const bySerial = new Map<number, MaaRafExcelFlight>();
  let skippedRows = 0;
  let skippedOutsideWindow = 0;
  const unresolved = new Set<string>();
  const fromYmd = opts?.fromYmd?.trim() || null;
  const toYmd = opts?.toYmd?.trim() || null;

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const serialRaw = pick(row, cols.serial);
    const serialNum = Number(serialRaw);
    if (!Number.isFinite(serialNum) || serialNum <= 0) {
      skippedRows += 1;
      continue;
    }

    const stdParts =
      readMaaRafWorkbookDateCell(ws, i, cols.stdDate, pick(row, cols.stdDate)) ||
      readMaaRafWorkbookDateCell(ws, i, cols.fromDate, pick(row, cols.fromDate));
    if (!stdParts) {
      skippedRows += 1;
      continue;
    }

    if (fromYmd && stdParts.ymd < fromYmd) {
      skippedOutsideWindow += 1;
      continue;
    }
    if (toYmd && stdParts.ymd > toYmd) {
      skippedOutsideWindow += 1;
      continue;
    }

    const equipmentCode = cellText(pick(row, cols.equipmentNo));
    if (!equipmentCode) {
      skippedRows += 1;
      continue;
    }

    const catalog = resolveRafEquipment(equipmentCode);
    if (!MAA_RAF_EQUIPMENT_CATALOG[equipmentCode.toUpperCase()]) {
      unresolved.add(equipmentCode.toUpperCase());
    }

    const fromParts =
      readMaaRafWorkbookDateCell(ws, i, cols.fromDate, pick(row, cols.fromDate)) ||
      stdParts;
    const toParts =
      readMaaRafWorkbookDateCell(ws, i, cols.toDate, pick(row, cols.toDate)) ||
      fromParts;
    const usageHours = excelUsageToHours(pick(row, cols.usagesTime));
    const uses = hoursToHhMm(usageHours) || (usageHours > 0 ? String(usageHours) : '');

    const atdParts = readMaaRafWorkbookDateCell(
      ws,
      i,
      cols.atdDate,
      pick(row, cols.atdDate),
    );
    const customerName = cellText(pick(row, cols.customerName));
    const customerCode = cellText(pick(row, cols.customerCode)).toUpperCase();
    const flightNo = cellText(pick(row, cols.flightNo));
    const typeCraft = cellText(pick(row, cols.typeCraft));
    const categoryOfFlight =
      cellText(pick(row, cols.category)) || 'Domestic';

    let flight = bySerial.get(serialNum);
    if (!flight) {
      flight = {
        excelSerial: serialNum,
        customerName,
        customerCode,
        flightNo,
        typeCraft,
        categoryOfFlight,
        operationDate: stdParts.ddMmYyyy,
        stdDate: stdParts.ddMmYyyy,
        atdDate: atdParts?.ddMmYyyy || stdParts.ddMmYyyy,
        operationYmd: stdParts.ymd,
        services: [],
      };
      bySerial.set(serialNum, flight);
    } else {
      if (!flight.customerName && customerName) flight.customerName = customerName;
      if (!flight.customerCode && customerCode) flight.customerCode = customerCode;
      if (!flight.flightNo && flightNo) flight.flightNo = flightNo;
      if (!flight.typeCraft && typeCraft) flight.typeCraft = typeCraft;
    }

    flight.services.push({
      excelRowIndex: i + 1,
      equipmentCode: catalog.code,
      kind: catalog.kind,
      serviceCode: catalog.serviceCode,
      particular: catalog.particular,
      uom: catalog.uom,
      usageHours,
      fromDate: fromParts.ddMmYyyy,
      fromTime: fromParts.hhMm,
      toDate: toParts.ddMmYyyy,
      toTime: toParts.hhMm,
      uses,
      remarks: cellText(pick(row, cols.remarks)),
    });
  }

  const flights = [...bySerial.values()].sort(
    (a, b) => a.operationYmd.localeCompare(b.operationYmd) || a.excelSerial - b.excelSerial,
  );

  return {
    sheetName,
    flights,
    skippedRows,
    skippedOutsideWindow,
    unresolvedEquipmentCodes: [...unresolved].sort(),
  };
}
