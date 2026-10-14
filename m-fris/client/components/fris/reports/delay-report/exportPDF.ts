import type { jsPDF } from 'jspdf';
import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import { loadLogoAsBase64 } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';
import { formatMinutesAsDisplay, ymdToDdMmYyyy } from './delayReportUtils';

export type DelayReportPdfCodeRow = {
  code: string;
  description: string;
  category: string;
  flightCount: number;
  totalMinutes: number;
  avgMinutes: number;
  pctOfDelay: number;
  severity: string;
  owner: 'gha' | 'non-gha';
};

export type DelayReportPdfInput = {
  filters: {
    fromYmd: string;
    toYmd: string;
    airline: string;
    station: string;
  };
  kpis: Array<{ title: string; value: string }>;
  insights: string[];
  topCodes: DelayReportPdfCodeRow[];
  ghaRows: DelayReportPdfCodeRow[];
  nonGhaRows: DelayReportPdfCodeRow[];
  monthlyTrend: Array<{
    month: string;
    label?: string;
    delayedFlights: number;
    avgDuration: number;
    trendFlights?: number;
  }>;
  severitySplit: { high: number; low: number };
  hourlyDistribution: Array<{ hour: string; delays: number }>;
  weeklyDistribution: Array<{
    week: string;
    rotation: number;
    atfm: number;
    operational: number;
  }>;
  airlineShare: ReadonlyArray<{ name: string; flights: number }>;
  stationBreakdown: ReadonlyArray<{ name: string; delays: number }>;
};

const MARGIN = 10;
const PAGE_TOP = 12;
const HEADER_BG: [number, number, number] = [5, 150, 105];
const KPI_BOX_FILL: [number, number, number] = [247, 254, 251];
const FONT_BODY = 7.5;
const FONT_TITLE = 14;
const FONT_SECTION = 10;
const FONT_KPI = 8.5;
const LOGO_SRC_PX = { w: 714, h: 138 } as const;
const LOGO_DRAW_W_MM = 36;
const LOGO_DRAW_H_MM = (LOGO_DRAW_W_MM * LOGO_SRC_PX.h) / LOGO_SRC_PX.w;

const CODE_HEADERS = [
  'Code',
  'Description',
  'Category',
  'Flights',
  'Total delay',
  'Avg delay',
  '% of delay',
  'Severity',
];
const CODE_COL_WEIGHTS = [10, 48, 28, 16, 22, 20, 18, 16];
const CODE_ALIGNS = [
  'left',
  'left',
  'left',
  'right',
  'right',
  'right',
  'right',
  'center',
] as const;

type SeverityLevel = 'High' | 'Watch' | 'Alert';

const SEVERITY_ROW_FILL: Record<SeverityLevel, [number, number, number]> = {
  High: [254, 226, 226],
  Watch: [254, 249, 195],
  Alert: [255, 237, 213],
};

const SEVERITY_TEXT: Record<SeverityLevel, [number, number, number]> = {
  High: [185, 28, 28],
  Watch: [161, 98, 7],
  Alert: [194, 65, 12],
};

const CHART_BAR: [number, number, number] = [5, 150, 105];
const CHART_TREND: [number, number, number] = [20, 184, 166];
const CHART_AVG: [number, number, number] = [245, 158, 11];
const CHART_GRID: [number, number, number] = [226, 232, 240];
const CHART_MUTED: [number, number, number] = [100, 116, 139];

const STROKE: [number, number, number] = [167, 243, 208];

type TableAlign = 'left' | 'right' | 'center';

type PdfTableRow = {
  cells: string[];
  severity?: string;
};

type MonthlyTrendPoint = DelayReportPdfInput['monthlyTrend'][number];

type PdfLayout = {
  pageW: number;
  pageH: number;
  contentW: number;
  pageBottom: number;
};

function getLayout(doc: jsPDF): PdfLayout {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  return {
    pageW,
    pageH,
    contentW: pageW - 2 * MARGIN,
    pageBottom: pageH - 12,
  };
}

function scaleColWidths(weights: number[], targetWidth: number): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  const scaled = weights.map((weight) => (weight / total) * targetWidth);
  const rounded = scaled.map((value) => Math.floor(value * 10) / 10);
  const drift = targetWidth - rounded.reduce((sum, value) => sum + value, 0);
  rounded[rounded.length - 1] = (rounded[rounded.length - 1] ?? 0) + drift;
  return rounded;
}

function formatHoursMinutes(totalMinutes: number): string {
  return `${formatMinutesAsDisplay(totalMinutes)}h`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function normalizeSeverity(raw: string | undefined): SeverityLevel | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'high') return 'High';
  if (value === 'watch') return 'Watch';
  if (value === 'alert') return 'Alert';
  return null;
}

function severityRowFill(severity: SeverityLevel | null): [number, number, number] | null {
  if (!severity) return null;
  return SEVERITY_ROW_FILL[severity];
}

function severityTextColor(severity: SeverityLevel | null): [number, number, number] {
  if (!severity) return [0, 0, 0];
  return SEVERITY_TEXT[severity];
}

function newPageIfNeeded(doc: jsPDF, y: number, need: number, layout: PdfLayout): number {
  if (y + need > layout.pageBottom) {
    doc.addPage();
    return PAGE_TOP;
  }
  return y;
}

async function drawDelayReportHeader(
  doc: jsPDF,
  yTop: number,
  filters: DelayReportPdfInput['filters'],
  layout: PdfLayout,
): Promise<number> {
  const fromLabel = ymdToDdMmYyyy(filters.fromYmd);
  const toLabel = ymdToDdMmYyyy(filters.toYmd);
  const airlineLabel = filters.airline || 'All airlines';
  const stationLabel = filters.station || 'All stations';
  const generatedAt = new Date().toLocaleString();

  const logo = await loadLogoAsBase64();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', MARGIN, yTop, LOGO_DRAW_W_MM, LOGO_DRAW_H_MM);
    } catch {
      // ignore bad image data
    }
  }

  const rightX = layout.pageW - MARGIN;
  const summaryFields = [
    { label: 'Period', value: `${fromLabel} – ${toLabel}` },
    { label: 'Airline', value: airlineLabel },
    { label: 'Station', value: stationLabel },
    { label: 'Generated', value: generatedAt },
  ];

  doc.setFontSize(7.5);
  let summaryBaseline = yTop + 3.6;
  for (const { label, value } of summaryFields) {
    doc.setFont('helvetica', 'bold');
    const prefix = `${label}: `;
    const prefixW = doc.getTextWidth(prefix);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(value, 52);
    const lineValue = valueLines[0] ?? value;
    const valueW = doc.getTextWidth(lineValue);
    const lineW = prefixW + valueW;
    const lineX = rightX - lineW;
    doc.setFont('helvetica', 'bold');
    doc.text(prefix, lineX, summaryBaseline);
    doc.setFont('helvetica', 'normal');
    doc.text(lineValue, lineX + prefixW, summaryBaseline);
    summaryBaseline += 4.2;
  }

  const titleBaseline = yTop + Math.max(5, LOGO_DRAW_H_MM * 0.45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_TITLE);
  doc.setTextColor(5, 150, 105);
  doc.text('Delay Report', layout.pageW / 2, titleBaseline, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  const blockBottom = Math.max(
    yTop + LOGO_DRAW_H_MM,
    summaryBaseline + 1,
    titleBaseline + 4,
  );

  const ruleY = blockBottom + 2;
  doc.setDrawColor(...STROKE);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, ruleY, MARGIN + layout.contentW, ruleY);

  return ruleY + 5;
}

function drawSectionTitle(
  doc: jsPDF,
  y: number,
  title: string,
  subtitle: string | undefined,
  layout: PdfLayout,
): number {
  y = newPageIfNeeded(doc, y, subtitle ? 12 : 9, layout);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SECTION);
  doc.setTextColor(5, 150, 105);
  doc.text(title, MARGIN, y);
  y += 4.5;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, MARGIN, y);
    y += 3.5;
  }
  doc.setTextColor(0, 0, 0);
  return y + 1.5;
}

function drawTable(
  doc: jsPDF,
  y: number,
  colWidths: number[],
  headers: string[],
  rows: PdfTableRow[],
  layout: PdfLayout,
  opts?: { aligns?: TableAlign[]; maxBodyLines?: number; severityColIndex?: number },
): number {
  const tableW = colWidths.reduce((sum, width) => sum + width, 0);
  const colX: number[] = [];
  let cx = MARGIN;
  for (const width of colWidths) {
    colX.push(cx);
    cx += width;
  }
  const padX = 1.2;
  const lineH = 3.3;
  const maxBodyLines = opts?.maxBodyLines ?? 4;
  const aligns = opts?.aligns ?? headers.map(() => 'left' as TableAlign);
  const severityColIndex = opts?.severityColIndex ?? headers.length - 1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_BODY);
  let headerLines = 1;
  const headerWrapped: string[][] = [];
  for (let c = 0; c < headers.length; c++) {
    const lines = doc.splitTextToSize(headers[c] ?? '', colWidths[c]! - 2 * padX).slice(0, 2);
    headerWrapped.push(lines);
    headerLines = Math.max(headerLines, lines.length);
  }
  const headerH = Math.max(7, headerLines * lineH + 2.2);
  y = newPageIfNeeded(doc, y, headerH + 4, layout);

  doc.setFillColor(...HEADER_BG);
  doc.setDrawColor(...STROKE);
  doc.setLineWidth(0.15);
  doc.rect(MARGIN, y, tableW, headerH, 'FD');
  for (let c = 1; c < colWidths.length; c++) {
    doc.line(colX[c]!, y, colX[c]!, y + headerH);
  }
  doc.setTextColor(255, 255, 255);
  for (let c = 0; c < headers.length; c++) {
    const lines = headerWrapped[c]!;
    let ty = y + 4;
    for (const line of lines) {
      const x =
        aligns[c] === 'right'
          ? colX[c]! + colWidths[c]! - padX
          : aligns[c] === 'center'
            ? colX[c]! + colWidths[c]! / 2
            : colX[c]! + padX;
      doc.text(line, x, ty, { align: aligns[c] });
      ty += lineH;
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  y += headerH;

  rows.forEach((row) => {
    const cells = row.cells;
    const rowSeverity = normalizeSeverity(row.severity);
    const rowFill = severityRowFill(rowSeverity);

    let rowH = 5.8;
    const wrappedCells: string[][] = [];
    for (let c = 0; c < colWidths.length; c++) {
      const text = String(cells[c] ?? '').trim() || '—';
      const lines = doc.splitTextToSize(text, colWidths[c]! - 2 * padX).slice(0, maxBodyLines);
      wrappedCells.push(lines);
      rowH = Math.max(rowH, lines.length * lineH + 2);
    }

    y = newPageIfNeeded(doc, y, rowH, layout);
    if (rowFill) {
      doc.setFillColor(...rowFill);
      doc.rect(MARGIN, y, tableW, rowH, 'F');
    }
    doc.setDrawColor(...STROKE);
    doc.rect(MARGIN, y, tableW, rowH, 'S');
    for (let c = 1; c < colWidths.length; c++) {
      doc.line(colX[c]!, y, colX[c]!, y + rowH);
    }

    for (let c = 0; c < colWidths.length; c++) {
      const lines = wrappedCells[c]!;
      const isSeverityCell = c === severityColIndex;
      const textColor = isSeverityCell ? severityTextColor(rowSeverity) : ([0, 0, 0] as const);
      doc.setFont('helvetica', isSeverityCell ? 'bold' : 'normal');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      let ty = y + 3.8;
      for (const line of lines) {
        const x =
          aligns[c] === 'right'
            ? colX[c]! + colWidths[c]! - padX
            : aligns[c] === 'center'
              ? colX[c]! + colWidths[c]! / 2
              : colX[c]! + padX;
        doc.text(line, x, ty, { align: aligns[c] });
        ty += lineH;
      }
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    y += rowH;
  });

  return y + 4;
}

function codeTableRows(rows: DelayReportPdfCodeRow[]): PdfTableRow[] {
  return rows.map((row) => ({
    severity: row.severity,
    cells: [
      row.code,
      row.description,
      row.category,
      String(row.flightCount),
      formatHoursMinutes(row.totalMinutes),
      `${row.avgMinutes.toFixed(1)} min`,
      formatPercent(row.pctOfDelay),
      row.severity,
    ],
  }));
}

function drawKpiBox(
  doc: jsPDF,
  y: number,
  kpis: DelayReportPdfInput['kpis'],
  layout: PdfLayout,
): number {
  y = drawSectionTitle(doc, y, 'Key metrics', undefined, layout);

  const columns = 3;
  const innerPad = 4;
  const gapX = 4;
  const gapY = 3;
  const rowH = 6.5;
  const colW = (layout.contentW - innerPad * 2 - gapX * (columns - 1)) / columns;
  const gridRows = Math.max(1, Math.ceil(kpis.length / columns));
  const boxH = innerPad * 2 + gridRows * rowH + (gridRows - 1) * gapY;

  y = newPageIfNeeded(doc, y, boxH + 4, layout);

  doc.setDrawColor(...STROKE);
  doc.setFillColor(...KPI_BOX_FILL);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, layout.contentW, boxH, 2, 2, 'FD');

  const startY = y + innerPad + 4;
  for (let index = 0; index < kpis.length; index++) {
    const kpi = kpis[index];
    if (!kpi) continue;

    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = MARGIN + innerPad + col * (colW + gapX);
    const lineY = startY + row * (rowH + gapY);

    const label = `${kpi.title} :`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_KPI);
    doc.setTextColor(51, 65, 85);
    doc.text(label, x, lineY);

    const labelW = doc.getTextWidth(`${label} `);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(5, 150, 105);
    const valueLines = doc.splitTextToSize(kpi.value, colW - labelW - 1);
    doc.text(valueLines[0] ?? kpi.value, x + labelW, lineY);
    doc.setTextColor(0, 0, 0);
  }

  return y + boxH + 6;
}

function drawDashedLine(
  doc: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash = 1.1,
  gap = 1.1,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= 0) return;
  const ux = dx / len;
  const uy = dy / len;
  let dist = 0;
  let draw = true;
  while (dist < len) {
    const seg = draw ? dash : gap;
    const next = Math.min(dist + seg, len);
    if (draw) {
      doc.line(x1 + ux * dist, y1 + uy * dist, x1 + ux * next, y1 + uy * next);
    }
    dist = next;
    draw = !draw;
  }
}

function drawMonthlyTrendChart(
  doc: jsPDF,
  y: number,
  points: MonthlyTrendPoint[],
  layout: PdfLayout,
): number {
  if (points.length === 0) return y;

  const chartH = 62;
  const padLeft = 11;
  const padRight = 12;
  const padTop = 10;
  const padBottom = 13;
  const legendH = 5;
  const plotW = layout.contentW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom - legendH;

  y = drawSectionTitle(
    doc,
    y,
    'Monthly trend',
    'Delayed flight count vs average duration per movement',
    layout,
  );
  y = newPageIfNeeded(doc, y, chartH + 4, layout);

  const chartX = MARGIN;
  const chartY = y;

  doc.setFillColor(...KPI_BOX_FILL);
  doc.setDrawColor(...STROKE);
  doc.setLineWidth(0.2);
  doc.roundedRect(chartX, chartY, layout.contentW, chartH, 2, 2, 'FD');

  const plotX = chartX + padLeft;
  const plotY = chartY + padTop + legendH;
  const plotBottom = plotY + plotH;

  const leftMax = Math.max(
    ...points.map((point) => Math.max(point.delayedFlights, point.trendFlights ?? 0)),
    1,
  );
  const rightMax = Math.max(...points.map((point) => point.avgDuration), 1);
  const slotW = plotW / points.length;
  const barW = Math.min(slotW * 0.52, 7.5);

  const centerX = (index: number) => plotX + slotW * index + slotW / 2;
  const leftY = (value: number) => plotBottom - (value / leftMax) * plotH;
  const rightY = (value: number) => plotBottom - (value / rightMax) * plotH;

  doc.setDrawColor(...CHART_GRID);
  doc.setLineWidth(0.12);
  for (let tick = 0; tick <= 4; tick++) {
    const gy = plotY + (plotH / 4) * tick;
    doc.line(plotX, gy, plotX + plotW, gy);
  }

  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.25);
  doc.line(plotX, plotBottom, plotX + plotW, plotBottom);
  doc.line(plotX, plotY, plotX, plotBottom);
  doc.line(plotX + plotW, plotY, plotX + plotW, plotBottom);

  doc.setFontSize(6);
  doc.setTextColor(...CHART_MUTED);
  for (let tick = 0; tick <= 4; tick++) {
    const value = Math.round(leftMax - (leftMax / 4) * tick);
    const gy = plotY + (plotH / 4) * tick;
    doc.text(String(value), plotX - 1.5, gy + 1, { align: 'right' });
    const avgValue = Math.round(rightMax - (rightMax / 4) * tick);
    doc.text(String(avgValue), plotX + plotW + 1.5, gy + 1, { align: 'left' });
  }

  points.forEach((point, index) => {
    const cx = centerX(index);
    const barHeight = plotBottom - leftY(point.delayedFlights);
    doc.setFillColor(...CHART_BAR);
    doc.rect(cx - barW / 2, leftY(point.delayedFlights), barW, barHeight, 'F');

    const label = (point.label ?? point.month).slice(0, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...CHART_MUTED);
    doc.text(label, cx, plotBottom + 4.5, { align: 'center' });
  });

  doc.setDrawColor(...CHART_TREND);
  doc.setLineWidth(0.45);
  for (let index = 1; index < points.length; index++) {
    const prev = points[index - 1]!;
    const curr = points[index]!;
    doc.line(
      centerX(index - 1),
      leftY(prev.trendFlights ?? prev.delayedFlights),
      centerX(index),
      leftY(curr.trendFlights ?? curr.delayedFlights),
    );
  }

  doc.setDrawColor(...CHART_AVG);
  doc.setLineWidth(0.4);
  for (let index = 1; index < points.length; index++) {
    const prev = points[index - 1]!;
    const curr = points[index]!;
    drawDashedLine(
      doc,
      centerX(index - 1),
      rightY(prev.avgDuration),
      centerX(index),
      rightY(curr.avgDuration),
    );
  }
  points.forEach((point, index) => {
    doc.setFillColor(...CHART_AVG);
    doc.circle(centerX(index), rightY(point.avgDuration), 0.75, 'F');
  });

  const legendY = chartY + padTop + 1.5;
  let legendX = chartX + 4;
  const legendItems: { color: [number, number, number]; label: string; dashed?: boolean }[] = [
    { color: CHART_BAR, label: 'Delayed flights' },
    { color: CHART_TREND, label: 'Flight trend' },
    { color: CHART_AVG, label: 'Avg duration (min)', dashed: true },
  ];
  doc.setFontSize(6.2);
  for (const item of legendItems) {
    doc.setFillColor(...item.color);
    if (item.dashed) {
      doc.setDrawColor(...item.color);
      drawDashedLine(doc, legendX, legendY, legendX + 5, legendY, 0.9, 0.9);
    } else {
      doc.rect(legendX, legendY - 1.2, 3.2, 2.4, 'F');
    }
    doc.setTextColor(...CHART_MUTED);
    doc.text(item.label, legendX + 6, legendY + 0.5);
    legendX += doc.getTextWidth(item.label) + 14;
  }

  doc.setTextColor(0, 0, 0);
  return chartY + chartH + 6;
}

function drawCodeTable(
  doc: jsPDF,
  y: number,
  title: string,
  rows: DelayReportPdfCodeRow[],
  layout: PdfLayout,
  colWidths: number[],
): number {
  y = drawSectionTitle(
    doc,
    y,
    title,
    `${rows.length} delay code${rows.length === 1 ? '' : 's'}`,
    layout,
  );
  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(FONT_BODY);
    doc.setTextColor(100, 116, 139);
    doc.text('No rows in current scope.', MARGIN, y + 4);
    doc.setTextColor(0, 0, 0);
    return y + 10;
  }
  return drawTable(doc, y, colWidths, CODE_HEADERS, codeTableRows(rows), layout, {
    aligns: [...CODE_ALIGNS],
    severityColIndex: CODE_HEADERS.length - 1,
  });
}

async function buildDelayReportPdfDoc(data: DelayReportPdfInput): Promise<jsPDF> {
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const layout = getLayout(doc);
  const codeColWidths = scaleColWidths(CODE_COL_WEIGHTS, layout.contentW);

  let y = await drawDelayReportHeader(doc, PAGE_TOP, data.filters, layout);
  y = drawKpiBox(doc, y, data.kpis, layout);
  y = drawMonthlyTrendChart(doc, y, data.monthlyTrend, layout);
  y = drawCodeTable(doc, y, 'GHA CODE DELAY', data.ghaRows, layout, codeColWidths);
  drawCodeTable(doc, y, 'NON GHA CODE DELAY', data.nonGhaRows, layout, codeColWidths);

  return doc;
}

export async function exportDelayReportPdf(
  data: DelayReportPdfInput,
  filename = 'delay-report-dashboard.pdf',
): Promise<void> {
  const doc = await buildDelayReportPdfDoc(data);
  doc.save(filename);
}
