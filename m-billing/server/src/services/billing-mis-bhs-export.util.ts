import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { exportBhsMisViaOpenpyxl } from './billing-mis-bhs-openpyxl.util';
import {
  delhiRevSummaryHeaders,
  stampDelhiRevSummaryTitle,
  formatMisMonthToken,
  getBhsMisStationProfile,
  type BhsMisStationProfile,
} from './billing-mis-bhs-profile.util';
import {
  airlineCodeFromFlight,
  buildProjSkdMatrix,
  excelColLetter,
  getProjSkdSheetLayout,
  looksLikeScheduledFlightNo,
  normalizeMisScheduleYmd,
  projSkdClearUntilRow,
  projSkdCount,
  PROJ_SKD_FIRST_DAY_ROW,
  splitProjectedByAirlineColumns,
  ymdForDay,
  type ProjSkdMatrix,
} from './billing-mis-bhs-proj-skd.util';
import {
  buildRecoSkdMatrix,
  getRecoSkdSheetLayout,
  recoSkdClearUntilRow,
  RECO_SKD_DATA_START_ROW,
  type RecoSkdFlightLike,
  type RecoSkdMatrix,
  type RecoSkdScheduleMaster,
} from './billing-mis-bhs-reco-skd.util';
import {
  BHS_REV_COL,
  BHS_REV_FIRST_ROW,
  DEL_REV_COL,
  BHS_SCHED_COL,
  BHS_SCHED_FIRST_ROW,
  BHS_XXLD_COL,
  BHS_XXLD_FIRST_ROW,
  bhsMisAirlineFullName,
  buildBhsMisRevRows,
  type BhsMisRevIndexedRow,
} from './billing-mis-bhs-source.util';

export type BhsMisFlightRow = {
  flightNo: string;
  aircraftType: string;
  customerCode: string;
  airlineName: string;
  scheduleDate: string;
  sta?: string;
  std?: string;
  category?: string;
  cancelled?: boolean;
  /** Billing eligibility from sources; Rev_summary uses eligible only. Proj_Skd counts all flown. */
  eligible?: boolean;
  skdNonSkd?: string;
  ops?: string;
  bookingNo?: string;
  challanNo?: string;
  flightStatus?: string;
};

export type BhsMisPriceCardRow = {
  customerCode: string;
  airlineName: string;
  aircraftType: string;
  category: string;
  bodyType: string;
  packagePriceUsd?: number;
  packagePriceInr?: number;
  currency: string;
  validFrom?: Date;
  validTo?: Date;
  royaltyMode?: string;
};

export type BhsMisInvoiceRow = {
  customerCode: string;
  billToCustomerCode?: string;
  customerName: string;
  invoiceNumber: string;
  status: string;
  totalInclTax: number;
  currency: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
};

export type BhsMisExportInput = {
  stationCode: string;
  from: string;
  to: string;
  flights: BhsMisFlightRow[];
  lastMonthFlights?: BhsMisFlightRow[];
  fhrFlights?: RecoSkdFlightLike[];
  scheduleMasters?: RecoSkdScheduleMaster[];
  priceCardRows: BhsMisPriceCardRow[];
  invoices: BhsMisInvoiceRow[];
  revRows?: BhsMisRevIndexedRow[];
  roeToInr: number;
  previousInvoices?: BhsMisInvoiceRow[];
  previousRoeToInr?: number;
};

const workbookSheetNameCache = new Map<string, string[]>();

export async function listBhsMisWorkbookSheetNames(templateFile: string): Promise<string[]> {
  const cached = workbookSheetNameCache.get(templateFile);
  if (cached) return cached;
  const templatePath = resolveTemplatePath(templateFile);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const names = workbook.worksheets.map((sheet) => sheet.name);
  workbookSheetNameCache.set(templateFile, names);
  return names;
}

function resolveTemplatePath(templateFile: string): string {
  const candidates = [
    join(process.cwd(), '..', '..', 'modules', 'm-billing', 'server', 'assets', 'bhs-mis', templateFile),
    join(process.cwd(), 'modules', 'm-billing', 'server', 'assets', 'bhs-mis', templateFile),
    join(__dirname, '..', 'assets', 'bhs-mis', templateFile),
    join(__dirname, '..', '..', 'assets', 'bhs-mis', templateFile),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`BHS MIS template not found: ${templateFile}`);
}

function pickOp(op: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = String(op[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function dayOfWeekShort(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00`);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] ?? '';
}

function dowNumber(dateYmd: string): number {
  const d = new Date(`${dateYmd}T12:00:00`);
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/** ExcelJS writeBuffer needs shared formulas expanded; formula text must NOT include leading '='. */
function materializeSharedFormulas(workbook: ExcelJS.Workbook): void {
  workbook.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const formula = cell.formula;
        if (!formula) return;
        const bare = formula.replace(/^=+/, '');
        const raw = cell.value;
        const result =
          raw && typeof raw === 'object' && 'result' in raw
            ? (raw as { result?: ExcelJS.CellValue }).result
            : undefined;
        const normalizedResult =
          result === null || result === undefined ? undefined : (result as ExcelJS.CellFormulaValue['result']);
        cell.value =
          normalizedResult !== undefined
            ? { formula: bare, result: normalizedResult }
            : { formula: bare };
      });
    });
  });
}

function cellHasFormula(cell: ExcelJS.Cell): boolean {
  if (cell.formula) return true;
  const v = cell.value;
  if (typeof v === 'string' && v.startsWith('=')) return true;
  if (v && typeof v === 'object' && 'formula' in v) return true;
  return false;
}

function setCellValue(ws: ExcelJS.Worksheet, address: string, value: ExcelJS.CellValue): void {
  const cell = ws.getCell(address);
  if (cellHasFormula(cell)) return;
  cell.value = value;
}

function setIndexed(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
): void {
  const cell = ws.getCell(row, col);
  if (cellHasFormula(cell) || cell.isMerged) return;
  cell.value = value;
}

function excelDate(value: string): Date | string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function royaltyIncExc(value?: string): 'Inc' | 'Exc' {
  const mode = String(value ?? 'Inc').trim().toLowerCase();
  return mode === 'exc' || mode === 'exclusive' || mode === 'excluded' ? 'Exc' : 'Inc';
}

function writeDelhiRateInputs(
  ws: ExcelJS.Worksheet,
  rowIndex: number,
  row: BhsMisRevIndexedRow,
): void {
  const currency = String(row.currency || 'INR').trim().toUpperCase() || 'INR';
  let usd = row.packagePriceUsd || undefined;
  let inr = row.packagePriceInr || undefined;
  if (currency === 'USD') {
    if (usd == null && inr != null) usd = inr;
    inr = undefined;
  } else {
    if (inr == null && usd != null) inr = usd;
    usd = undefined;
  }
  setIndexedForce(ws, rowIndex, 14, currency);
  setIndexedForce(ws, rowIndex, 15, usd ?? null);
  setIndexedForce(ws, rowIndex, 16, inr ?? null);
  setIndexedForce(ws, rowIndex, 17, row.roeToInr);
  setIndexedForce(ws, rowIndex, 18, royaltyIncExc(row.royaltyMode));
  setIndexedForce(ws, rowIndex, 10, row.currentFlightCount ?? 0);
  setIndexedForce(ws, rowIndex, 11, 0);
  setIndexedForce(ws, rowIndex, 12, 0);
  const base = `ROUND(IFERROR(N(M${rowIndex}),0)*(IFERROR(N(O${rowIndex}),0)+IFERROR(N(P${rowIndex}),0)),0)`;
  setIndexedForce(
    ws,
    rowIndex,
    19,
    `=IF(R${rowIndex}="Exc",${base},IF(B${rowIndex}="Int",${base}*(100-$R$1)/100,${base}))`,
  );
  setIndexedForce(
    ws,
    rowIndex,
    23,
    `=IF(IFERROR(N(O${rowIndex}),0)>0,SUM(S${rowIndex}:V${rowIndex})*IFERROR(N(Q${rowIndex}),1),SUM(S${rowIndex}:V${rowIndex}))`,
  );
}

function setIndexedForce(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
): void {
  const cell = ws.getCell(row, col);
  if (cell.isMerged) return;
  cell.value = value;
}

function replaceMonthTokensInSheet(
  ws: ExcelJS.Worksheet,
  monthToken: string,
  monthTitle: string,
  stationLabel: string,
): void {
  const isChennaiStation = stationLabel.trim().toLowerCase() === 'chennai';
  const scanRows = Math.min(ws.rowCount || ws.actualRowCount || 0, 6);
  const scanCols = Math.min(ws.columnCount || 20, 20);
  for (let r = 1; r <= scanRows; r++) {
    for (let c = 1; c <= scanCols; c++) {
      const cell = ws.getCell(r, c);
      const v = cell.value;
      if (typeof v !== 'string' || v.startsWith('=')) continue;
      let next = v;
      next = next.replace(/[A-Z]{3}-\d{2}/g, monthToken);
      next = next.replace(/for the month of [A-Za-z]+-\d{2}/gi, `for the month of ${monthToken}`);
      next = next.replace(/for the m\/o [A-Za-z]+-\d{2}/gi, `for the m/o ${monthToken}`);
      if (!isChennaiStation) {
        next = next.replace(/Chennai Stat\w*/gi, `${stationLabel} Station`);
        next = next.replace(
          /Bird Airport service\s*\(\s*Chennai\s*\)/gi,
          `Bird Airport service(${stationLabel})`,
        );
        next = next.replace(/\bChennai\b/gi, stationLabel);
      }
      if (next !== v) cell.value = next;
    }
  }
}

function populateScheduleFris(
  ws: ExcelJS.Worksheet,
  flights: BhsMisFlightRow[],
): number {
  const unique = new Map<string, BhsMisFlightRow>();
  for (const row of flights) {
    const key = `${row.flightNo}|${row.aircraftType}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  const maxTemplateRows = 200;
  for (let clearRow = BHS_SCHED_FIRST_ROW; clearRow <= maxTemplateRows; clearRow++) {
    for (let c = 1; c <= 7; c++) {
      const cell = ws.getCell(clearRow, c);
      if (typeof cell.value === 'string' && cell.value.startsWith('=')) continue;
      cell.value = null;
    }
  }
  let offset = 0;
  for (const row of unique.values()) {
    const r = BHS_SCHED_FIRST_ROW + offset;
    setIndexed(ws, r, BHS_SCHED_COL.flightNo, row.flightNo);
    setIndexed(ws, r, BHS_SCHED_COL.aircraftType, row.aircraftType);
    setIndexed(ws, r, BHS_SCHED_COL.sta, row.sta ?? '');
    setIndexed(ws, r, BHS_SCHED_COL.std, row.std ?? '');
    setIndexed(ws, r, BHS_SCHED_COL.dowName, row.scheduleDate ? dayOfWeekShort(row.scheduleDate) : '');
    setIndexed(ws, r, BHS_SCHED_COL.body, row.category?.includes('WB') ? 'WB' : 'NB');
    setIndexed(ws, r, BHS_SCHED_COL.dowNum, row.scheduleDate ? dowNumber(row.scheduleDate) : '');
    offset += 1;
  }
  return unique.size;
}

function writePlain(ws: ExcelJS.Worksheet, row: number, col: number, value: ExcelJS.CellValue): void {
  ws.getCell(row, col).value = value;
}

function excelColNumber(letters: string): number {
  let n = 0;
  for (const ch of String(letters ?? '').toUpperCase()) {
    if (ch < 'A' || ch > 'Z') continue;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function unmergeSheetRegion(
  ws: ExcelJS.Worksheet,
  minRow: number,
  maxCol?: number,
  skipTitleMerge = false,
): void {
  const merges = [
    ...(((ws as unknown as { model?: { merges?: string[] } }).model?.merges ?? []) as string[]),
  ];
  for (const range of merges) {
    const start = /^\$?([A-Z]+)\$?(\d+)/i.exec(range);
    if (!start) continue;
    const startCol = excelColNumber(start[1]);
    const startRow = Number(start[2]);
    if (startRow < minRow) continue;
    if (maxCol && startCol >= maxCol) continue;
    if (skipTitleMerge && startRow === 2 && startCol <= 2) continue;
    try {
      ws.unMergeCells(range);
    } catch {
      /* already split */
    }
  }
}

const RECO_THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

function styleRecoSkdCell(
  cell: ExcelJS.Cell,
  kind: 'header' | 'data' | 'total' | 'plain',
): void {
  const bold = kind === 'header' || kind === 'total';
  cell.font = {
    name: 'Calibri',
    size: 10,
    bold,
    color: { argb: 'FF000000' },
  };
  if (kind === 'header') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
  } else if (kind === 'total') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  } else {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  }
  cell.alignment = {
    horizontal: kind === 'plain' ? 'left' : 'center',
    vertical: 'middle',
    wrapText: kind === 'header',
  };
  cell.border = kind === 'plain' ? {} : RECO_THIN_BORDER;
}

function populateProjSkd(
  ws: ExcelJS.Worksheet,
  flights: BhsMisFlightRow[],
  monthToken: string,
  fromDateStr: string,
  toDateStr: string,
  layoutKind: 'maa' | 'del',
  reco?: RecoSkdMatrix | null,
): ProjSkdMatrix {
  const matrix = buildProjSkdMatrix(flights, fromDateStr, toDateStr);
  const layout = getProjSkdSheetLayout(layoutKind);
  const maxAirlineCols = Math.max(1, layout.protectFromCol - layout.firstAirlineCol - 1);
  const columns = matrix.columns.slice(0, maxAirlineCols);
  const lastAirlineCol = layout.firstAirlineCol + columns.length - 1;
  const totalCol = columns.length > 0 ? lastAirlineCol + 1 : layout.firstAirlineCol;
  const firstDayRow = PROJ_SKD_FIRST_DAY_ROW;
  const lastDayRow = 3 + matrix.numDays;
  const totalRow = lastDayRow + 1;
  const projectedRow = totalRow + 1;
  const diffRow = totalRow + 2;
  const lastAirlineLetter = excelColLetter(Math.max(layout.firstAirlineCol, lastAirlineCol));
  const firstAirlineLetter = excelColLetter(layout.firstAirlineCol);
  const lastWriteCol = Math.min(layout.protectFromCol - 1, Math.max(totalCol, layout.firstAirlineCol));

  unmergeSheetRegion(ws, 2, layout.protectFromCol, true);

  const a2 = ws.getCell('A2');
  if (!cellHasFormula(a2) || typeof a2.value === 'string') {
    a2.value = `Flight Chart for the m/o ${monthToken}`;
  }
  a2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };

  const clearUntil = projSkdClearUntilRow(matrix.numDays, ws.rowCount);
  for (let r = 2; r <= clearUntil; r++) {
    ws.getRow(r).height = r === 2 ? 28 : 16;
    for (let c = 1; c < layout.protectFromCol; c++) {
      if (r === 2 && c <= 2) continue;
      const cell = ws.getCell(r, c);
      cell.value = null;
      styleRecoSkdCell(cell, 'plain');
      cell.border = {};
      cell.numFmt = 'General';
    }
  }

  writePlain(ws, 3, 1, 'Date ');
  if (layout.dayNameCol) {
    writePlain(ws, 3, layout.dayNameCol, 'Days');
  }
  writePlain(ws, 3, layout.weekdayCol, 'Weekdays');

  columns.forEach((col, idx) => {
    const c = layout.firstAirlineCol + idx;
    writePlain(ws, 2, c, (col.aircraftLabel || col.aircraftType).replace(/\s+/g, ' ').trim());
    writePlain(ws, 3, c, col.airlineCode);
    ws.getColumn(c).width = Math.max(11, Math.min(16, (col.aircraftLabel || col.airlineCode).length + 2));
  });
  writePlain(ws, 3, totalCol, layout.totalHeader.replace(/\n/g, ' '));
  ws.getColumn(1).width = 12;
  ws.getColumn(layout.weekdayCol).width = 10;
  if (layout.dayNameCol) ws.getColumn(layout.dayNameCol).width = 8;
  ws.getColumn(totalCol).width = 10;

  for (let c = 1; c <= lastWriteCol; c++) {
    styleRecoSkdCell(ws.getCell(2, c), 'header');
    styleRecoSkdCell(ws.getCell(3, c), 'header');
    ws.getCell(2, c).alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
  }
  styleRecoSkdCell(ws.getCell(2, 1), 'plain');
  ws.getCell(2, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };

  const paint = (r: number, kind: 'data' | 'total') => {
    for (let c = 1; c <= lastWriteCol; c++) {
      const cell = ws.getCell(r, c);
      styleRecoSkdCell(cell, kind);
      if (c === 1 && kind === 'data') cell.numFmt = 'YYYY-MM-DD';
      else if (c >= layout.weekdayCol) cell.numFmt = '0';
    }
  };

  for (let dayNum = 1; dayNum <= matrix.numDays; dayNum++) {
    const r = 3 + dayNum;
    const dayStr = ymdForDay(matrix.year, matrix.month, dayNum);
    if (dayNum === 1) {
      writePlain(ws, r, 1, new Date(Date.UTC(matrix.year, matrix.month - 1, dayNum)));
    } else {
      writePlain(ws, r, 1, { formula: `A${r - 1}+1` });
    }
    if (layout.dayNameCol) {
      writePlain(ws, r, layout.dayNameCol, { formula: `TEXT(A${r},"DDD")` });
    }
    writePlain(ws, r, layout.weekdayCol, { formula: `WEEKDAY(A${r},2)` });
    columns.forEach((col, idx) => {
      writePlain(ws, r, layout.firstAirlineCol + idx, projSkdCount(matrix, dayStr, col.key));
    });
    if (columns.length > 0) {
      writePlain(ws, r, totalCol, {
        formula: `SUM(${firstAirlineLetter}${r}:${lastAirlineLetter}${r})`,
      });
    } else {
      writePlain(ws, r, totalCol, 0);
    }
    paint(r, 'data');
  }

  writePlain(ws, totalRow, 1, 'Total');
  columns.forEach((_, idx) => {
    const letter = excelColLetter(layout.firstAirlineCol + idx);
    writePlain(ws, totalRow, layout.firstAirlineCol + idx, {
      formula: `SUM(${letter}${firstDayRow}:${letter}${lastDayRow})`,
    });
  });
  writePlain(ws, totalRow, totalCol, {
    formula: `SUM(${excelColLetter(totalCol)}${firstDayRow}:${excelColLetter(totalCol)}${lastDayRow})`,
  });
  paint(totalRow, 'total');

  const projected = splitProjectedByAirlineColumns(columns, reco?.rows ?? []);
  writePlain(ws, projectedRow, 1, 'Projected Schedule');
  columns.forEach((_, idx) => {
    writePlain(ws, projectedRow, layout.firstAirlineCol + idx, projected[idx] ?? 0);
  });
  if (columns.length > 0) {
    writePlain(ws, projectedRow, totalCol, {
      formula: `SUM(${firstAirlineLetter}${projectedRow}:${lastAirlineLetter}${projectedRow})`,
    });
  }
  paint(projectedRow, 'data');
  ws.getCell(projectedRow, 1).alignment = { horizontal: 'left', vertical: 'middle' };

  writePlain(ws, diffRow, 1, 'Difference');
  const sumStart = columns.length > 0 ? layout.firstAirlineCol : totalCol;
  for (let c = sumStart; c <= totalCol; c++) {
    const letter = excelColLetter(c);
    writePlain(ws, diffRow, c, {
      formula: `${letter}${totalRow}-${letter}${projectedRow}`,
    });
  }
  paint(diffRow, 'data');
  ws.getCell(diffRow, 1).alignment = { horizontal: 'left', vertical: 'middle' };

  return { ...matrix, columns };
}

function populateRecoSkd(
  ws: ExcelJS.Worksheet,
  matrix: RecoSkdMatrix,
  layoutKind: 'maa' | 'del',
): void {
  const layout = getRecoSkdSheetLayout(layoutKind);
  const dataStart = RECO_SKD_DATA_START_ROW;
  unmergeSheetRegion(ws, 3);
  const clearUntil = recoSkdClearUntilRow(matrix.rows.length, ws.rowCount);
  for (let r = dataStart; r <= clearUntil; r++) {
    const row = ws.getRow(r);
    row.height = 16;
    for (let c = 1; c <= layout.lastWriteCol; c++) {
      const cell = ws.getCell(r, c);
      cell.value = null;
      styleRecoSkdCell(cell, 'plain');
      cell.border = {};
      cell.numFmt = 'General';
    }
  }

  for (let slot = 0; slot < layout.extraSlotCount; slot++) {
    const extra = matrix.extraDays[slot];
    writePlain(
      ws,
      3,
      layout.extraStartCol + slot,
      extra ? `Extra day-${extra.weekday}` : '',
    );
  }
  writePlain(ws, 3, layout.netCurrentCol, `Net Total Flights ${matrix.monthToken}`);
  writePlain(ws, 3, layout.netLastCol, `Net Total Flights ${matrix.prevMonthToken}`);
  for (let c = 1; c <= layout.lastWriteCol; c++) {
    styleRecoSkdCell(ws.getCell(3, c), 'header');
  }

  const numericCols = new Set<number>([
    layout.seriesCol,
    ...Array.from({ length: 7 }, (_, i) => layout.firstWeekdayCol + i),
    layout.weeklyCol,
    layout.opsWeeksCol,
    layout.completedCol,
    ...Array.from({ length: layout.extraSlotCount }, (_, i) => layout.extraStartCol + i),
    layout.totalFlightsCol,
    layout.addLessCol,
    layout.netCurrentCol,
    layout.netLastCol,
    layout.diffCol,
  ]);

  const paintRow = (r: number, kind: 'data' | 'total') => {
    for (let c = 1; c <= layout.lastWriteCol; c++) {
      const cell = ws.getCell(r, c);
      styleRecoSkdCell(cell, kind);
      if (numericCols.has(c)) cell.numFmt = '0';
    }
  };

  matrix.rows.forEach((row, idx) => {
    const r = dataStart + idx;
    writePlain(ws, r, layout.seriesCol, idx + 1);
    writePlain(ws, r, layout.codeCol, row.airlineCode);
    if (layout.flightCol != null) {
      writePlain(ws, r, layout.flightCol, row.flightNo);
    }
    for (let wd = 0; wd < 7; wd++) {
      writePlain(ws, r, layout.firstWeekdayCol + wd, row.weekdayCounts[wd] ?? 0);
    }
    writePlain(ws, r, layout.weeklyCol, row.weeklyTotal);
    writePlain(ws, r, layout.opsWeeksCol, row.fullOpsWeeks);
    writePlain(ws, r, layout.completedCol, row.completedWeeks);
    for (let slot = 0; slot < layout.extraSlotCount; slot++) {
      writePlain(ws, r, layout.extraStartCol + slot, row.extraCounts[slot] ?? 0);
    }
    writePlain(ws, r, layout.totalFlightsCol, row.completedWeeks + row.extraSum);
    writePlain(ws, r, layout.addLessCol, row.addLess);
    writePlain(ws, r, layout.netCurrentCol, row.netCurrent);
    writePlain(ws, r, layout.netLastCol, row.netLast);
    writePlain(ws, r, layout.diffCol, row.diff);
    writePlain(ws, r, layout.reasonCol, row.reason);
    paintRow(r, 'data');
  });

  const first = dataStart;
  const last = dataStart + Math.max(matrix.rows.length, 1) - 1;
  const tot = dataStart + matrix.rows.length;
  writePlain(ws, tot, layout.flightCol ?? layout.codeCol, 'Total');
  const sumCols = [
    ...Array.from({ length: 7 }, (_, i) => layout.firstWeekdayCol + i),
    layout.weeklyCol,
    layout.completedCol,
    ...Array.from({ length: layout.extraSlotCount }, (_, i) => layout.extraStartCol + i),
    layout.totalFlightsCol,
    layout.addLessCol,
    layout.netCurrentCol,
    layout.netLastCol,
    layout.diffCol,
  ];
  if (matrix.rows.length > 0) {
    for (const c of sumCols) {
      const letter = excelColLetter(c);
      writePlain(ws, tot, c, { formula: `SUM(${letter}${first}:${letter}${last})` });
    }
  }
  paintRow(tot, 'total');

  if (layoutKind === 'maa') {
    const reco = tot + 1;
    writePlain(ws, reco, 9, 'Flight Reco:');
    writePlain(ws, reco + 1, 9, `Weekly Flight of ${matrix.prevMonthToken}`);
    writePlain(ws, reco + 1, 11, matrix.weeklyLast);
    writePlain(ws, reco + 2, 9, `Weekly Flight of ${matrix.monthToken}`);
    writePlain(ws, reco + 2, 11, { formula: `K${tot}` });
    writePlain(ws, reco + 3, 9, 'Difference:-');
    writePlain(ws, reco + 3, 11, { formula: `K${reco + 1}-K${reco + 2}` });
    for (let r = reco; r <= reco + 3; r++) {
      styleRecoSkdCell(ws.getCell(r, 9), 'plain');
      styleRecoSkdCell(ws.getCell(r, 11), 'plain');
      ws.getCell(r, 11).numFmt = '0';
      ws.getCell(r, 9).font = { name: 'Calibri', size: 10, bold: r === reco, color: { argb: 'FF000000' } };
    }
  }
}

function populateRevSummaryInputs(
  ws: ExcelJS.Worksheet,
  revRows: BhsMisRevIndexedRow[],
  fromYmd?: string,
): number {
  const startR = BHS_REV_FIRST_ROW;
  const isMaa = ws.name === 'Rev_summary';
  if (!isMaa && fromYmd) {
    const titleCell = ws.getCell(1, 1);
    if (!titleCell.isMerged && typeof titleCell.value === 'string') {
      titleCell.value = stampDelhiRevSummaryTitle(titleCell.value, fromYmd);
    }
    const headers = delhiRevSummaryHeaders(fromYmd);
    setIndexedForce(ws, 2, DEL_REV_COL.prevMonthFlights, headers.flightOf);
    setIndexedForce(ws, 2, DEL_REV_COL.invoiceAmount, headers.invoiceAmount);
    setIndexedForce(ws, 2, DEL_REV_COL.invoiceAmountInr, headers.invoiceInr);
    setIndexedForce(ws, 2, DEL_REV_COL.prevInvoiceAmountInr, headers.prevInr);
    setIndexedForce(ws, 2, DEL_REV_COL.prevMonthOnly, headers.prevOnly);
  }
  const seenInvoiceAirlines = new Set<string>();
  revRows.forEach((row, idx) => {
    const r = startR + idx;
    const airlineName = bhsMisAirlineFullName(row.airlineName, row.customerCode);
    setIndexed(ws, r, BHS_REV_COL.categoryDomInt, row.categoryDomInt);
    if (isMaa) {
      setIndexed(ws, r, BHS_REV_COL.customerCode, row.customerCode);
      setIndexed(ws, r, BHS_REV_COL.airlineName, airlineName);
    } else {
      setIndexedForce(ws, r, BHS_REV_COL.customerCode, airlineName);
      setIndexed(ws, r, BHS_REV_COL.airlineName, row.bodyType || 'NB');
    }
    setIndexed(ws, r, BHS_REV_COL.aircraftType, row.aircraftType);
    setIndexed(ws, r, BHS_REV_COL.bodyType, row.bodyType || 'NB');
    if (isMaa) {
      setIndexed(ws, r, BHS_REV_COL.flightCount, row.flightCount);
    } else if (row.validFrom) {
      const validity = excelDate(row.validFrom);
      const validityCell = ws.getCell(r, BHS_REV_COL.flightCount);
      if (!validityCell.isMerged) {
        validityCell.value = validity;
        validityCell.numFmt = 'MM-DD-YY';
      }
    }
    if (isMaa) {
      setIndexed(ws, r, BHS_REV_COL.category, row.category);
      if (row.validFrom) setIndexed(ws, r, BHS_REV_COL.validFrom, row.validFrom);
      if (row.validTo) setIndexed(ws, r, BHS_REV_COL.validTo, row.validTo);
      setIndexed(ws, r, BHS_REV_COL.currency, row.currency || 'INR');
      setIndexed(ws, r, BHS_REV_COL.roe, row.roeToInr);
      if (row.packagePriceUsd) setIndexed(ws, r, BHS_REV_COL.packagePriceUsd, row.packagePriceUsd);
      if (row.packagePriceInr) setIndexed(ws, r, BHS_REV_COL.packagePriceInr, row.packagePriceInr);
      if (row.royaltyMode) setIndexed(ws, r, BHS_REV_COL.royaltyMode, row.royaltyMode);
    } else {
      writeDelhiRateInputs(ws, r, row);
    }
    if (isMaa && row.invoiceTotal != null) {
      setIndexed(ws, r, BHS_REV_COL.invoiceTotal, row.invoiceTotal);
    }
    if (isMaa && row.invoiceNumber) setIndexed(ws, r, BHS_REV_COL.invoiceNo, row.invoiceNumber);
    if (!isMaa) {
      setIndexedForce(ws, r, DEL_REV_COL.prevMonthFlights, row.prevMonthFlightCount ?? 0);
      const airline = String(row.customerCode ?? '').toUpperCase();
      const firstAirlineRow = airline.length > 0 && !seenInvoiceAirlines.has(airline);
      if (firstAirlineRow) seenInvoiceAirlines.add(airline);
      const invoiceAmount = firstAirlineRow ? (row.invoiceAmount ?? 0) : 0;
      const invoiceInr = firstAirlineRow ? (row.invoiceAmountInr ?? 0) : 0;
      const prevInr = firstAirlineRow ? (row.prevInvoiceAmountInr ?? 0) : 0;
      setIndexedForce(ws, r, DEL_REV_COL.invoiceAmount, invoiceAmount);
      setIndexedForce(ws, r, DEL_REV_COL.invoiceAmountInr, invoiceInr);
      setIndexedForce(ws, r, DEL_REV_COL.prevInvoiceAmountInr, prevInr);
      setIndexedForce(ws, r, DEL_REV_COL.prevMonthOnly, prevInr);
    }
  });

  const endDataRow = Math.max(startR + revRows.length - 1, startR);

  // Clear template placeholder rows beyond endDataRow
  for (let clearR = endDataRow + 1; clearR <= 65; clearR++) {
    for (let c = 1; c <= 40; c++) {
      const cell = ws.getCell(clearR, c);
      if (!cell.isMerged && (!cell.formula || cell.formula.length === 0)) {
        cell.value = null;
      }
    }
  }

  const totalRow = endDataRow + 1;

  if (!isMaa) {
    setCellValue(ws, `D${totalRow}`, 'Total');
    setCellValue(ws, `T${totalRow}`, { formula: `SUM(T${startR}:T${endDataRow})` });
    setCellValue(ws, `U${totalRow}`, { formula: `SUM(U${startR}:U${endDataRow})` });
    setCellValue(ws, `V${totalRow}`, { formula: `SUM(V${startR}:V${endDataRow})` });
    setCellValue(ws, `W${totalRow}`, { formula: `SUM(W${startR}:W${endDataRow})` });
    setCellValue(ws, `X${totalRow}`, { formula: `SUM(X${startR}:X${endDataRow})` });
    setCellValue(ws, `Y${totalRow}`, { formula: `SUM(Y${startR}:Y${endDataRow})` });
    setCellValue(ws, `Z${totalRow}`, { formula: `SUM(Z${startR}:Z${endDataRow})` });
    setCellValue(ws, `AA${totalRow}`, { formula: `SUM(AA${startR}:AA${endDataRow})` });
    setCellValue(ws, `AB${totalRow}`, { formula: `SUM(AB${startR}:AB${endDataRow})` });

    const summaryStart = totalRow + 2;

    setCellValue(ws, `H${summaryStart}`, 'Per Flight');
    setCellValue(ws, `I${summaryStart}`, 'Revenue [Including GST]');
    setCellValue(ws, `J${summaryStart}`, '%');
    setCellValue(ws, `K${summaryStart}`, '# of Flt in CM');
    setCellValue(ws, `L${summaryStart}`, 'INR');
    setCellValue(ws, `M${summaryStart}`, { formula: `AB${totalRow}/SUM(M${startR}:M${endDataRow})` });

    const sDom = summaryStart + 1;
    const sInt = summaryStart + 2;
    const sTot = summaryStart + 3;

    setCellValue(ws, `H${sDom}`, 46446);
    setCellValue(ws, `I${sDom}`, { formula: `SUMIF(B${startR}:B${endDataRow},"Dom",Z${startR}:Z${endDataRow})` });
    setCellValue(ws, `J${sDom}`, { formula: `I${sDom}/I${sTot}` });
    setCellValue(ws, `K${sDom}`, { formula: `SUMIF(B${startR}:B${endDataRow},"Dom",M${startR}:M${endDataRow})` });
    setCellValue(ws, `L${sDom}`, { formula: `IF(K${sDom}>0,I${sDom}/K${sDom},0)` });
    setCellValue(ws, `M${sDom}`, { formula: `L${sDom}-H${sDom}` });

    setCellValue(ws, `H${sInt}`, 46446);
    setCellValue(ws, `I${sInt}`, { formula: `SUMIF(B${startR}:B${endDataRow},"Int",Z${startR}:Z${endDataRow})` });
    setCellValue(ws, `J${sInt}`, { formula: `I${sInt}/I${sTot}` });
    setCellValue(ws, `K${sInt}`, { formula: `SUMIF(B${startR}:B${endDataRow},"Int",M${startR}:M{endDataRow})` });
    setCellValue(ws, `L${sInt}`, { formula: `IF(K${sInt}>0,I${sInt}/K${sInt},0)` });
    setCellValue(ws, `M${sInt}`, { formula: `L${sInt}-H${sInt}` });

    setCellValue(ws, `I${sTot}`, { formula: `SUM(I${sDom}:I${sInt})` });
    setCellValue(ws, `J${sTot}`, { formula: `SUM(J${sDom}:J${sInt})` });
    setCellValue(ws, `K${sTot}`, { formula: `SUM(K${sDom}:K${sInt})` });
    setCellValue(ws, `L${sTot}`, { formula: `IF(K${sTot}>0,I${sTot}/K${sTot},0)` });
    setCellValue(ws, `M${sTot}`, { formula: `L${sTot}-H${sInt}` });
  }

  return revRows.length;
}

function populateAddlXxld(
  ws: ExcelJS.Worksheet,
  flights: BhsMisFlightRow[],
  monthToken: string,
  stationLabel: string,
): number {
  const cancelled = flights.filter((f) => f.cancelled);
  ws.getCell(1, 1).value = `Bird Airport service(${stationLabel}) Private Limited`;
  ws.getCell(2, 1).value = `Details of cancelled flights in ${stationLabel} for the month of ${monthToken}`;
  cancelled.slice(0, 100).forEach((row, idx) => {
    const r = BHS_XXLD_FIRST_ROW + idx;
    const code = (row.customerCode || '').toUpperCase().split('-')[0];
    setIndexed(ws, r, BHS_XXLD_COL.serial, idx + 1);
    setIndexed(ws, r, BHS_XXLD_COL.date, row.scheduleDate);
    setIndexed(ws, r, BHS_XXLD_COL.flightNo, row.flightNo);
    setIndexed(ws, r, BHS_XXLD_COL.aircraftType, row.aircraftType);
    setIndexed(ws, r, BHS_XXLD_COL.customerCode, code);
    setIndexed(ws, r, BHS_XXLD_COL.airlineName, row.airlineName);
    setIndexed(ws, r, BHS_XXLD_COL.qty, 1);
  });
  return cancelled.length;
}

async function buildBhsMisWorkbookExcelJs(
  input: BhsMisExportInput,
  profile: BhsMisStationProfile,
  templatePath: string,
): Promise<Buffer> {
  const templateBytes = readFileSync(templatePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes as unknown as ExcelJS.Buffer);
  materializeSharedFormulas(workbook);

  const monthToken = formatMisMonthToken(input.from);
  const monthTitle = formatMisMonthToken(input.from);

  for (const sheetDef of profile.sheets) {
    const ws = workbook.getWorksheet(sheetDef.sheetName);
    if (!ws) continue;
    replaceMonthTokensInSheet(ws, monthToken, monthTitle, profile.stationLabel);
  }

  if (profile.scheduleSheet) {
    const scheduleWs = workbook.getWorksheet(profile.scheduleSheet);
    if (scheduleWs) populateScheduleFris(scheduleWs, input.flights);
  }

  const recoMatrix = buildRecoSkdMatrix(
    input.scheduleMasters ?? [],
    input.fhrFlights ?? input.flights,
    input.lastMonthFlights ?? input.flights,
    input.from,
    input.to,
  );
  const projWs = workbook.getWorksheet(profile.projSheet);
  if (projWs) {
    populateProjSkd(
      projWs,
      input.flights,
      monthToken,
      input.from,
      input.to,
      profile.layout,
      recoMatrix,
    );
  }
  const recoWs = workbook.getWorksheet(profile.recoSheet);
  if (recoWs) {
    populateRecoSkd(recoWs, recoMatrix, profile.layout);
  }

  const revWs = workbook.getWorksheet(profile.revSummarySheet);
  if (revWs) {
    populateRevSummaryInputs(
      revWs,
      input.revRows ??
        buildBhsMisRevRows(input.priceCardRows, input.invoices, input.flights, input.roeToInr, {
          previousFlights: input.lastMonthFlights,
          previousInvoices: input.previousInvoices,
          previousRoeToInr: input.previousRoeToInr,
        }),
      input.from,
    );
  }

  const addlWs = workbook.getWorksheet('Addl & XXLD Flt');
  if (addlWs) populateAddlXxld(addlWs, input.flights, monthToken, profile.stationLabel);

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export async function buildBhsMisWorkbook(input: BhsMisExportInput): Promise<Buffer> {
  const profile = getBhsMisStationProfile(input.stationCode);
  const templatePath = resolveTemplatePath(profile.templateFile);

  const openpyxlBuffer = await exportBhsMisViaOpenpyxl(input, templatePath, profile);
  if (openpyxlBuffer) return openpyxlBuffer;

  return buildBhsMisWorkbookExcelJs(input, profile, templatePath);
}

function pickScheduledFlightNo(
  op: Record<string, unknown>,
  ref: Record<string, unknown>,
): string {
  const nestedMain =
    op.mainDetails && typeof op.mainDetails === 'object'
      ? (op.mainDetails as Record<string, unknown>)
      : {};
  const nestedTerminal =
    op.terminalDetails && typeof op.terminalDetails === 'object'
      ? (op.terminalDetails as Record<string, unknown>)
      : {};
  const candidates = [
    pickOp(ref, 'flightNo'),
    pickOp(op, 'flightNoEquipmentNo', 'ArrivalFltNo', 'DepartureFltNo'),
    pickOp(nestedMain, 'ArrivalFltNo', 'DepartureFltNo'),
    pickOp(nestedTerminal, 'FlightNo', 'flightNo'),
    pickOp(op, 'flightNo', 'Flight_No', 'Flight No', 'flightNumber'),
  ].filter(Boolean);
  const scheduled = candidates.find((value) => looksLikeScheduledFlightNo(value));
  return scheduled || candidates[0] || '';
}

function pickScheduledAircraftType(op: Record<string, unknown>): string {
  const nested =
    op.mainDetails && typeof op.mainDetails === 'object'
      ? (op.mainDetails as Record<string, unknown>)
      : {};
  const nestedTerminal =
    op.terminalDetails && typeof op.terminalDetails === 'object'
      ? (op.terminalDetails as Record<string, unknown>)
      : {};
  const candidates = [
    pickOp(op, 'TypeCraft', 'typeCraft'),
    pickOp(nested, 'TypeCraft', 'typeCraft', 'aircraftType'),
    pickOp(nestedTerminal, 'TypeCraft', 'typeCraft', 'aircraftType'),
    pickOp(op, 'aircraft', 'Aircraft'),
    pickOp(op, 'aircraftType', 'Aircraft_Type', 'acType'),
  ].filter(Boolean);
  const scored = candidates
    .map((label) => {
      const trimmed = label.replace(/\s+/g, ' ').trim();
      if (!trimmed || /^(NB|WB)$/i.test(trimmed)) return { trimmed, score: -1 };
      let score = trimmed.length;
      if (/\d/.test(trimmed)) score += 10;
      if (/-/.test(trimmed)) score += 5;
      return { trimmed, score };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.trimmed ?? '';
}

export function mapSourceRowToMisFlight(row: Record<string, unknown>): BhsMisFlightRow | null {
  const op = (row.operationalData as Record<string, unknown> | undefined) ?? row;
  const ref = (row.sourceRef as Record<string, unknown> | undefined) ?? {};
  const nestedMain =
    op.mainDetails && typeof op.mainDetails === 'object'
      ? (op.mainDetails as Record<string, unknown>)
      : {};
  const nestedTerminal =
    op.terminalDetails && typeof op.terminalDetails === 'object'
      ? (op.terminalDetails as Record<string, unknown>)
      : {};
  const flightNo = pickScheduledFlightNo(op, ref);
  const scheduleDate =
    normalizeMisScheduleYmd(op.billingDateYmd) ||
    normalizeMisScheduleYmd(pickOp(op, 'scheduleDate', 'staDate', 'STADate', 'STA_Date', 'flightDate')) ||
    normalizeMisScheduleYmd(pickOp(nestedTerminal, 'STADate', 'staDate', 'STA_Date')) ||
    normalizeMisScheduleYmd(pickOp(nestedMain, 'STADate', 'staDate')) ||
    normalizeMisScheduleYmd(pickOp(op, 'sta', 'STA'));
  if (!flightNo || !scheduleDate) return null;
  const category = pickOp(op, 'categoryOfFlight', 'Cate_of_Flight', 'flightCategory');
  const skdNonSkd = pickOp(
    op,
    'skdNonSkd',
    'Skd/Non Skd',
    'flightType',
    'Typeofflight',
    'TypeofFlight',
  ) || pickOp(nestedMain, 'Typeofflight', 'TypeofFlight', 'skdNonSkd');
  const ops = pickOp(op, 'ops', 'opsType', 'typeOfFlight', 'TypeofHandling', 'Typeofflight')
    || pickOp(nestedMain, 'TypeofHandling', 'Typeofflight');
  const bookingNo = pickOp(op, 'bookingNo', 'BookingNo') || pickOp(nestedMain, 'bookingNo');
  const challanNo = pickOp(op, 'challanNo', 'ChallanNo') || pickOp(nestedMain, 'challanNo');
  const flightStatus = pickOp(op, 'flightStatus', 'Flight Status', 'status')
    || pickOp(nestedMain, 'flightStatus', 'Flight Status');
  const cancelled =
    Boolean(row.cancelled) ||
    Boolean(op.isCancelled) ||
    Boolean(op.cancelled) ||
    /canc|xxld|divert/i.test(category) ||
    /canc/i.test(flightNo);
  const eligibility = row.billingEligibility as { eligible?: boolean } | undefined;
  const eligible =
    typeof eligibility?.eligible === 'boolean' ? eligibility.eligible : undefined;
  const rawAirline = pickOp(
    op,
    'airlineCode',
    'AirlineCode',
    'Arline_Code',
    'mainAirlineCode',
    'customerCode',
  );
  const customerCode = airlineCodeFromFlight(rawAirline, flightNo);
  return {
    flightNo,
    aircraftType: pickScheduledAircraftType(op),
    customerCode,
    airlineName: pickOp(op, 'airlineName', 'customerName', 'Airline_Name', 'Airline', 'airline'),
    scheduleDate,
    sta: pickOp(op, 'sta', 'STA'),
    std: pickOp(op, 'std', 'STD'),
    category,
    cancelled,
    eligible,
    skdNonSkd,
    ops,
    bookingNo,
    challanNo,
    flightStatus,
  };
}

/** Drop rows stamped for another station (belt-and-suspenders on login scope). */
export function flightRowMatchesStation(
  row: Record<string, unknown>,
  stationCode: string,
): boolean {
  const expected = String(stationCode ?? '').trim().toUpperCase();
  if (!expected) return true;
  const aliases = new Set([expected]);
  if (expected === 'IXC') aliases.add('CHANDIGARH');
  if (expected === 'CHANDIGARH') aliases.add('IXC');
  if (expected === 'DEL') aliases.add('DELHI');
  if (expected === 'DELHI') aliases.add('DEL');
  if (expected === 'MAA') aliases.add('CHENNAI');
  if (expected === 'CHENNAI') aliases.add('MAA');

  const op = (row.operationalData as Record<string, unknown> | undefined) ?? row;
  const stamped = pickOp(
    op,
    'stationCode',
    'station',
    'Station_Code',
    'StationCode',
    'serviceStation',
  ).toUpperCase();
  if (!stamped) return true;
  return aliases.has(stamped);
}

export { getBhsMisStationProfile, resolveTemplatePath };
export type { BhsMisStationProfile };
