import type { jsPDF } from 'jspdf';
import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import type { FlightData } from '@/utils/dataProcessor';
import { displayFlightInstanceSerial } from '@/utils/dataProcessor';
import { loadLogoAsBase64 } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';
import { gatherPaxShiftReportData, type PaxShiftReportGathered } from '@/components/fris/reports/paxShiftReportData';
import {
  ADDITIONAL_INFO_HEADERS,
  ARRIVAL_MHB_HEADERS,
  buildAdditionalInfoRow,
  buildArrivalMhbRow,
  buildCompiledByRow,
  buildDelayCodeRows,
  buildLevel4Row,
  buildPaxRow,
  briefHandlingDescription,
  COMPILED_BY_HEADERS,
  fhCellOrDash,
  LEVEL4_HEADERS,
  PAX_FLIGHT_DETAILS_PANEL_COLUMNS,
  PAX_REPORT_PDF_HEADERS,
} from '@/components/fris/reports/paxShiftReportFlightDetailsLayout';
import {
  buildRosterLeaveTableBody,
  buildStaffDetailsTableBody,
  buildSupTlOnDutyRow,
  flightHandlingField,
  paxShiftReportFlightDate,
  paxShiftReportFlightLockDisplay,
  type PaxShiftThreeColumnRow,
} from '@/components/fris/reports/paxShiftReportTableModel';

const PAGE_TOP = 12;
const PAGE_BOTTOM = 275;
const MARGIN = 14;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - 2 * MARGIN;
/** Space below a table / block before the next line (jsPDF uses text baseline). */
const GAP_AFTER_TABLE_MM = 2;
const GAP_SECTION_TITLE_TOP = 1;
const GAP_SECTION_TITLE_AFTER = 2.5;
const GAP_BLOCK_LABEL_BEFORE = 1;
const GAP_BLOCK_LABEL_AFTER = 2;
/** Gap between major report blocks (staff, counters, delay, etc.). */
const SECTION_OUTER_GAP = 4;
/** `BAS.png` intrinsic size — keep aspect when drawing. */
const LOGO_SRC_PX = { w: 714, h: 138 } as const;
const LOGO_DRAW_W_MM = 50;
const LOGO_DRAW_H_MM = (LOGO_DRAW_W_MM * LOGO_SRC_PX.h) / LOGO_SRC_PX.w;
const HEADER_SUMMARY_LINE_H = 4.1;
/** Section headings (Flight Details, Staff On Duty, etc.). */
const FONT_SECTION_TITLE = 11;
/** Tables, labels, panel fields, header summary, prose — all non-title body content. */
const FONT_BODY = 8;
const HEADER_SUMMARY_FONT = FONT_BODY;

const STROKE: [number, number, number] = [186, 198, 210];
const HEADER_FILL: [number, number, number] = [241, 245, 249];
const ROW_ALT: [number, number, number] = [252, 252, 253];
const BODY_TEXT: [number, number, number] = [17, 24, 39];

type PdfTableTheme = {
  headerFill: [number, number, number];
  headerText: [number, number, number];
  bodyText: [number, number, number];
  stroke: [number, number, number];
};

/** Single emerald theme for the whole Pax Shift PDF. */
const REPORT_THEME: PdfTableTheme = {
  headerFill: [209, 250, 229],
  headerText: [4, 120, 87],
  bodyText: BODY_TEXT,
  stroke: STROKE,
};
const LABEL_COLOR = REPORT_THEME.headerText;
/** 11pt section / block titles (Flight Details, Staff, Delay, etc.). */
const SECTION_TITLE_COLOR: [number, number, number] = [0, 0, 0];
const SECTION_TITLE_UNDERLINE_OFFSET = 0.9;
const SECTION_TITLE_UNDERLINE_W = 0.3;
const PROSE_FILL = REPORT_THEME.headerFill;
const PROSE_BORDER: [number, number, number] = [110, 231, 183];
/** Emerald rules under the report header (primary + hairline). */
const HEADER_RULE = REPORT_THEME.headerText;
const STAFF_COL_W_DETAIL = 52;
const STAFF_COL_W_COUNT = 22;
const STAFF_COL_W_NAMES = CONTENT_W - STAFF_COL_W_DETAIL - STAFF_COL_W_COUNT;
const STAFF_TABLE_HDR = ['Details', 'Count', 'Name of staff'];

function newPageIfNeeded(doc: jsPDF, y: number, blockHeight: number): number {
  if (y + blockHeight > PAGE_BOTTOM) {
    doc.addPage();
    return PAGE_TOP;
  }
  return y;
}

/** Section title (11pt) + content, no outer border. */
function drawSectionBlock(
  doc: jsPDF,
  y: number,
  title: string,
  drawContent: (doc: jsPDF, contentY: number) => number,
): number {
  y += SECTION_OUTER_GAP;
  y = drawThemedBlockLabel(doc, y, title, SECTION_TITLE_COLOR);
  return drawContent(doc, y);
}

function setStrokeStyle(doc: jsPDF) {
  doc.setDrawColor(STROKE[0], STROKE[1], STROKE[2]);
  doc.setLineWidth(0.2);
}

function setPlainStroke(doc: jsPDF) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
}

/** Baseline Y for first text line inside a cell (top = cellTop). */
function cellTextStartY(cellTop: number): number {
  return cellTop + 4.3;
}

/**
 * Draw a bordered table: header row + body rows. Column widths in mm, sum ≤ CONTENT_W.
 * Returns Y below the table (+ small gap).
 */
function drawPdfTable(
  doc: jsPDF,
  yTop: number,
  colWidths: number[],
  headers: string[],
  rows: string[][],
  opts?: {
    headerH?: number;
    minRowH?: number;
    lineH?: number;
    plain?: boolean;
    fontSize?: number;
    theme?: PdfTableTheme;
    maxBodyLines?: number;
    maxHeaderLines?: number;
    /** Left edge of table (mm); default page margin. */
    x0?: number;
    /** Extra space after table; use 0 when placing tables side-by-side. */
    bottomGap?: number;
  },
): number {
  const theme = opts?.theme;
  const plain = theme ? false : opts?.plain === true;
  const fontSize = opts?.fontSize ?? FONT_BODY;
  const minHeaderH = opts?.headerH ?? 6.8;
  const minRowH = opts?.minRowH ?? 5.8;
  const lineH = opts?.lineH ?? 3.45;
  const x0 = opts?.x0 ?? MARGIN;
  const bottomGap = opts?.bottomGap ?? GAP_AFTER_TABLE_MM;
  const padX = plain ? 1 : 1.4;
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const colX: number[] = [];
  let cx = x0;
  for (const w of colWidths) {
    colX.push(cx);
    cx += w;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const maxHdrCap = opts?.maxHeaderLines ?? (plain || theme ? 3 : 2);
  const headerLineArrays: string[][] = [];
  let headerLineCount = 1;
  for (let c = 0; c < colWidths.length; c++) {
    const hlines = doc.splitTextToSize(headers[c] ?? '', Math.max(2, colWidths[c]! - 2 * padX)).slice(0, maxHdrCap);
    headerLineArrays.push(hlines);
    headerLineCount = Math.max(headerLineCount, hlines.length);
  }
  const headerH = Math.max(minHeaderH, headerLineCount * lineH + 2.4);

  const applyStroke = () => {
    if (theme) {
      doc.setDrawColor(theme.stroke[0], theme.stroke[1], theme.stroke[2]);
      doc.setLineWidth(0.2);
    } else if (plain) {
      setPlainStroke(doc);
    } else {
      setStrokeStyle(doc);
    }
  };

  let y = yTop;
  y = newPageIfNeeded(doc, y, headerH + 2);

  if (theme) {
    applyStroke();
    doc.setFillColor(theme.headerFill[0], theme.headerFill[1], theme.headerFill[2]);
    doc.rect(x0, y, tableW, headerH, 'FD');
  } else if (plain) {
    setPlainStroke(doc);
    doc.rect(x0, y, tableW, headerH, 'S');
  } else {
    setStrokeStyle(doc);
    doc.setFillColor(HEADER_FILL[0], HEADER_FILL[1], HEADER_FILL[2]);
    doc.rect(x0, y, tableW, headerH, 'FD');
  }
  if (theme) {
    doc.setTextColor(theme.headerText[0], theme.headerText[1], theme.headerText[2]);
  } else {
    doc.setTextColor(plain ? 0 : 30, plain ? 0 : 41, plain ? 0 : 59);
  }
  for (let c = 0; c < colWidths.length; c++) {
    if (c > 0) {
      applyStroke();
      doc.line(colX[c], y, colX[c], y + headerH);
    }
    let hy = cellTextStartY(y);
    for (const hl of headerLineArrays[c]!) {
      doc.text(hl, colX[c]! + padX, hy);
      hy += lineH;
    }
  }
  if (!plain && !theme) {
    setStrokeStyle(doc);
    doc.rect(x0, y, tableW, headerH, 'S');
  } else if (theme) {
    applyStroke();
    doc.rect(x0, y, tableW, headerH, 'S');
  }
  y += headerH;

  doc.setFont('helvetica', 'normal');
  if (theme) {
    doc.setTextColor(theme.bodyText[0], theme.bodyText[1], theme.bodyText[2]);
  } else {
    doc.setTextColor(plain ? 0 : 17, plain ? 0 : 24, plain ? 0 : 39);
  }
  doc.setFontSize(fontSize);

  rows.forEach((cells, ri) => {
    const padded = colWidths.map((_, i) => String(cells[i] ?? '').trim() || '—');
    let rowH = minRowH;
    const lineArrays: string[][] = [];
    for (let c = 0; c < colWidths.length; c++) {
      const lines = doc.splitTextToSize(padded[c], colWidths[c] - 2 * padX);
      lineArrays.push(lines);
      rowH = Math.max(rowH, Math.min(lines.length, plain ? 12 : 6) * lineH + 2.2);
    }

    y = newPageIfNeeded(doc, y, rowH + 1);
    if (!plain && !theme && ri % 2 === 1) {
      doc.setFillColor(ROW_ALT[0], ROW_ALT[1], ROW_ALT[2]);
      doc.rect(x0, y, tableW, rowH, 'F');
    }
    applyStroke();
    doc.rect(x0, y, tableW, rowH, 'S');
    for (let c = 1; c < colWidths.length; c++) {
      applyStroke();
      doc.line(colX[c], y, colX[c], y + rowH);
    }

    const maxLines = opts?.maxBodyLines ?? (plain ? 12 : theme ? 8 : 6);
    for (let c = 0; c < colWidths.length; c++) {
      const lines = lineArrays[c].slice(0, maxLines);
      let ty = cellTextStartY(y);
      for (let L = 0; L < lines.length; L++) {
        doc.text(lines[L], colX[c] + padX, ty);
        ty += lineH;
      }
      if (lineArrays[c].length > maxLines) {
        doc.text('…', colX[c] + padX, ty - lineH * 0.2);
      }
    }
    y += rowH;
  });

  setStrokeStyle(doc);
  doc.setTextColor(0, 0, 0);
  return y + bottomGap;
}

/** Logo (left), title (center), flight summary stacked on the right — no borders or section title. */
async function drawPaxShiftPdfHeader(
  doc: jsPDF,
  yTop: number,
  flight: FlightData,
  fh: Record<string, string | number> | null | undefined,
  serialLabel: string,
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
    { label: 'Airline name', value: String(flight.airline ?? '').trim() || '—' },
    { label: 'Flight no.', value: String(flight.flightNo ?? '').trim() || '—' },
    { label: 'Flight lock', value: paxShiftReportFlightLockDisplay(flight) },
    { label: 'Date', value: paxShiftReportFlightDate(flight, fh) },
    { label: 'FHR No.', value: String(serialLabel ?? '').trim() || '—' },
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
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('PAX SHIFT REPORT', PAGE_W / 2, titleBaseline, { align: 'center' });
  doc.setFont('helvetica', 'normal');

  const blockBottom = Math.max(
    yTop + LOGO_DRAW_H_MM,
    summaryBaseline + 1.2,
    titleBaseline + 5,
  );

  const ruleY = blockBottom + 1;
  doc.setDrawColor(HEADER_RULE[0], HEADER_RULE[1], HEADER_RULE[2]);
  doc.setLineWidth(0.45);
  doc.line(MARGIN, ruleY, MARGIN + CONTENT_W, ruleY);
  doc.setLineWidth(0.12);
  doc.line(MARGIN, ruleY + 1.2, MARGIN + CONTENT_W, ruleY + 1.2);

  return ruleY + 2;
}

function equalColWidths(n: number, totalW: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((totalW / n) * 100) / 100;
  const arr = Array.from({ length: n }, () => base);
  const rem = +(totalW - base * n).toFixed(2);
  arr[n - 1] = +(arr[n - 1]! + rem).toFixed(2);
  return arr;
}

/** Column widths from header/cell text; scales to `totalW` with optional per-column minimums (mm). */
function fitTableColWidths(
  doc: jsPDF,
  headers: string[],
  rows: string[][],
  totalW: number,
  fontSize: number,
  colMinMm?: number[],
): number[] {
  const padMm = 2.6;
  doc.setFontSize(fontSize);
  const raw: number[] = [];
  for (let c = 0; c < headers.length; c++) {
    const floor = colMinMm?.[c] ?? 6;
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

/** Horizontal passenger table: wider Info column, equal data columns across remaining width. */
function paxHorizontalColWidths(totalW: number, colCount: number, infoW = 16): number[] {
  if (colCount <= 1) return [totalW];
  const dataCols = colCount - 1;
  const dataW = +((totalW - infoW) / dataCols).toFixed(2);
  const widths = [infoW, ...Array.from({ length: dataCols }, () => dataW)];
  const rem = +(totalW - widths.reduce((a, b) => a + b, 0)).toFixed(2);
  widths[widths.length - 1] = +(widths[widths.length - 1]! + rem).toFixed(2);
  return widths;
}

function threeColStaffRowsToPdf(rows: PaxShiftThreeColumnRow[]): string[][] {
  return rows.map((r) => [r.detail, r.count, r.names]);
}

function drawSectionTitleUnderline(
  doc: jsPDF,
  x: number,
  baseline: number,
  textWidth: number,
  color: [number, number, number],
): void {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(SECTION_TITLE_UNDERLINE_W);
  const lineY = baseline + SECTION_TITLE_UNDERLINE_OFFSET;
  doc.line(x, lineY, x + textWidth, lineY);
}

/** Section heading (color-themed); centered by default, or left-aligned. */
function drawThemedSectionTitle(
  doc: jsPDF,
  y: number,
  title: string,
  titleColor: [number, number, number] = SECTION_TITLE_COLOR,
  topGap = GAP_SECTION_TITLE_TOP,
  align: 'left' | 'center' = 'center',
): number {
  y += topGap;
  y = newPageIfNeeded(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SECTION_TITLE);
  doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
  const baseline = y + 4.8;
  const textW = doc.getTextWidth(title);
  const x = align === 'left' ? MARGIN : MARGIN + CONTENT_W / 2;
  doc.text(title, x, baseline, { align });
  const underlineX = align === 'left' ? x : x - textW / 2;
  drawSectionTitleUnderline(doc, underlineX, baseline, textW, titleColor);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  return baseline + GAP_SECTION_TITLE_AFTER;
}

type PaxPanelField = { label: string; key: string };

function drawFlightDetailsLabelValue(
  doc: jsPDF,
  lx: number,
  ly: number,
  field: PaxPanelField,
  fh: Record<string, string>,
  opts: { labelWidth: number; valueMaxWidth: number },
): void {
  const prefix = `${field.label} : `;
  const value = fhCellOrDash(fh, field.key);
  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(REPORT_THEME.headerText[0], REPORT_THEME.headerText[1], REPORT_THEME.headerText[2]);
  doc.text(prefix, lx, ly);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const lines = doc.splitTextToSize(value, Math.max(4, opts.valueMaxWidth));
  doc.text(lines[0] || '—', lx + opts.labelWidth, ly);
}

function maxLabelWidth(doc: jsPDF, labels: string[]): number {
  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'bold');
  let max = 0;
  for (const label of labels) {
    max = Math.max(max, doc.getTextWidth(`${label} : `));
  }
  return max;
}

function equalPanelColWidths(columnCount: number, totalW = CONTENT_W): number[] {
  const base = +(totalW / columnCount).toFixed(2);
  const widths = Array.from({ length: columnCount }, () => base);
  const rem = +(totalW - base * columnCount).toFixed(2);
  widths[widths.length - 1] = +(widths[widths.length - 1]! + rem).toFixed(2);
  return widths;
}

/** Flight Details — 4 equal columns of label : value. */
function drawFlightDetailsTimesTable(
  doc: jsPDF,
  y: number,
  fhRaw: Record<string, string | number> | null | undefined,
): number {
  const fh: Record<string, string> = Object.fromEntries(
    Object.entries(fhRaw ?? {}).map(([key, entryValue]) => [key, String(entryValue ?? '')]),
  );
  y = drawThemedSectionTitle(doc, y, 'Flight Details', SECTION_TITLE_COLOR, 0, 'left');

  const pad = 2;
  const lineStep = 3.6;
  const colCount = PAX_FLIGHT_DETAILS_PANEL_COLUMNS.length;
  const colWidths = equalPanelColWidths(colCount);
  const x0 = MARGIN;
  const colX: number[] = [x0];
  for (let i = 1; i < colCount; i++) {
    colX.push(colX[i - 1]! + colWidths[i - 1]!);
  }

  const panelRows = Math.max(...PAX_FLIGHT_DETAILS_PANEL_COLUMNS.map((col) => col.length));
  const panelH = 3 + panelRows * lineStep + 1.5;

  y = newPageIfNeeded(doc, y, panelH + 2);
  doc.setDrawColor(STROKE[0], STROKE[1], STROKE[2]);
  doc.setLineWidth(0.2);
  doc.setFillColor(255, 255, 255);
  doc.rect(x0, y, CONTENT_W, panelH, 'FD');
  doc.rect(x0, y, CONTENT_W, panelH, 'S');
  for (let i = 1; i < colCount; i++) {
    doc.line(colX[i]!, y, colX[i]!, y + panelH);
  }

  PAX_FLIGHT_DETAILS_PANEL_COLUMNS.forEach((fields, colIndex) => {
    const colW = colWidths[colIndex]!;
    const labelW = maxLabelWidth(
      doc,
      fields.map((f) => f.label),
    );
    const valueMax = colW - pad * 2 - labelW;
    fields.forEach((field, rowIndex) => {
      drawFlightDetailsLabelValue(doc, colX[colIndex]! + pad, y + 3 + rowIndex * lineStep, field, fh, {
        labelWidth: labelW,
        valueMaxWidth: valueMax,
      });
    });
  });

  doc.setTextColor(0, 0, 0);
  return y + panelH + GAP_AFTER_TABLE_MM;
}

function staffColsForTableWidth(tableW: number): number[] {
  const scale = tableW / CONTENT_W;
  const detail = +(STAFF_COL_W_DETAIL * scale).toFixed(2);
  const count = +(STAFF_COL_W_COUNT * scale).toFixed(2);
  const names = +(tableW - detail - count).toFixed(2);
  return [detail, count, names];
}

/** Staff rostered/Duty — wider Details, Count on one line, slightly narrower names. */
function staffRosterColsForTableWidth(tableW: number): number[] {
  const count = Math.max(+(tableW * 0.17).toFixed(2), 15);
  const detail = +(tableW * 0.32).toFixed(2);
  const names = +(tableW - detail - count).toFixed(2);
  return [detail, count, names];
}

function drawStaffSectionContent(doc: jsPDF, y: number, gathered: PaxShiftReportGathered): number {
  const staffCols = [STAFF_COL_W_DETAIL, STAFF_COL_W_COUNT, STAFF_COL_W_NAMES];
  const staffOpts = {
    fontSize: FONT_BODY,
    minRowH: 6.5,
    maxBodyLines: 14,
    theme: REPORT_THEME,
  };

  y = drawPdfTable(
    doc,
    y,
    staffCols,
    STAFF_TABLE_HDR,
    threeColStaffRowsToPdf([buildSupTlOnDutyRow(gathered)]),
    staffOpts,
  );

  const staffPairGap = 4;
  const rosterW = +(CONTENT_W * 0.4).toFixed(2);
  const detailsW = +(CONTENT_W - rosterW - staffPairGap).toFixed(2);
  const detailsX = MARGIN + rosterW + staffPairGap;
  y = drawThemedDualBlockLabel(
    doc,
    y,
    { title: 'Staff rostered/Duty', color: SECTION_TITLE_COLOR },
    { title: 'Staff Details', color: SECTION_TITLE_COLOR, x: detailsX },
  );
  const pairTop = y;
  const pairOpts = { ...staffOpts, bottomGap: 0 };
  const yRoster = drawPdfTable(
    doc,
    pairTop,
    staffRosterColsForTableWidth(rosterW),
    STAFF_TABLE_HDR,
    threeColStaffRowsToPdf(buildRosterLeaveTableBody(gathered)),
    { ...pairOpts, x0: MARGIN },
  );
  const yDetails = drawPdfTable(
    doc,
    pairTop,
    staffColsForTableWidth(detailsW),
    STAFF_TABLE_HDR,
    threeColStaffRowsToPdf(buildStaffDetailsTableBody(gathered)),
    { ...pairOpts, x0: detailsX },
  );
  return Math.max(yRoster, yDetails) + GAP_AFTER_TABLE_MM;
}

function countersColsForTableWidth(tableW: number): number[] {
  const scale = tableW / CONTENT_W;
  const uh = +(58 * scale).toFixed(2);
  const reason = +(62 * scale).toFixed(2);
  const staff = +(tableW - uh - reason).toFixed(2);
  return [uh, reason, staff];
}

/** Counters & overtime (left) and Level-4 Bags (right). */
function drawCountersLevel4Content(
  doc: jsPDF,
  y: number,
  fh: Record<string, string | number> | null | undefined,
): number {
  const pairGap = 4;
  const countersW = +((CONTENT_W - pairGap) / 2).toFixed(2);
  const level4W = +(CONTENT_W - countersW - pairGap).toFixed(2);
  const level4X = MARGIN + countersW + pairGap;

  y = drawThemedDualBlockLabel(
    doc,
    y,
    { title: 'Counters & overtime', color: SECTION_TITLE_COLOR },
    { title: 'Level-4 Bags', color: SECTION_TITLE_COLOR, x: level4X },
  );

  const uh = flightHandlingField(fh, 'uhCounters');
  const overtimeReason = flightHandlingField(fh, 'overtimeReason');
  const staffOvertime = flightHandlingField(fh, 'staffOvertime');
  const pairTop = y;
  const pairOpts = { bottomGap: 0 };

  const yCounters = drawPdfTable(
    doc,
    pairTop,
    countersColsForTableWidth(countersW),
    ['UH counter', 'Overtime reason', 'Staff of overtime'],
    [[uh || '—', overtimeReason || '—', staffOvertime || '—']],
    { fontSize: FONT_BODY, minRowH: 7, maxBodyLines: 10, theme: REPORT_THEME, ...pairOpts },
  );
  const yLevel4 = drawPdfTable(
    doc,
    pairTop,
    [26, level4W - 26],
    [...LEVEL4_HEADERS],
    [buildLevel4Row(fh)],
    { fontSize: FONT_BODY, minRowH: 7, theme: REPORT_THEME, x0: level4X, ...pairOpts },
  );
  return Math.max(yCounters, yLevel4) + GAP_AFTER_TABLE_MM;
}

function drawShortShippedContent(doc: jsPDF, y: number, gathered: PaxShiftReportGathered): number {
  const tableGap = 4;
  const leftTableW = 58;
  const rightTableW = CONTENT_W - leftTableW - tableGap;
  const tableTop = y;
  const sideOpts = { fontSize: FONT_BODY, theme: REPORT_THEME, bottomGap: 0 };

  const yLeft = drawPdfTable(
    doc,
    tableTop,
    [28, 30],
    ['Label', 'Value'],
    [['No. of bags', gathered.shortShipped.noOfBags !== '' ? gathered.shortShipped.noOfBags : '—']],
    { ...sideOpts, minRowH: 6.5, x0: MARGIN },
  );

  const wSr = 11;
  const wOpt = 38;
  const wRem = +(rightTableW - wSr - wOpt).toFixed(2);
  const rightX = MARGIN + leftTableW + tableGap;
  const detailRows =
    gathered.shortShipped.rows.length === 0
      ? [['—', '—', 'No detail rows']]
      : gathered.shortShipped.rows.map((r, idx) => [
          String(idx + 1),
          r.optionSection || '—',
          r.remarks || '—',
        ]);

  const yRight = drawPdfTable(
    doc,
    tableTop,
    [wSr, wOpt, wRem],
    ['Sr.', 'Option section', 'Remarks'],
    detailRows,
    {
      ...sideOpts,
      minRowH: gathered.shortShipped.rows.length === 0 ? 6 : 6.5,
      maxBodyLines: 10,
      x0: rightX,
    },
  );

  return Math.max(yLeft, yRight) + GAP_AFTER_TABLE_MM;
}

/** Subsection title above a table (same 11pt as main section titles by default). */
function drawThemedBlockLabel(
  doc: jsPDF,
  y: number,
  title: string,
  labelColor: [number, number, number],
  fontSize = FONT_SECTION_TITLE,
): number {
  y += GAP_BLOCK_LABEL_BEFORE;
  y = newPageIfNeeded(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
  const baseline = y + (fontSize >= FONT_SECTION_TITLE ? 4.8 : 3.8);
  doc.text(title, MARGIN, baseline);
  if (fontSize >= FONT_SECTION_TITLE) {
    drawSectionTitleUnderline(doc, MARGIN, baseline, doc.getTextWidth(title), labelColor);
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  return baseline + (fontSize >= FONT_SECTION_TITLE ? GAP_SECTION_TITLE_AFTER : GAP_BLOCK_LABEL_AFTER);
}

/** Two subsection titles on one row (left + right columns). */
function drawThemedDualBlockLabel(
  doc: jsPDF,
  y: number,
  left: { title: string; color: [number, number, number] },
  right: { title: string; color: [number, number, number]; x: number },
  fontSize = FONT_SECTION_TITLE,
): number {
  y += GAP_BLOCK_LABEL_BEFORE;
  y = newPageIfNeeded(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const baseline = y + (fontSize >= FONT_SECTION_TITLE ? 4.8 : 3.8);
  doc.setTextColor(left.color[0], left.color[1], left.color[2]);
  doc.text(left.title, MARGIN, baseline);
  if (fontSize >= FONT_SECTION_TITLE) {
    drawSectionTitleUnderline(doc, MARGIN, baseline, doc.getTextWidth(left.title), left.color);
  }
  doc.setTextColor(right.color[0], right.color[1], right.color[2]);
  doc.text(right.title, right.x, baseline);
  if (fontSize >= FONT_SECTION_TITLE) {
    drawSectionTitleUnderline(doc, right.x, baseline, doc.getTextWidth(right.title), right.color);
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  return baseline + (fontSize >= FONT_SECTION_TITLE ? GAP_SECTION_TITLE_AFTER : GAP_BLOCK_LABEL_AFTER);
}

const WIDE_TABLE_OPTS = {
  fontSize: FONT_BODY,
  headerH: 6,
  minRowH: 6,
  lineH: 3.1,
  maxHeaderLines: 2,
  maxBodyLines: 6,
  theme: REPORT_THEME,
} as const;

function drawDelayCodeContent(doc: jsPDF, y: number, fh: Record<string, string>): number {
  return drawPdfTable(
    doc,
    y,
    [CONTENT_W - 14, 14],
    ['Delay Code & Description', 'Min'],
    buildDelayCodeRows(fh),
    { fontSize: FONT_BODY, minRowH: 6.5, theme: REPORT_THEME },
  );
}

function drawPaxTransitContent(doc: jsPDF, y: number, fh: Record<string, string>): number {
  const paxHeaders = [...PAX_REPORT_PDF_HEADERS];
  const paxRows = [buildPaxRow(fh, 'arrivals'), buildPaxRow(fh, 'departures')];
  return drawPdfTable(
    doc,
    y,
    paxHorizontalColWidths(CONTENT_W, paxHeaders.length),
    paxHeaders,
    paxRows,
    { ...WIDE_TABLE_OPTS },
  );
}

function drawArrivalMhbContent(doc: jsPDF, y: number, fh: Record<string, string>): number {
  const mhbHeaders = [...ARRIVAL_MHB_HEADERS];
  const mhbRows = [buildArrivalMhbRow(fh)];
  return drawPdfTable(
    doc,
    y,
    fitTableColWidths(doc, mhbHeaders, mhbRows, CONTENT_W, FONT_BODY),
    mhbHeaders,
    mhbRows,
    { ...WIDE_TABLE_OPTS },
  );
}

function drawAdditionalInfoContent(doc: jsPDF, y: number, fh: Record<string, string>): number {
  const addHeaders = [...ADDITIONAL_INFO_HEADERS];
  const addRows = [buildAdditionalInfoRow(fh)];
  return drawPdfTable(
    doc,
    y,
    fitTableColWidths(doc, addHeaders, addRows, CONTENT_W, FONT_BODY),
    addHeaders,
    addRows,
    { ...WIDE_TABLE_OPTS },
  );
}

function drawBriefHandlingContent(doc: jsPDF, y: number, fh: Record<string, string>): number {
  return drawThemedProseBox(doc, y, briefHandlingDescription(fh), REPORT_THEME);
}

function drawThemedProseBox(doc: jsPDF, y: number, text: string, theme: PdfTableTheme): number {
  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text.trim() || '—', CONTENT_W - 4);
  const lineH = 3.85;
  const padY = 1.5;
  const boxH = Math.min(lines.length, 45) * lineH + padY * 2;
  y = newPageIfNeeded(doc, y, boxH + 1);
  doc.setDrawColor(theme.stroke[0], theme.stroke[1], theme.stroke[2]);
  doc.setLineWidth(0.2);
  doc.setFillColor(PROSE_FILL[0], PROSE_FILL[1], PROSE_FILL[2]);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 1.5, 1.5, 'FD');
  doc.setDrawColor(PROSE_BORDER[0], PROSE_BORDER[1], PROSE_BORDER[2]);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 1.5, 1.5, 'S');
  doc.setTextColor(theme.bodyText[0], theme.bodyText[1], theme.bodyText[2]);
  let ty = y + padY + 3;
  const cap = 45;
  for (let i = 0; i < Math.min(lines.length, cap); i++) {
    doc.text(lines[i]!, MARGIN + 2, ty);
    ty += lineH;
  }
  if (lines.length > cap) {
    doc.text('…', MARGIN + 2, ty);
  }
  doc.setTextColor(0, 0, 0);
  return y + boxH + GAP_AFTER_TABLE_MM;
}

function drawReportCompiledBy(
  doc: jsPDF,
  y: number,
  fh: Record<string, string | number> | null | undefined,
): number {
  y = drawThemedBlockLabel(doc, y, 'Report compiled by', REPORT_THEME.headerText, FONT_BODY);
  return drawPdfTable(
    doc,
    y,
    equalColWidths(COMPILED_BY_HEADERS.length, CONTENT_W),
    [...COMPILED_BY_HEADERS],
    [buildCompiledByRow(fh)],
    { fontSize: FONT_BODY, minRowH: 7, headerH: 7, theme: REPORT_THEME },
  );
}

/**
 * Builds the full single-flight Pax Shift PDF: header, Flight Details times,
 * staff, counters, short shipped bags, then remaining Flight Details tables.
 */
export async function buildPaxShiftReportPdfDoc(
  flight: FlightData,
  pregathered?: PaxShiftReportGathered,
): Promise<{ doc: jsPDF; serialLabel: string }> {
  const fs = String(flight.slNo ?? '').trim();
  const serialLabel = displayFlightInstanceSerial(flight.slNo);
  const gathered = pregathered || (await gatherPaxShiftReportData(fs));
  const fh = gathered.flightHandling;

  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = await drawPaxShiftPdfHeader(doc, PAGE_TOP, flight, fh, serialLabel);
  y = drawFlightDetailsTimesTable(doc, y, fh);

  const fhRecord: Record<string, string> = Object.fromEntries(
    Object.entries(fh ?? {}).map(([key, entryValue]) => [key, String(entryValue ?? '')]),
  );

  y = drawSectionBlock(doc, y, 'Staff On Duty (Sup/TL), Rostered & Details', (d, cy) =>
    drawStaffSectionContent(d, cy, gathered),
  );
  y = drawSectionBlock(doc, y, 'Counters & overtime / Level-4 Bags', (d, cy) =>
    drawCountersLevel4Content(d, cy, fh),
  );
  y = drawSectionBlock(doc, y, 'Short shipped bag', (d, cy) => drawShortShippedContent(d, cy, gathered));
  y = drawSectionBlock(doc, y, 'Delay Code & Description', (d, cy) => drawDelayCodeContent(d, cy, fhRecord));
  y = drawSectionBlock(doc, y, 'Passenger / Transit pax / Baggage count', (d, cy) =>
    drawPaxTransitContent(d, cy, fhRecord),
  );
  y = drawSectionBlock(doc, y, 'Arrival MHB & baggage', (d, cy) => drawArrivalMhbContent(d, cy, fhRecord));
  y = drawSectionBlock(doc, y, 'Additional Info', (d, cy) => drawAdditionalInfoContent(d, cy, fhRecord));
  y = drawSectionBlock(doc, y, 'Brief description of flight handling', (d, cy) =>
    drawBriefHandlingContent(d, cy, fhRecord),
  );
  drawReportCompiledBy(doc, y, fhRecord);

  return { doc, serialLabel };
}

export function paxShiftReportPdfFilename(serialLabel: string): string {
  const safeFile = serialLabel.replace(/[^\w.-]+/g, '_');
  return `Pax-Shift-Report-${safeFile || 'flight'}.pdf`;
}

/** PDF as base64 for email attachment upload. */
export async function buildPaxShiftReportPdfBase64(
  flight: FlightData,
  pregathered?: PaxShiftReportGathered,
): Promise<{ base64: string; filename: string; serialLabel: string }> {
  const { doc, serialLabel } = await buildPaxShiftReportPdfDoc(flight, pregathered);
  const filename = paxShiftReportPdfFilename(serialLabel);
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] ?? '' : '';
  return { base64, filename, serialLabel };
}

export async function downloadPaxShiftReportPdf(
  flight: FlightData,
  pregathered?: PaxShiftReportGathered,
): Promise<void> {
  const { doc, serialLabel } = await buildPaxShiftReportPdfDoc(flight, pregathered);
  doc.save(paxShiftReportPdfFilename(serialLabel));
}
