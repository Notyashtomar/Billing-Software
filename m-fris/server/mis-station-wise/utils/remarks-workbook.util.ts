import ExcelJS from 'exceljs';
import type { CalendarMonthSlice } from './station-wise-months.util';
import {
  REMARKS_FLIGHT_COLUMNS,
  REMARKS_SUMMARY_COLUMNS,
  type RemarksAirlineSummary,
  type RemarksMonthBlock,
} from './remarks-layout.util';
import type { RemarksFlightRow } from './remarks-map-fhr.util';

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

/** Zero → dash (same rule as month-sheet preview). */
const ZERO_FMT = '0;-0;"—"';
const PCT_FMT = '0.00%;-0.00%;"—"';

const HEADER_YELLOW: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' },
};

function fillArgb(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thin(cell: ExcelJS.Cell) {
  cell.border = THIN;
}

function writeFlightHeaders(ws: ExcelJS.Worksheet) {
  for (const col of REMARKS_FLIGHT_COLUMNS) {
    const cell = ws.getCell(`${col.letter}1`);
    cell.value = col.label;
    cell.font = { bold: true, name: 'Calibri', size: 11 };
    cell.fill = HEADER_YELLOW;
    thin(cell);
  }
}

function writeSummaryTitle(ws: ExcelJS.Worksheet, sheetName: string) {
  ws.mergeCells('J1:S1');
  const title = ws.getCell('J1');
  title.value = `Summary of Flights - ${sheetName}`;
  title.font = { bold: true, name: 'Calibri', size: 12, color: { argb: 'FF006100' } };
  title.fill = fillArgb('FFC6EFCE');
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  thin(title);
}

function writeSummaryHeaders(ws: ExcelJS.Worksheet) {
  for (const col of REMARKS_SUMMARY_COLUMNS) {
    const cell = ws.getCell(`${col.letter}3`);
    cell.value = col.label;
    cell.font = { bold: true, name: 'Calibri', size: 10 };
    cell.fill = fillArgb(col.fillArgb);
    cell.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    thin(cell);
  }
}

function writeSummaryTotalsRow(
  ws: ExcelJS.Worksheet,
  totals: RemarksAirlineSummary,
  airlineRowCount: number,
) {
  const lastData = 3 + Math.max(1, airlineRowCount);
  const firstData = 4;
  const sumRange = (letter: string) =>
    airlineRowCount > 0
      ? `SUM(${letter}${firstData}:${letter}${lastData})`
      : '0';

  // Row 2 holds SUM totals above headers (template pattern).
  const map: Array<{ letter: string; value: number; formula: string; pct?: boolean }> = [
    { letter: 'K', value: totals.fltCount, formula: sumRange('K') },
    { letter: 'L', value: totals.arlComnt, formula: sumRange('L') },
    { letter: 'N', value: totals.notSatisfactory, formula: sumRange('N') },
    { letter: 'O', value: totals.belowAverage, formula: sumRange('O') },
    { letter: 'P', value: totals.satisfactory, formula: sumRange('P') },
    { letter: 'Q', value: totals.good, formula: sumRange('Q') },
    { letter: 'R', value: totals.excellent, formula: sumRange('R') },
    { letter: 'S', value: totals.blanks, formula: sumRange('S') },
  ];

  for (const item of map) {
    const cell = ws.getCell(`${item.letter}2`);
    cell.value = { formula: item.formula, result: item.value };
    cell.numFmt = ZERO_FMT;
    cell.font = { bold: true, name: 'Calibri', size: 10 };
    thin(cell);
  }
}

function writeAirlineSummaryRow(
  ws: ExcelJS.Worksheet,
  rowIndex: number,
  airline: RemarksAirlineSummary,
) {
  const j = ws.getCell(`J${rowIndex}`);
  j.value = airline.airline;
  thin(j);

  const k = ws.getCell(`K${rowIndex}`);
  k.value = {
    formula: `COUNTIF(B:B,J${rowIndex})`,
    result: airline.fltCount,
  };
  k.numFmt = ZERO_FMT;
  thin(k);

  const l = ws.getCell(`L${rowIndex}`);
  l.value = {
    formula: `COUNTIFS(B:B,J${rowIndex},H:H,\"*\")`,
    result: airline.arlComnt,
  };
  l.numFmt = ZERO_FMT;
  thin(l);

  const m = ws.getCell(`M${rowIndex}`);
  m.value = {
    formula: `IF(K${rowIndex}=0,0,L${rowIndex}/K${rowIndex})`,
    result: airline.comntPct,
  };
  m.numFmt = PCT_FMT;
  thin(m);

  const ratingCols: Array<{
    letter: string;
    headerLetter: string;
    value: number;
  }> = [
    { letter: 'N', headerLetter: 'N', value: airline.notSatisfactory },
    { letter: 'O', headerLetter: 'O', value: airline.belowAverage },
    { letter: 'P', headerLetter: 'P', value: airline.satisfactory },
    { letter: 'Q', headerLetter: 'Q', value: airline.good },
    { letter: 'R', headerLetter: 'R', value: airline.excellent },
  ];

  for (const col of ratingCols) {
    const cell = ws.getCell(`${col.letter}${rowIndex}`);
    cell.value = {
      formula: `COUNTIFS(B:B,J${rowIndex},I:I,${col.headerLetter}$3)`,
      result: col.value,
    };
    cell.numFmt = ZERO_FMT;
    thin(cell);
  }

  const s = ws.getCell(`S${rowIndex}`);
  s.value = {
    formula: `COUNTIFS(B:B,J${rowIndex},I:I,\"\")`,
    result: airline.blanks,
  };
  s.numFmt = ZERO_FMT;
  thin(s);
}

function writeFlightRows(ws: ExcelJS.Worksheet, flights: RemarksFlightRow[]) {
  flights.forEach((flight, idx) => {
    const r = idx + 2;
    ws.getCell(`A${r}`).value =
      typeof flight.serialNo === 'number' ? flight.serialNo : flight.serialNo || '';
    ws.getCell(`B${r}`).value = flight.airline;
    ws.getCell(`C${r}`).value = flight.flightNo;
    ws.getCell(`D${r}`).value = flight.typeCraft;
    ws.getCell(`E${r}`).value = flight.ataTime;
    ws.getCell(`F${r}`).value = flight.ataDate;
    ws.getCell(`G${r}`).value = flight.airRep || null;
    ws.getCell(`H${r}`).value = flight.airRepRem || null;
    ws.getCell(`I${r}`).value = flight.ratingValue || null;
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
      thin(ws.getCell(`${letter}${r}`));
    }
  });
}

function setColumnWidths(ws: ExcelJS.Worksheet) {
  const widths: Record<string, number> = {
    A: 10,
    B: 20,
    C: 14,
    D: 12,
    E: 10,
    F: 12,
    G: 16,
    H: 36,
    I: 14,
    J: 22,
    K: 10,
    L: 10,
    M: 9,
    N: 15,
    O: 14,
    P: 12,
    Q: 8,
    R: 10,
    S: 8,
  };
  for (const [col, width] of Object.entries(widths)) {
    ws.getColumn(col).width = width;
  }
  ws.getRow(3).height = 30;
}

function writeMonthSheet(wb: ExcelJS.Workbook, block: RemarksMonthBlock) {
  const ws = wb.addWorksheet(block.sheetName);
  writeFlightHeaders(ws);
  writeFlightRows(ws, block.flights);
  writeSummaryTitle(ws, block.sheetName);
  writeSummaryHeaders(ws);
  writeSummaryTotalsRow(ws, block.totals, block.airlines.length);
  block.airlines.forEach((airline, idx) => {
    writeAirlineSummaryRow(ws, 4 + idx, airline);
  });
  setColumnWidths(ws);
}

export async function buildRemarksWorkbook(input: {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  months: CalendarMonthSlice[];
  monthBlocks: RemarksMonthBlock[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FRIS MIS Remarks';
  wb.created = new Date();

  for (const block of input.monthBlocks) {
    writeMonthSheet(wb, block);
  }

  if (input.monthBlocks.length === 0) {
    const ws = wb.addWorksheet('EMPTY');
    ws.getCell('A1').value = `No flights for ${input.stationLabel} (${input.from} – ${input.to})`;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Download name: MIS_REMARKS_MAA_JAN TO MARCH 26.xlsx style. */
export function remarksExportFileName(
  stationCode: string,
  fromYmd: string,
  toYmd: string,
): string {
  const code = String(stationCode ?? '').trim().toUpperCase() || 'STN';
  const from = /^(\d{4})-(\d{2})/.exec(fromYmd);
  const to = /^(\d{4})-(\d{2})/.exec(toYmd);
  if (!from || !to) return `MIS_REMARKS_${code}.xlsx`;

  const monthToken = (ym: RegExpExecArray) => {
    const idx = Number(ym[2]) - 1;
    if (idx === 2) return 'MARCH';
    const abbr = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][
      idx
    ];
    return abbr ?? 'UNK';
  };

  const yy = (ym: RegExpExecArray) => String(ym[1]).slice(-2);
  const sameMonth = from[1] === to[1] && from[2] === to[2];
  if (sameMonth) {
    return `MIS_REMARKS_${code}_${monthToken(from)} ${yy(from)}.xlsx`;
  }
  if (from[1] === to[1]) {
    return `MIS_REMARKS_${code}_${monthToken(from)} TO ${monthToken(to)} ${yy(to)}.xlsx`;
  }
  return `MIS_REMARKS_${code}_${monthToken(from)} ${yy(from)} TO ${monthToken(to)} ${yy(to)}.xlsx`;
}
