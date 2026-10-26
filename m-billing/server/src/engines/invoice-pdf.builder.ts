import PDFDocument from 'pdfkit';
import type { InvoicePdfInput } from './invoice-pdf.types';
import { chandigarhBhsTerms, isChandigarhBhsLayout } from './invoice-pdf-chandigarh-bhs.util';
import { CHENNAI_INVOICE_FOOTER, resolveInvoiceContacts } from './invoice-pdf.defaults';
import {
  getInvoiceLogoBuffer,
  type InvoiceLogoBrand,
} from './invoice-logo-assets';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BORDER = '#000000';
const LINE_W = 0.75;
/** Invoice body text is 20% larger than the legacy PDF sizes. */
const FONT_SCALE = 1.2;
const CELL_PAD = 4;
const FOOTER_RESERVED_H = invDim(58);
const FLOW_TOP_Y = MARGIN + 8;
const FLOW_BOTTOM_Y = PAGE_H - MARGIN - FOOTER_RESERVED_H;

type CellOpts = {
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  size?: number;
  underline?: boolean;
  valign?: 'top' | 'middle';
};

function invFs(base: number): number {
  return Math.round(base * FONT_SCALE * 10) / 10;
}

function invDim(base: number): number {
  return Math.round(base * FONT_SCALE * 10) / 10;
}

function setCellFont(doc: PDFKit.PDFDocument, opts: CellOpts): number {
  const size = invFs(opts.size ?? 7);
  doc.font(opts.bold ? 'Times-Bold' : 'Times-Roman').fontSize(size).fillColor('#000');
  return size;
}

function measureWrappedTextHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  innerWidth: number,
  opts: CellOpts = {},
): number {
  const size = invFs(opts.size ?? 7);
  setCellFont(doc, opts);
  if (!text.trim()) return size * 1.15;
  return doc.heightOfString(text, { width: innerWidth, lineGap: 1 });
}

function measureCellHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  w: number,
  opts: CellOpts = {},
  minH = invDim(14),
  verticalPad = CELL_PAD,
): number {
  const innerW = Math.max(1, w - CELL_PAD * 2);
  const textH = measureWrappedTextHeight(doc, text, innerW, opts);
  return Math.max(minH, textH + verticalPad * 2);
}

/** `{{ENTITY}}` resolves to the invoicing station's legal entity, not a fixed station. */
const TERMS_TEMPLATE: string[] = [
  'Rates are excluding royalty / concession fee payable to Airport Authority Of India.',
  'All the payments to be effected through the banking channel preferably through electronic gateways i.e. Net Banking or NEFT or RTGS or Demand Draft / Cheques in favour of {{ENTITY}} . Kindly remit the payment to our bank account as per bank details mentioned on the invoice.',
  'The details of payment instrument / payment advice along (i) Invoice No. (ii) Invoice due date (iii) Deduction on account of TDS if applicable (iv) Any other deduction with details (v) Net amount transferred to {{ENTITY}} should be sent to corporate office at amit.sharma@thebirdgroup.com and receivable@bird.in',
  'No Credit shall be given in the absence of the payment information.',
  'Invoice has to be paid in full and all Bank charges should be to the Account of the Payee.',
  'If the payment is not made by due date, then interest at 18% p.a. or as per terms of the agreement, shall be levied and recovered as an Additional Charges commencing from the date of the invoice till date of payment(both days inclusive).',
  '{{ENTITY}} shall report the current invoice as outward supplies (in GSTR-1) in the month in which the invoice is raised (ie, based on the date of the invoice) and the customer can avail the GST credit (wherever applicable) based on such reporting once it is accepted by the customers (in GSTR-2) in the GST network.',
  'In case there is a mismatch in the reporting by {{ENTITY}} and the customer, {{ENTITY}} and the customers shall jointly agree and rectify such mismatch within the time limit prescribed in GST Law.',
  '{{ENTITY}} shall not be responsible for any loss of credit to the customers for any reason of customers non-compliance.',
  'GST is not payable under Reverse Charge.',
  'In case of any queries/ clarification about your enclosed invoice, please contact at below mentioned Contact Details & Email Id\'s, within three working days from the date of receipt of the invoice.',
];

function invoiceTerms(companyName: string): string[] {
  const entity = companyName.trim() || 'THE COMPANY';
  return TERMS_TEMPLATE.map((term) => term.split('{{ENTITY}}').join(entity));
}

/** Exported for unit tests — Chennai tax-invoice terms (SI/MA/327 reference). */
export function chennaiInvoiceTerms(companyName: string): string[] {
  return invoiceTerms(companyName);
}

const EINVOICE_FOOTER = CHENNAI_INVOICE_FOOTER.eInvoiceDisclaimer;

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtInr(n: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtRoundedInr(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
}

function fmtRoundedUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number): string {
  return n.toFixed(2);
}

/** Contractual exclusive rate. Extended royalty changes the amount, not this label. */
const MAX_CONCESSION_DISPLAY_PERCENT = 18;

/** One concession row. A ceiling with no percent is named Concession only. */
function concessionAmountRows(
  _subtotal: number,
  percent: number | undefined,
  amount: number,
): Array<{ label: string; amount: number }> {
  const raw = percent != null && percent > 0 ? percent : 0;
  const pct = raw > MAX_CONCESSION_DISPLAY_PERCENT ? MAX_CONCESSION_DISPLAY_PERCENT : raw;
  if (pct > 0 && amount > 0.004) {
    return [{ label: `Concession Fee @ ${fmtPct(pct)}% of "Total Gross Revenue"`, amount }];
  }
  if (amount > 0.004) return [{ label: 'Concession', amount }];
  return [];
}

function fmtPlainInr(n: number): string {
  return n.toFixed(2);
}

/** Reference words row ends "… RUPEES AND ZERO PAISA ONLY" (rounded amount → paisa is always zero). */
function wordsWithPaisa(words: string): string {
  const w = (words ?? '').trim();
  if (!w) return w;
  if (/PAISA/i.test(w)) return w;
  const stripped = w.replace(/\s+ONLY\.?$/i, '');
  return `${stripped} AND ZERO PAISA ONLY`;
}

function fmtRoe(n: number): string {
  return n.toFixed(5);
}

const STATION_LOGO_BRANDS: Record<string, InvoiceLogoBrand> = {
  CHENNAI: 'BAS',
  MAA: 'BAS',
  TRICHY: 'BAS',
  TRZ: 'BAS',
  COIMBATORE: 'BAS',
  CJB: 'BAS',
  IMPHAL: 'BAS',
  IMF: 'BAS',
  AGARTALA: 'BAS',
  IXA: 'BAS',
  GOA: 'BAS',
  GOI: 'BAS',
  CHANDIGARH: 'BAS',
  IXC: 'BAS',
  DELHI: 'BFS',
  DEL: 'BFS',
  KOCHI: 'BFS',
  COK: 'BFS',
  TRIVANDRUM: 'GSEC',
  THIRUVANANTHAPURAM: 'GSEC',
  TRV: 'GSEC',
};

export function resolveInvoiceLogoBrand(serviceStation: string): InvoiceLogoBrand {
  const key = serviceStation.trim().toUpperCase();
  return STATION_LOGO_BRANDS[key] ?? 'BAS';
}

function renderBrandHeader(doc: PDFKit.PDFDocument, input: InvoicePdfInput): number {
  const y = MARGIN;
  const logoBuffer = getInvoiceLogoBuffer(resolveInvoiceLogoBrand(input.serviceStation));
  const logoH = invDim(32);
  if (logoBuffer.length > 0) {
    doc.image(logoBuffer, MARGIN, y, { height: logoH });
  }
  doc.font('Times-Bold').fontSize(invFs(15)).fillColor('#000');
  doc.text(input.title || 'TAX INVOICE', MARGIN, y + 8, { width: CONTENT_W, align: 'center' });

  return y + logoH + 6;
}

function strokeBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  doc.save().lineWidth(LINE_W).strokeColor(BORDER).rect(x, y, w, h).stroke().restore();
}

function strokeHorizontal(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number) {
  doc.save().lineWidth(LINE_W).strokeColor(BORDER).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

/** Vertical column guides only — no horizontal row lines (reference invoice body style). */
function strokeColumnGuides(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  colWidths: number[],
  h: number,
) {
  doc.save().lineWidth(LINE_W).strokeColor(BORDER);
  let cx = x;
  doc.moveTo(cx, y).lineTo(cx, y + h).stroke();
  for (const cw of colWidths) {
    cx += cw;
    doc.moveTo(cx, y).lineTo(cx, y + h).stroke();
  }
  doc.restore();
}

function putCellText(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts: CellOpts = {},
) {
  setCellFont(doc, opts);
  const size = invFs(opts.size ?? 7);
  const ty = opts.valign === 'middle' ? y + (h - size) / 2 - 1 : y + CELL_PAD;
  doc.text(text, x + CELL_PAD, ty, {
    width: w - CELL_PAD * 2,
    height: h - CELL_PAD * 2,
    align: opts.align ?? 'left',
    underline: opts.underline,
    lineBreak: true,
    ellipsis: false,
  });
}

function drawCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts: CellOpts = {},
): number {
  const actualH = measureCellHeight(doc, text, w, opts, h);
  strokeBox(doc, x, y, w, actualH);
  setCellFont(doc, opts);
  const size = invFs(opts.size ?? 7);
  const ty = opts.valign === 'middle' ? y + (actualH - size) / 2 - 1 : y + CELL_PAD;
  doc.text(text, x + CELL_PAD, ty, {
    width: w - CELL_PAD * 2,
    height: actualH - CELL_PAD * 2,
    align: opts.align ?? 'left',
    underline: opts.underline,
    lineBreak: true,
    ellipsis: false,
  });
  return actualH;
}

/** Line-item column weights — keep in sync with renderLineItemsTable. */
const LINE_ITEM_COL_WEIGHTS = [24, 130, 30, 34, 50, 38, 52, 56] as const;

function scaleLineItemColWidths(contentW: number): number[] {
  const scale = contentW / LINE_ITEM_COL_WEIGHTS.reduce((s, n) => s + n, 0);
  const widths = LINE_ITEM_COL_WEIGHTS.map((n) => Math.round(n * scale));
  widths[widths.length - 1] += contentW - widths.reduce((s, n) => s + n, 0);
  return widths;
}

/** Absolute X of Unit | Rate/Unit vertical border (matches line items table). */
function getUnitRateDividerX(contentW: number): number {
  const widths = scaleLineItemColWidths(contentW);
  return MARGIN + widths.slice(0, 6).reduce((s, n) => s + n, 0);
}

/**
 * Vertical middle of a single-line header cell.
 * Uses the font size, not heightOfString, so the glyphs sit in the middle
 * (heightOfString includes empty space under the letters and pins text to the top).
 */
function headerFieldTextY(
  doc: PDFKit.PDFDocument,
  y: number,
  h: number,
  _text: string,
  _innerW: number,
  opts: CellOpts,
): number {
  setCellFont(doc, opts);
  const size = invFs(opts.size ?? 7);
  return y + Math.max(0, (h - size) / 2);
}

function drawLabelValueRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  /** Fraction of `w` (0–1) or absolute label width in PDF points (>1). */
  labelW: number = 0.48,
): number {
  const lw = labelW > 1 ? labelW : w * labelW;
  const vw = w - lw;
  strokeBox(doc, x, y, lw, h);
  const labelY = headerFieldTextY(doc, y, h, label, lw - CELL_PAD * 2, { size: 7 });
  doc.text(label, x + CELL_PAD, labelY, {
    width: lw - CELL_PAD * 2,
    lineGap: 0,
    lineBreak: false,
  });
  strokeBox(doc, x + lw, y, vw, h);
  const valueY = headerFieldTextY(doc, y, h, value, vw - CELL_PAD * 2, {
    size: 7,
    bold: true,
  });
  doc.text(value, x + lw + CELL_PAD, valueY, {
    width: vw - CELL_PAD * 2,
    lineGap: 0,
    lineBreak: false,
  });
  return h;
}

function drawPageFooter(
  doc: PDFKit.PDFDocument,
  page: number,
  total: number,
  invoiceNumber: string,
  continued?: boolean,
) {
  // Reference prints the disclaimer larger (wraps to two centred lines) directly above the footer line.
  const disclaimerY = PAGE_H - MARGIN - invDim(40);
  doc.font('Times-Bold').fontSize(invFs(8.5)).fillColor('#000');
  doc.text(EINVOICE_FOOTER, MARGIN + 20, disclaimerY, { width: CONTENT_W - 40, align: 'center' });
  const y = PAGE_H - MARGIN - invDim(14);
  doc.font('Times-Bold').fontSize(invFs(7));
  doc.text(`Invoice No. : ${invoiceNumber}`, MARGIN, y, { width: CONTENT_W, align: 'left', lineBreak: false });
  if (continued) {
    doc.font('Times-Roman').text('Continued on next page...', MARGIN, y, { width: CONTENT_W, align: 'center' });
  }
  doc.font('Times-Bold').text(`Page No. : ${page} of ${total}`, MARGIN, y, { width: CONTENT_W, align: 'right' });
}

function addFlowPage(doc: PDFKit.PDFDocument): number {
  doc.addPage();
  return FLOW_TOP_Y;
}

function ensureFlowSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  neededH: number,
  onNewPage?: (newY: number) => number,
): number {
  if (y + neededH <= FLOW_BOTTOM_Y) return y;
  const nextY = addFlowPage(doc);
  return onNewPage ? onNewPage(nextY) : nextY;
}

function addBufferedPageFooters(doc: PDFKit.PDFDocument, input: InvoicePdfInput) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    const pageIndex = range.start + i;
    doc.switchToPage(pageIndex);
    drawPageFooter(
      doc,
      i + 1,
      range.count,
      input.invoiceNumber,
      i + 1 < range.count,
    );
  }
}

function addressAsWrappedText(lines: string[]): string {
  return lines.map((s) => s.trim()).filter(Boolean).join(', ');
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function extractPhoneFromAddressLines(lines: string[]): string | undefined {
  for (const line of lines) {
    const trimmed = line.trim();
    const labeled = trimmed.match(/phone\s*no\.?\s*:?\s*(.+)$/i);
    if (labeled?.[1]?.trim()) return labeled[1].trim();
  }
  return undefined;
}

/** Station address rows under the legal name, including Phone No. */
export const MAX_STATION_ADDRESS_ROWS = 7;

function dedupeConsecutiveAddressLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (out.length && out[out.length - 1].toLowerCase() === trimmed.toLowerCase()) {
      continue;
    }
    out.push(trimmed);
  }
  return out;
}

/** Cap station address to `maxRows` without dropping leftover text (merge into last row). */
export function compactStationAddressRows(
  lines: string[],
  maxRows: number = MAX_STATION_ADDRESS_ROWS,
): string[] {
  const deduped = dedupeConsecutiveAddressLines(lines);
  if (maxRows <= 0) return [];
  if (deduped.length <= maxRows) return deduped;
  if (maxRows === 1) return [deduped.join(', ')];
  return [...deduped.slice(0, maxRows - 1), deduped.slice(maxRows - 1).join(', ')];
}

/** "DELHI" → "Delhi" for the Service Station row (display only). */
function titleCaseStation(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

/** Secondary address prints as comma-joined wrapped text (reference style). */
function joinAddressForWrap(lines: string[]): string {
  return lines
    .map((line) => line.trim().replace(/,+$/, ''))
    .filter(Boolean)
    .join(', ');
}

function buildCompanyHeaderLines(company: InvoicePdfInput['company']): string[] {
  const phone =
    company.phone?.trim() || extractPhoneFromAddressLines(company.addressLines) || '';
  const phoneDigits = phone ? digitsOnly(phone) : '';

  const addressLines = company.addressLines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/phone\s*no\.?\s*:/i.test(line)) return false;
      if (phoneDigits.length >= 6 && digitsOnly(line) === phoneDigits) return false;
      return true;
    });

  // Phone row always prints (label only when the station has no number) so every header lines up.
  const phoneLine = phone ? `Phone No.: ${phone}` : 'Phone No.:';
  const addressBudget = MAX_STATION_ADDRESS_ROWS - 1;
  const compacted = compactStationAddressRows(addressLines, Math.max(0, addressBudget));
  return [company.name, ...compacted, phoneLine].filter(Boolean);
}

function putStateCodeCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  stateCode?: string,
): number {
  const label = 'State Code: ';
  const value = stateCode?.trim() ?? '';
  strokeBox(doc, x, y, w, h);
  const ty = headerFieldTextY(doc, y, h, `${label}${value}`, w - CELL_PAD * 2, { size: 7 });
  doc.font('Times-Roman').fontSize(invFs(7)).fillColor('#000');
  doc.text(`${label} ${value}`, x + CELL_PAD, ty, { lineBreak: false });
  return h;
}

/**
 * Bill To body height (label + name + address). Compact gaps so the box can
 * end at SAC without stretching Invoice No. / Service Station rows.
 */
function measureCompanyBlockHeight(
  doc: PDFKit.PDFDocument,
  lines: string[],
  width: number,
): number {
  let h = CELL_PAD;
  doc.font('Times-Bold').fontSize(invFs(8));
  if (lines[0]) {
    h += doc.heightOfString(lines[0], { width, lineGap: 1 }) + 1;
  }
  doc.font('Times-Roman').fontSize(invFs(7));
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    h += doc.heightOfString(trimmed, { width, lineGap: 0 });
  }
  h += CELL_PAD;
  return h;
}

function measureSecondaryAddressHeight(
  doc: PDFKit.PDFDocument,
  lines: string[],
  width: number,
): number {
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  doc.font('Times-Roman').fontSize(invFs(7));
  const lineH = doc.heightOfString('X', { lineGap: 0 });
  // The box always prints (reference layout) — at least two text lines tall, even with no data.
  const minH = CELL_PAD * 2 + lineH * 2;
  if (clean.length === 0) return minH;
  let h = CELL_PAD;
  // First line (company name) stays on its own row; the rest wraps as one comma-joined block.
  h += doc.heightOfString(clean[0], { width, lineGap: 0 });
  const rest = joinAddressForWrap(clean.slice(1));
  if (rest) h += doc.heightOfString(rest, { width, lineGap: 0 });
  h += CELL_PAD;
  return Math.max(h, minH);
}

function measureBillToBodyHeight(
  doc: PDFKit.PDFDocument,
  billTo: InvoicePdfInput['billTo'],
  addressWidth: number,
): number {
  let h = CELL_PAD;
  doc.font('Times-Bold').fontSize(invFs(7));
  h += doc.heightOfString('Bill To:', { width: addressWidth, lineGap: 0 });
  if (billTo.name) {
    h += doc.heightOfString(billTo.name.toUpperCase(), { width: addressWidth, lineGap: 0 });
  }
  doc.font('Times-Roman').fontSize(invFs(7));
  for (const line of billTo.addressLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    h += doc.heightOfString(trimmed, { width: addressWidth, lineGap: 0 });
  }
  h += CELL_PAD;
  return h;
}

function measureBillToAddressHeight(
  doc: PDFKit.PDFDocument,
  addressLines: string[],
  addressWidth: number,
): number {
  doc.font('Times-Roman').fontSize(invFs(7));
  let h = 0;
  for (const line of addressLines) {
    h += doc.heightOfString(line, { width: addressWidth, lineGap: 0, lineBreak: true });
  }
  return h;
}

/** Merge or wrap address rows so Bill To body fits above the SAC band with bottom padding. */
export function fitBillToAddressLines(
  doc: PDFKit.PDFDocument,
  addressLines: string[],
  addressWidth: number,
  maxH: number,
): string[] {
  const deduped = addressLines.map((line) => line.trim()).filter(Boolean);
  if (deduped.length === 0) return [];
  if (maxH <= 0) return [deduped.join(', ')];

  for (let maxRows = deduped.length; maxRows >= 1; maxRows--) {
    const candidate =
      maxRows >= deduped.length ? deduped : compactStationAddressRows(deduped, maxRows);
    if (measureBillToAddressHeight(doc, candidate, addressWidth) <= maxH) {
      return candidate;
    }
  }
  return [deduped.join(', ')];
}

function renderBillToAddressBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  startY: number,
  addressWidth: number,
  maxH: number,
  addressLines: string[],
): void {
  if (maxH <= 0 || addressLines.length === 0) return;
  doc.font('Times-Roman').fontSize(invFs(7)).fillColor('#000');
  doc.text(addressLines.join('\n'), x + CELL_PAD, startY, {
    width: addressWidth,
    height: maxH,
    lineGap: 0,
    lineBreak: true,
    ellipsis: false,
  });
}

export type InvoiceHeaderGridLayout = {
  sellerH: number;
  sellerNameH: number;
  billBodyH: number;
  billAddressH: number;
  billToH: number;
  /** First bill-to box. Grows with the primary address. */
  primaryAddressH: number;
  /** Second address box. 0 when the customer has no second address. */
  secondaryAddressH: number;
  /** Extra company-address height below the five rigid header rows. */
  sellerExtraH: number;
  /** Extra primary-address height below Flight Category through SAC. Spacer sits above SAC. */
  addressExtraH: number;
  /** Empty row under SAC, beside the second address, so Service Code stays level with State Code. */
  afterSupplySpacerH: number;
  topMetaHs: number[];
  billAlignHs: number[];
  afterStateHs: number[];
  sacRowH: number;
  stateRowH: number;
  bottomRowH: number;
  /** Right meta column height from header-grid top through Place of Supply. */
  rightHeaderH: number;
  /** Left column height — matches `rightHeaderH` so the line-items table can start flush. */
  leftHeaderH: number;
  companyLines: string[];
  topRightMetaRows: Array<[string, string]>;
  billAlignRightRows: Array<[string, string]>;
  afterStateRightRows: Array<[string, string]>;
  metaLabelAbsW: number;
  leftW: number;
  rightW: number;
  addressWidth: number;
};

/** Shared header metrics for every tax-invoice PDF (drafts + posted). */
export function layoutInvoiceHeaderGrid(
  doc: PDFKit.PDFDocument,
  input: InvoicePdfInput,
): InvoiceHeaderGridLayout {
  const w = CONTENT_W;
  const leftW = w / 2;
  const rightW = w / 2;
  doc.font('Times-Bold').fontSize(invFs(7));
  const headerLineH = doc.heightOfString('GSTIN', { lineGap: 0 });
  const baseRowH = headerLineH + 6;
  const companyLines = buildCompanyHeaderLines(input.company);
  const addressWidth = leftW - CELL_PAD * 2;
  // Value column above the particulars table is 30% of the page width.
  const metaLabelAbsW = rightW - w * 0.3;

  doc.font('Times-Bold').fontSize(invFs(8));
  const sellerNameH = doc.heightOfString(companyLines[0] ?? '', { width: addressWidth, lineGap: 1 });

  // Description sits opposite the seller box so Bill To top aligns with Flight Category.
  const topRightMetaRows: Array<[string, string]> = [
    ['Invoice No.', input.invoiceNumber ?? ''],
    ['Invoice Date', input.invoiceDate ?? ''],
    ['GSTIN', input.company.gstin ?? ''],
    ['CIN', input.company.cin ?? ''],
    ['Description of Services', input.serviceDescription ?? 'Airport Services'],
  ];
  const topMetaHs = topRightMetaRows.map(() => baseRowH);
  const topMetaNaturalSum = topMetaHs.reduce((sum, h) => sum + h, 0);
  const sellerContentH = measureCompanyBlockHeight(doc, companyLines, addressWidth);
  const sellerExtraH = Math.max(0, sellerContentH - topMetaNaturalSum);
  const sellerH = topMetaNaturalSum + sellerExtraH;

  const billAlignRightRows: Array<[string, string]> = [
    ['Flight Category', input.flightCategory ?? ''],
    ['For the Month', input.billingPeriodLabel ?? ''],
    ['Service Station', titleCaseStation(input.serviceStation ?? '')],
    ['State', input.state ?? ''],
  ];
  const billBodyH = measureBillToBodyHeight(doc, input.billTo, addressWidth);

  const afterStateRightRows: Array<[string, string]> = [
    ['SAC', input.sacCode ?? ''],
    ['Service Code', input.serviceCode ?? ''],
    ['Place of Supply', input.placeOfSupply ?? ''],
  ];
  // Primary bill-to ends on the SAC bottom. The second address starts on that same line.
  const rigidSacSpanH = baseRowH * (billAlignRightRows.length + 1);
  const primaryNaturalH = measureBillToBodyHeight(doc, input.billTo, addressWidth);
  const secondaryNaturalH = measureSecondaryAddressHeight(
    doc,
    input.billTo.secondaryAddressLines ?? [],
    addressWidth,
  );
  // Any leftover height is shared by Flight Category through SAC. No blank row between State and SAC.
  const flightToSacCount = billAlignRightRows.length + 1;
  const rowShare = Math.max(0, primaryNaturalH - rigidSacSpanH) / flightToSacCount;
  const billAlignHs = billAlignRightRows.map(() => baseRowH + rowShare);
  const sacRowH = baseRowH + rowShare;
  const afterStateHs = [sacRowH, baseRowH, baseRowH];
  const stateRowH = afterStateHs[1];
  const bottomRowH = afterStateHs[2];
  const billAlignSum = billAlignHs.reduce((sum, h) => sum + h, 0);
  const addressExtraH = 0;
  const primaryAddressH = billAlignSum + sacRowH;
  const secondaryAddressH = secondaryNaturalH;
  const billToH = primaryAddressH + secondaryAddressH;
  const billAddressH = billToH - sacRowH;
  // Blank row under SAC, beside the second address, so Service Code stays level with State Code.
  const afterSupplySpacerH = secondaryAddressH;
  const rightHeaderH =
    topMetaNaturalSum +
    sellerExtraH +
    billAlignSum +
    addressExtraH +
    sacRowH +
    stateRowH +
    bottomRowH +
    afterSupplySpacerH;
  const leftHeaderH = sellerH + billToH + stateRowH + bottomRowH;

  return {
    sellerH,
    sellerNameH,
    billBodyH,
    billAddressH,
    billToH,
    primaryAddressH,
    secondaryAddressH,
    sellerExtraH,
    addressExtraH,
    afterSupplySpacerH,
    topMetaHs,
    billAlignHs,
    afterStateHs,
    sacRowH,
    stateRowH,
    bottomRowH,
    rightHeaderH,
    leftHeaderH,
    companyLines,
    topRightMetaRows,
    billAlignRightRows,
    afterStateRightRows,
    metaLabelAbsW,
    leftW,
    rightW,
    addressWidth,
  };
}

function renderHeaderGrid(doc: PDFKit.PDFDocument, input: InvoicePdfInput, startY: number): number {
  const x = MARGIN;
  const y = startY;
  const layout = layoutInvoiceHeaderGrid(doc, input);
  const {
    sellerH,
    sellerNameH,
    billToH,
    primaryAddressH,
    secondaryAddressH,
    sellerExtraH,
    afterSupplySpacerH,
    topMetaHs,
    billAlignHs,
    afterStateHs,
    stateRowH,
    bottomRowH,
    companyLines,
    topRightMetaRows,
    billAlignRightRows,
    afterStateRightRows,
    metaLabelAbsW,
    leftW,
    rightW,
    addressWidth,
  } = layout;

  strokeBox(doc, x, y, leftW, sellerH);
  const sellerTextH = Math.max(0, measureCompanyBlockHeight(doc, companyLines, addressWidth) - CELL_PAD * 2);
  let cy = y + Math.max(CELL_PAD, (sellerH - sellerTextH) / 2);
  doc.font('Times-Bold').fontSize(invFs(8)).fillColor('#000');
  doc.text(companyLines[0] ?? '', x + CELL_PAD, cy, {
    width: addressWidth,
    lineGap: 1,
    lineBreak: true,
  });
  cy += sellerNameH + 1;
  const sellerAddrLines = companyLines.slice(1).map((line) => line.trim()).filter(Boolean);
  if (sellerAddrLines.length) {
    doc.font('Times-Roman').fontSize(invFs(7)).fillColor('#000');
    doc.text(sellerAddrLines.join('\n'), x + CELL_PAD, cy, {
      width: addressWidth,
      lineGap: 0,
      lineBreak: true,
    });
  }

  const billY = y + sellerH;
  strokeBox(doc, x, billY, leftW, primaryAddressH);
  const primaryLines = input.billTo.addressLines.map((line) => line.trim()).filter(Boolean);
  let by = billY + CELL_PAD;
  doc.font('Times-Bold').fontSize(invFs(7)).fillColor('#000');
  doc.text('Bill To:', x + CELL_PAD, by, {
    width: addressWidth,
    underline: true,
    lineGap: 0,
    lineBreak: true,
  });
  by += doc.heightOfString('Bill To:', { width: addressWidth, lineGap: 0 });
  if (input.billTo.name) {
    const billToName = input.billTo.name.toUpperCase();
    doc.text(billToName, x + CELL_PAD, by, {
      width: addressWidth,
      lineGap: 0,
      lineBreak: true,
    });
    by += doc.heightOfString(billToName, { width: addressWidth, lineGap: 0 });
  }
  if (primaryLines.length) {
    doc.font('Times-Roman').fontSize(invFs(7)).fillColor('#000');
    doc.text(primaryLines.join('\n'), x + CELL_PAD, by, {
      width: addressWidth,
      lineGap: 0,
      lineBreak: true,
    });
  }
  if (secondaryAddressH > 0) {
    const secondaryY = billY + primaryAddressH;
    strokeBox(doc, x, secondaryY, leftW, secondaryAddressH);
    const secondaryLines = (input.billTo.secondaryAddressLines ?? [])
      .map((line) => line.trim())
      .filter(Boolean);
    const secondaryText = [secondaryLines[0], joinAddressForWrap(secondaryLines.slice(1))]
      .filter(Boolean)
      .join('\n');
    doc.font('Times-Roman').fontSize(invFs(7)).fillColor('#000');
    doc.text(secondaryText, x + CELL_PAD, secondaryY + CELL_PAD, {
      width: addressWidth,
      lineGap: 0,
      lineBreak: true,
    });
  }

  // Primary address ends on the SAC bottom. Second address starts on that line.
  const stateCodeY = billY + billToH;
  putStateCodeCell(doc, x, stateCodeY, leftW, stateRowH, input.billTo.stateCode);

  const gstinY = stateCodeY + stateRowH;
  const gstPart = input.billTo.gstin ? `GSTIN/UIN : ${input.billTo.gstin}` : 'GSTIN/UIN :';
  // Label always prints; the value still follows the customer's show-PAN setting.
  const panPart = input.billTo.pan?.trim() ? `PAN No. : ${input.billTo.pan.trim()}` : 'PAN No. :';
  const vatPart = input.billTo.vat?.trim() ? `VAT No. : ${input.billTo.vat.trim()}` : '';
  strokeBox(doc, x, gstinY, leftW, bottomRowH);
  // Reference: "GSTIN/UIN : 07AABCV6250D7ZE   PAN No. : AABCV6250D" — regular weight, one line.
  const gstinText = [gstPart, panPart, vatPart].filter(Boolean).join('   ');
  const gstinTextY = headerFieldTextY(doc, gstinY, bottomRowH, gstinText, leftW - CELL_PAD * 2, {
    size: 7,
  });
  doc.text(gstinText, x + CELL_PAD, gstinTextY, {
    width: leftW - CELL_PAD * 2,
    lineGap: 0,
    lineBreak: false,
  });

  let rightY = y;
  for (let i = 0; i < topRightMetaRows.length; i++) {
    rightY += drawLabelValueRow(
      doc,
      x + leftW,
      rightY,
      rightW,
      topMetaHs[i],
      topRightMetaRows[i][0],
      topRightMetaRows[i][1],
      metaLabelAbsW,
    );
  }
  if (sellerExtraH > 0) {
    strokeBox(doc, x + leftW, rightY, rightW, sellerExtraH);
    rightY += sellerExtraH;
  }

  for (let i = 0; i < billAlignRightRows.length; i++) {
    rightY += drawLabelValueRow(
      doc,
      x + leftW,
      rightY,
      rightW,
      billAlignHs[i],
      billAlignRightRows[i][0],
      billAlignRightRows[i][1],
      metaLabelAbsW,
    );
  }

  rightY += drawLabelValueRow(
    doc,
    x + leftW,
    rightY,
    rightW,
    afterStateHs[0],
    afterStateRightRows[0][0],
    afterStateRightRows[0][1],
    metaLabelAbsW,
  );
  if (afterSupplySpacerH > 0) {
    strokeBox(doc, x + leftW, rightY, rightW, afterSupplySpacerH);
    rightY += afterSupplySpacerH;
  }
  for (let i = 1; i < afterStateRightRows.length; i++) {
    rightY += drawLabelValueRow(
      doc,
      x + leftW,
      rightY,
      rightW,
      afterStateHs[i],
      afterStateRightRows[i][0],
      afterStateRightRows[i][1],
      metaLabelAbsW,
    );
  }

  return rightY;
}

const INR_USD_COL_WEIGHTS = [22, 108, 28, 32, 44, 34, 46, 50, 40, 56] as const;

function renderInrUsdLineItemsTable(
  doc: PDFKit.PDFDocument,
  input: InvoicePdfInput,
  startY: number,
): number {
  const x = MARGIN;
  const w = CONTENT_W;
  const roe = input.exchangeRate ?? 0;
  const scale = w / INR_USD_COL_WEIGHTS.reduce((sum, n) => sum + n, 0);
  const widths = INR_USD_COL_WEIGHTS.map((n) => Math.round(n * scale));
  widths[widths.length - 1] += w - widths.reduce((sum, n) => sum + n, 0);
  const headers = [
    'Sr. No.',
    'Particular',
    'Used',
    'Charged',
    'Aircraft Type',
    'Unit',
    'Rate/Unit (USD)',
    'Amount (USD)',
    'ROE',
    'Amount (INR)',
  ];
  const aligns: Array<'left' | 'right' | 'center'> = [
    'center',
    'left',
    'center',
    'center',
    'center',
    'center',
    'center',
    'right',
    'center',
    'right',
  ];
  let y = startY;
  const minHeadH = invDim(28);
  let headH = minHeadH;
  headers.forEach((header, index) => {
    headH = Math.max(headH, measureCellHeight(doc, header, widths[index], { bold: true, size: 6 }));
  });
  const drawHeader = (headerY: number): number => {
    let cx = x;
    headers.forEach((header, index) => {
      strokeBox(doc, cx, headerY, widths[index], headH);
      putCellText(doc, cx, headerY, widths[index], headH, header, {
        bold: true,
        align: 'center',
        size: 6,
        valign: 'middle',
      });
      cx += widths[index];
    });
    return headerY + headH;
  };
  y = ensureFlowSpace(doc, y, headH);
  y = drawHeader(y);
  const rows = input.lines.map((line) => [
    String(line.lineNo),
    line.description,
    line.used != null ? String(line.used) : '',
    String(line.charged),
    line.aircraftType ?? '',
    line.uom,
    fmtUsd(line.unitPrice),
    fmtUsd(line.amount),
    fmtRoe(roe),
    fmtInr(line.amountInr ?? line.amount * roe),
  ]);
  if (input.hasAnnexures) {
    rows.push(headers.map((_, index) => (index === 1 ? '[Refer attached annexure for details]' : '')));
  }
  const minRowH = invDim(15);
  for (const cells of rows) {
    let rowH = minRowH;
    cells.forEach((cell, index) => {
      if (!cell) return;
      rowH = Math.max(rowH, measureCellHeight(doc, cell, widths[index], { size: 6, align: aligns[index] }));
    });
    y = ensureFlowSpace(doc, y, rowH, drawHeader);
    let cellX = x;
    cells.forEach((cell, index) => {
      strokeBox(doc, cellX, y, widths[index], rowH);
      if (cell) {
        putCellText(doc, cellX, y, widths[index], rowH, cell, { size: 6, align: aligns[index] });
      }
      cellX += widths[index];
    });
    y += rowH;
  }

  const usdW = widths[7];
  const roeW = widths[8];
  const inrW = widths[9];
  const labelW = widths.slice(0, 7).reduce((sum, n) => sum + n, 0);
  const addRow = (label: string, usd: string, inr: string, bold = false) => {
    const rowH = Math.max(
      minRowH,
      measureCellHeight(doc, label, labelW, { bold, size: 6.5 }),
    );
    y = ensureFlowSpace(doc, y, rowH);
    strokeBox(doc, x, y, labelW, rowH);
    putCellText(doc, x, y, labelW, rowH, label, { bold, size: 6.5, align: 'right' });
    strokeBox(doc, x + labelW, y, usdW, rowH);
    putCellText(doc, x + labelW, y, usdW, rowH, usd, { bold, size: 6.5, align: 'right' });
    strokeBox(doc, x + labelW + usdW, y, roeW, rowH);
    strokeBox(doc, x + labelW + usdW + roeW, y, inrW, rowH);
    putCellText(doc, x + labelW + usdW + roeW, y, inrW, rowH, inr, { bold, size: 6.5, align: 'right' });
    y += rowH;
  };
  addRow('Total Amount', fmtUsd(input.subtotalUsd ?? input.subtotalExclTax), fmtInr(input.subtotalInr ?? 0), true);
  const concession = concessionAmountRows(
    input.subtotalExclTax,
    input.concessionFeePercent,
    input.concessionFeeUsd ?? input.concessionFeeAmount,
  );
  for (const row of concession) {
    const label =
      input.concessionFeePercent && input.concessionFeePercent > 0
        ? `Concession Fee @ ${fmtPct(input.concessionFeePercent)}% of "Total Gross Revenue"`
        : row.label;
    addRow(label, fmtUsd(input.concessionFeeUsd ?? row.amount), fmtInr(input.concessionFeeInr ?? 0));
  }
  addRow('Gross Amount in', fmtUsd(input.grossAmountUsd ?? input.grossAmount), fmtInr(input.grossAmountInr ?? 0), true);
  if ((input.cgstUsd ?? 0) > 0 || (input.cgstInr ?? 0) > 0) {
    addRow(`CGST @ ${fmtPct(input.cgstPercent ?? 9)}%`, fmtUsd(input.cgstUsd ?? 0), fmtInr(input.cgstInr ?? 0));
  }
  if ((input.sgstUsd ?? 0) > 0 || (input.sgstInr ?? 0) > 0) {
    addRow(`SGST @ ${fmtPct(input.sgstPercent ?? 9)}%`, fmtUsd(input.sgstUsd ?? 0), fmtInr(input.sgstInr ?? 0));
  }
  const inrWords = `Total Amount Receivable In Words- ${input.amountInWordsInr ?? ''} (In INR) (Rounded Off)`;
  const usdWords = `Total Amount Receivable In Words USD- ${input.amountInWordsUsd ?? ''} ONLY`;
  addRow(inrWords, fmtRoundedUsd(input.totalReceivableUsd ?? 0), fmtRoundedInr(input.totalReceivableInr ?? 0), true);
  addRow(usdWords, '', '', true);
  return y + 4;
}

function renderLineItemsTable(doc: PDFKit.PDFDocument, input: InvoicePdfInput, startY: number): number {
  if (input.dualCurrencyLayout && input.exchangeRate) {
    return renderInrUsdLineItemsTable(doc, input, startY);
  }
  const x = MARGIN;
  const w = CONTENT_W;
  const isUsd = input.currencyCode === 'USD';

  type Col = { header: string; w: number; align?: 'left' | 'right' | 'center' };
  const colWidths = scaleLineItemColWidths(w);
  const cols: Col[] = [
    { header: 'Sr. No.', w: colWidths[0], align: 'center' },
    { header: 'Particular', w: colWidths[1], align: 'left' },
    { header: 'Used', w: colWidths[2], align: 'center' },
    { header: 'Charged', w: colWidths[3], align: 'center' },
    { header: 'Aircraft\nType', w: colWidths[4], align: 'center' },
    { header: 'Unit', w: colWidths[5], align: 'center' },
    {
      header: isUsd ? 'Rate/Unit\n(USD)' : 'Rate/Unit\n(INR)',
      w: colWidths[6],
      align: 'center',
    },
    {
      header: isUsd ? 'Amount(USD)' : 'Amount(INR)',
      w: colWidths[7],
      align: 'right',
    },
  ];

  let y = startY;
  const minHeadH = invDim(24);
  let headH = minHeadH;
  for (const col of cols) {
    headH = Math.max(headH, measureCellHeight(doc, col.header, col.w, { bold: true, size: 6.5 }));
  }

  const minRowH = invDim(15);
  const drawHeader = (headerY: number): number => {
    let cx = x;
    for (const col of cols) {
      strokeBox(doc, cx, headerY, col.w, headH);
      putCellText(doc, cx, headerY, col.w, headH, col.header, {
        bold: true,
        align: 'center',
        size: 6.5,
        valign: 'middle',
      });
      cx += col.w;
    }
    return headerY + headH;
  };

  const ensureTableSpace = (currentY: number, neededH: number): number =>
    ensureFlowSpace(doc, currentY, neededH, drawHeader);

  y = ensureFlowSpace(doc, y, headH);
  y = drawHeader(y);

  const lineRows: string[][] = input.lines.map((line) =>
    isUsd
      ? [
          String(line.lineNo),
          line.description,
          line.used != null ? String(line.used) : '',
          String(line.charged),
          line.aircraftType ?? '',
          line.uom,
          fmtPlainInr(line.unitPrice),
          fmtUsd(line.amount),
        ]
      : [
          String(line.lineNo),
          line.description,
          line.used != null ? String(line.used) : '',
          String(line.charged),
          line.aircraftType ?? '',
          line.uom,
          // Reference prints the unit rate without digit grouping (1091.00).
          fmtPlainInr(line.unitPrice),
          fmtInr(line.amount),
        ],
  );

  if (input.hasAnnexures) {
    const annexCells = cols.map((_, i) =>
      i === 1 ? '[Refer attached annexure for details]' : i === cols.length - 1 ? '-' : '',
    );
    lineRows.push(annexCells);
  }

  // Reference body: column guides only (no row rules), rows breathe, and the box
  // keeps a minimum height so short invoices still show the open particulars area.
  const bodyRowH = invDim(19);
  const bodyTopGapH = invDim(8);
  const minBodyH = invDim(150);
  const bodyStartY = y;
  let bodyY = y + bodyTopGapH;
  let segmentStartY = bodyStartY;

  const closeSegment = (endY: number) => {
    if (endY > segmentStartY) strokeColumnGuides(doc, x, segmentStartY, colWidths, endY - segmentStartY);
  };

  for (const cells of lineRows) {
    let rowH = bodyRowH;
    for (let i = 0; i < cols.length; i++) {
      if (!cells[i]) continue;
      rowH = Math.max(
        rowH,
        measureCellHeight(doc, cells[i], cols[i].w, { size: 7, align: cols[i].align ?? 'left' }, 0, 2),
      );
    }
    if (bodyY + rowH > FLOW_BOTTOM_Y) {
      closeSegment(bodyY);
      strokeHorizontal(doc, x, x + w, bodyY);
      bodyY = ensureTableSpace(bodyY, rowH);
      segmentStartY = bodyY;
    }
    let cellX = x;
    for (let i = 0; i < cols.length; i++) {
      if (cells[i]) {
        putCellText(doc, cellX, bodyY, cols[i].w, rowH, cells[i], {
          size: 7,
          align: cols[i].align ?? 'left',
        });
      }
      cellX += cols[i].w;
    }
    bodyY += rowH;
  }

  // Pad the open area up to the reference minimum when the page has room.
  const usedBodyH = bodyY - segmentStartY;
  if (segmentStartY === bodyStartY && usedBodyH < minBodyH) {
    bodyY = Math.min(bodyStartY + minBodyH, Math.max(bodyY, FLOW_BOTTOM_Y - invDim(260)));
    bodyY = Math.max(bodyY, bodyStartY + usedBodyH);
  }
  closeSegment(bodyY);
  y = bodyY;

  strokeHorizontal(doc, x, x + w, y);

  const rowH = minRowH;
  const labelW = cols.slice(0, cols.length - 1).reduce((s, c) => s + c.w, 0);
  const amountW = cols[cols.length - 1].w;

  const addAmountRow = (
    label: string,
    amount: string,
    bold = false,
    leftPrefix?: string,
  ) => {
    const rowHeight = Math.max(
      rowH,
      measureCellHeight(doc, label, labelW, { bold, size: 7 }),
      measureCellHeight(doc, amount, amountW, { bold, size: 7, align: 'right' }),
      leftPrefix
        ? measureCellHeight(doc, leftPrefix, labelW, { bold, size: 7 })
        : 0,
    );
    y = ensureFlowSpace(doc, y, rowHeight);
    strokeBox(doc, x, y, labelW, rowHeight);
    if (leftPrefix) {
      putCellText(doc, x, y, labelW, rowHeight, leftPrefix, { bold, size: 7, align: 'left' });
    }
    // Reference: tax rows (CGST/SGST) sit at the right edge; every other label is left-aligned.
    const labelAlign = /^(CGST|SGST|IGST)\b/.test(label) ? 'right' : 'left';
    putCellText(doc, x, y, labelW, rowHeight, label, { bold, size: 7, align: labelAlign });
    strokeBox(doc, x + labelW, y, amountW, rowHeight);
    putCellText(doc, x + labelW, y, amountW, rowHeight, amount, { bold, size: 7, align: 'right' });
    y += rowHeight;
  };

  if (isUsd) {
    addAmountRow('Total Amount in USD', fmtUsd(input.subtotalExclTax), true);
    for (const row of concessionAmountRows(
      input.subtotalExclTax,
      input.concessionFeePercent,
      input.concessionFeeAmount,
    )) {
      addAmountRow(row.label, fmtUsd(row.amount));
    }
    addAmountRow('Gross Amount in USD', fmtUsd(input.grossAmount), true);

    if (input.totalReceivableUsd != null) {
      let taxAddPlaced = false;
      if (input.cgstUsd != null && input.cgstUsd > 0) {
        addAmountRow(
          `CGST @ ${fmtPct(input.cgstPercent ?? 9)}%`,
          fmtPlainInr(input.cgstUsd),
          false,
          taxAddPlaced ? undefined : 'Add:',
        );
        taxAddPlaced = true;
      }
      if (input.sgstUsd != null && input.sgstUsd > 0) {
        addAmountRow(
          `SGST @ ${fmtPct(input.sgstPercent ?? 9)}%`,
          fmtPlainInr(input.sgstUsd),
          false,
          taxAddPlaced ? undefined : 'Add:',
        );
        taxAddPlaced = true;
      }
      const usdWords = input.amountInWordsUsd
        ? `Total Amount Receivable In Words- ${wordsWithPaisa(input.amountInWordsUsd)} (In USD) (Rounded Off)`
        : 'Total Amount Receivable in USD (Rounded Off)';
      const usdWordsH = Math.max(
        invDim(24),
        measureCellHeight(doc, usdWords, labelW, { bold: true, size: 6.5 }),
        measureCellHeight(doc, fmtRoundedUsd(input.totalReceivableUsd ?? 0), amountW, {
          bold: true,
          size: 9,
          align: 'right',
        }),
      );
      y = ensureFlowSpace(doc, y, usdWordsH);
      strokeBox(doc, x, y, labelW, usdWordsH);
      putCellText(doc, x, y, labelW, usdWordsH, usdWords, { bold: true, size: 6.5 });
      strokeBox(doc, x + labelW, y, amountW, usdWordsH);
      putCellText(
        doc,
        x + labelW,
        y,
        amountW,
        usdWordsH,
        fmtRoundedUsd(input.totalReceivableUsd ?? 0),
        {
          bold: true,
          size: 9,
          align: 'right',
          valign: 'middle',
        },
      );
      y += usdWordsH;
    } else if (input.exchangeRate && input.totalReceivableInr != null) {
      addAmountRow(
        `Exchange rate of Rs. ${fmtRoe(input.exchangeRate)} has been considered for USD conversion`,
        input.grossAmountInr != null && input.grossAmountInr > 0
          ? fmtInr(input.grossAmountInr)
          : '',
        true,
      );
      let taxAddPlaced = false;
      if (input.cgstInr != null && input.cgstInr > 0) {
        addAmountRow(
          `CGST @ ${fmtPct(input.cgstPercent ?? 9)}%`,
          fmtPlainInr(input.cgstInr),
          false,
          taxAddPlaced ? undefined : 'Add:',
        );
        taxAddPlaced = true;
      }
      if (input.sgstInr != null && input.sgstInr > 0) {
        addAmountRow(
          `SGST @ ${fmtPct(input.sgstPercent ?? 9)}%`,
          fmtPlainInr(input.sgstInr),
          false,
          taxAddPlaced ? undefined : 'Add:',
        );
        taxAddPlaced = true;
      }
      const inrWords = input.amountInWordsInr
        ? `Total Amount Receivable In Words- ${wordsWithPaisa(input.amountInWordsInr)} (In INR) (Rounded Off)`
        : 'Total Amount Receivable in INR (Rounded Off)';
      const inrWordsH = Math.max(
        invDim(24),
        measureCellHeight(doc, inrWords, labelW, { bold: true, size: 6.5 }),
        measureCellHeight(doc, fmtRoundedInr(input.totalReceivableInr), amountW, {
          bold: true,
          size: 9,
          align: 'right',
        }),
      );
      y = ensureFlowSpace(doc, y, inrWordsH);
      strokeBox(doc, x, y, labelW, inrWordsH);
      putCellText(doc, x, y, labelW, inrWordsH, inrWords, { bold: true, size: 6.5 });
      strokeBox(doc, x + labelW, y, amountW, inrWordsH);
      putCellText(doc, x + labelW, y, amountW, inrWordsH, fmtRoundedInr(input.totalReceivableInr), {
        bold: true,
        size: 9,
        align: 'right',
        valign: 'middle',
      });
      y += inrWordsH;
    }
  } else {
    addAmountRow('Total Amount in INR', fmtInr(input.subtotalExclTax), true);
    for (const row of concessionAmountRows(
      input.subtotalExclTax,
      input.concessionFeePercent,
      input.concessionFeeAmount,
    )) {
      addAmountRow(row.label, fmtInr(row.amount));
    }
    addAmountRow('Gross Amount in INR', fmtInr(input.grossAmount), true);
    let taxAddPlaced = false;
    if (input.cgstAmount > 0) {
      addAmountRow(
        `CGST @ ${fmtPct(input.cgstPercent ?? 9)}%`,
        fmtPlainInr(input.cgstAmount),
        false,
        taxAddPlaced ? undefined : 'Add:',
      );
      taxAddPlaced = true;
    }
    if (input.sgstAmount > 0) {
      addAmountRow(
        `SGST @ ${fmtPct(input.sgstPercent ?? 9)}%`,
        fmtPlainInr(input.sgstAmount),
        false,
        taxAddPlaced ? undefined : 'Add:',
      );
      taxAddPlaced = true;
    }
    const wordsText = `Total Amount Receivable In Words- ${wordsWithPaisa(input.amountInWords)} (In INR) (Rounded Off)`;
    const wordsH = Math.max(
      invDim(24),
      measureCellHeight(doc, wordsText, labelW, { bold: true, size: 6.5 }),
      measureCellHeight(doc, fmtRoundedInr(input.totalInclTax), amountW, {
        bold: true,
        size: 9,
        align: 'right',
      }),
    );
    y = ensureFlowSpace(doc, y, wordsH);
    strokeBox(doc, x, y, labelW, wordsH);
    putCellText(doc, x, y, labelW, wordsH, wordsText, { bold: true, size: 6.5 });
    strokeBox(doc, x + labelW, y, amountW, wordsH);
    putCellText(doc, x + labelW, y, amountW, wordsH, fmtRoundedInr(input.totalInclTax), {
      bold: true,
      size: 9,
      align: 'right',
      valign: 'middle',
    });
    y += wordsH;
  }

  return y + 4;
}

/** Reference bank block: bold label, regular value, one line per row, no blank rows. */
function bankTableRows(input: InvoicePdfInput): Array<[string, string]> {
  const bank = input.bankDetails ?? {};
  const isUsd = input.currencyCode === 'USD';
  return [
    ['Bank Name :', bank.bankName ?? ''],
    ['Branch Address :', bank.branchAddress ?? ''],
    ['Beneficiary Name :', bank.beneficiaryName ?? ''],
    ["Swift Code of Beneficiary's Bank :", bank.swiftCode ?? ''],
    [isUsd ? 'USD Account Number :' : 'INR Account Number :', bank.accountNumber ?? ''],
    ['MICR :', bank.micr ?? ''],
    ['IFSC :', bank.ifscCode ?? ''],
    ["Beneficiary's PAN :", input.company.pan ?? ''],
  ];
}

const BANK_ROW_H = invDim(12);

function measureBankTableHeight(doc: PDFKit.PDFDocument, input: InvoicePdfInput): number {
  const w = CONTENT_W;
  let total = measureCellHeight(
    doc,
    "BENEFICIARY'S BANK ACCOUNT DETAILS FOR PROCESSING PAYMENT : -",
    w,
    { bold: true, size: 7 },
    invDim(16),
  );
  for (const [label, value] of bankTableRows(input)) {
    total += measureCellHeight(doc, `${label} ${value}`, w, { size: 7 }, BANK_ROW_H, 2);
  }
  return total + 4;
}

function renderBankTable(doc: PDFKit.PDFDocument, input: InvoicePdfInput, startY: number): number {
  const x = MARGIN;
  const w = CONTENT_W;
  let y = ensureFlowSpace(doc, startY, measureBankTableHeight(doc, input));
  y += drawCell(doc, x, y, w, invDim(16), "BENEFICIARY'S BANK ACCOUNT DETAILS FOR PROCESSING PAYMENT : -", {
    bold: true,
    size: 7,
  });

  const rows = bankTableRows(input);
  for (const [label, value] of rows) {
    const h = measureCellHeight(doc, `${label} ${value}`, w, { size: 7 }, BANK_ROW_H, 2);
    y = ensureFlowSpace(doc, y, h);
    strokeBox(doc, x, y, w, h);
    doc.fontSize(invFs(7)).fillColor('#000');
    const lineH = doc.font('Times-Bold').heightOfString('X', { lineGap: 0 });
    const ty = y + Math.max(1, (h - lineH) / 2);
    doc.font('Times-Bold').text(label, x + CELL_PAD, ty, { continued: true, lineBreak: false });
    doc.font('Times-Roman').text(value ? ` ${value}` : '', { lineBreak: false });
    y += h;
  }
  return y + 4;
}

/**
 * Terms wording stays station-specific (IXC BHS keeps its own clauses); only the
 * placement/typography is shared so every invoice reads the same.
 */
function resolveInvoiceTermsForLayout(input: InvoicePdfInput): string[] {
  return isChandigarhBhsLayout(input) ? chandigarhBhsTerms(input.company.name) : invoiceTerms(input.company.name);
}

/** Page 1 is identical for every station / service: brand, IRN, header grid, particulars, bank block. */
function renderPage1(doc: PDFKit.PDFDocument, input: InvoicePdfInput): number {
  let y = renderBrandHeader(doc, input);
  y += drawCell(doc, MARGIN, y, CONTENT_W, invDim(16), `IRN :- ${input.irn?.trim() ?? ''}`, {
    bold: true,
    size: 7.5,
  });
  y = renderHeaderGrid(doc, input, y);
  y = renderLineItemsTable(doc, input, y);
  return renderBankTable(doc, input, y);
}

/** Page 2 is identical for every invoice: notes title, terms, contacts, save-paper line, signatories. */
function renderPage2(doc: PDFKit.PDFDocument, input: InvoicePdfInput) {
  let y = FLOW_TOP_Y;

  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(LINE_W).strokeColor(BORDER).stroke();
  y += 8;

  doc.font('Times-Bold').fontSize(invFs(9)).fillColor('#000');
  doc.text(`Notes to Invoice No. :- ${input.invoiceNumber}`, MARGIN, y, { width: CONTENT_W, align: 'center' });
  y += invDim(16);
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(LINE_W).strokeColor(BORDER).stroke();
  y += 10;

  doc.font('Times-Bold').fontSize(invFs(8)).text('Other Terms & Conditions :', MARGIN, y, { underline: true });
  y += invDim(14);

  doc.font('Times-Roman').fontSize(invFs(7));
  const terms = resolveInvoiceTermsForLayout(input);
  for (let i = 0; i < terms.length; i++) {
    const text = `${i + 1}. ${terms[i]}`;
    const h = doc.heightOfString(text, { width: CONTENT_W, lineGap: 1 });
    y = ensureFlowSpace(doc, y, h + 5);
    doc.text(text, MARGIN, y, { width: CONTENT_W, align: 'justify', lineGap: 1, lineBreak: true });
    y += h + 5;
  }
  y += 6;
  const cols = [
    { label: 'Location', w: 72 },
    { label: 'Name', w: 88 },
    { label: 'Position', w: 100 },
    { label: 'CONTACT NO', w: 72 },
    { label: 'E Mail Id', w: CONTENT_W - 332 },
  ];
  const scale = CONTENT_W / cols.reduce((s, c) => s + c.w, 0);
  const scaledCols = cols.map((c) => ({ ...c, w: Math.round(c.w * scale) }));
  scaledCols[scaledCols.length - 1].w += CONTENT_W - scaledCols.reduce((s, c) => s + c.w, 0);

  let headH = invDim(16);
  for (const col of scaledCols) {
    headH = Math.max(headH, measureCellHeight(doc, col.label, col.w, { bold: true, size: 6.5 }));
  }
  y = ensureFlowSpace(doc, y, headH);
  let cx = MARGIN;
  for (const col of scaledCols) {
    strokeBox(doc, cx, y, col.w, headH);
    putCellText(doc, cx, y, col.w, headH, col.label, {
      bold: true,
      size: 6.5,
      align: 'center',
      valign: 'middle',
    });
    cx += col.w;
  }
  y += headH;

  const contacts = resolveInvoiceContacts(input.serviceStation).map((row) => [
    row.location,
    row.name,
    row.position,
    row.phone,
    row.email,
  ]);
  const minContactRowH = invDim(18);
  for (const row of contacts) {
    let rowH = minContactRowH;
    for (let i = 0; i < scaledCols.length; i++) {
      rowH = Math.max(rowH, measureCellHeight(doc, row[i], scaledCols[i].w, { size: 6.5 }));
    }
    y = ensureFlowSpace(doc, y, rowH, (newY) => {
      let headerX = MARGIN;
      for (const col of scaledCols) {
        strokeBox(doc, headerX, newY, col.w, headH);
        putCellText(doc, headerX, newY, col.w, headH, col.label, {
          bold: true,
          size: 6.5,
          align: 'center',
          valign: 'middle',
        });
        headerX += col.w;
      }
      return newY + headH;
    });
    cx = MARGIN;
    for (let i = 0; i < scaledCols.length; i++) {
      strokeBox(doc, cx, y, scaledCols[i].w, rowH);
      putCellText(doc, cx, y, scaledCols[i].w, rowH, row[i], { size: 6.5 });
      cx += scaledCols[i].w;
    }
    y += rowH;
  }

  y += 14;
  const savePaperH = measureWrappedTextHeight(
    doc,
    CHENNAI_INVOICE_FOOTER.savePaperMessage,
    CONTENT_W,
    { bold: true, size: 8 },
  );
  y = ensureFlowSpace(doc, y, savePaperH + invDim(50));
  doc.font('Times-Bold').fontSize(invFs(8)).text(CHENNAI_INVOICE_FOOTER.savePaperMessage, MARGIN, y, {
    width: CONTENT_W,
    align: 'center',
    lineBreak: true,
  });
  y += invDim(36);
  y = ensureFlowSpace(doc, y, invDim(12));
  doc.font('Times-Roman').fontSize(invFs(8));
  doc.text(CHENNAI_INVOICE_FOOTER.authorisedSignatoryLabel, MARGIN + 24, y);
  doc.text(CHENNAI_INVOICE_FOOTER.authorisedSignatoryLabel, MARGIN + CONTENT_W - 130, y);
}

export function buildInvoicePdfBuffer(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // One flow for every invoice: page 1 body, then notes/terms on a fresh page.
    renderPage1(doc, input);
    doc.addPage();
    renderPage2(doc, input);

    addBufferedPageFooters(doc, input);
    doc.end();
  });
}

export function buildInvoicePlainTextSummary(input: InvoicePdfInput): string {
  return [
    input.title,
    `Invoice: ${input.invoiceNumber}  Date: ${input.invoiceDate}`,
    `Customer: ${input.billTo.name}`,
    `Period: ${input.billingPeriodLabel}`,
    `Total: ${fmtInr(input.totalInclTax)}`,
  ].join('\n');
}
