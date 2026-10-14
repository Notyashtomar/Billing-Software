import ExcelJS from 'exceljs';
import type { AirlineWiseAirlineBlock, AirlineWiseStationBlock } from './airline-wise-layout.util';
import {
  MONTH_WISE_COLUMNS,
  MONTH_WISE_PERFORMANCE_LABELS,
  type MonthWiseAirlineBlock,
} from './month-wise-layout.util';
import { formatRangeLabel } from './station-wise-months.util';

const ZERO_FMT = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';
const PCT_FMT = '0.00%;-0.00%;"-"';
const HEADER_TEAL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF00B0F0' },
};
const TITLE_YELLOW: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFFC1' },
};
const PCT_GREEN: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF99FF99' },
};
const SUMMARY_TITLE: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC9FFC9' },
};
const PERF_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF66FF99' },
};
const GAP_YELLOW: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
};
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

function thin(cell: ExcelJS.Cell) {
  cell.border = THIN;
}

function fillArgb(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function setNum(cell: ExcelJS.Cell, formula: string, result: number, pct = false) {
  cell.value = { formula, result };
  cell.numFmt = pct ? PCT_FMT : ZERO_FMT;
  thin(cell);
}

function monthSerial(fromYmd: string): Date {
  const [y, m] = fromYmd.split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, 1));
}

function writeStationSheet(
  wb: ExcelJS.Workbook,
  airline: AirlineWiseAirlineBlock,
  station: AirlineWiseStationBlock,
  yearLabel: string,
) {
  const block: MonthWiseAirlineBlock = {
    name: airline.name,
    code: airline.code,
    sheetName: station.sheetName,
    months: station.months,
    totals: station.totals,
    performance: station.performance,
  };
  const ws = wb.addWorksheet(block.sheetName);

  ws.getCell('A1').value = 'TOTAL IN NOS.';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFF0066' }, name: 'Calibri', size: 11 };
  ws.getCell('A1').fill = TITLE_YELLOW;
  thin(ws.getCell('A1'));

  for (const col of MONTH_WISE_COLUMNS) {
    const cell = ws.getCell(`${col.letter}1`);
    cell.font = { bold: true, color: { argb: 'FFFF0066' }, name: 'Calibri', size: 11 };
    cell.fill = TITLE_YELLOW;
    setNum(cell, `SUM(${col.letter}5:${col.letter}1048576)`, block.totals[col.key]);
  }

  ws.getCell('A2').value = 'TOTAL IN %';
  ws.getCell('A2').fill = PCT_GREEN;
  thin(ws.getCell('A2'));
  for (const col of MONTH_WISE_COLUMNS) {
    const cell = ws.getCell(`${col.letter}2`);
    cell.fill = PCT_GREEN;
    setNum(
      cell,
      `${col.letter}1/$P$1`,
      block.totals.total === 0 ? 0 : block.totals[col.key] / block.totals.total,
      true,
    );
  }

  ws.mergeCells('A3:P3');
  const title = ws.getCell('A3');
  title.value = `AIRLINE : ${block.name} ${yearLabel} , ${station.stationCode}`;
  title.font = { bold: true, size: 12, color: { argb: 'FF0070C0' }, name: 'Calibri' };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  thin(title);

  ws.getCell('A4').value = 'MONTH';
  ws.getCell('A4').fill = HEADER_TEAL;
  ws.getCell('A4').font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  ws.getCell('A4').alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
  thin(ws.getCell('A4'));

  for (const col of MONTH_WISE_COLUMNS) {
    const cell = ws.getCell(`${col.letter}4`);
    cell.value = col.label;
    cell.font = {
      bold: col.tone === 'xxld' || col.tone === 'total',
      color: { argb: col.fontArgb ?? 'FF000000' },
      name: 'Calibri',
      size: 11,
    };
    if (col.fillArgb) cell.fill = fillArgb(col.fillArgb);
    cell.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    thin(cell);
  }
  ws.getRow(4).height = 72;

  block.months.forEach((month, i) => {
    const r = 5 + i;
    const a = ws.getCell(`A${r}`);
    a.value = monthSerial(month.from);
    a.numFmt = 'mmm-yy';
    thin(a);
    for (const col of MONTH_WISE_COLUMNS) {
      const cell = ws.getCell(`${col.letter}${r}`);
      if (col.key === 'total') {
        setNum(cell, `B${r}+C${r}+H${r}`, month.metrics.total);
      } else {
        cell.value = month.metrics[col.key];
        cell.numFmt = ZERO_FMT;
        thin(cell);
      }
    }
  });

  const p = block.performance;
  ws.mergeCells('R6:U6');
  ws.getCell('R6').value = 'Performance report';
  ws.getCell('R6').font = { bold: true, name: 'Calibri' };
  ws.getCell('R6').fill = PERF_FILL;
  thin(ws.getCell('R6'));
  ws.getCell('V6').value = 'Flt';
  ws.getCell('W6').value = '%';
  ws.getCell('V6').fill = PERF_FILL;
  ws.getCell('W6').fill = PERF_FILL;
  ws.getCell('V6').font = { bold: true };
  ws.getCell('W6').font = { bold: true };
  thin(ws.getCell('V6'));
  thin(ws.getCell('W6'));

  const perfDefs: Array<{ row: number; label: string; flt: string; count: number }> = [
    { row: 7, label: MONTH_WISE_PERFORMANCE_LABELS[0], flt: 'I1', count: p.onTime },
    { row: 8, label: MONTH_WISE_PERFORMANCE_LABELS[1], flt: 'B1', count: p.cancelled },
    { row: 9, label: MONTH_WISE_PERFORMANCE_LABELS[2], flt: 'SUM(V10:V13)', count: p.offSked },
    { row: 10, label: MONTH_WISE_PERFORMANCE_LABELS[3], flt: 'D1+E1+K1', count: p.gtSaved },
    { row: 11, label: MONTH_WISE_PERFORMANCE_LABELS[4], flt: 'L1+M1', count: p.beforeStd },
    { row: 12, label: MONTH_WISE_PERFORMANCE_LABELS[5], flt: 'F1+N1', count: p.nonGha },
    { row: 13, label: MONTH_WISE_PERFORMANCE_LABELS[6], flt: 'G1+O1', count: p.gha },
    { row: 14, label: MONTH_WISE_PERFORMANCE_LABELS[7], flt: 'V7+V8+V9', count: p.total },
  ];
  for (const item of perfDefs) {
    ws.mergeCells(`R${item.row}:U${item.row}`);
    ws.getCell(`R${item.row}`).value = item.label;
    ws.getCell(`R${item.row}`).font = {
      bold: item.row === 7 || item.row === 8 || item.row === 9 || item.row === 14,
      name: 'Calibri',
    };
    thin(ws.getCell(`R${item.row}`));
    setNum(ws.getCell(`V${item.row}`), item.flt, item.count);
    setNum(
      ws.getCell(`W${item.row}`),
      `V${item.row}/$V$14`,
      p.total === 0 ? 0 : item.count / p.total,
      true,
    );
  }

  ws.getColumn('A').width = 12;
  for (const col of MONTH_WISE_COLUMNS) {
    ws.getColumn(col.letter).width = 13;
  }
  ws.getColumn('R').width = 42;
  ws.getColumn('V').width = 10;
  ws.getColumn('W').width = 10;
}

const SUMMARY_KEYS: Array<{
  key: keyof AirlineWiseStationBlock['performance'];
  label: string;
  fill?: string;
}> = [
  { key: 'onTime', label: 'Flights Operated On Time', fill: 'FFC6EFCE' },
  { key: 'cancelled', label: 'Cancelled Flights', fill: 'FFF8CBAD' },
  { key: 'offSked', label: 'Flights Operated Off-Sked', fill: 'FFA9D08E' },
  { key: 'gtSaved', label: 'Ground Time Saved', fill: 'FFC6EFCE' },
  { key: 'beforeStd', label: 'Departed Or Before STD', fill: 'FFC6EFCE' },
  { key: 'nonGha', label: 'AGT > SGT (Reasons Not Attributable To GHA)', fill: 'FFA9D08E' },
  { key: 'gha', label: 'Improvement For GHA', fill: 'FFF8CBAD' },
  { key: 'total', label: 'Total Flights', fill: 'FFDDEBF7' },
];

const NOS_LETTERS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;
const PCT_LETTERS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'] as const;

/** Returns the TOTAL row index after writing STATIONS {year} + station rows. */
function writeStationsYearBlock(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  yearLabel: string,
  stations: AirlineWiseStationBlock[],
): number {
  ws.getCell(`A${headerRow}`).value = `STATIONS ${yearLabel}`;
  ws.getCell(`A${headerRow}`).font = { bold: true, color: { argb: 'FF0070C0' } };
  thin(ws.getCell(`A${headerRow}`));
  SUMMARY_KEYS.forEach((k, i) => {
    const nos = ws.getCell(headerRow, i + 2);
    nos.value = k.label;
    nos.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    nos.font = { bold: true, name: 'Calibri', size: 11 };
    if (k.fill) nos.fill = fillArgb(k.fill);
    thin(nos);
    const pct = ws.getCell(headerRow, i + 11);
    pct.value = k.label;
    pct.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    pct.font = { bold: true, name: 'Calibri', size: 11 };
    if (k.fill) pct.fill = fillArgb(k.fill);
    thin(pct);
  });
  ws.getRow(headerRow).height = 48;
  ws.getCell(headerRow, 10).fill = GAP_YELLOW;

  const first = headerRow + 1;
  stations.forEach((station, i) => {
    const r = first + i;
    ws.getCell(`A${r}`).value = station.stationCode;
    ws.getCell(`A${r}`).font = { bold: true };
    thin(ws.getCell(`A${r}`));
    SUMMARY_KEYS.forEach((k, ci) => {
      const n = station.performance[k.key];
      const cell = ws.getCell(`${NOS_LETTERS[ci]}${r}`);
      cell.value = n;
      cell.numFmt = ZERO_FMT;
      cell.alignment = { horizontal: 'center' };
      thin(cell);
      setNum(
        ws.getCell(`${PCT_LETTERS[ci]}${r}`),
        `${NOS_LETTERS[ci]}${r}/$I${r}`,
        station.performance.total === 0 ? 0 : n / station.performance.total,
        true,
      );
    });
  });

  const totalRow = first + stations.length;
  ws.getCell(`A${totalRow}`).value = 'TOTAL';
  ws.getCell(`A${totalRow}`).font = { bold: true };
  thin(ws.getCell(`A${totalRow}`));
  const last = Math.max(headerRow, totalRow - 1);
  const rangeTot = stations.reduce((acc, a) => acc + a.performance.total, 0);
  SUMMARY_KEYS.forEach((k, ci) => {
    const L = NOS_LETTERS[ci]!;
    const sum = stations.reduce((acc, a) => acc + a.performance[k.key], 0);
    setNum(
      ws.getCell(`${L}${totalRow}`),
      stations.length === 0 ? '0' : `SUM(${L}${first}:${L}${last})`,
      sum,
    );
    setNum(
      ws.getCell(`${PCT_LETTERS[ci]}${totalRow}`),
      `${L}${totalRow}/$I${totalRow}`,
      rangeTot === 0 ? 0 : sum / rangeTot,
      true,
    );
  });
  return totalRow;
}

function writeSummarySheet(
  wb: ExcelJS.Workbook,
  airline: AirlineWiseAirlineBlock,
  input: { from: string; to: string; yearLabel: string },
) {
  const ws = wb.addWorksheet('SUMMARY', { properties: { tabColor: { argb: 'FFFFFF00' } } });

  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = 'PEFORMANCE REPORT IN NOS.';
  ws.getCell('A1').fill = SUMMARY_TITLE;
  ws.getCell('A1').font = { bold: true, name: 'Calibri' };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  thin(ws.getCell('A1'));
  ws.mergeCells('K1:R1');
  ws.getCell('K1').value = 'PEFORMANCE REPORT IN %';
  ws.getCell('K1').fill = SUMMARY_TITLE;
  ws.getCell('K1').font = { bold: true, name: 'Calibri' };
  ws.getCell('K1').alignment = { horizontal: 'center' };
  thin(ws.getCell('K1'));

  const currentEnd = writeStationsYearBlock(ws, 2, input.yearLabel, airline.stations);
  const prior = airline.priorYear;
  if (prior && prior.flights > 0) {
    const priorYear = String(Number(input.yearLabel) - 1 || '').trim() || input.yearLabel;
    writeStationsYearBlock(ws, currentEnd + 2, priorYear, prior.stations);
  }

  ws.getCell('A1').note = `${airline.name} · ${formatRangeLabel(input.from, input.to)}`;
  ws.getColumn('A').width = 16;
  for (let c = 2; c <= 18; c += 1) ws.getColumn(c).width = c === 10 ? 3 : 14;
}

export async function buildAirlineWiseWorkbook(input: {
  airline: AirlineWiseAirlineBlock;
  from: string;
  to: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FRIS';
  const yearLabel = input.from.slice(0, 4);
  writeSummarySheet(wb, input.airline, { from: input.from, to: input.to, yearLabel });
  for (const station of input.airline.stations) {
    writeStationSheet(wb, input.airline, station, yearLabel);
  }
  const prior = input.airline.priorYear;
  if (prior && prior.flights > 0) {
    const priorYear = String(Number(yearLabel) - 1);
    for (const station of prior.stations) {
      writeStationSheet(wb, { ...prior, name: `${prior.name} ${priorYear}` }, station, priorYear);
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
