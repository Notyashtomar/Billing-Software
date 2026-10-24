import PDFDocument from 'pdfkit';
import { getInvoiceLogoBuffer } from './invoice-logo-assets';
import { resolveInvoiceLogoBrand } from './invoice-pdf.builder';
import type { AdsAnnexureTable } from './ads-equipment-annexure.util';

export type AdsAnnexurePdfInput = {
  companyName: string;
  airlineName: string;
  serviceStation: string;
  titleLine: string;
  table: AdsAnnexureTable;
};

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 22;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BORDER = '#000000';
const HEADER_BG = '#d9d9d9';
const TOTAL_BG = '#f3f3f3';

function fmtCount(value: number | undefined): string {
  if (value == null || !(value > 0)) return '';
  return String(value);
}

function wrapLines(doc: PDFKit.PDFDocument, text: string, width: number): string[] {
  const words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0]!;
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (doc.widthOfString(next) <= width) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function identityWidths(equipCount: number): number[] {
  const sno = 28;
  const fhr = 58;
  const flight = 88;
  const acType = 70;
  const atd = 54;
  const identity = sno + fhr + flight + acType + atd;
  const remaining = CONTENT_W - identity;
  const each = equipCount > 0 ? remaining / equipCount : remaining;
  return [sno, fhr, flight, acType, atd, ...Array.from({ length: equipCount }, () => each)];
}

export function buildAdsAnnexurePdfBuffer(input: AdsAnnexurePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const columns = input.table.columns;
    const colHeaders = ['S No', 'FHR No', 'Flight No', 'Aircraft Type', 'ATD Date', ...columns.map((c) => c.label)];
    const widths = identityWidths(columns.length);
    const rowH = 16;
    const headerH = 28;
    const tableBottom = PAGE_H - MARGIN - 8;

    const drawHeader = (): number => {
      const logoBuffer = getInvoiceLogoBuffer(resolveInvoiceLogoBrand(input.serviceStation));
      const logoH = 34;
      if (logoBuffer.length > 0) {
        doc.image(logoBuffer, MARGIN, MARGIN, { height: logoH });
      }
      let y = MARGIN + 2;
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000');
      doc.text(input.companyName || ' ', MARGIN, y, { width: CONTENT_W, align: 'center' });
      y += 18;
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text(input.airlineName || ' ', MARGIN, y, { width: CONTENT_W, align: 'center' });
      y += 16;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(input.titleLine, MARGIN, y, { width: CONTENT_W, align: 'center' });
      return y + 18;
    };

    const drawTableHeader = (y: number): number => {
      doc.save().rect(MARGIN, y, CONTENT_W, headerH).fill(HEADER_BG).restore();
      doc.save().lineWidth(0.6).strokeColor(BORDER).rect(MARGIN, y, CONTENT_W, headerH).stroke().restore();
      let x = MARGIN;
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#000');
      for (let i = 0; i < colHeaders.length; i += 1) {
        const w = widths[i] ?? 40;
        const lines = wrapLines(doc, colHeaders[i] ?? '', w - 4);
        const textH = lines.length * 8;
        const ty = y + Math.max(3, (headerH - textH) / 2);
        doc.text(lines.join('\n'), x + 2, ty, { width: w - 4, align: 'center', lineGap: 0 });
        doc.save().lineWidth(0.6).strokeColor(BORDER).moveTo(x, y).lineTo(x, y + headerH).stroke().restore();
        x += w;
      }
      doc.save().lineWidth(0.6).strokeColor(BORDER).moveTo(x, y).lineTo(x, y + headerH).stroke().restore();
      return y + headerH;
    };

    const drawDataRow = (y: number, cells: string[], totals = false): number => {
      if (totals) {
        doc.save().rect(MARGIN, y, CONTENT_W, rowH).fill(TOTAL_BG).restore();
      }
      doc.save().lineWidth(0.5).strokeColor(BORDER).rect(MARGIN, y, CONTENT_W, rowH).stroke().restore();
      let x = MARGIN;
      for (let i = 0; i < cells.length; i += 1) {
        const w = widths[i] ?? 40;
        doc.font(totals || i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor('#000');
        doc.text(cells[i] ?? '', x + 2, y + 4, {
          width: w - 4,
          align: 'center',
        });
        doc.save().lineWidth(0.5).strokeColor(BORDER).moveTo(x, y).lineTo(x, y + rowH).stroke().restore();
        x += w;
      }
      doc.save().lineWidth(0.5).strokeColor(BORDER).moveTo(x, y).lineTo(x, y + rowH).stroke().restore();
      return y + rowH;
    };

    let y = drawHeader();
    y = drawTableHeader(y);

    if (input.table.rows.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#000');
      doc.text(
        'No additional billed equipment for this invoice. Columns follow priced equipment rules on the contract Clauses tab.',
        MARGIN,
        y + 12,
        { width: CONTENT_W, align: 'center' },
      );
      doc.end();
      return;
    }

    const startNewPage = () => {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
      y = drawHeader();
      y = drawTableHeader(y);
    };

    input.table.rows.forEach((row, index) => {
      if (y + rowH > tableBottom) startNewPage();
      const cells = [
        String(index + 1),
        row.serialNo,
        row.flightNo,
        row.aircraftType,
        row.atdDate,
        ...columns.map((column) => fmtCount(row.counts[column.key])),
      ];
      y = drawDataRow(y, cells);
    });

    if (y + rowH > tableBottom) startNewPage();
    const totalCells = [
      '',
      '',
      '',
      '',
      'Total',
      ...columns.map((column) => fmtCount(input.table.totals[column.key])),
    ];
    drawDataRow(y, totalCells, true);
    doc.end();
  });
}
