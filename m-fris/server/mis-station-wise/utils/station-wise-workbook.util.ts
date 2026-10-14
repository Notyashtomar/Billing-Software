import ExcelJS from 'exceljs';
import type { CalendarMonthSlice } from './station-wise-months.util';
import { formatRangeLabel, ymdToExcelSerial } from './station-wise-months.util';
import {
  COMBINED_FORMULAS,
  GHA_CODE_COLS,
  GHA_TIME_BUCKET_COLS,
  GT_BUCKET_COLS,
  NON_GHA_TIME_BUCKET_COLS,
  ROW2_TOTAL_FORMULAS,
  airlineRowFormulas,
  bucketThresholdExcel,
  dataRowFormulas,
  performanceFormulas,
  previewAirlineSumif,
  previewSumFormula,
} from './station-wise-formulas.util';
import { evaluateStationWiseRow } from './station-wise-evaluate.util';
import type { StationWiseInputRow } from './station-wise-map-fhr.util';
import { parseToYmd } from './station-wise-map-fhr.util';
import {
  AIRLINE_REPORT_METRIC_KEYS,
  buildAirlineFlightReport,
  compareAirlineName,
} from './station-wise-airline-report.util';
import {
  STATION_WISE_CF_RULES,
  resolveStationWiseCellHighlight,
} from './station-wise-conditional-format.util';

/** MAA bird-report header palette (dark blue + yellow text). */
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF002060' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFF00' },
  size: 9,
  name: 'Calibri',
};
const SECTION_GHA_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFBDFFD3' },
};
const SECTION_GHA_CODES_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFDDFF' },
};
const SECTION_FINAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFAFCFFF' },
};
const FINAL_DW_EA_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFBDFFD3' },
};
const FINAL_EB_EJ_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFFC9' },
};
const AIRLINE_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFCDF2FF' },
};
const PREVIEW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFECFDF5' },
};
const SECTION_DELAY_CODES_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2D5F1' },
};
const SECTION_NON_GHA_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF2DCDB' },
};

const COL_A_T = [
  'SerialNo',
  'Airline',
  'FlightNo',
  'TypeCraft',
  'STATime',
  'STADate',
  'STDTime',
  'STDDate',
  'ATATime',
  'ATADate',
  'ATDTime',
  'ATDDate',
  'Delay',
  'ActualDelay',
  'delay1',
  'ReasonofDelay',
  'delay2',
  'delaycode2',
  'delay3',
  'delaycode3',
] as const;

const FORMULA_HEADERS: Record<string, string> = {
  U: 'Diff Arr Date',
  V: 'Diff Dep Date',
  W: 'Late ATA',
  X: 'Late ATD',
  Y: 'Delay Status',
  Z: 'Delay Category',
  AA: 'Code 1',
  AB: 'Code 1 Time',
  AC: 'Code 2',
  AD: 'Code 2 Time',
  AE: 'Code 3',
  AF: 'Code 3 Time',
  BB: 'Total',
  BC: 'GHA Delays',
  BD: 'XXLD Flt',
  BE: '# of XXLD Flt',
  BF: 'STD GT',
  BG: 'ACTUAL GT',
  BH: 'GT SAVED',
  CB: 'Total delay',
  CC: 'Flights within STA & STD',
  CD: 'Actual GT=< STD GT',
  CE: 'AGT > SGT',
  DA: 'Non GHA Delay',
  DB: 'Non GHA Delay Time',
  DW: 'Flights Arrived Later Than STA',
  DX: 'And Departed On Or Before STD',
  DY: 'Departed Post STD but AGT <= SGT',
  DZ: 'AGT > SGT (Reasons Not Attributable To GHA)',
  EA: 'AGT > SGT (Reasons Not Attributable to GHA)',
  EB: 'Flights Arrived on or Before STA',
  EC: 'On Time Flights',
  ED: 'Before STA Flights',
  EE: 'Departed Before STD & AGT < SGT',
  EF: 'Departed Before STD & AGT = SGT',
  EG: ' Exceeding SGT But Before STD',
  EH: 'Exceeding SGT and Also After STD',
  EI: 'AGT > SGT & Departed post STD (Reasons Not Attributable)',
  EJ: 'AGT > SGT & Departed post STD (Reasons Attributable)',
};

const AIRLINE_HEADERS: Record<string, string> = {
  EL: 'FLIGHT CATEGORY AND AIRLINE',
  EM: 'XXLD Flight',
  EN: 'Flight Arrived Later Than STA',
  EO: 'Departed On Or Before STD',
  EP: 'Departed Post STD but AGT < = SGT',
  EQ: 'AGT > SGT (Reasons Not Attributable to GHA)',
  ER: 'AGT > SGT (Reasons Attributable to GHA)',
  ES: 'Flights Arrived On Or Before STA',
  ET: 'On Time Flights',
  EU: 'Before STA Flights',
  EV: 'Departed Before STD & AGT < SGT',
  EW: 'Departed Before STD & AGT = SGT',
  EX: 'Exceeding SGT But Before STD',
  EY: 'AGT > SGT Departed Post STD (Reasons Not Attributable to GHA)',
  EZ: 'AGT > SGT Departed Post STD (Reasons Attributable to GHA)',
  FA: 'TOTAL',
};

const AIRLINE_COL_TONE: Record<string, 'xxld' | 'gha' | 'timing' | 'otp' | 'total' | undefined> = {
  EM: 'xxld',
  EO: 'timing',
  EP: 'timing',
  ER: 'gha',
  ET: 'otp',
  EU: 'otp',
  EV: 'timing',
  EW: 'timing',
  EZ: 'gha',
  FA: 'total',
};

const AIRLINE_ORANGE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8CBAD' },
};
const AIRLINE_PINK_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF4CCCC' },
};
const AIRLINE_TITLE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFCDF2FF' },
};
const AIRLINE_ZERO_FMT = '0;-0;"-"';
const TIME_INPUT_FMT = 'hh:mm';
const DATE_INPUT_FMT = 'dd/mm/yyyy';

/** FLIGHT REPORT block: title row 3, headers row 4, COMBINED row 5, airlines from 6. */
export const FLIGHT_REPORT_TITLE_ROW = 3;
export const FLIGHT_REPORT_COMBINED_ROW = 5;
export const FLIGHT_REPORT_COLS = Object.keys(AIRLINE_HEADERS);

const THIN_BLACK_BORDER: ExcelJS.Border = {
  style: 'thin',
  color: { argb: 'FF000000' },
};

function thinGridBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { ...THIN_BLACK_BORDER },
    left: { ...THIN_BLACK_BORDER },
    bottom: { ...THIN_BLACK_BORDER },
    right: { ...THIN_BLACK_BORDER },
  };
}

/**
 * Rule: FLIGHT REPORT (EL–FA) always has a thin black grid from the title
 * through COMBINED plus every airline row. Never a fixed last row — if
 * airlines grow, the bordered range grows with them.
 */
export function flightReportLastDataRow(airlineCount: number): number {
  return FLIGHT_REPORT_COMBINED_ROW + Math.max(0, airlineCount);
}

export function applyFlightReportGridBorders(
  ws: ExcelJS.Worksheet,
  airlineCount: number,
): void {
  const lastRow = flightReportLastDataRow(airlineCount);
  for (let r = FLIGHT_REPORT_TITLE_ROW; r <= lastRow; r += 1) {
    for (const col of FLIGHT_REPORT_COLS) {
      ws.getCell(`${col}${r}`).border = thinGridBorder();
    }
  }
}

function applyThinGrid(
  ws: ExcelJS.Worksheet,
  cols: string[],
  fromRow: number,
  toRow: number,
): void {
  for (let r = fromRow; r <= toRow; r += 1) {
    for (const col of cols) {
      ws.getCell(`${col}${r}`).border = thinGridBorder();
    }
  }
}

/** Flag / count formula columns — never cache "-" (Excel SUM then #VALUE!). */
const TIME_RESULT_COLS = new Set(['W', 'X', 'Y', 'AB', 'AD', 'AF', 'BB', 'BF', 'BG', 'BH', 'DB']);

function paintCfCell(
  cell: ExcelJS.Cell,
  letter: string,
  value: string | number | undefined,
) {
  const hit = resolveStationWiseCellHighlight(letter, value);
  if (!hit) return;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${hit.backgroundColor.slice(1)}` },
  };
  cell.font = {
    ...(cell.font ?? {}),
    color: { argb: `FF${hit.color.slice(1)}` },
    name: 'Calibri',
    size: 9,
  };
}

/** MAA conditional formatting on month data rows (also painted on cached results). */
function applyMonthConditionalFormatting(
  ws: ExcelJS.Worksheet,
  lastDataRow: number,
) {
  const end = Math.max(4, lastDataRow);
  for (const rule of STATION_WISE_CF_RULES) {
    const ref =
      rule.fromCol === rule.toCol
        ? `${rule.fromCol}4:${rule.toCol}${end}`
        : `${rule.fromCol}4:${rule.toCol}${end}`;
    if (rule.operator === 'containsText') {
      ws.addConditionalFormatting({
        ref,
        rules: [
          {
            type: 'containsText',
            operator: 'containsText',
            text: String(rule.value),
            priority: rule.priority,
            style: {
              fill: {
                type: 'pattern',
                pattern: 'solid',
                bgColor: { argb: rule.fillArgb },
              },
              font: { color: { argb: rule.fontArgb } },
            },
          },
        ],
      });
      continue;
    }
    ws.addConditionalFormatting({
      ref,
      rules: [
        {
          type: 'cellIs',
          operator: rule.operator,
          formulae: [String(rule.value)],
          priority: rule.priority,
          style: {
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: rule.fillArgb },
            },
            font: { color: { argb: rule.fontArgb } },
          },
        },
      ],
    });
  }
}

function setFormula(
  ws: ExcelJS.Worksheet,
  addr: string,
  formula: string,
  result?: string | number | boolean | Date,
) {
  if (result === undefined) {
    ws.getCell(addr).value = { formula };
    return;
  }
  ws.getCell(addr).value = { formula, result };
}

function styleHeader(cell: ExcelJS.Cell, fill: ExcelJS.Fill = HEADER_FILL) {
  cell.fill = fill;
  cell.font = HEADER_FONT;
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
}

function stylePlainHeader(cell: ExcelJS.Cell, fill?: ExcelJS.Fill) {
  if (fill) cell.fill = fill;
  cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: 'FF000000' } };
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
}

function writeThresholds(ws: ExcelJS.Worksheet, cols: readonly string[]) {
  cols.forEach((col, i) => {
    const cell = ws.getCell(`${col}3`);
    cell.value = bucketThresholdExcel(i);
    cell.numFmt = 'hh:mm:ss';
    stylePlainHeader(cell);
  });
}

function writeTimeInput(cell: ExcelJS.Cell, value: number | '') {
  if (value === '' || !Number.isFinite(value)) {
    cell.value = null;
    return;
  }
  cell.value = value;
  cell.numFmt = TIME_INPUT_FMT;
}

function writeDateInput(cell: ExcelJS.Cell, display: string) {
  const serial = ymdToExcelSerial(parseToYmd(display) ?? '');
  if (serial == null) {
    cell.value = display || null;
    return;
  }
  cell.value = serial;
  cell.numFmt = DATE_INPUT_FMT;
}

function writeDelayInput(
  cell: ExcelJS.Cell,
  value: number | '',
  zeroAsMidnight = false,
) {
  if (value === '' || (value === 0 && !zeroAsMidnight)) {
    cell.value = null;
    return;
  }
  cell.value = value;
  cell.numFmt = TIME_INPUT_FMT;
}

function cacheFormulaResult(
  cell: ExcelJS.Cell,
  col: string,
  result: string | number | undefined,
) {
  if (result === undefined || result === '') return;
  if (typeof result === 'number' && Number.isFinite(result)) {
    cell.numFmt = TIME_RESULT_COLS.has(col) ? TIME_INPUT_FMT : AIRLINE_ZERO_FMT;
  }
}

function writeMonthHeaders(ws: ExcelJS.Worksheet) {
  ws.mergeCells('AA2:AF2');
  ws.getCell('AA2').value = 'Delay Codes and Timings';
  ws.getCell('AA2').fill = SECTION_DELAY_CODES_FILL;
  ws.getCell('AA2').font = { bold: true, size: 10 };

  ws.mergeCells('AG2:BA2');
  ws.getCell('AG2').value = 'GHA Related Codes';
  ws.getCell('AG2').fill = SECTION_GHA_CODES_FILL;
  ws.getCell('AG2').font = { bold: true, size: 10 };

  ws.mergeCells('CG1:CY1');
  ws.getCell('CG1').value = 'GHA RELATED DELAY AND TIMINGS';
  ws.getCell('CG1').fill = SECTION_GHA_FILL;
  ws.getCell('CG1').font = { bold: true, size: 10, color: { argb: 'FF00B050' } };

  ws.mergeCells('DA1:DU1');
  ws.getCell('DA1').value = 'NON GHA RELATED DELAY TIMINGS';
  ws.getCell('DA1').fill = SECTION_NON_GHA_FILL;
  ws.getCell('DA1').font = { bold: true, size: 10, color: { argb: 'FFFF0000' } };

  ws.mergeCells('DW1:EJ1');
  ws.getCell('DW1').value = 'FINAL REPORT VALUES AND RECORDS';
  ws.getCell('DW1').fill = SECTION_FINAL_FILL;
  ws.getCell('DW1').font = { bold: true, size: 10 };

  ws.getCell('W2').value = 0;
  ws.getCell('W2').numFmt = 'hh:mm:ss';
  ws.getCell('BF2').value = 1;
  ws.getCell('BG2').value = 1;
  ws.getCell('BH2').value = 'TOTAL>>>';

  COL_A_T.forEach((label, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = label;
    styleHeader(cell);
  });

  for (const [col, label] of Object.entries(FORMULA_HEADERS)) {
    const cell = ws.getCell(`${col}3`);
    cell.value = label;
    if (col >= 'DW' && col <= 'EA') stylePlainHeader(cell, FINAL_DW_EA_FILL);
    else if (col >= 'EB' && col <= 'EJ') stylePlainHeader(cell, FINAL_EB_EJ_FILL);
    else stylePlainHeader(cell);
  }

  for (const { col, code } of GHA_CODE_COLS) {
    const cell = ws.getCell(`${col}3`);
    cell.value = code;
    stylePlainHeader(cell);
  }

  writeThresholds(ws, GT_BUCKET_COLS);
  writeThresholds(ws, GHA_TIME_BUCKET_COLS);
  writeThresholds(ws, NON_GHA_TIME_BUCKET_COLS);

  for (const [col, formula] of Object.entries(ROW2_TOTAL_FORMULAS)) {
    setFormula(ws, `${col}2`, formula);
    ws.getCell(`${col}2`).font = { bold: true };
  }

  ws.getRow(3).height = 36;
  ws.getRow(4).height = 18;
}

function writeInputRow(ws: ExcelJS.Worksheet, excelRow: number, row: StationWiseInputRow) {
  // Numeric times/dates so live MAA formulas never hit #VALUE! on I-E / G-E / N-BB.
  // Missing ATA/ATD stay blank (cancelled) — never write "-" into A–T.
  ws.getCell(excelRow, 1).value = row.serialNo === '' ? null : row.serialNo;
  ws.getCell(excelRow, 2).value = row.airline || null;
  ws.getCell(excelRow, 3).value = row.flightNo || null;
  ws.getCell(excelRow, 4).value = row.typeCraft || null;
  writeTimeInput(ws.getCell(excelRow, 5), row.staTime);
  writeDateInput(ws.getCell(excelRow, 6), row.staDate);
  writeTimeInput(ws.getCell(excelRow, 7), row.stdTime);
  writeDateInput(ws.getCell(excelRow, 8), row.stdDate);
  writeTimeInput(ws.getCell(excelRow, 9), row.ataTime);
  writeDateInput(ws.getCell(excelRow, 10), row.ataDate);
  writeTimeInput(ws.getCell(excelRow, 11), row.atdTime);
  writeDateInput(ws.getCell(excelRow, 12), row.atdDate);
  ws.getCell(excelRow, 13).value = row.delay || null;
  writeDelayInput(ws.getCell(excelRow, 14), row.actualDelay, true);
  writeDelayInput(ws.getCell(excelRow, 15), row.delay1);
  ws.getCell(excelRow, 16).value = row.reasonOfDelay || null;
  writeDelayInput(ws.getCell(excelRow, 17), row.delay2);
  ws.getCell(excelRow, 18).value = row.delaycode2 || null;
  writeDelayInput(ws.getCell(excelRow, 19), row.delay3);
  ws.getCell(excelRow, 20).value = row.delaycode3 || null;

  const evaluated = evaluateStationWiseRow(row);
  for (const [col, formula] of Object.entries(dataRowFormulas(excelRow))) {
    const result = evaluated[col];
    const cache =
      typeof result === 'number' && Number.isFinite(result)
        ? result
        : result === undefined || result === ''
          ? undefined
          : result;
    setFormula(ws, `${col}${excelRow}`, formula, cache);
    const cell = ws.getCell(`${col}${excelRow}`);
    cacheFormulaResult(cell, col, cache);
    paintCfCell(cell, col, typeof result === 'number' ? result : String(result ?? ''));
  }
}

function styleAirlineHeader(cell: ExcelJS.Cell, col: string) {
  const tone = AIRLINE_COL_TONE[col];
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  cell.font = {
    bold: col === 'EM' || col === 'ES' || col === 'EL',
    size: 11,
    name: 'Calibri',
    color: {
      argb:
        tone === 'xxld' ? 'FFFF0000' : tone === 'otp' ? 'FF0070C0' : 'FF002060',
    },
  };
  if (tone === 'timing') cell.fill = AIRLINE_ORANGE_FILL;
  else if (tone === 'gha') cell.fill = AIRLINE_PINK_FILL;
  else if (col === 'EL') cell.fill = AIRLINE_TITLE_FILL;
}

function writeAirlineMetric(
  ws: ExcelJS.Worksheet,
  addr: string,
  formula: string,
  value: number,
  col: string,
) {
  setFormula(ws, addr, formula, value);
  const cell = ws.getCell(addr);
  cell.numFmt = AIRLINE_ZERO_FMT;
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  if (col === 'EM') {
    cell.font = { ...(cell.font ?? {}), color: { argb: 'FFFF0000' }, name: 'Calibri', size: 11 };
  }
}

function writeAirlineAndPerformance(
  ws: ExcelJS.Worksheet,
  airlines: string[],
  rows: StationWiseInputRow[],
) {
  const report = buildAirlineFlightReport(rows);
  const combined = report.find((r) => r.name === 'COMBINED');
  const byName = new Map(report.map((r) => [r.name, r]));

  ws.mergeCells('EL3:FA3');
  const title = ws.getCell('EL3');
  title.value = 'FLIGHT REPORT';
  title.fill = AIRLINE_TITLE_FILL;
  title.font = {
    name: 'Times New Roman',
    size: 18,
    bold: false,
    color: { argb: 'FF002060' },
  };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 72;

  for (const [col, label] of Object.entries(AIRLINE_HEADERS)) {
    const cell = ws.getCell(`${col}4`);
    cell.value = label;
    styleAirlineHeader(cell, col);
  }

  const row2Map: Record<string, (typeof AIRLINE_REPORT_METRIC_KEYS)[number]> = {
    BD: 'xxld',
    DW: 'lateSta',
    DX: 'depOnOrBeforeStd',
    DY: 'depPostStdAgtLeSgt',
    DZ: 'agtGtSgtNonGha',
    EA: 'agtGtSgtGha',
    EB: 'arrivedOnOrBeforeSta',
    EC: 'onTime',
    ED: 'beforeSta',
    EE: 'depBeforeStdAgtLtSgt',
    EF: 'depBeforeStdAgtEqSgt',
    EG: 'exceedingSgtBeforeStd',
    EI: 'agtGtSgtPostStdNonGha',
    EJ: 'agtGtSgtPostStdGha',
  };
  for (const [col, key] of Object.entries(row2Map)) {
    const existing = ws.getCell(`${col}2`).value;
    const formula =
      existing && typeof existing === 'object' && 'formula' in existing
        ? String((existing as { formula: string }).formula)
        : ROW2_TOTAL_FORMULAS[col];
    if (!formula) continue;
    setFormula(ws, `${col}2`, formula, combined?.metrics[key] ?? 0);
    ws.getCell(`${col}2`).numFmt = AIRLINE_ZERO_FMT;
    ws.getCell(`${col}2`).font = { bold: true };
  }

  ws.getCell('EL5').value = 'COMBINED';
  ws.getCell('EL5').font = { bold: true, name: 'Calibri', size: 11 };
  ws.getCell('EL5').alignment = { horizontal: 'left', vertical: 'middle' };
  const metricCols = AIRLINE_REPORT_METRIC_KEYS;
  const combinedFormulas = COMBINED_FORMULAS;
  metricCols.forEach((key, i) => {
    const col = Object.keys(AIRLINE_HEADERS).filter((c) => c !== 'EL')[i];
    if (!col) return;
    writeAirlineMetric(
      ws,
      `${col}5`,
      combinedFormulas[col],
      combined?.metrics[key] ?? 0,
      col,
    );
  });

  airlines.forEach((name, i) => {
    const r = 6 + i;
    ws.getCell(`EL${r}`).value = name;
    ws.getCell(`EL${r}`).alignment = { horizontal: 'left', vertical: 'middle' };
    const formulas = airlineRowFormulas(r);
    const metrics = byName.get(name)?.metrics;
    metricCols.forEach((key, mi) => {
      const col = Object.keys(AIRLINE_HEADERS).filter((c) => c !== 'EL')[mi];
      if (!col) return;
      writeAirlineMetric(ws, `${col}${r}`, formulas[col], metrics?.[key] ?? 0, col);
    });
  });

  applyFlightReportGridBorders(ws, airlines.length);

  ws.getColumn('EL').width = 28;
  for (const col of Object.keys(AIRLINE_HEADERS)) {
    if (col === 'EL') continue;
    ws.getColumn(col).width = col === 'EQ' || col === 'EY' || col === 'EZ' ? 14 : 9;
  }

  ws.mergeCells('FC5:FF5');
  ws.getCell('FC5').value = 'Performance report';
  ws.getCell('FC5').font = { bold: true, size: 12, color: { argb: 'FF002060' } };
  ws.getCell('FC5').fill = PREVIEW_FILL;
  ws.getCell('FG5').value = 'Flt';
  ws.getCell('FH5').value = '%';
  styleHeader(ws.getCell('FG5'));
  styleHeader(ws.getCell('FH5'));

  const m = combined?.metrics;
  const perfFlt: Record<number, number> = {
    6: m?.onTime ?? 0,
    7: m?.xxld ?? 0,
    9: (m?.depOnOrBeforeStd ?? 0) + (m?.depPostStdAgtLeSgt ?? 0) + (m?.depBeforeStdAgtLtSgt ?? 0),
    10: (m?.depBeforeStdAgtEqSgt ?? 0) + (m?.exceedingSgtBeforeStd ?? 0),
    11: (m?.agtGtSgtNonGha ?? 0) + (m?.agtGtSgtPostStdNonGha ?? 0),
    12: (m?.agtGtSgtGha ?? 0) + (m?.agtGtSgtPostStdGha ?? 0),
  };
  perfFlt[8] = perfFlt[9] + perfFlt[10] + perfFlt[11] + perfFlt[12];
  perfFlt[13] = perfFlt[6] + perfFlt[7] + perfFlt[8];
  const totalFlt = perfFlt[13] || 0;

  for (const item of performanceFormulas()) {
    ws.getCell(`FC${item.row}`).value = item.label;
    setFormula(ws, `FG${item.row}`, item.flt, perfFlt[item.row] ?? 0);
    const pct = totalFlt === 0 ? 0 : item.row === 13 ? 1 : (perfFlt[item.row] ?? 0) / totalFlt;
    setFormula(ws, `FH${item.row}`, item.pct, pct);
    ws.getCell(`FG${item.row}`).numFmt = AIRLINE_ZERO_FMT;
    ws.getCell(`FH${item.row}`).numFmt = '0.0%';
    if (item.row === 13) {
      ws.getCell(`FC${item.row}`).font = { bold: true };
      ws.getCell(`FG${item.row}`).font = { bold: true };
    }
  }
}

function uniqueAirlines(rows: StationWiseInputRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const name = row.airline.trim();
    if (name) set.add(name);
  }
  return [...set].sort(compareAirlineName);
}

function writePreviewSheet(
  wb: ExcelJS.Workbook,
  input: {
    stationLabel: string;
    stationCode: string;
    from: string;
    to: string;
    months: CalendarMonthSlice[];
    airlines: string[];
  },
) {
  const ws = wb.addWorksheet('PREVIEW', {
    views: [{ state: 'frozen', ySplit: 5, topLeftCell: 'A6', activeCell: 'A6' }],
  });
  const sheets = input.months.map((m) => m.sheetName);

  ws.getCell('A1').value = `${input.stationLabel} — MIS Station Wise`;
  ws.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF002060' } };
  ws.mergeCells('A1:F1');

  ws.getCell('A2').value =
    `${input.stationCode} · ${formatRangeLabel(input.from, input.to)} · calendar months develop with the selected range`;
  ws.getCell('A2').font = { size: 11, color: { argb: 'FF334155' } };
  ws.mergeCells('A2:F2');

  ws.getCell('A4').value = 'Performance report (whole range)';
  ws.getCell('A4').font = { bold: true, size: 13, color: { argb: 'FF002060' } };
  ws.getCell('A4').fill = PREVIEW_FILL;
  ws.mergeCells('A4:C4');

  ws.getCell('A5').value = 'Metric';
  ws.getCell('B5').value = 'Flt';
  ws.getCell('C5').value = '%';
  styleHeader(ws.getCell('A5'));
  styleHeader(ws.getCell('B5'));
  styleHeader(ws.getCell('C5'));

  const perf = performanceFormulas();
  const previewFltCells = ['FG6', 'FG7', 'FG8', 'FG9', 'FG10', 'FG11', 'FG12', 'FG13'];
  perf.forEach((item, i) => {
    const r = 6 + i;
    ws.getCell(`A${r}`).value = item.label;
    setFormula(ws, `B${r}`, previewSumFormula(sheets, previewFltCells[i]));
    if (i < 7) {
      setFormula(ws, `C${r}`, `IF($B$13=0,0,B${r}/$B$13)`);
    } else {
      setFormula(ws, `C${r}`, 'SUM(C6:C8)');
    }
    ws.getCell(`C${r}`).numFmt = '0.0%';
    if (i === 7) ws.getCell(`A${r}`).font = { bold: true };
  });

  ws.getCell('A16').value = 'Month-wise development';
  ws.getCell('A16').font = { bold: true, size: 13, color: { argb: 'FF002060' } };
  ws.getCell('A16').fill = PREVIEW_FILL;
  ws.mergeCells('A16:G16');

  const monthHeaders = [
    'Sheet',
    'Month',
    'From',
    'To',
    'On time',
    'Cancelled',
    'Total (FG13)',
  ];
  monthHeaders.forEach((h, i) => {
    const cell = ws.getCell(17, i + 1);
    cell.value = h;
    styleHeader(cell);
  });

  input.months.forEach((month, i) => {
    const r = 18 + i;
    ws.getCell(`A${r}`).value = month.sheetName;
    ws.getCell(`B${r}`).value = month.label;
    ws.getCell(`C${r}`).value = month.from;
    ws.getCell(`D${r}`).value = month.to;
    setFormula(ws, `E${r}`, `'${month.sheetName}'!FG6`);
    setFormula(ws, `F${r}`, `'${month.sheetName}'!FG7`);
    setFormula(ws, `G${r}`, `'${month.sheetName}'!FG13`);
  });

  const airlineStart = 18 + input.months.length + 2;
  ws.getCell(`A${airlineStart}`).value = 'Airline preview (SUMIF across month sheets)';
  ws.getCell(`A${airlineStart}`).font = { bold: true, size: 13, color: { argb: 'FF002060' } };
  ws.getCell(`A${airlineStart}`).fill = PREVIEW_FILL;
  ws.mergeCells(`A${airlineStart}:E${airlineStart}`);

  const ah = airlineStart + 1;
  ['Airline', 'XXLD', 'Late STA', 'On time', 'Total'].forEach((h, i) => {
    const cell = ws.getCell(ah, i + 1);
    cell.value = h;
    styleHeader(cell);
  });

  input.airlines.forEach((name, i) => {
    const r = ah + 1 + i;
    ws.getCell(`A${r}`).value = name;
    setFormula(ws, `B${r}`, previewAirlineSumif(sheets, 'EM', r));
    setFormula(ws, `C${r}`, previewAirlineSumif(sheets, 'EN', r));
    setFormula(ws, `D${r}`, previewAirlineSumif(sheets, 'ET', r));
    setFormula(ws, `E${r}`, previewAirlineSumif(sheets, 'FA', r));
  });
  applyThinGrid(
    ws,
    ['A', 'B', 'C', 'D', 'E'],
    ah,
    ah + input.airlines.length,
  );

  ws.getColumn(1).width = 52;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 14;
  ws.getColumn(7).width = 16;
}

export type StationWiseWorkbookInput = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  months: CalendarMonthSlice[];
  rowsByMonth: Map<string, StationWiseInputRow[]>;
};

export async function buildStationWiseWorkbook(
  input: StationWiseWorkbookInput,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FRIS';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const allRows = input.months.flatMap((m) => input.rowsByMonth.get(m.key) ?? []);
  const airlines = uniqueAirlines(allRows);

  writePreviewSheet(wb, {
    stationLabel: input.stationLabel,
    stationCode: input.stationCode,
    from: input.from,
    to: input.to,
    months: input.months,
    airlines,
  });

  for (const month of input.months) {
    const rows = input.rowsByMonth.get(month.key) ?? [];
    const monthAirlines = uniqueAirlines(rows);
    const ws = wb.addWorksheet(month.sheetName, {
      // Match MAA: freeze header rows 1–3 (A4). Also pin airline/flight cols A–C.
      views: [{ state: 'frozen', xSplit: 3, ySplit: 3, topLeftCell: 'D4', activeCell: 'D4' }],
    });
    writeMonthHeaders(ws);
    rows.forEach((row, i) => writeInputRow(ws, 4 + i, row));
    const lastDataRow = rows.length === 0 ? 4 : 3 + rows.length;
    applyMonthConditionalFormatting(ws, lastDataRow);
    writeAirlineAndPerformance(ws, monthAirlines, rows);

    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 22;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 14;
    for (let c = 5; c <= 20; c += 1) ws.getColumn(c).width = 12;
    ws.getColumn(16).width = 28;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
