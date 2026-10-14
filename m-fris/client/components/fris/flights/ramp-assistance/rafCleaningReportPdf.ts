/**
 * RAF View-column cleaning report PDF.
 * Uses dynamic jsPDF only — do not static-import this from Worker graph entry points.
 */

import { getJsPDFConstructor } from '@/lib/dynamic-imports';
import {
  formatSignedAt,
  placeSignatureImage,
} from '@/components/fris/flights/scheduledairlines/signatures/signaturePdf';
import {
  RAF_CLEANING_SOP_STATEMENT,
  type RafCleaningReportData,
} from './rafCleaningReportData';

const MARGIN = 16;
const LINE = 0.2;

function dash(v: string): string {
  const t = String(v ?? '').trim();
  return t || '—';
}

function drawHLine(
  doc: InstanceType<Awaited<ReturnType<typeof getJsPDFConstructor>>>,
  y: number,
  pageW: number,
): void {
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(LINE);
  doc.line(MARGIN, y, pageW - MARGIN, y);
}

function fieldRow(
  doc: InstanceType<Awaited<ReturnType<typeof getJsPDFConstructor>>>,
  y: number,
  cols: Array<{ label: string; value: string; x: number; w: number }>,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  for (const col of cols) {
    doc.text(`${col.label}`, col.x, y);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const col of cols) {
    const labelW = doc.getTextWidth(`${col.label} `);
    doc.text(dash(col.value), col.x + labelW, y, {
      maxWidth: Math.max(12, col.w - labelW - 2),
    });
  }
  return y + 7;
}

export async function downloadRafCleaningReportPdf(
  data: RafCleaningReportData,
  filename?: string,
): Promise<void> {
  const JsPDF = await getJsPDFConstructor();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 2 * MARGIN;
  let y = 18;

  // Header placeholders (legacy report chrome)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  for (let i = 0; i < 3; i += 1) {
    doc.text('—', pageW / 2, y, { align: 'center' });
    y += 5;
  }
  doc.text('— / —', pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(data.title, pageW / 2, y, { align: 'center' });
  y += 6;
  drawHLine(doc, y, pageW);
  y += 8;

  const col1 = MARGIN;
  const col2 = MARGIN + contentW * 0.34;
  const col3 = MARGIN + contentW * 0.66;
  const w1 = contentW * 0.32;
  const w2 = contentW * 0.30;
  const w3 = contentW * 0.32;

  y = fieldRow(doc, y, [
    { label: 'Airline', value: data.airline, x: col1, w: w1 },
    { label: 'Code', value: data.airlineCode, x: col2, w: w2 },
    { label: 'Flight No', value: data.flightNo, x: col3, w: w3 },
  ]);
  y = fieldRow(doc, y, [
    { label: 'Aircraft Type', value: data.aircraftType, x: col1, w: w1 },
    { label: 'Reg.', value: data.registration, x: col2, w: w2 },
    { label: 'Route', value: data.route, x: col3, w: w3 },
  ]);
  y = fieldRow(doc, y, [
    { label: 'STA Date', value: data.staDate, x: col1, w: w1 },
    { label: 'STA Time', value: data.staTime, x: col2, w: w2 },
    { label: 'STD Date', value: data.stdDate, x: col3, w: w3 },
  ]);
  y = fieldRow(doc, y, [
    { label: 'STD Time', value: data.stdTime, x: col1, w: w1 },
    { label: 'ATA Date', value: data.ataDate, x: col2, w: w2 },
    { label: 'ATA Time', value: data.ataTime, x: col3, w: w3 },
  ]);
  y = fieldRow(doc, y, [
    { label: 'ATD Date', value: data.atdDate, x: col1, w: w1 },
    { label: 'ATD Time', value: data.atdTime, x: col2, w: w2 },
  ]);
  y += 2;
  y = fieldRow(doc, y, [
    { label: 'Started From', value: data.startedFrom, x: col1, w: w1 },
    { label: 'Cleaning Ended', value: data.cleaningEnded, x: col2, w: w2 },
    { label: 'Duration', value: data.duration, x: col3, w: w3 },
  ]);
  y = fieldRow(doc, y, [
    {
      label: 'Cleaning Supervisor',
      value: data.cleaningSupervisor,
      x: col1,
      w: contentW,
    },
  ]);

  y += 4;
  drawHLine(doc, y, pageW);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const sopLines = doc.splitTextToSize(
    `${dash(data.title)} ${RAF_CLEANING_SOP_STATEMENT}`,
    contentW,
  );
  doc.text(sopLines, MARGIN, y);
  y += sopLines.length * 5 + 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Remarks (if any)', MARGIN, y);
  y += 4;
  drawHLine(doc, y, pageW);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const remarkLines = doc.splitTextToSize(dash(data.remarks), contentW);
  doc.text(remarkLines, MARGIN, y);
  y += Math.max(18, remarkLines.length * 5 + 10);

  drawHLine(doc, y, pageW);
  y += 10;

  const sigBoxW = 55;
  const sigBoxH = 22;
  const rightX = pageW - MARGIN - sigBoxW;

  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.15);
  doc.rect(MARGIN, y, sigBoxW, sigBoxH);
  doc.rect(rightX, y, sigBoxW, sigBoxH);
  placeSignatureImage(doc, data.ghSignature?.signatureUrl, MARGIN + 1, y + 1, sigBoxW - 2, sigBoxH - 2);
  placeSignatureImage(
    doc,
    data.airlineSignature?.signatureUrl,
    rightX + 1,
    y + 1,
    sigBoxW - 2,
    sigBoxH - 2,
  );
  y += sigBoxH + 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('GH Signature', MARGIN, y);
  doc.text('Airline Signature', pageW - MARGIN, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (data.ghRepName.trim()) {
    doc.text(data.ghRepName.trim(), MARGIN, y);
  }
  if (data.airlineRepName.trim()) {
    doc.text(data.airlineRepName.trim(), pageW - MARGIN, y, { align: 'right' });
  }
  y += 4;

  doc.setFontSize(8);
  const ghSigned = formatSignedAt(data.ghSignature?.signedAt);
  const airlineSigned = formatSignedAt(data.airlineSignature?.signedAt);
  if (ghSigned) {
    doc.text(`Signed: ${ghSigned}`, MARGIN, y);
  }
  if (airlineSigned) {
    doc.text(`Signed: ${airlineSigned}`, pageW - MARGIN, y, { align: 'right' });
  }

  const safeName = (filename ?? `${data.title.replace(/\s+/g, '_')}_${data.serialNo || 'raf'}.pdf`)
    .replace(/[^\w.\-]+/g, '_');
  doc.save(safeName);
}

/** Lazy entry — keeps jspdf out of static Worker graph. */
export async function downloadRafCleaningReportPdfLazy(
  data: RafCleaningReportData,
  filename?: string,
): Promise<void> {
  return downloadRafCleaningReportPdf(data, filename);
}
