import type { jsPDF } from 'jspdf';
import { getHtml2Canvas, getJsPDFConstructor } from '@/lib/dynamic-imports';
import { loadLogoAsBase64 } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';

const MARGIN = 10;
const EMERALD: [number, number, number] = [29, 158, 117];
const EMERALD_DARK: [number, number, number] = [15, 110, 86];
const HEADER_TEXT: [number, number, number] = [255, 255, 255];
const BODY_TEXT: [number, number, number] = [30, 41, 59];
const MUTED_TEXT: [number, number, number] = [100, 116, 139];
const STROKE: [number, number, number] = [203, 213, 225];
const ZEBRA: [number, number, number] = [240, 250, 246];

export type QualityPdfColumn = {
  header: string;
  width: number; // relative weight
  align?: 'left' | 'right' | 'center';
};

export type QualityPdfTable = {
  title: string;
  columns: QualityPdfColumn[];
  rows: string[][];
  totalRow?: string[];
  emptyText?: string;
};

export type QualityPdfChart = {
  title: string;
  element: HTMLElement | null;
};

export type QualityReportPdfInput = {
  title: string;
  airlineLabel: string;
  fromLabel: string;
  toLabel: string;
  charts: QualityPdfChart[];
  tables: QualityPdfTable[];
  filename?: string;
};

async function captureChart(element: HTMLElement): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const html2canvas = await getHtml2Canvas();
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: Math.max(element.scrollWidth, element.clientWidth),
      windowHeight: Math.max(element.scrollHeight, element.clientHeight),
    });
    if (!canvas.width || !canvas.height) return null;
    return { dataUrl: canvas.toDataURL('image/png'), ratio: canvas.height / canvas.width };
  } catch {
    return null;
  }
}

function drawHeader(
  doc: jsPDF,
  pageW: number,
  logo: string | null,
  input: QualityReportPdfInput,
): number {
  const top = MARGIN;
  const logoW = 26;
  const logoH = 14;

  if (logo) {
    try {
      doc.addImage(logo, 'PNG', MARGIN, top, logoW, logoH);
    } catch {
      // ignore bad image data
    }
  }

  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(input.title, pageW / 2, top + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
  doc.text('Quality Performance Report', pageW / 2, top + 11.5, { align: 'center' });

  const rightX = pageW - MARGIN;
  doc.setFontSize(9.5);
  const rightLines: { label: string; value: string }[] = [
    { label: 'Airline: ', value: input.airlineLabel },
    { label: 'Range: ', value: `${input.fromLabel} - ${input.toLabel}` },
  ];
  let ry = top + 4;
  for (const line of rightLines) {
    doc.setFont('helvetica', 'bold');
    const lw = doc.getTextWidth(line.label);
    doc.setFont('helvetica', 'normal');
    const vw = doc.getTextWidth(line.value);
    const x = rightX - (lw + vw);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    doc.text(line.label, x, ry);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
    doc.text(line.value, x + lw, ry);
    ry += 5;
  }

  const ruleY = top + logoH + 2.5;
  doc.setDrawColor(EMERALD[0], EMERALD[1], EMERALD[2]);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, ruleY, pageW - MARGIN, ruleY);
  doc.setLineWidth(0.2);

  return ruleY + 5;
}

function ensureSpace(doc: jsPDF, y: number, needed: number, pageH: number): number {
  if (y + needed > pageH - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function drawSectionBar(doc: jsPDF, y: number, pageW: number, label: string): number {
  const h = 7;
  doc.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2]);
  doc.rect(MARGIN, y, pageW - MARGIN * 2, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(HEADER_TEXT[0], HEADER_TEXT[1], HEADER_TEXT[2]);
  doc.text(label, MARGIN + 2.5, y + h - 2);
  return y + h;
}

function drawTable(doc: jsPDF, yStart: number, pageW: number, pageH: number, table: QualityPdfTable): number {
  const contentW = pageW - MARGIN * 2;
  const totalWeight = table.columns.reduce((sum, c) => sum + c.width, 0) || 1;
  const colW = table.columns.map((c) => (c.width / totalWeight) * contentW);

  const fontSize = 7;
  const rowH = 6;
  const headH = 7;
  const pad = 1.5;

  let y = ensureSpace(doc, yStart, headH + rowH + 4, pageH);
  y = drawSectionBar(doc, y, pageW, table.title);

  const drawHeadRow = (yy: number): number => {
    doc.setFillColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2]);
    doc.rect(MARGIN, yy, contentW, headH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(HEADER_TEXT[0], HEADER_TEXT[1], HEADER_TEXT[2]);
    let x = MARGIN;
    table.columns.forEach((col, i) => {
      const w = colW[i]!;
      const align = col.align ?? 'left';
      const tx = align === 'right' ? x + w - pad : align === 'center' ? x + w / 2 : x + pad;
      const lines = doc.splitTextToSize(col.header, w - pad * 2);
      doc.text(lines.slice(0, 2), tx, yy + (lines.length > 1 ? 3 : 4.6), { align });
      x += w;
    });
    return yy + headH;
  };

  y = drawHeadRow(y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);

  if (table.rows.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN, y, contentW, rowH, 'FD');
    doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
    doc.text(table.emptyText ?? 'No data available.', MARGIN + contentW / 2, y + rowH - 2, { align: 'center' });
    return y + rowH + 4;
  }

  table.rows.forEach((row, ri) => {
    if (y + rowH > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
      y = drawHeadRow(y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    }
    if (ri % 2 === 1) {
      doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
      doc.rect(MARGIN, y, contentW, rowH, 'F');
    }
    let x = MARGIN;
    table.columns.forEach((col, i) => {
      const w = colW[i]!;
      const align = col.align ?? 'left';
      const tx = align === 'right' ? x + w - pad : align === 'center' ? x + w / 2 : x + pad;
      const text = doc.splitTextToSize(row[i] ?? '', w - pad * 2)[0] ?? '';
      doc.text(text, tx, y + rowH - 2, { align });
      x += w;
    });
    y += rowH;
  });

  if (table.totalRow) {
    if (y + rowH > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2]);
    doc.rect(MARGIN, y, contentW, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(HEADER_TEXT[0], HEADER_TEXT[1], HEADER_TEXT[2]);
    let x = MARGIN;
    table.columns.forEach((col, i) => {
      const w = colW[i]!;
      const align = col.align ?? 'left';
      const tx = align === 'right' ? x + w - pad : align === 'center' ? x + w / 2 : x + pad;
      const text = doc.splitTextToSize(table.totalRow![i] ?? '', w - pad * 2)[0] ?? '';
      doc.text(text, tx, y + rowH - 2, { align });
      x += w;
    });
    y += rowH;
  }

  // Outer border
  doc.setDrawColor(STROKE[0], STROKE[1], STROKE[2]);
  doc.setLineWidth(0.2);

  return y + 5;
}

export async function exportQualityReportPdf(input: QualityReportPdfInput): Promise<void> {
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const logo = await loadLogoAsBase64();
  let y = drawHeader(doc, pageW, logo, input);

  // Charts (baggage on-time, cargo & mail mix) side by side as images
  const captures = await Promise.all(
    input.charts.map(async (c) => ({
      title: c.title,
      capture: c.element ? await captureChart(c.element) : null,
    })),
  );
  const validCaptures = captures.filter((c) => c.capture);

  if (validCaptures.length > 0) {
    const gap = 6;
    const cellW = (pageW - MARGIN * 2 - gap * (validCaptures.length - 1)) / validCaptures.length;
    let maxH = 0;
    const placements = validCaptures.map((c, i) => {
      const h = Math.min(cellW * c.capture!.ratio, 78);
      maxH = Math.max(maxH, h);
      return { x: MARGIN + i * (cellW + gap), dataUrl: c.capture!.dataUrl, h };
    });
    y = ensureSpace(doc, y, maxH + 6, pageH);
    for (const p of placements) {
      try {
        doc.addImage(p.dataUrl, 'PNG', p.x, y, cellW, p.h, undefined, 'FAST');
      } catch {
        // ignore bad canvas; text tables below still export
      }
    }
    y += maxH + 6;
  } else if (input.charts.some((c) => c.element)) {
    // Canvas capture failed — note in PDF; detailed tables still render below.
    y = ensureSpace(doc, y, 12, pageH);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(MUTED_TEXT[0], MUTED_TEXT[1], MUTED_TEXT[2]);
    doc.text(
      'Chart images could not be captured; see summary tables below.',
      MARGIN,
      y,
    );
    y += 8;
  }

  for (const table of input.tables) {
    y = drawTable(doc, y, pageW, pageH, table);
  }

  doc.save(input.filename ?? 'quality-report.pdf');
}
