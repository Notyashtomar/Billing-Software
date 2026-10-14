import { Injectable } from '@nestjs/common';
import { buildInvoicePdfBuffer, buildInvoicePlainTextSummary } from './invoice-pdf.builder';
import { buildInvoicePdfInput, type BuildInvoicePdfInputParams } from './invoice-pdf.mapper';
import { buildSampleInvoicePdfInput } from './invoice-pdf.sample-data';
import type { InvoicePdfInput, InvoicePdfSnapshot } from './invoice-pdf.types';

/** @deprecated Use InvoicePdfInput via buildInvoicePdfInput */
export interface PdfDocumentInput {
  title: string;
  customerName: string;
  customerCode: string;
  documentNumber: string;
  documentDate: string;
  currencyCode: string;
  lines: Array<{
    lineNo: number;
    description: string;
    quantity: number;
    unitPrice: number;
    lineAmountInclTax: number;
  }>;
  subtotalExclTax: number;
  taxTotal: number;
  totalInclTax: number;
}

@Injectable()
export class PdfEngineService {
  async buildInvoiceSnapshot(params: BuildInvoicePdfInputParams): Promise<InvoicePdfSnapshot> {
    const input = buildInvoicePdfInput(params);
    const pdfBuffer = await buildInvoicePdfBuffer(input);
    return {
      format: 'pdf',
      pdfBase64: pdfBuffer.toString('base64'),
      pageCount: 2,
      generatedAt: new Date().toISOString(),
      plainText: buildInvoicePlainTextSummary(input),
    };
  }

  /** Finance reference layout — SI/MA/326/001896 (preview / training). */
  async buildSampleInvoiceSnapshot(): Promise<InvoicePdfSnapshot> {
    const input = buildSampleInvoicePdfInput();
    const pdfBuffer = await buildInvoicePdfBuffer(input);
    return {
      format: 'pdf',
      pdfBase64: pdfBuffer.toString('base64'),
      pageCount: 2,
      generatedAt: new Date().toISOString(),
      plainText: buildInvoicePlainTextSummary(input),
    };
  }

  /** Legacy text snapshot — kept for credit memos until dedicated layout is added. */
  buildSnapshot(input: PdfDocumentInput) {
    const plainText = [
      input.title,
      '='.repeat(60),
      `Customer: ${input.customerCode} — ${input.customerName}`,
      `Document: ${input.documentNumber}`,
      `Date: ${input.documentDate}`,
      `Currency: ${input.currencyCode}`,
      '',
      'Lines',
      '-'.repeat(60),
      ...input.lines.map(
        (l) =>
          `${l.lineNo}. ${l.description} | Qty ${l.quantity} @ ${l.unitPrice} = ${l.lineAmountInclTax}`,
      ),
      '-'.repeat(60),
      `Subtotal (excl tax): ${input.subtotalExclTax}`,
      `Tax: ${input.taxTotal}`,
      `Total (incl tax): ${input.totalInclTax}`,
    ].join('\n');

    return {
      format: 'text',
      plainText,
      generatedAt: new Date().toISOString(),
    };
  }

  toDownloadBody(snapshot: InvoicePdfSnapshot | { plainText?: string; pdfBase64?: string; format?: string }): {
    contentType: string;
    body: string;
    encoding?: 'base64';
    fileNameExt: string;
  } {
    if (snapshot.format === 'pdf' && 'pdfBase64' in snapshot && snapshot.pdfBase64) {
      return {
        contentType: 'application/pdf',
        body: snapshot.pdfBase64,
        encoding: 'base64',
        fileNameExt: 'pdf',
      };
    }
    return {
      contentType: 'text/plain',
      body: snapshot.plainText ?? '',
      fileNameExt: 'txt',
    };
  }
}

export type { InvoicePdfInput, BuildInvoicePdfInputParams };
