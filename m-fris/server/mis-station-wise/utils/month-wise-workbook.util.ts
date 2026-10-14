import ExcelJS from 'exceljs';
import type { AirlineReportMetricKey } from './station-wise-airline-report.util';
import {
  MONTH_WISE_COLUMNS,
  MONTH_WISE_PERFORMANCE_LABELS,
  type MonthWiseAirlineBlock,
  type MonthWisePerformance,
} from './month-wise-layout.util';
import { formatRangeLabel, type CalendarMonthSlice } from './station-wise-months.util';

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

function setNum(
  cell: ExcelJS.Cell,
  formula: string,
  result: number,
  pct = false,
) {
  cell.value = { formula, result };
  cell.numFmt = pct ? PCT_FMT : ZERO_FMT;
  thin(cell);
}

function monthSerial(fromYmd: string): Date {
  const [y, m] = fromYmd.split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, 1));
}

function writeAirlineSheet(
  wb: ExcelJS.Workbook,
  block: MonthWiseAirlineBlock,
  input: {
    stationLabel: string;
    stationCode: string;
    from: string;
    to: string;
    yearLabel: string;
  },
) {
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
    setNum(cell, `${col.letter}1/$P$1`, block.totals.total === 0 ? 0 : block.totals[col.key] / block.totals.total, true);
  }

  ws.mergeCells('A3:P3');
  const title = ws.getCell('A3');
  title.value = `AIRLINE : ${block.name} ${input.yearLabel} , ${input.stationCode}`;
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
        setNum(
          cell,
          `B${r}+C${r}+H${r}`,
          month.metrics.total,
        );
      } else {
        cell.value = month.metrics[col.key];
        cell.numFmt = ZERO_FMT;
        thin(cell);
      }
    }
  });

  const perfStart = 6;
  ws.mergeCells(`R${perfStart}:U${perfStart}`);
  ws.getCell(`R${perfStart}`).value = 'Performance report';
  ws.getCell(`R${perfStart}`).font = { bold: true, name: 'Calibri' };
  ws.getCell(`R${perfStart}`).fill = PERF_FILL;
  thin(ws.getCell(`R${perfStart}`));
  ws.getCell('V6').value = 'Flt';
  ws.getCell('W6').value = '%';
  ws.getCell('V6').fill = PERF_FILL;
  ws.getCell('W6').fill = PERF_FILL;
  ws.getCell('V6').font = { bold: true };
  ws.getCell('W6').font = { bold: true };
  thin(ws.getCell('V6'));
  thin(ws.getCell('W6'));

  const p = block.performance;
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

function summaryMetric(
  perf: MonthWisePerformance,
  key: keyof MonthWisePerformance,
): number {
  return perf[key];
}

function writeSummarySheet(
  wb: ExcelJS.Workbook,
  input: {
    stationLabel: string;
    stationCode: string;
    from: string;
    to: string;
    yearLabel: string;
    combined: MonthWiseAirlineBlock;
    airlines: MonthWiseAirlineBlock[];
  },
) {
  const ws = wb.addWorksheet('SUMMARY', { properties: { tabColor: { argb: 'FFFFFF00' } } });
  const rows = input.airlines;
  const keys: Array<{ col: string; key: keyof MonthWisePerformance; label: string; fill?: string }> = [
    { col: 'B', key: 'onTime', label: 'Flights Operated On Time', fill: 'FFC6EFCE' },
    { col: 'C', key: 'cancelled', label: 'Cancelled Flights', fill: 'FFF8CBAD' },
    { col: 'D', key: 'offSked', label: 'Flights Operated Off-Sked', fill: 'FFA9D08E' },
    { col: 'E', key: 'gtSaved', label: 'Ground Time Saved', fill: 'FFC6EFCE' },
    { col: 'F', key: 'beforeStd', label: 'Departed Or Before STD', fill: 'FFC6EFCE' },
    { col: 'G', key: 'nonGha', label: 'AGT > SGT (Reasons Not Attributable To GHA)', fill: 'FFA9D08E' },
    { col: 'H', key: 'gha', label: 'Improvement For GHA', fill: 'FFF8CBAD' },
    { col: 'I', key: 'total', label: 'Total Flights', fill: 'FFDDEBF7' },
  ];

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

  ws.getCell('A2').value = `${input.stationCode} ${input.yearLabel}`;
  ws.getCell('A2').font = { bold: true, color: { argb: 'FF0070C0' } };
  thin(ws.getCell('A2'));
  keys.forEach((k, i) => {
    const nos = ws.getCell(2, i + 2);
    nos.value = k.label;
    nos.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    nos.font = { bold: true, name: 'Calibri', size: 11 };
    if (k.fill) nos.fill = fillArgb(k.fill);
    thin(nos);
    const pct = ws.getCell(2, i + 11);
    pct.value = k.label;
    pct.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
    pct.font = { bold: true, name: 'Calibri', size: 11 };
    if (k.fill) pct.fill = fillArgb(k.fill);
    thin(pct);
  });
  ws.getRow(2).height = 48;
  ws.getCell('J2').fill = GAP_YELLOW;

  const nosLetters = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;
  const pctLetters = ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'] as const;

  rows.forEach((airline, i) => {
    const r = 3 + i;
    ws.getCell(`A${r}`).value = airline.code || airline.name;
    ws.getCell(`A${r}`).font = { bold: true };
    thin(ws.getCell(`A${r}`));
    keys.forEach((k, ci) => {
      const n = summaryMetric(airline.performance, k.key);
      const cell = ws.getCell(`${nosLetters[ci]}${r}`);
      cell.value = n;
      cell.numFmt = ZERO_FMT;
      cell.alignment = { horizontal: 'center' };
      thin(cell);
      setNum(
        ws.getCell(`${pctLetters[ci]}${r}`),
        `${nosLetters[ci]}${r}/$I${r}`,
        airline.performance.total === 0 ? 0 : n / airline.performance.total,
        true,
      );
    });
  });

  const totalRow = 3 + rows.length;
  ws.getCell(`A${totalRow}`).value = 'TOTAL';
  ws.getCell(`A${totalRow}`).font = { bold: true };
  thin(ws.getCell(`A${totalRow}`));
  const first = 3;
  const last = Math.max(2, totalRow - 1);
  const rangeTot = rows.reduce((acc, a) => acc + a.performance.total, 0);
  keys.forEach((k, ci) => {
    const L = nosLetters[ci]!;
    const sum = rows.reduce((acc, a) => acc + summaryMetric(a.performance, k.key), 0);
    setNum(
      ws.getCell(`${L}${totalRow}`),
      rows.length === 0 ? '0' : `SUM(${L}${first}:${L}${last})`,
      sum,
    );
    setNum(
      ws.getCell(`${pctLetters[ci]}${totalRow}`),
      `${L}${totalRow}/$I${totalRow}`,
      rangeTot === 0 ? 0 : sum / rangeTot,
      true,
    );
  });

  ws.getCell('A1').note = `${input.stationLabel} · ${formatRangeLabel(input.from, input.to)}`;
  ws.getColumn('A').width = 28;
  for (let c = 2; c <= 18; c += 1) ws.getColumn(c).width = c === 10 ? 3 : 14;
}

export type MonthWiseWorkbookInput = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  months: CalendarMonthSlice[];
  combined: MonthWiseAirlineBlock;
  airlines: MonthWiseAirlineBlock[];
};

export async function buildMonthWiseWorkbook(
  input: MonthWiseWorkbookInput,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FRIS';
  const yearLabel = input.from.slice(0, 4);
  writeSummarySheet(wb, { ...input, yearLabel });
  writeAirlineSheet(wb, input.combined, {
    stationLabel: input.stationLabel,
    stationCode: input.stationCode,
    from: input.from,
    to: input.to,
    yearLabel,
  });
  for (const airline of input.airlines) {
    writeAirlineSheet(wb, airline, {
      stationLabel: input.stationLabel,
      stationCode: input.stationCode,
      from: input.from,
      to: input.to,
      yearLabel,
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export type { MonthWisePerformance, AirlineReportMetricKey };
