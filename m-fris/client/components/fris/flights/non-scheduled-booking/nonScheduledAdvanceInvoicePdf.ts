import type { jsPDF } from 'jspdf';
import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import { loadLogoAsBase64 } from '../scheduledairlines/reportPdfUtils';
import type { NonScheduledAdvanceInvoiceData } from './nonScheduledAdvanceInvoice';
import {
  buildNsInvoiceModel,
  formatInrRounded,
  type NsInvoiceModel,
} from './nonScheduledInvoiceModel';

/**
 * Advance invoice PDF for Non-Scheduled bookings.
 *
 * Uses the station tax-invoice stationery grid: company / bill-to block against
 * the invoice + service meta column, boxed particulars table, concession fee,
 * CGST + SGST, rounded receivable in words, terms and beneficiary bank block.
 */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PAD = 1.4;
const BASE_FONT = 7.6;
const BOTTOM_LIMIT = PAGE_H - 16;

type CellOpts = {
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  size?: number;
  underline?: boolean;
  middle?: boolean;
};

function applyFont(doc: jsPDF, opts: CellOpts): number {
  const size = opts.size ?? BASE_FONT;
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(0, 0, 0);
  return size;
}

function wrap(doc: jsPDF, text: string, w: number, opts: CellOpts = {}): string[] {
  applyFont(doc, opts);
  return doc.splitTextToSize(text || '', Math.max(1, w - PAD * 2)) as string[];
}

function lineHeight(size: number): number {
  return size * 0.42;
}

function textHeight(doc: jsPDF, text: string, w: number, opts: CellOpts = {}): number {
  const size = opts.size ?? BASE_FONT;
  const lines = wrap(doc, text, w, opts);
  return Math.max(1, lines.length) * lineHeight(size) + PAD * 2;
}

function putText(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts: CellOpts = {},
): void {
  const size = applyFont(doc, opts);
  const lines = wrap(doc, text, w, opts);
  const lh = lineHeight(size);
  const blockH = lines.length * lh;
  const startY = (opts.middle ? y + (h - blockH) / 2 : y + PAD) + lh * 0.78;
  const align = opts.align ?? 'left';
  const tx = align === 'right' ? x + w - PAD : align === 'center' ? x + w / 2 : x + PAD;
  lines.forEach((line, i) => {
    doc.text(line, tx, startY + i * lh, { align });
    if (opts.underline) {
      const tw = doc.getTextWidth(line);
      const ux = align === 'right' ? tx - tw : align === 'center' ? tx - tw / 2 : tx;
      doc.line(ux, startY + i * lh + 0.6, ux + tw, startY + i * lh + 0.6);
    }
  });
}

function box(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
}

function drawCell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts: CellOpts = {},
): void {
  box(doc, x, y, w, h);
  putText(doc, x, y, w, h, text, opts);
}

/** Stacked paragraph block (company / bill-to) inside one boxed cell. */
type BlockLine = { text: string; bold?: boolean; size?: number; underline?: boolean };

function blockHeight(doc: jsPDF, lines: BlockLine[], w: number): number {
  return (
    lines.reduce(
      (sum, line) =>
        sum +
        wrap(doc, line.text, w, line).length * lineHeight(line.size ?? BASE_FONT),
      0,
    ) +
    PAD * 2
  );
}

function drawBlock(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  lines: BlockLine[],
): void {
  box(doc, x, y, w, h);
  let cy = y + PAD;
  for (const line of lines) {
    const size = line.size ?? BASE_FONT;
    const wrapped = wrap(doc, line.text, w, line);
    const lh = lineHeight(size);
    putText(doc, x, cy - PAD, w, wrapped.length * lh + PAD * 2, line.text, {
      bold: line.bold,
      size,
      underline: line.underline,
    });
    cy += wrapped.length * lh;
  }
}

function labelValueRows(
  doc: jsPDF,
  rows: Array<[string, string]>,
  w: number,
  labelW: number,
  minH: number,
): number[] {
  return rows.map(([label, value]) =>
    Math.max(
      minH,
      textHeight(doc, label, labelW),
      textHeight(doc, value, w - labelW, { bold: true }),
    ),
  );
}

function renderHeaderGrid(doc: jsPDF, model: NsInvoiceModel, startY: number): number {
  const leftW = CONTENT_W * 0.5;
  const rightW = CONTENT_W - leftW;
  const labelW = rightW * 0.46;
  const minRowH = 4.6;
  const rows: Array<[string, string]> = [...model.metaRows, ...model.serviceRows];
  const rowHeights = labelValueRows(doc, rows, rightW, labelW, minRowH);
  const rightH = rowHeights.reduce((sum, h) => sum + h, 0);

  const companyLines: BlockLine[] = [
    { text: model.company.name, bold: true, size: 8.4 },
    ...model.company.addressLines.map((text) => ({ text })),
    ...(model.company.phone ? [{ text: `Phone No.: ${model.company.phone}` }] : []),
  ];
  const billToLines: BlockLine[] = [
    { text: 'Bill To:', bold: true, underline: true },
    { text: model.billTo.name, bold: true, size: 8.4 },
    ...model.billTo.addressLines.map((text) => ({ text })),
  ];

  const companyH = blockHeight(doc, companyLines, leftW);
  const stateCodeH = minRowH;
  const gstinH = minRowH;
  const billToNaturalH = blockHeight(doc, billToLines, leftW);
  const leftNaturalH = companyH + billToNaturalH + stateCodeH + gstinH;
  const totalH = Math.max(leftNaturalH, rightH);
  const billToH = billToNaturalH + (totalH - leftNaturalH > 0 ? totalH - leftNaturalH : 0);

  drawBlock(doc, MARGIN, startY, leftW, companyH, companyLines);
  drawBlock(doc, MARGIN, startY + companyH, leftW, billToH, billToLines);
  drawCell(
    doc,
    MARGIN,
    startY + companyH + billToH,
    leftW,
    stateCodeH,
    `State Code: ${model.billTo.stateCode}`,
  );
  drawCell(
    doc,
    MARGIN,
    startY + companyH + billToH + stateCodeH,
    leftW,
    gstinH,
    `GSTIN/UIN : ${model.billTo.gstin}     PAN No. : ${model.billTo.pan}`,
    { bold: true },
  );

  let ry = startY;
  const extraRight = totalH - rightH;
  rows.forEach(([label, value], i) => {
    const h = rowHeights[i] + (i === rows.length - 1 ? Math.max(0, extraRight) : 0);
    drawCell(doc, MARGIN + leftW, ry, labelW, h, label);
    drawCell(doc, MARGIN + leftW + labelW, ry, rightW - labelW, h, value, { bold: true });
    ry += h;
  });

  return startY + totalH;
}

function renderFlightStrip(doc: jsPDF, model: NsInvoiceModel, startY: number): number {
  if (model.flightRows.length === 0) return startY;
  const headerH = 5;
  const colW = CONTENT_W / 3;
  const labelW = colW * 0.45;
  const cellH = 4.6;
  const rowCount = Math.ceil(model.flightRows.length / 3);

  let y = startY + 3;
  drawCell(doc, MARGIN, y, CONTENT_W, headerH, 'BOOKING & FLIGHT DETAILS', {
    bold: true,
    middle: true,
  });
  y += headerH;

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < 3; c++) {
      const entry = model.flightRows[r * 3 + c];
      const x = MARGIN + c * colW;
      if (!entry) {
        drawCell(doc, x, y, colW, cellH, '');
        continue;
      }
      drawCell(doc, x, y, labelW, cellH, entry[0], { middle: true });
      drawCell(doc, x + labelW, y, colW - labelW, cellH, entry[1], {
        bold: true,
        middle: true,
      });
    }
    y += cellH;
  }
  return y;
}

const LINE_COL_W = [11, 62, 12, 15, 22, 18, 25, 25];
const LINE_COL_ALIGN: Array<'left' | 'center' | 'right'> = [
  'center',
  'left',
  'right',
  'right',
  'left',
  'left',
  'right',
  'right',
];
const LINE_HEADERS = [
  'Sr. No.',
  'Particular',
  'Used',
  'Charged',
  'Aircraft Type',
  'Unit',
  'Rate/Unit (INR)',
  'Amount(INR)',
];

function renderLineItems(doc: jsPDF, model: NsInvoiceModel, startY: number): number {
  let y = startY + 3;
  const headerH = 8;
  let x = MARGIN;
  LINE_HEADERS.forEach((header, i) => {
    drawCell(doc, x, y, LINE_COL_W[i], headerH, header, {
      bold: true,
      align: 'center',
      middle: true,
      size: 7.2,
    });
    x += LINE_COL_W[i];
  });
  y += headerH;

  for (const line of model.lines) {
    const cells = [
      line.srNo,
      line.particular,
      line.used,
      line.charged,
      line.aircraftType,
      line.unit,
      line.rate,
      line.amount,
    ];
    const rowH = Math.max(
      6,
      ...cells.map((cell, i) => textHeight(doc, cell, LINE_COL_W[i])),
    );
    x = MARGIN;
    cells.forEach((cell, i) => {
      drawCell(doc, x, y, LINE_COL_W[i], rowH, cell, { align: LINE_COL_ALIGN[i] });
      x += LINE_COL_W[i];
    });
    y += rowH;
  }

  const labelW = LINE_COL_W.slice(0, 7).reduce((sum, w) => sum + w, 0);
  const amountW = LINE_COL_W[7];

  for (const row of model.totalRows) {
    const h = Math.max(5, textHeight(doc, row.label, labelW, { bold: row.bold }));
    box(doc, MARGIN, y, labelW, h);
    if (row.prefix) {
      putText(doc, MARGIN, y, labelW, h, row.prefix, { middle: true });
    }
    putText(doc, MARGIN, y, labelW, h, row.label, {
      align: 'right',
      bold: row.bold,
      middle: true,
    });
    drawCell(doc, MARGIN + labelW, y, amountW, h, row.value, {
      align: 'right',
      bold: row.bold,
      middle: true,
    });
    y += h;
  }

  const wordsText = `Total Amount Receivable In Words- ${model.totals.amountInWords} (In INR) (Rounded Off)`;
  const wordsH = Math.max(8, textHeight(doc, wordsText, labelW, { bold: true }));
  drawCell(doc, MARGIN, y, labelW, wordsH, wordsText, { bold: true });
  drawCell(
    doc,
    MARGIN + labelW,
    y,
    amountW,
    wordsH,
    formatInrRounded(model.totals.roundedTotal),
    { bold: true, align: 'right', middle: true, size: 9 },
  );
  return y + wordsH;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= BOTTOM_LIMIT) return y;
  doc.addPage();
  return MARGIN + 4;
}

function renderTerms(doc: jsPDF, model: NsInvoiceModel, startY: number): number {
  let y = ensureSpace(doc, startY + 4, 14);
  putText(doc, MARGIN, y, CONTENT_W, 5, 'Terms & Conditions:', {
    bold: true,
    underline: true,
    size: 8,
  });
  y += 5;
  model.terms.forEach((term, i) => {
    const text = `${i + 1}) ${term}`;
    const h = textHeight(doc, text, CONTENT_W);
    y = ensureSpace(doc, y, h);
    putText(doc, MARGIN, y, CONTENT_W, h, text);
    y += h;
  });
  return y;
}

function renderBank(doc: jsPDF, model: NsInvoiceModel, startY: number): number {
  if (model.bankRows.length === 0) return startY;
  const rowH = 5;
  let y = ensureSpace(doc, startY + 3, rowH * (model.bankRows.length + 1));
  drawCell(
    doc,
    MARGIN,
    y,
    CONTENT_W,
    rowH,
    "BENEFICIARY'S BANK ACCOUNT DETAILS FOR PROCESSING PAYMENT : -",
    { bold: true, middle: true },
  );
  y += rowH;
  for (const [label, value] of model.bankRows) {
    const text = `${label} ${value}`.trim();
    const h = Math.max(rowH, textHeight(doc, text, CONTENT_W));
    drawCell(doc, MARGIN, y, CONTENT_W, h, text, { middle: true });
    y += h;
  }
  return y;
}

function renderPageFooters(doc: jsPDF, model: NsInvoiceModel, invoiceNo: string): void {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    applyFont(doc, { bold: true, size: 7.2 });
    doc.text(model.footerNote, PAGE_W / 2, PAGE_H - 11, { align: 'center' });
    applyFont(doc, { size: 7 });
    doc.text(`Invoice No. : ${invoiceNo}`, MARGIN, PAGE_H - 6);
    doc.text(`Page ${page} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
  }
}

export async function downloadNonScheduledAdvanceInvoicePdf(
  data: NonScheduledAdvanceInvoiceData,
): Promise<void> {
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const model = buildNsInvoiceModel(data);

  const logo = await loadLogoAsBase64();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', MARGIN, MARGIN, 36, 11);
    } catch {
      // ignore unreadable logo — the document must still print
    }
  }

  applyFont(doc, { bold: true, size: 14 });
  doc.text(model.title, PAGE_W / 2, MARGIN + 7, { align: 'center' });

  let y = MARGIN + 15;
  if (model.irn) {
    drawCell(doc, MARGIN, y, CONTENT_W, 5.5, `IRN :- ${model.irn}`, {
      bold: true,
      middle: true,
    });
    y += 5.5;
  }

  y = renderHeaderGrid(doc, model, y);
  y = renderFlightStrip(doc, model, y);
  y = renderLineItems(doc, model, y);
  y = renderTerms(doc, model, y);
  renderBank(doc, model, y);
  renderPageFooters(doc, model, data.invoiceNo);

  const safeName = data.invoiceNo.replace(/[^\w.-]+/g, '_');
  doc.save(`Advance-Invoice-${safeName}.pdf`);
}
