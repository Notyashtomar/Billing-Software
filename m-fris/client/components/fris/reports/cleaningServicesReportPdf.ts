import type { jsPDF } from 'jspdf';
import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import { loadLogoAsBase64 } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';

const MARGIN = 10;
const PAGE_TOP = 12;
const HEADER_BG: [number, number, number] = [5, 150, 105];
const KPI_BOX_FILL: [number, number, number] = [247, 254, 251];
const STROKE: [number, number, number] = [167, 243, 208];
const FONT_BODY = 6.5;
const FONT_TITLE = 14;
const FONT_SECTION = 10;
const FONT_KPI = 8.5;
const LOGO_SRC_PX = { w: 714, h: 138 } as const;
const LOGO_DRAW_W_MM = 36;
const LOGO_DRAW_H_MM = (LOGO_DRAW_W_MM * LOGO_SRC_PX.h) / LOGO_SRC_PX.w;

/** Relative column weights for 14 cleaning-service columns (portrait A4). */
const COL_WEIGHTS = [12, 16, 14, 14, 22, 14, 14, 14, 12, 14, 12, 12, 16, 38];

type PdfLayout = {
  pageW: number;
  pageH: number;
  contentW: number;
  pageBottom: number;
};

function ymdToDdMmYyyy(ymd: string): string {
  const [y, mo, d] = ymd.split('-');
  if (!y || !mo || !d) return ymd;
  return `${d}/${mo}/${y}`;
}

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

function newPageIfNeeded(doc: jsPDF, y: number, need: number, layout: PdfLayout): number {
  if (y + need > layout.pageBottom) {
    doc.addPage();
    return PAGE_TOP;
  }
  return y;
}

async function drawReportHeader(
  doc: jsPDF,
  yTop: number,
  fromDate: string,
  toDate: string,
  filterSummary: string,
  layout: PdfLayout,
): Promise<number> {
  const fromLabel = ymdToDdMmYyyy(fromDate);
  const toLabel = ymdToDdMmYyyy(toDate);
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
    { label: 'Generated', value: generatedAt },
  ];
  if (filterSummary.trim()) {
    summaryFields.push({ label: 'Filters', value: filterSummary.trim() });
  }

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
  doc.text('Cleaning Services Report', layout.pageW / 2, titleBaseline, { align: 'center' });
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

function drawKpiBox(
  doc: jsPDF,
  y: number,
  kpis: Array<{ title: string; value: string }>,
  layout: PdfLayout,
): number {
  y = drawSectionTitle(doc, y, 'Summary', undefined, layout);

  const columns = 2;
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

function drawTable(
  doc: jsPDF,
  y: number,
  colWidths: number[],
  headers: string[],
  rows: string[][],
  layout: PdfLayout,
): number {
  const tableW = colWidths.reduce((sum, width) => sum + width, 0);
  const colX: number[] = [];
  let cx = MARGIN;
  for (const width of colWidths) {
    colX.push(cx);
    cx += width;
  }

  const padX = 1;
  const lineH = 3;
  const maxBodyLines = 4;

  const drawHeader = (startY: number): number => {
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
    let headerY = newPageIfNeeded(doc, startY, headerH + 4, layout);

    doc.setFillColor(...HEADER_BG);
    doc.setDrawColor(...STROKE);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, headerY, tableW, headerH, 'FD');
    for (let c = 1; c < colWidths.length; c++) {
      doc.line(colX[c]!, headerY, colX[c]!, headerY + headerH);
    }

    doc.setTextColor(255, 255, 255);
    for (let c = 0; c < headers.length; c++) {
      const lines = headerWrapped[c]!;
      let ty = headerY + 4;
      for (const line of lines) {
        doc.text(line, colX[c]! + padX, ty);
        ty += lineH;
      }
    }

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    return headerY + headerH;
  };

  y = drawHeader(y);

  rows.forEach((cells) => {
    let rowH = 5.5;
    const wrappedCells: string[][] = [];
    for (let c = 0; c < colWidths.length; c++) {
      const text = String(cells[c] ?? '').trim() || '—';
      const lines = doc.splitTextToSize(text, colWidths[c]! - 2 * padX).slice(0, maxBodyLines);
      wrappedCells.push(lines);
      rowH = Math.max(rowH, lines.length * lineH + 2);
    }

    if (y + rowH > layout.pageBottom) {
      doc.addPage();
      y = drawHeader(PAGE_TOP);
    }

    doc.setDrawColor(...STROKE);
    doc.rect(MARGIN, y, tableW, rowH, 'S');

    for (let c = 1; c < colWidths.length; c++) {
      doc.line(colX[c]!, y, colX[c]!, y + rowH);
    }

    for (let c = 0; c < colWidths.length; c++) {
      const lines = wrappedCells[c]!;
      let ty = y + 3.6;
      for (const line of lines) {
        doc.text(line, colX[c]! + padX, ty);
        ty += lineH;
      }
    }

    y += rowH;
  });

  return y + 4;
}

export async function downloadCleaningServicesReportPdf(options: {
  fromDate: string;
  toDate: string;
  filterSummary: string;
  headers: string[];
  rows: string[][];
  filename?: string;
}): Promise<void> {
  const { fromDate, toDate, filterSummary, headers, rows } = options;
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const layout = getLayout(doc);
  const colWidths = scaleColWidths([...COL_WEIGHTS], layout.contentW);

  let y = await drawReportHeader(doc, PAGE_TOP, fromDate, toDate, filterSummary, layout);
  y = drawKpiBox(
    doc,
    y,
    [
      {
        title: 'Period',
        value: `${ymdToDdMmYyyy(fromDate)} – ${ymdToDdMmYyyy(toDate)}`,
      },
      {
        title: 'Records',
        value: `${rows.length} record${rows.length === 1 ? '' : 's'}`,
      },
    ],
    layout,
  );

  y = drawSectionTitle(
    doc,
    y,
    'Cleaning service records',
    `${rows.length} record${rows.length === 1 ? '' : 's'} in export`,
    layout,
  );

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(FONT_BODY);
    doc.setTextColor(100, 116, 139);
    doc.text('No rows in current scope.', MARGIN, y + 4);
    doc.setTextColor(0, 0, 0);
  } else {
    drawTable(doc, y, colWidths, headers, rows, layout);
  }

  doc.save(options.filename ?? `cleaning-services_${fromDate}_${toDate}.pdf`);
}
