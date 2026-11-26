import ExcelJS from 'exceljs';

export type EbcLayout = 'qp' | 'vj';

export type EbcEntry = {
  date: string;
  flightNo: string;
  passengerName: string;
  pnr: string;
  receiptNo: string;
  chargeType: string;
  quantity: string;
  rate: number | null;
  amount: number | null;
  tax: number | null;
  total: number | null;
  paymentMode: string;
  paymentNote: string;
};

export type EbcMoneySplit = {
  upi: number | null;
  cash: number | null;
  card: number | null;
  total: number | null;
};

export type EbcDailyTotal = EbcMoneySplit & { date: string };

export type EbcParsedSheet = {
  month: string;
  airline: string;
  layout: EbcLayout;
  rows: EbcEntry[];
  dailyTotals: EbcDailyTotal[];
  monthSplit: EbcMoneySplit | null;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function blankEntry(): EbcEntry {
  return {
    date: '',
    flightNo: '',
    passengerName: '',
    pnr: '',
    receiptNo: '',
    chargeType: '',
    quantity: '',
    rate: null,
    amount: null,
    tax: null,
    total: null,
    paymentMode: '',
    paymentNote: '',
  };
}

function asText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return ymdFromDate(value);
  if (typeof value === 'object') {
    const record = value as { result?: unknown; richText?: Array<{ text?: string }>; text?: string };
    if (record.result != null) return asText(record.result);
    if (Array.isArray(record.richText)) return record.richText.map((part) => part.text ?? '').join('').trim();
    if (typeof record.text === 'string') return record.text.trim();
    return '';
  }
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  const raw = value != null && typeof value === 'object' && 'result' in value
    ? (value as { result?: unknown }).result
    : value;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const cleaned = String(raw).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Excel serial (1900 system) or a written date → YYYY-MM-DD. */
export function parseEbcDate(value: unknown, fallbackYear?: number): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return ymdFromDate(value);
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return ymdFromDate(utc);
  }
  const text = asText(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
  const named = text.match(/^(\d{1,2})[-\s]([A-Za-z]+)(?:[-\s](\d{2}|\d{4}))?$/);
  if (named) {
    const month = MONTH_INDEX[named[2].toLowerCase()];
    if (!month) return '';
    const year = named[3]
      ? named[3].length === 2
        ? 2000 + Number(named[3])
        : Number(named[3])
      : fallbackYear;
    if (!year) return '';
    return `${year}-${pad(month)}-${pad(Number(named[1]))}`;
  }
  return '';
}

function airlineOf(flightNo: string): string {
  const match = flightNo.toUpperCase().match(/^([A-Z0-9]{2})/);
  return match?.[1] ?? '';
}

function monthOf(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : '';
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isXlsx(buffer: Buffer, fileName: string): boolean {
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  return /\.xlsx$/i.test(fileName);
}

function finishSheets(
  layout: EbcLayout,
  rows: EbcEntry[],
  dailyTotals: EbcDailyTotal[],
  monthSplit: EbcMoneySplit | null,
): EbcParsedSheet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const airline = airlineOf(row.flightNo);
    if (!airline) continue;
    counts.set(airline, (counts.get(airline) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = ranked[0] && ranked[0][1] / Math.max(rows.length, 1) >= 0.9 ? ranked[0][0] : '';

  const byAirline = new Map<string, EbcEntry[]>();
  for (const row of rows) {
    const airline = dominant || airlineOf(row.flightNo);
    if (!airline || !row.date) continue;
    const bucket = byAirline.get(airline) ?? [];
    bucket.push(row);
    byAirline.set(airline, bucket);
  }
  if (byAirline.size === 0) {
    throw new Error('No collection rows found. Check the header row and flight numbers.');
  }

  return [...byAirline.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([airline, airlineRows]) => {
      const months = new Set(airlineRows.map((row) => monthOf(row.date)).filter(Boolean));
      if (months.size !== 1) {
        throw new Error(`${airline} has dates in more than one month. Import one month at a time.`);
      }
      const month = [...months][0];
      const airlineDays = dailyTotals.filter((day) => monthOf(day.date) === month);
      const split = monthSplit ?? sumSplit(airlineDays);
      const lineTotal = airlineRows.reduce((sum, row) => sum + (row.total ?? 0), 0);
      return {
        month,
        airline,
        layout,
        rows: airlineRows,
        dailyTotals: airlineDays,
        monthSplit: split ?? { upi: null, cash: null, card: null, total: lineTotal },
      };
    });
}

function sumSplit(days: EbcDailyTotal[]): EbcMoneySplit | null {
  if (days.length === 0) return null;
  const add = (key: keyof EbcMoneySplit) => days.reduce((sum, day) => sum + (day[key] ?? 0), 0);
  return { upi: add('upi'), cash: add('cash'), card: add('card'), total: add('total') };
}

function parseQpCsv(text: string): EbcParsedSheet[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('The CSV has no collection rows.');
  const rows: EbcEntry[] = [];
  let summaryTotal: number | null = null;
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    if (cells.some((cell) => cell.toUpperCase() === 'TOTAL')) {
      summaryTotal = asNumber(cells[8]) ?? asNumber(cells[6]);
      continue;
    }
    const flightNo = cells[1] ?? '';
    const date = parseEbcDate(cells[0]);
    if (!flightNo || !date) continue;
    const row = blankEntry();
    row.date = date;
    row.flightNo = flightNo.toUpperCase();
    row.passengerName = cells[2] ?? '';
    row.pnr = (cells[3] ?? '').toUpperCase();
    row.quantity = cells[4] ?? '';
    row.rate = asNumber(cells[5]);
    row.amount = asNumber(cells[6]);
    row.tax = asNumber(cells[7]);
    row.total = asNumber(cells[8]);
    row.paymentMode = (cells[9] ?? '').toUpperCase();
    rows.push(row);
  }
  const sheets = finishSheets('qp', rows, [], null);
  if (summaryTotal != null && sheets.length === 1) {
    sheets[0].monthSplit = { upi: null, cash: null, card: null, total: summaryTotal };
  }
  return sheets;
}

function cellValue(row: ExcelJS.Row, col: number): ExcelJS.CellValue {
  return row.getCell(col).value;
}

async function parseVjWorkbook(buffer: Buffer): Promise<EbcParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets.find((item) => item.actualRowCount > 1) ?? workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook has no sheets.');

  const rows: EbcEntry[] = [];
  const dailyTotals: EbcDailyTotal[] = [];
  let monthSplit: EbcMoneySplit | null = null;
  let currentDate = '';

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const label = asText(cellValue(row, 11)).toUpperCase();
    const flightNo = asText(cellValue(row, 2)).toUpperCase();
    if (label === 'TOTAL') {
      const split: EbcMoneySplit = {
        upi: asNumber(cellValue(row, 12)),
        cash: asNumber(cellValue(row, 13)),
        card: asNumber(cellValue(row, 14)),
        total: asNumber(cellValue(row, 15)),
      };
      if (currentDate) {
        dailyTotals.push({ date: currentDate, ...split });
        currentDate = '';
      } else {
        monthSplit = split;
      }
      return;
    }
    if (!flightNo || flightNo === 'FLIGHT NUMBER') return;
    const yearHint = currentDate ? Number(currentDate.slice(0, 4)) : undefined;
    const date = parseEbcDate(cellValue(row, 1), yearHint) || currentDate;
    if (!date) return;
    currentDate = date;
    const entry = blankEntry();
    entry.date = date;
    entry.flightNo = flightNo;
    entry.passengerName = asText(cellValue(row, 3));
    entry.receiptNo = asText(cellValue(row, 4));
    entry.pnr = asText(cellValue(row, 5)).toUpperCase();
    entry.chargeType = asText(cellValue(row, 7));
    entry.quantity = asText(cellValue(row, 8));
    entry.total = asNumber(cellValue(row, 9));
    entry.amount = entry.total;
    entry.paymentMode = asText(cellValue(row, 10)).toUpperCase();
    entry.paymentNote = asText(cellValue(row, 11));
    rows.push(entry);
  });

  return finishSheets('vj', rows, dailyTotals, monthSplit);
}

export async function parseEbcFile(buffer: Buffer, fileName = ''): Promise<EbcParsedSheet[]> {
  if (!buffer?.length) throw new Error('The file is empty.');
  if (isXlsx(buffer, fileName)) return parseVjWorkbook(buffer);
  const text = buffer.toString('utf8');
  const header = text.split(/\r?\n/, 1)[0]?.toUpperCase() ?? '';
  if (header.includes('KGS') || header.includes('FLIGHT NO')) return parseQpCsv(text);
  if (header.includes('EXCESS BAGGAGE') || header.includes('RECEIPT')) {
    throw new Error('Save the VJ register as .xlsx. The CSV reader is for the QP collection file.');
  }
  throw new Error('Unrecognised EBC file. Use the QP collection CSV or the VJ monthly workbook.');
}
