import type { jsPDF } from 'jspdf';
import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import { loadLogoAsBase64 } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';
import {
  SCHEDULE_VIEW_FULL_WEEKDAY_NAMES,
  type ScheduleAirlineViewRow,
} from '@/components/fris/advance/scheduleAirlineViewModel';

const MARGIN = 10;
const PAGE_TOP = 12;
const PAGE_BOTTOM = 195;
/** `BAS.png` intrinsic size (IHDR) — aspect must match or the bitmap stretches. */
const LOGO_SRC_PX = { w: 714, h: 138 } as const;
const LOGO_MAX_W_MM = 58;
const LOGO_DRAW_W_MM = LOGO_MAX_W_MM;
const LOGO_DRAW_H_MM = (LOGO_MAX_W_MM * LOGO_SRC_PX.h) / LOGO_SRC_PX.w;
const HEADER_BLUE: [number, number, number] = [30, 64, 175];
const FOOTER_YELLOW: [number, number, number] = [254, 240, 138];
const STROKE: [number, number, number] = [200, 200, 200];

/**
 * 14 columns — total 277mm. Route + Flight No. wider; Valid from/to slightly narrower than before.
 */
const COL_W = [22, 10, 24, 20, 15, 21, 21, 21, 21, 21, 21, 21, 18, 21] as const;

const NUM_DAY_COLS = 7;
const FIRST_DAY_COL = 5;
const LAST_DAY_COL = FIRST_DAY_COL + NUM_DAY_COLS - 1;

function colXs(): number[] {
  const x0 = MARGIN;
  const xs: number[] = [];
  let x = x0;
  for (const w of COL_W) {
    xs.push(x);
    x += w;
  }
  return xs;
}

function tableWidth(): number {
  return COL_W.reduce((a, b) => a + b, 0);
}

function newPageIfNeeded(doc: jsPDF, y: number, need: number): number {
  if (y + need > PAGE_BOTTOM) {
    doc.addPage();
    return PAGE_TOP;
  }
  return y;
}

function drawTableHeader(doc: jsPDF, y: number): number {
  const xs = colXs();
  const h = 12.5;
  doc.setFillColor(...HEADER_BLUE);
  doc.rect(MARGIN, y, tableWidth(), h, 'F');
  doc.setDrawColor(...STROKE);
  doc.setLineWidth(0.15);
  doc.rect(MARGIN, y, tableWidth(), h, 'S');

  let cx = MARGIN;
  for (const w of COL_W) {
    doc.line(cx + w, y, cx + w, y + h);
    cx += w;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);

  const headers = [
    'Airline',
    'No. of flights',
    'Route',
    'Flight No.',
    'A/C Type',
    ...SCHEDULE_VIEW_FULL_WEEKDAY_NAMES,
    'Valid from',
    'Valid to',
  ];
  const headerLineH = 3.1;
  headers.forEach((text, i) => {
    const lines = doc.splitTextToSize(text, COL_W[i] - 1.2);
    const blockH = lines.length * headerLineH;
    const midY = y + h / 2;
    const firstLineY = midY - blockH / 2 + headerLineH / 2;
    lines.forEach((line: string, li: number) => {
      doc.text(line, xs[i] + COL_W[i] / 2, firstLineY + li * headerLineH, {
        align: 'center',
        baseline: 'middle',
      });
    });
  });

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + h;
}

function drawDataRow(doc: jsPDF, y: number, row: ScheduleAirlineViewRow): number {
  const xs = colXs();
  const pad = 0.8;
  const cells: string[] = [
    row.airlineName,
    String(row.weeklyCount),
    row.route,
    row.flightNo,
    row.aircraft,
    ...row.dayCells,
    row.validFrom,
    row.validTo,
  ];

  let maxLines = 1;
  const lineH = 3.2;
  doc.setFontSize(7.5);
  for (let i = 0; i < cells.length; i++) {
    const wrapped = doc.splitTextToSize(cells[i] || '', COL_W[i] - 2 * pad);
    maxLines = Math.max(maxLines, Math.min(wrapped.length, 5));
  }
  const h = Math.max(7.2, 2.8 + maxLines * lineH);

  doc.setDrawColor(...STROKE);
  doc.setLineWidth(0.12);
  doc.rect(MARGIN, y, tableWidth(), h, 'S');
  let cx = MARGIN;
  for (const w of COL_W) {
    doc.line(cx + w, y, cx + w, y + h);
    cx += w;
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  for (let i = 0; i < cells.length; i++) {
    const wrapped = doc.splitTextToSize(cells[i] || '', COL_W[i] - 2 * pad);
    const vis = wrapped.slice(0, 5);
    if (wrapped.length > 5) {
      vis[4] = `${String(vis[4]).slice(0, 16)}…`;
    }
    const startY = y + 3.6;
    vis.forEach((line: string, li: number) => {
      doc.text(line, xs[i] + COL_W[i] / 2, startY + li * lineH, { align: 'center' });
    });
  }

  return y + h;
}

/**
 * Yellow summary row (same as web): merged cols 0–4 (label), Mon–Sun counts, TOTAL spanning Valid from + Valid to.
 * Drawn above the blue header only — not repeated at the end of the sheet.
 */
function drawFooterRow(
  doc: jsPDF,
  y: number,
  footerDayCounts: number[],
  totalWeeklyFlights: number,
): number {
  const xs = colXs();
  const h = 9.5;
  const mergeFirst =
    COL_W[0] + COL_W[1] + COL_W[2] + COL_W[3] + COL_W[4];
  const xRight = MARGIN + tableWidth();

  doc.setFillColor(...FOOTER_YELLOW);
  doc.rect(MARGIN, y, tableWidth(), h, 'F');

  doc.setDrawColor(...STROKE);
  doc.setLineWidth(0.18);
  doc.rect(MARGIN, y, tableWidth(), h, 'S');

  /** Boundaries after merged block: xs[5]…xs[12]; skip xs[13] so Valid from + Valid to read as one cell. */
  for (let c = FIRST_DAY_COL; c < COL_W.length; c++) {
    if (c === COL_W.length - 1) continue;
    const vx = xs[c];
    if (vx > MARGIN && vx < xRight) {
      doc.line(vx, y, vx, y + h);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  const label = 'Weekly No Of Flights(Pax)';
  doc.text(label, MARGIN + mergeFirst / 2, y + 5.6, { align: 'center' });

  footerDayCounts.forEach((n, i) => {
    const col = FIRST_DAY_COL + i;
    doc.text(String(n), xs[col] + COL_W[col] / 2, y + 5.6, { align: 'center' });
  });

  /** Total centered across Valid from + Valid to (merged visually). */
  const totalText = `TOTAL ${totalWeeklyFlights} Per week`;
  const validFromCol = 12;
  const validToCol = 13;
  const totalSpanW = COL_W[validFromCol] + COL_W[validToCol];
  const totalCenterX = xs[validFromCol] + totalSpanW / 2;
  doc.setFontSize(7.3);
  doc.text(totalText, totalCenterX, y + 5.6, { align: 'center' });
  doc.setFontSize(8);

  doc.setFont('helvetica', 'normal');
  return y + h;
}

export type ScheduleAirlinePdfParams = {
  companyName: string;
  stationLine: string;
  /** e.g. Flight Schedule Till Dated (21-04-2026) */
  scheduleTitleLine: string;
  rows: ScheduleAirlineViewRow[];
  footerDayCounts: number[];
  totalWeeklyFlights: number;
  fileBaseName?: string;
};

export async function downloadScheduleAirlinePdf(params: ScheduleAirlinePdfParams): Promise<void> {
  const {
    companyName,
    stationLine,
    scheduleTitleLine,
    rows,
    footerDayCounts,
    totalWeeklyFlights,
    fileBaseName = 'flight-schedule',
  } = params;

  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let y = MARGIN;
  const pageW = 297;
  const logo = await loadLogoAsBase64();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', MARGIN, y, LOGO_DRAW_W_MM, LOGO_DRAW_H_MM);
    } catch {
      // ignore bad image
    }
  }

  const cx = pageW / 2;
  const titleBlockTop = y + Math.max(5, LOGO_DRAW_H_MM * 0.35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  if (companyName.trim()) {
    doc.text(companyName.trim(), cx, titleBlockTop, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(stationLine, cx, titleBlockTop + 7, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(scheduleTitleLine, cx, titleBlockTop + 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');

  y += Math.max(LOGO_DRAW_H_MM + 6, 26);

  if (rows.length > 0) {
    y = drawFooterRow(doc, y, footerDayCounts, totalWeeklyFlights);
  }
  y = drawTableHeader(doc, y);

  for (let ri = 0; ri < rows.length; ri++) {
    y = newPageIfNeeded(doc, y, 12);
    if (y === PAGE_TOP) {
      y = drawFooterRow(doc, y, footerDayCounts, totalWeeklyFlights);
      y = drawTableHeader(doc, y);
    }
    y = drawDataRow(doc, y, rows[ri]);
  }

  const safe = fileBaseName.replace(/[^a-zA-Z0-9-_]+/g, '-');
  doc.save(`${safe}.pdf`);
}
