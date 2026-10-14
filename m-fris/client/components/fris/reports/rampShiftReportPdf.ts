import type { jsPDF } from 'jspdf';
import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import { loadLogoAsBase64 } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';
import { getRampShiftReport, type RampShiftReportPayload } from '@/lib/api';
import {
  displayRampPersonName,
  payloadToFormSnapshot,
  type RampShiftFormSnapshot,
} from '@/components/fris/reports/rampShiftStorage';
import { scheduledRowsForReport } from '@/components/fris/reports/rampScheduledMappers';
import type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';
import type { NonScheduledAirlineTableRow } from '@/components/fris/reports/rampNonScheduledMappers';
import { formatRampFlightCellDisplay } from '@/components/fris/reports/rampDisplayFormat';
import { richTextToPlainText } from '@/lib/richText';
import {
  RAMP_RESOURCE_COLUMN_META,
  RAMP_RESOURCE_DESCRIPTION_ROWS,
  RAMP_RESOURCE_COL_GROUPS,
  rampResourceGroupRowSpanOnly,
  dayOfWeekFromYmd,
  formatYmdToDisplayDate,
  sumIntegerFields,
  type RampFlightRowKey,
} from '@/components/fris/reports/rampShiftReportLayout';

const PAGE_TOP = 10;
const PAGE_BOTTOM = 285;
const MARGIN = 8;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const FONT_SECTION = 10;
const FONT_BODY = 7;
/** Shared font size for Summary of Resources + flight tables in the PDF. */
const FONT_REPORT_TABLE = 6;
const FONT_REPORT_TABLE_LINE_H = 4.2;
const HEADER_SUMMARY_LINE_H = 4;
const HEADER_SUMMARY_FONT = FONT_BODY;
const LOGO_SRC_PX = { w: 714, h: 138 } as const;
const LOGO_DRAW_W_MM = 40;
const LOGO_DRAW_H_MM = (LOGO_DRAW_W_MM * LOGO_SRC_PX.h) / LOGO_SRC_PX.w;
/** Tailwind indigo palette for the full ramp shift PDF. */
const INDIGO_900: [number, number, number] = [49, 46, 129];
const INDIGO_100: [number, number, number] = [224, 231, 255];
const INDIGO_50: [number, number, number] = [238, 242, 255];
const INDIGO_200: [number, number, number] = [199, 210, 254];
const INDIGO_700: [number, number, number] = [67, 56, 202];
const HEADER_TEXT: [number, number, number] = [255, 255, 255];

const HEADER_RULE = INDIGO_700;
const RAMP_HEADER_FILL = INDIGO_900;
const RAMP_LABEL_FILL = INDIGO_100;
const RAMP_SCHED_ROW_FILL = INDIGO_50;
const STROKE = INDIGO_200;
const BODY_TEXT: [number, number, number] = [0, 0, 0];

/** PDF flight table columns (excludes airline, arrival ETA, departure ETD, delay reasons). */
const RAMP_FLIGHT_PDF_COLUMNS: { key: RampFlightRowKey; header: string }[] = [
  { key: 'fltNo', header: 'Flt no' },
  { key: 'reportNo', header: 'Report no' },
  { key: 'bayArr', header: 'Bay Arr' },
  { key: 'bayDep', header: 'Bay Dep' },
  { key: 'arrivalSta', header: 'STA' },
  { key: 'arrivalAta', header: 'ATA' },
  { key: 'holdOpen', header: 'Hold open' },
  { key: 'holdClose', header: 'Hold close' },
  { key: 'diffAta1stBag', header: 'Diff ATA-1st' },
  { key: 'diff1stBag', header: 'Diff 1st' },
  { key: 'diffLastBag', header: 'Diff last' },
  { key: 'diffLbAta', header: 'Diff LB-ATA' },
  { key: 'depStd', header: 'STD' },
  { key: 'depAtd', header: 'ATD' },
  { key: 'supvrName', header: 'Supvr' },
  { key: 'teamAtBay', header: 'Team' },
  { key: 'lastCargoLot', header: 'Last cargo' },
  { key: 'brs', header: 'BRS' },
  { key: 'chk', header: 'CHK' },
];

const FLIGHT_HEADERS = RAMP_FLIGHT_PDF_COLUMNS.map((c) => c.header);

/** Minimum column widths (mm) for flight tables — tuned to fit portrait A4 (~194mm). */
const FLIGHT_COL_MIN_MM: number[] = [
  11, // Flt no
  10, // Report no
  6.5, // Bay Arr
  6.5, // Bay Dep
  8, // STA
  8, // ATA
  11, // Hold open
  11, // Hold close
  12, // Diff ATA-1st
  12, // Diff 1st (date + time)
  12, // Diff last (date + time)
  12, // Diff LB-ATA
  8, // STD
  8, // ATD
  9, // Supvr
  7, // Team
  9, // Last cargo
  6, // BRS
  6, // CHK
];

/** Columns that absorb extra horizontal space (hold + diff fields). */
const FLIGHT_COL_FLEX = new Set([6, 7, 8, 9, 10, 11]);

type PdfTheme = {
  headerFill: [number, number, number];
  headerText: [number, number, number];
  bodyText: [number, number, number];
  stroke: [number, number, number];
};

const RAMP_THEME: PdfTheme = {
  headerFill: RAMP_HEADER_FILL,
  headerText: HEADER_TEXT,
  bodyText: BODY_TEXT,
  stroke: STROKE,
};

function newPageIfNeeded(doc: jsPDF, y: number, blockHeight: number): number {
  if (y + blockHeight > PAGE_BOTTOM) {
    doc.addPage();
    return PAGE_TOP;
  }
  return y;
}

function cellTextStartY(cellTop: number, lineH = 3.2): number {
  return cellTop + lineH + 0.4;
}

function formatFlightCell(key: RampFlightRowKey, raw: string): string {
  return formatRampFlightCellDisplay(key, raw);
}

function pdfCellLineWidths(doc: jsPDF, text: string): number {
  const s = String(text ?? '').trim() || '—';
  const lines = s.split(/\r?\n/);
  let w = 0;
  for (const line of lines) {
    w = Math.max(w, doc.getTextWidth(line || '—'));
  }
  return w;
}

function flightCellRaw(
  row: RampScheduledAirlineRow | NonScheduledAirlineTableRow,
  key: RampFlightRowKey,
): string {
  if (key === 'arrivalEta' && 'arrivalEtaAta' in row) {
    return String(row.arrivalEtaAta ?? '');
  }
  const r = row as Record<RampFlightRowKey, string | undefined>;
  return String(r[key] ?? '');
}

function flightDataRow(
  row: RampScheduledAirlineRow | NonScheduledAirlineTableRow,
): string[] {
  return RAMP_FLIGHT_PDF_COLUMNS.map(({ key }) => formatFlightCell(key, flightCellRaw(row, key)));
}

/** Widths tuned for portrait A4; respects per-column minimums before scaling. */
function flightTableColWidths(
  doc: jsPDF,
  headers: string[],
  rows: string[][],
  totalW: number,
  fontSize: number,
): number[] {
  const padMm = 2.6;
  doc.setFontSize(fontSize);
  const widths: number[] = [];

  for (let c = 0; c < headers.length; c++) {
    const floor = FLIGHT_COL_MIN_MM[c] ?? 8;
    doc.setFont('helvetica', 'bold');
    let w = doc.getTextWidth(headers[c] ?? '');
    doc.setFont('helvetica', 'normal');
    for (const row of rows) {
      w = Math.max(w, doc.getTextWidth(String(row[c] ?? '')));
    }
    widths.push(+(Math.max(floor, w + padMm)).toFixed(2));
  }

  let sum = widths.reduce((a, b) => a + b, 0);

  if (sum > totalW) {
    const minSum = FLIGHT_COL_MIN_MM.reduce((a, b) => a + b, 0);
    const shrinkable = sum - minSum;
    const deficit = sum - totalW;
    if (shrinkable > deficit && shrinkable > 0) {
      const factor = (shrinkable - deficit) / shrinkable;
      for (let c = 0; c < widths.length; c++) {
        const min = FLIGHT_COL_MIN_MM[c] ?? 7;
        const extra = widths[c]! - min;
        widths[c] = +(min + extra * factor).toFixed(2);
      }
    } else {
      const factor = totalW / sum;
      for (let c = 0; c < widths.length; c++) {
        widths[c] = +(widths[c]! * factor).toFixed(2);
      }
    }
    sum = widths.reduce((a, b) => a + b, 0);
  }

  if (sum < totalW) {
    const extra = +(totalW - sum).toFixed(2);
    const flexIndices = [...FLIGHT_COL_FLEX].filter((i) => i < widths.length);
    const flexTotal = flexIndices.reduce((a, i) => a + widths[i]!, 0);
    if (flexTotal > 0) {
      for (const i of flexIndices) {
        const add = (extra * widths[i]!) / flexTotal;
        widths[i] = +(widths[i]! + add).toFixed(2);
      }
    } else {
      widths[widths.length - 1] = +(widths[widths.length - 1]! + extra).toFixed(2);
    }
  }

  const rem = +(totalW - widths.reduce((a, b) => a + b, 0)).toFixed(2);
  if (Math.abs(rem) > 0.01) {
    widths[widths.length - 1] = +(widths[widths.length - 1]! + rem).toFixed(2);
  }

  return widths;
}

function equalColWidths(n: number, totalW: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((totalW / n) * 100) / 100;
  const arr = Array.from({ length: n }, () => base);
  const rem = +(totalW - base * n).toFixed(2);
  arr[n - 1] = +(arr[n - 1]! + rem).toFixed(2);
  return arr;
}

function fitTableColWidths(
  doc: jsPDF,
  headers: string[],
  rows: string[][],
  totalW: number,
  fontSize: number,
  colMinMm?: number[],
): number[] {
  const padMm = 2;
  doc.setFontSize(fontSize);
  const raw: number[] = [];
  for (let c = 0; c < headers.length; c++) {
    const floor = colMinMm?.[c] ?? 5.5;
    doc.setFont('helvetica', 'bold');
    let w = doc.getTextWidth(headers[c] ?? '');
    doc.setFont('helvetica', 'normal');
    for (const row of rows) {
      w = Math.max(w, doc.getTextWidth(String(row[c] ?? '')));
    }
    raw.push(Math.max(floor, w + padMm));
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= totalW) {
    const out = [...raw];
    out[out.length - 1] = +(out[out.length - 1]! + (totalW - sum)).toFixed(2);
    return out.map((w) => +w.toFixed(2));
  }
  const scale = totalW / sum;
  const scaled = raw.map((w) => +(w * scale).toFixed(2));
  const rem = +(totalW - scaled.reduce((a, b) => a + b, 0)).toFixed(2);
  scaled[scaled.length - 1] = +(scaled[scaled.length - 1]! + rem).toFixed(2);
  return scaled;
}

function drawPdfTable(
  doc: jsPDF,
  yTop: number,
  colWidths: number[],
  headers: string[],
  rows: string[][],
  opts?: {
    fontSize?: number;
    minRowH?: number;
    headerH?: number;
    theme?: PdfTheme;
    x0?: number;
    rowFill?: (rowIndex: number) => [number, number, number] | null;
    bottomGap?: number;
    maxBodyLines?: number;
    lineH?: number;
  },
): number {
  const theme = opts?.theme ?? RAMP_THEME;
  const fontSize = opts?.fontSize ?? FONT_BODY;
  const minHeaderH = opts?.headerH ?? 6;
  const minRowH = opts?.minRowH ?? 5;
  const lineH = opts?.lineH ?? 3.2;
  const x0 = opts?.x0 ?? MARGIN;
  const bottomGap = opts?.bottomGap ?? 2;
  const padX = 1.2;
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const colX: number[] = [];
  let cx = x0;
  for (const w of colWidths) {
    colX.push(cx);
    cx += w;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const headerLineArrays: string[][] = [];
  let headerLineCount = 1;
  for (let c = 0; c < colWidths.length; c++) {
    const hlines = doc.splitTextToSize(headers[c] ?? '', Math.max(2, colWidths[c]! - 2 * padX)).slice(0, 3);
    headerLineArrays.push(hlines);
    headerLineCount = Math.max(headerLineCount, hlines.length);
  }
  const headerH = Math.max(minHeaderH, headerLineCount * lineH + 2);

  const applyStroke = () => {
    doc.setDrawColor(theme.stroke[0], theme.stroke[1], theme.stroke[2]);
    doc.setLineWidth(0.15);
  };

  let y = yTop;
  y = newPageIfNeeded(doc, y, headerH + 2);
  applyStroke();
  doc.setFillColor(theme.headerFill[0], theme.headerFill[1], theme.headerFill[2]);
  doc.rect(x0, y, tableW, headerH, 'FD');
  doc.setTextColor(theme.headerText[0], theme.headerText[1], theme.headerText[2]);
  for (let c = 0; c < colWidths.length; c++) {
    if (c > 0) {
      applyStroke();
      doc.line(colX[c], y, colX[c], y + headerH);
    }
    let hy = cellTextStartY(y, lineH);
    for (const hl of headerLineArrays[c]!) {
      doc.text(hl, colX[c]! + padX, hy);
      hy += lineH;
    }
  }
  applyStroke();
  doc.rect(x0, y, tableW, headerH, 'S');
  y += headerH;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(theme.bodyText[0], theme.bodyText[1], theme.bodyText[2]);
  doc.setFontSize(fontSize);

  const maxBodyLines = opts?.maxBodyLines ?? 4;

  rows.forEach((cells, ri) => {
    const padded = colWidths.map((_, i) => String(cells[i] ?? '').trim() || '—');
    let rowH = minRowH;
    const lineArrays: string[][] = [];
    for (let c = 0; c < colWidths.length; c++) {
      const cellW = Math.max(2, colWidths[c]! - 2 * padX);
      const lines = padded[c].includes('\n')
        ? padded[c].split(/\r?\n/).flatMap((seg) => doc.splitTextToSize(seg, cellW))
        : doc.splitTextToSize(padded[c], cellW);
      lineArrays.push(lines);
      rowH = Math.max(rowH, Math.min(lines.length, maxBodyLines) * lineH + 1.8);
    }

    y = newPageIfNeeded(doc, y, rowH + 1);
    const fill = opts?.rowFill?.(ri);
    if (fill) {
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.rect(x0, y, tableW, rowH, 'F');
    }
    applyStroke();
    doc.rect(x0, y, tableW, rowH, 'S');
    for (let c = 1; c < colWidths.length; c++) {
      applyStroke();
      doc.line(colX[c], y, colX[c], y + rowH);
    }
    for (let c = 0; c < colWidths.length; c++) {
      const lines = lineArrays[c].slice(0, maxBodyLines);
      let ty = cellTextStartY(y, lineH);
      for (const line of lines) {
        doc.text(line, colX[c]! + padX, ty);
        ty += lineH;
      }
    }
    y += rowH;
  });

  doc.setTextColor(0, 0, 0);
  return y + bottomGap;
}

function drawOrangeSectionBar(doc: jsPDF, y: number, title: string): number {
  const barH = 7;
  y = newPageIfNeeded(doc, y, barH + 2);
  doc.setDrawColor(STROKE[0], STROKE[1], STROKE[2]);
  doc.setFillColor(RAMP_HEADER_FILL[0], RAMP_HEADER_FILL[1], RAMP_HEADER_FILL[2]);
  doc.rect(MARGIN, y, CONTENT_W, barH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SECTION);
  doc.setTextColor(HEADER_TEXT[0], HEADER_TEXT[1], HEADER_TEXT[2]);
  doc.text(title, MARGIN + CONTENT_W / 2, y + 4.8, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  return y + barH + 2;
}

/** Logo (left), report title (center), manager/date/shift details (right). */
async function drawRampShiftPdfHeader(
  doc: jsPDF,
  yTop: number,
  title: string,
  form: RampShiftFormSnapshot,
  meta: ShiftMeta,
): Promise<number> {
  const logo = await loadLogoAsBase64();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', MARGIN, yTop, LOGO_DRAW_W_MM, LOGO_DRAW_H_MM);
    } catch {
      // ignore bad image data
    }
  }

  const rightX = PAGE_W - MARGIN;
  const summaryFields: { label: string; value: string }[] = [
    { label: 'Manager / Duty Manager', value: displayRampPersonName(form.manager) },
    { label: 'Date', value: meta.dateLabel },
    { label: 'Shift Time', value: meta.shiftTime },
    { label: 'Day of week', value: meta.dayOfWeek },
    { label: 'Report By', value: form.reportBy || '—' },
  ];

  doc.setFontSize(HEADER_SUMMARY_FONT);
  let summaryBaseline = yTop + 3.8;
  for (const { label, value } of summaryFields) {
    doc.setFont('helvetica', 'bold');
    const prefix = `${label}: `;
    const prefixW = doc.getTextWidth(prefix);
    doc.setFont('helvetica', 'normal');
    const valueW = doc.getTextWidth(value);
    const lineW = prefixW + valueW;
    const lineX = rightX - lineW;
    doc.setFont('helvetica', 'bold');
    doc.text(prefix, lineX, summaryBaseline);
    doc.setFont('helvetica', 'normal');
    doc.text(value, lineX + prefixW, summaryBaseline);
    summaryBaseline += HEADER_SUMMARY_LINE_H;
  }

  const titleBaseline = yTop + Math.max(6, LOGO_DRAW_H_MM * 0.42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const titleLines = doc.splitTextToSize(title, CONTENT_W * 0.46);
  let titleY = titleBaseline;
  for (const line of titleLines.slice(0, 2)) {
    doc.text(line, PAGE_W / 2, titleY, { align: 'center' });
    titleY += 5;
  }
  doc.setFont('helvetica', 'normal');

  const blockBottom = Math.max(
    yTop + LOGO_DRAW_H_MM,
    summaryBaseline + 1.2,
    titleY + 1,
  );

  const ruleY = blockBottom + 1.5;
  doc.setDrawColor(HEADER_RULE[0], HEADER_RULE[1], HEADER_RULE[2]);
  doc.setLineWidth(0.45);
  doc.line(MARGIN, ruleY, MARGIN + CONTENT_W, ruleY);
  doc.setLineWidth(0.12);
  doc.line(MARGIN, ruleY + 1.2, MARGIN + CONTENT_W, ruleY + 1.2);

  return ruleY + 2.5;
}

type ShiftMeta = {
  title: string;
  shiftTime: string;
  dateLabel: string;
  dayOfWeek: string;
};

function buildShiftMeta(payload: RampShiftReportPayload): ShiftMeta {
  const isDay = payload.shift === 'day';
  return {
    title: isDay ? 'Day Shift Ramp Services Report' : 'Night Shift Ramp Services Report',
    shiftTime: isDay ? '05:00 - 17:00' : '17:00 - 05:00',
    dateLabel: formatYmdToDisplayDate(payload.reportDateYmd),
    dayOfWeek: dayOfWeekFromYmd(payload.reportDateYmd),
  };
}

type IndicatorBlock = { title: string; rows: { label: string; value: string; total?: boolean }[] };

function buildIndicators(form: RampShiftFormSnapshot): IndicatorBlock[] {
  return [
    {
      title: 'Flight',
      rows: [
        { label: 'Total Arrivals', value: form.totalArrivals },
        { label: 'Total Departures', value: form.totalDepartures },
        {
          label: 'Total',
          value: sumIntegerFields(form.totalArrivals, form.totalDepartures),
          total: true,
        },
      ],
    },
    {
      title: 'Pax / Cargo',
      rows: [
        { label: 'Pax Flts', value: form.paxFlts },
        { label: 'Cargo Flts', value: form.cargoFlts },
        { label: 'UnScheduled-Pax', value: form.unschedPax },
        { label: 'UnScheduled-Cargo', value: form.unschedCargo },
        {
          label: 'Total',
          value: sumIntegerFields(form.paxFlts, form.cargoFlts, form.unschedPax, form.unschedCargo),
          total: true,
        },
      ],
    },
    {
      title: 'Delays',
      rows: [
        { label: 'Accountable', value: form.delayAccountable },
        { label: 'UN - Accountable', value: form.delayUnAccountable },
        {
          label: 'Total',
          value: sumIntegerFields(form.delayAccountable, form.delayUnAccountable),
          total: true,
        },
      ],
    },
    {
      title: 'OTP',
      rows: [
        { label: 'Target', value: form.otpTarget },
        { label: 'Actual', value: form.otpActual },
      ],
    },
  ];
}

function drawIndicatorBox(doc: jsPDF, x0: number, y: number, boxW: number, block: IndicatorBlock): number {
  let by = newPageIfNeeded(doc, y, 30);
  const boxTop = by;
  doc.setDrawColor(STROKE[0], STROKE[1], STROKE[2]);
  doc.setFillColor(RAMP_HEADER_FILL[0], RAMP_HEADER_FILL[1], RAMP_HEADER_FILL[2]);
  doc.rect(x0, by, boxW, 5.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(HEADER_TEXT[0], HEADER_TEXT[1], HEADER_TEXT[2]);
  doc.text(block.title, x0 + boxW / 2, by + 3.8, { align: 'center' });
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  by += 5.5;

  const labelW = boxW * 0.58;
  const valueW = boxW - labelW;
  const rowH = 5;

  block.rows.forEach((row, rowIdx) => {
    const rowTop = by + rowIdx * rowH;
    doc.setFillColor(RAMP_LABEL_FILL[0], RAMP_LABEL_FILL[1], RAMP_LABEL_FILL[2]);
    doc.rect(x0, rowTop, labelW, rowH, 'F');
    if (row.total) {
      doc.setFillColor(INDIGO_50[0], INDIGO_50[1], INDIGO_50[2]);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(x0 + labelW, rowTop, valueW, rowH, 'F');
    doc.line(x0, rowTop, x0 + boxW, rowTop);
    doc.line(x0 + labelW, rowTop, x0 + labelW, rowTop + rowH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text(row.label, x0 + 1.2, rowTop + 3.5);
    doc.setFont('helvetica', row.total ? 'bold' : 'normal');
    doc.text(row.value || '—', x0 + labelW + 1.2, rowTop + 3.5);
  });

  const boxH = 5.5 + block.rows.length * rowH;
  doc.rect(x0, boxTop, boxW, boxH, 'S');
  return boxTop + boxH;
}

/** Left: Flight + Delays. Right: Pax/Cargo + OTP. */
function drawIndicators(doc: jsPDF, y: number, blocks: IndicatorBlock[]): number {
  const gap = 3;
  const colGap = 3;
  const boxW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + boxW + colGap;

  const flight = blocks.find((b) => b.title === 'Flight');
  const delays = blocks.find((b) => b.title === 'Delays');
  const paxCargo = blocks.find((b) => b.title === 'Pax / Cargo');
  const otp = blocks.find((b) => b.title === 'OTP');

  let leftY = y;
  if (flight) leftY = drawIndicatorBox(doc, leftX, leftY, boxW, flight) + gap;
  if (delays) leftY = drawIndicatorBox(doc, leftX, leftY, boxW, delays);

  let rightY = y;
  if (paxCargo) rightY = drawIndicatorBox(doc, rightX, rightY, boxW, paxCargo) + gap;
  if (otp) rightY = drawIndicatorBox(doc, rightX, rightY, boxW, otp);

  return Math.max(leftY, rightY) + 3;
}

function drawPdfCellBorder(
  doc: jsPDF,
  x: number,
  top: number,
  w: number,
  h: number,
  stroke: [number, number, number] = STROKE,
): void {
  doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
  doc.setLineWidth(0.15);
  doc.rect(x, top, w, h, 'S');
}

function drawPdfCellText(
  doc: jsPDF,
  text: string,
  x: number,
  top: number,
  w: number,
  h: number,
  opts: {
    align?: 'left' | 'center';
    bold?: boolean;
    fontSize?: number;
    padX?: number;
    /** White text on indigo header cells. */
    onDarkHeader?: boolean;
  },
): void {
  const fontSize = opts.fontSize ?? FONT_REPORT_TABLE;
  const padX = opts.padX ?? 1;
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  const textColor = opts.onDarkHeader ? HEADER_TEXT : BODY_TEXT;
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  const lines = doc.splitTextToSize(text, Math.max(2, w - 2 * padX)).slice(0, 3);
  const lineH = FONT_REPORT_TABLE_LINE_H;
  const blockH = lines.length * lineH;
  let ty = top + Math.max(lineH, (h - blockH) / 2 + lineH * 0.85);
  for (const line of lines) {
    const tx = opts.align === 'center' ? x + w / 2 : x + padX;
    doc.text(line, tx, ty, opts.align === 'center' ? { align: 'center' } : undefined);
    ty += lineH;
  }
}

function drawResourcesTable(doc: jsPDF, y: number, form: RampShiftFormSnapshot): number {
  const descW = 17;
  const dataColCount = RAMP_RESOURCE_COLUMN_META.length;
  const dataW = CONTENT_W - descW;
  const dataColWidths = equalColWidths(dataColCount, dataW);
  const colWidths = [descW, ...dataColWidths];
  const tableW = CONTENT_W;
  const x0 = MARGIN;
  const colX: number[] = [];
  let cx = x0;
  for (const w of colWidths) {
    colX.push(cx);
    cx += w;
  }

  const titleH = 7;
  const headerH1 = 7;
  const headerH2 = 6.5;
  const headerBlockH = headerH1 + headerH2;
  const bodyRowH = 6.5;
  const bodyRowCount = RAMP_RESOURCE_DESCRIPTION_ROWS.length;
  const estH = titleH + headerBlockH + bodyRowCount * bodyRowH + 4;
  y = newPageIfNeeded(doc, y, estH);

  doc.setDrawColor(STROKE[0], STROKE[1], STROKE[2]);
  doc.setFillColor(RAMP_HEADER_FILL[0], RAMP_HEADER_FILL[1], RAMP_HEADER_FILL[2]);
  doc.rect(x0, y, tableW, titleH, 'FD');
  drawPdfCellBorder(doc, x0, y, tableW, titleH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SECTION);
  doc.setTextColor(HEADER_TEXT[0], HEADER_TEXT[1], HEADER_TEXT[2]);
  doc.text('Summary of Resources', x0 + tableW / 2, y + 4.8, { align: 'center' });
  y += titleH;

  const headerTop = y;
  doc.setFillColor(RAMP_HEADER_FILL[0], RAMP_HEADER_FILL[1], RAMP_HEADER_FILL[2]);
  doc.rect(x0, headerTop, colWidths[0]!, headerBlockH, 'F');
  drawPdfCellBorder(doc, x0, headerTop, colWidths[0]!, headerBlockH);
  drawPdfCellText(doc, 'Description', colX[0]!, headerTop, colWidths[0]!, headerBlockH, {
    align: 'center',
    bold: true,
    fontSize: FONT_REPORT_TABLE,
    onDarkHeader: true,
  });

  let col = 1;
  for (const group of RAMP_RESOURCE_COL_GROUPS) {
    const span = group.subHeaders.length;
    let groupW = 0;
    for (let i = 0; i < span; i++) groupW += colWidths[col + i]!;
    const gx = colX[col]!;
    if (rampResourceGroupRowSpanOnly(group)) {
      doc.setFillColor(RAMP_HEADER_FILL[0], RAMP_HEADER_FILL[1], RAMP_HEADER_FILL[2]);
      doc.rect(gx, headerTop, groupW, headerBlockH, 'F');
      drawPdfCellBorder(doc, gx, headerTop, groupW, headerBlockH);
      drawPdfCellText(doc, group.title, gx, headerTop, groupW, headerBlockH, {
        align: 'center',
        bold: true,
        fontSize: FONT_REPORT_TABLE,
        onDarkHeader: true,
      });
    } else {
      doc.setFillColor(RAMP_HEADER_FILL[0], RAMP_HEADER_FILL[1], RAMP_HEADER_FILL[2]);
      doc.rect(gx, headerTop, groupW, headerH1, 'F');
      drawPdfCellBorder(doc, gx, headerTop, groupW, headerH1);
      drawPdfCellText(doc, group.title, gx, headerTop, groupW, headerH1, {
        align: 'center',
        bold: true,
        fontSize: FONT_REPORT_TABLE,
        onDarkHeader: true,
      });
      const subTop = headerTop + headerH1;
      for (let i = 0; i < span; i++) {
        const cw = colWidths[col + i]!;
        const sx = colX[col + i]!;
        doc.setFillColor(INDIGO_700[0], INDIGO_700[1], INDIGO_700[2]);
        doc.rect(sx, subTop, cw, headerH2, 'F');
        drawPdfCellBorder(doc, sx, subTop, cw, headerH2);
        drawPdfCellText(doc, group.subHeaders[i] || ' ', sx, subTop, cw, headerH2, {
          align: 'center',
          bold: true,
          fontSize: FONT_REPORT_TABLE,
          onDarkHeader: true,
        });
      }
    }
    col += span;
  }

  y = headerTop + headerBlockH;

  RAMP_RESOURCE_DESCRIPTION_ROWS.forEach((label, ri) => {
    y = newPageIfNeeded(doc, y, bodyRowH + 1);
    const rowTop = y;
    const rowFill = ri % 2 === 0 ? [255, 255, 255] : RAMP_SCHED_ROW_FILL;

    doc.setFillColor(RAMP_LABEL_FILL[0], RAMP_LABEL_FILL[1], RAMP_LABEL_FILL[2]);
    doc.rect(colX[0]!, rowTop, colWidths[0]!, bodyRowH, 'F');
    drawPdfCellBorder(doc, colX[0]!, rowTop, colWidths[0]!, bodyRowH);
    drawPdfCellText(doc, label, colX[0]!, rowTop, colWidths[0]!, bodyRowH, {
      align: 'left',
      bold: true,
      fontSize: FONT_REPORT_TABLE,
      padX: 1.2,
    });

    for (let c = 0; c < dataColCount; c++) {
      const ci = c + 1;
      const val = form.resourceValues[ri]?.[c] || '—';
      doc.setFillColor(rowFill[0], rowFill[1], rowFill[2]);
      doc.rect(colX[ci]!, rowTop, colWidths[ci]!, bodyRowH, 'F');
      drawPdfCellBorder(doc, colX[ci]!, rowTop, colWidths[ci]!, bodyRowH);
      drawPdfCellText(doc, val, colX[ci]!, rowTop, colWidths[ci]!, bodyRowH, {
        align: 'center',
        fontSize: FONT_REPORT_TABLE,
      });
    }
    y += bodyRowH;
  });

  return y + 2;
}

function drawFlightSection(
  doc: jsPDF,
  y: number,
  sectionTitle: string,
  rows: (RampScheduledAirlineRow | NonScheduledAirlineTableRow)[],
  emptyMessage: string,
  greenRows: boolean,
): number {
  y = drawOrangeSectionBar(doc, y, sectionTitle);
  if (rows.length === 0) {
    y = newPageIfNeeded(doc, y, 10);
    doc.setDrawColor(STROKE[0], STROKE[1], STROKE[2]);
    doc.setFillColor(RAMP_HEADER_FILL[0], RAMP_HEADER_FILL[1], RAMP_HEADER_FILL[2]);
    const headerH = 8;
    doc.rect(MARGIN, y, CONTENT_W, headerH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_REPORT_TABLE);
    doc.setTextColor(HEADER_TEXT[0], HEADER_TEXT[1], HEADER_TEXT[2]);
    let hx = MARGIN;
    const colW = flightTableColWidths(doc, FLIGHT_HEADERS, [], CONTENT_W, FONT_REPORT_TABLE);
    for (let i = 0; i < FLIGHT_HEADERS.length; i++) {
      doc.text(FLIGHT_HEADERS[i]!, hx + 1, y + 4);
      if (i > 0) doc.line(hx, y, hx, y + headerH);
      hx += colW[i]!;
    }
    doc.rect(MARGIN, y, CONTENT_W, headerH, 'S');
    y += headerH;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    doc.rect(MARGIN, y, CONTENT_W, 8, 'S');
    doc.text(emptyMessage, MARGIN + CONTENT_W / 2, y + 5, { align: 'center' });
    return y + 10;
  }

  const bodyRows = rows.map((row) => flightDataRow(row));
  const colWidths = flightTableColWidths(doc, FLIGHT_HEADERS, bodyRows, CONTENT_W, FONT_REPORT_TABLE);
  return drawPdfTable(doc, y, colWidths, FLIGHT_HEADERS, bodyRows, {
    fontSize: FONT_REPORT_TABLE,
    lineH: FONT_REPORT_TABLE_LINE_H,
    minRowH: 8.5,
    headerH: 8.5,
    maxBodyLines: 2,
    rowFill: greenRows ? () => RAMP_SCHED_ROW_FILL : undefined,
  });
}

function drawNotes(doc: jsPDF, y: number, form: RampShiftFormSnapshot): number {
  const gap = 3;
  const boxW = (CONTENT_W - gap) / 2;
  const notes = [
    {
      title: 'Operational Performance : Appreciations / Observations / Suggestions',
      body: richTextToPlainText(form.operationalNotes) || '—',
    },
    {
      title: 'Irregularities : Staff Issues / Safety / Compliance',
      body: richTextToPlainText(form.irregularitiesNotes) || '—',
    },
  ];

  const titlePad = 3;
  const titleLineH = 3;
  const bodyLineH = 3.2;
  const bodyPad = 4;
  const maxBodyLines = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);

  const layouts = notes.map((note) => ({
    titleLines: doc.splitTextToSize(note.title, boxW - titlePad * 2),
    bodyLines: doc.splitTextToSize(note.body, boxW - 4).slice(0, maxBodyLines),
  }));

  const titleLineCount = Math.max(...layouts.map((l) => l.titleLines.length), 1);
  const titleH = 5 + titleLineCount * titleLineH;
  const bodyLineCount = Math.max(...layouts.map((l) => l.bodyLines.length), 1);
  const bodyH = bodyLineCount * bodyLineH + bodyPad;
  const boxH = titleH + bodyH;

  const topY = newPageIfNeeded(doc, y, boxH + 4);

  for (let i = 0; i < layouts.length; i++) {
    const { titleLines, bodyLines } = layouts[i]!;
    const x0 = MARGIN + i * (boxW + gap);
    const bodyTop = topY + titleH;

    doc.setDrawColor(STROKE[0], STROKE[1], STROKE[2]);

    doc.setFillColor(RAMP_HEADER_FILL[0], RAMP_HEADER_FILL[1], RAMP_HEADER_FILL[2]);
    doc.rect(x0, topY, boxW, titleH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(HEADER_TEXT[0], HEADER_TEXT[1], HEADER_TEXT[2]);
    const titleBlockH = titleLines.length * titleLineH;
    let ty = topY + (titleH - titleBlockH) / 2 + 3;
    for (const line of titleLines) {
      doc.text(line, x0 + boxW / 2, ty, { align: 'center' });
      ty += titleLineH;
    }

    doc.setFillColor(255, 255, 255);
    doc.rect(x0, bodyTop, boxW, bodyH, 'FD');
    doc.line(x0, bodyTop, x0 + boxW, bodyTop);
    doc.rect(x0, topY, boxW, boxH, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    let by = bodyTop + 3;
    for (const line of bodyLines) {
      doc.text(line, x0 + 2, by);
      by += bodyLineH;
    }
  }

  return topY + boxH + 4;
}

/**
 * Builds and downloads the Ramp Shift report PDF (day or night) for a saved report id.
 */
export async function downloadRampShiftReportPdf(reportId: string): Promise<void> {
  const id = String(reportId ?? '').trim();
  if (!id) throw new Error('Missing report id.');

  const payload = await getRampShiftReport(id);
  const form = payloadToFormSnapshot(payload);
  const meta = buildShiftMeta(payload);
  const scheduled = scheduledRowsForReport(form.scheduledRows);
  const scheduledEmpty =
    scheduled.length === 0
      ? form.scheduledRows.length === 0
        ? 'No scheduled flights saved on this report.'
        : 'No flights are checked and authorized.'
      : '';

  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = await drawRampShiftPdfHeader(doc, PAGE_TOP, meta.title, form, meta);
  y = drawOrangeSectionBar(doc, y, 'Operational Indicators');
  y = drawIndicators(doc, y, buildIndicators(form));
  y = drawResourcesTable(doc, y, form);
  y = drawFlightSection(
    doc,
    y,
    'Scheduled Airlines',
    scheduled,
    scheduledEmpty,
    true,
  );
  y = drawFlightSection(
    doc,
    y,
    'Non-Scheduled Airlines',
    form.nonScheduledRows,
    'No non-scheduled flights for this report.',
    false,
  );
  y = drawNotes(doc, y, form);

  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Report ID: ${payload.reportId} · Modified by ${payload.modifiedBy || '—'}`,
    MARGIN + CONTENT_W / 2,
    Math.min(y + 4, PAGE_BOTTOM),
    { align: 'center' },
  );

  const shiftSlug = payload.shift === 'night' ? 'Night' : 'Day';
  const dateSlug = payload.reportDateYmd.replace(/-/g, '') || 'report';
  const safeId = id.replace(/[^\w.-]+/g, '_').slice(0, 24);
  doc.save(`Ramp-Shift-Report-${shiftSlug}-${dateSlug}-${safeId}.pdf`);
}
