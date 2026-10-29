import ExcelJS from 'exceljs';

export type UldFlag = '' | 'A320' | 'XXLD';

export type UldMovement = {
  uldType: string;
  inQty: number | null;
  outQty: number | null;
  balance: number | null;
};

export type UldDayRow = {
  date: string;
  flightNo: string;
  flag: UldFlag;
  movements: UldMovement[];
};

export type UldAirlineSheet = {
  month: string;
  airline: string;
  uldTypes: string[];
  opening: Array<{ uldType: string; balance: number | null }>;
  rows: UldDayRow[];
};

const MONTH_INDEX: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

/** "SEP 2026" / "APRIL 2026" → "2026-09". */
export function monthKeyFromSheetName(name: string): string | null {
  const m = name.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_INDEX[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[2]}-${String(month).padStart(2, '0')}`;
}

const UA_VS_AIRLINE: Record<string, string> = {
  UA: 'UNITED AIR LINES (UA)',
  VS: 'VIRGIN ATLANTIC (VS)',
};

/** "UA NOV 2023" / "VS MAR 25" / "UA SEPTEMBER 2025" → airline + month. */
export function uaVsSheetIdentity(name: string): { airline: string; month: string } | null {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  const m = cleaned.match(/^(UA|VS)\s+([A-Za-z]+)\s+(\d{2}|\d{4})$/i);
  if (!m) return null;
  const month = MONTH_INDEX[m[2].toLowerCase()];
  if (!month) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return {
    airline: UA_VS_AIRLINE[m[1].toUpperCase()],
    month: `${year}-${String(month).padStart(2, '0')}`,
  };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return ymd(value);
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim();
    }
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    return '';
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  const raw = value != null && typeof value === 'object' && 'result' in value ? value.result : value;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cellDate(value: ExcelJS.CellValue): string {
  if (value instanceof Date) return ymd(value);
  if (value != null && typeof value === 'object' && 'result' in value && value.result instanceof Date) {
    return ymd(value.result);
  }
  const text = cellText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

/** Workbook green = A320, red = cancelled (XXLD). Yellow balance formulas are not a status. */
function cellFlag(cell: ExcelJS.Cell): UldFlag | null {
  const argb = cell.fill?.type === 'pattern' ? cell.fill.fgColor?.argb ?? '' : '';
  if (argb.endsWith('92D050')) return 'A320';
  if (argb.endsWith('FF0000')) return 'XXLD';
  return null;
}

type ColRole = { kind: 'date' | 'flight' | 'in' | 'out' | 'balance'; uldType: string };

function headerRole(header: string): ColRole['kind'] | null {
  const h = header.replace(/\s+/g, ' ').trim().toUpperCase();
  if (h.startsWith('DATE')) return 'date';
  if (h.startsWith('FLT') || h.startsWith('FLIGHT')) return 'flight';
  if (h === 'IN') return 'in';
  if (h === 'OUT') return 'out';
  if (h.startsWith('BALANCE')) return 'balance';
  return null;
}

function parseSheet(ws: ExcelJS.Worksheet, month: string): UldAirlineSheet[] {
  const lastCol = ws.columnCount;
  const lastRow = ws.rowCount;
  const row1 = ws.getRow(1);
  const row2 = ws.getRow(2);
  const row3 = ws.getRow(3);

  let airline = '';
  let uldType = '';
  const airlineOf: string[] = [];
  const typeOf: string[] = [];
  const roleOf: Array<ColRole | null> = [];
  for (let col = 1; col <= lastCol; col += 1) {
    const nextAirline = cellText(row1.getCell(col).value);
    if (nextAirline && nextAirline !== airline) {
      airline = nextAirline;
      uldType = '';
    }
    const nextType = cellText(row2.getCell(col).value);
    if (nextType) uldType = nextType.replace(/\s+/g, ' ').trim();
    airlineOf[col] = airline;
    typeOf[col] = uldType;
    const kind = headerRole(cellText(row3.getCell(col).value));
    roleOf[col] = kind ? { kind, uldType } : null;
  }
  // A blank header right after DATE is the flight-number column (some airlines omit the label).
  for (let col = 2; col <= lastCol; col += 1) {
    if (!roleOf[col] && roleOf[col - 1]?.kind === 'date' && airlineOf[col] === airlineOf[col - 1]) {
      roleOf[col] = { kind: 'flight', uldType: typeOf[col] };
    }
  }

  const blocks: Array<{ airline: string; cols: number[] }> = [];
  for (let col = 1; col <= lastCol; col += 1) {
    if (!airlineOf[col]) continue;
    const last = blocks[blocks.length - 1];
    if (last && last.airline === airlineOf[col]) last.cols.push(col);
    else blocks.push({ airline: airlineOf[col], cols: [col] });
  }

  return blocks
    .map((block) => parseBlock(ws, month, block.airline, block.cols, roleOf, lastRow))
    .filter((sheet) => sheet.rows.length > 0 || sheet.opening.some((o) => o.balance != null));
}

function parseBlock(
  ws: ExcelJS.Worksheet,
  month: string,
  airline: string,
  cols: number[],
  roleOf: Array<ColRole | null>,
  lastRow: number,
): UldAirlineSheet {
  // Split the airline into sections, each starting at its DATE column.
  const sections: number[][] = [];
  for (const col of cols) {
    if (roleOf[col]?.kind === 'date' || sections.length === 0) sections.push([]);
    sections[sections.length - 1].push(col);
  }

  const uldTypes: string[] = [];
  const remember = (type: string) => {
    if (type && !uldTypes.includes(type)) uldTypes.push(type);
  };

  const opening = new Map<string, number | null>();
  const rows: UldDayRow[] = [];
  let openingTaken = false;

  for (let r = 4; r <= lastRow; r += 1) {
    const excelRow = ws.getRow(r);
    for (const section of sections) {
      let date = '';
      let flightNo = '';
      let flag: UldFlag = '';
      const movements = new Map<string, UldMovement>();
      const movement = (type: string) => {
        remember(type);
        let found = movements.get(type);
        if (!found) {
          found = { uldType: type, inQty: null, outQty: null, balance: null };
          movements.set(type, found);
        }
        return found;
      };
      let anyQty = false;
      for (const col of section) {
        const role = roleOf[col];
        if (!role) continue;
        const cell = excelRow.getCell(col);
        const marked = cellFlag(cell);
        if (marked) flag = flag === 'XXLD' ? flag : marked;
        if (role.kind === 'date') date = cellDate(cell.value) || date;
        else if (role.kind === 'flight') flightNo = cellText(cell.value) || flightNo;
        else if (role.uldType) {
          const qty = cellNumber(cell.value);
          const slot = movement(role.uldType);
          if (role.kind === 'in') slot.inQty = qty;
          else if (role.kind === 'out') slot.outQty = qty;
          else slot.balance = qty;
          if (qty != null) anyQty = true;
        }
      }
      const list = [...movements.values()];
      if (!date && !flightNo && anyQty && !openingTaken) {
        for (const item of list) {
          if (item.balance != null) opening.set(item.uldType, item.balance);
        }
        continue;
      }
      if (!date && !flightNo && !anyQty) continue;
      rows.push({ date, flightNo, flag, movements: list });
    }
    openingTaken = true;
  }

  return {
    month,
    airline,
    uldTypes,
    opening: uldTypes.map((uldType) => ({ uldType, balance: opening.get(uldType) ?? null })),
    rows,
  };
}

export type UldWorkbookKind = 'others' | 'ua-vs';

export async function parseUldWorkbook(buffer: Buffer, kind: UldWorkbookKind = 'others'): Promise<UldAirlineSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheets: UldAirlineSheet[] = [];
  for (const ws of wb.worksheets) {
    if (kind === 'ua-vs') {
      const identity = uaVsSheetIdentity(ws.name);
      if (!identity) continue;
      // One airline per sheet. The title row is a description, not the airline name.
      const parsed = parseSheet(ws, identity.month).map((sheet) => ({ ...sheet, airline: identity.airline }));
      const merged = mergeAirlineSheets(parsed, identity);
      if (merged) sheets.push(merged);
      continue;
    }
    const month = monthKeyFromSheetName(ws.name);
    if (!month) continue;
    sheets.push(...parseSheet(ws, month));
  }
  return sheets;
}

/** UA/VS sheets are a single airline; fold every column block into one record. */
function mergeAirlineSheets(
  parts: UldAirlineSheet[],
  identity: { airline: string; month: string },
): UldAirlineSheet | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const uldTypes: string[] = [];
  const opening = new Map<string, number | null>();
  const rows: UldDayRow[] = [];
  for (const part of parts) {
    for (const type of part.uldTypes) if (!uldTypes.includes(type)) uldTypes.push(type);
    for (const item of part.opening) {
      if (item.balance != null) opening.set(item.uldType, item.balance);
    }
    rows.push(...part.rows);
  }
  return {
    month: identity.month,
    airline: identity.airline,
    uldTypes,
    opening: uldTypes.map((uldType) => ({ uldType, balance: opening.get(uldType) ?? null })),
    rows,
  };
}
