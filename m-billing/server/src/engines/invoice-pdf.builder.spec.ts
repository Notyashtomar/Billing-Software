import PDFDocument from 'pdfkit';
import {
  compactStationAddressRows,
  MAX_STATION_ADDRESS_ROWS,
  chennaiInvoiceTerms,
  fitBillToAddressLines,
  layoutInvoiceHeaderGrid,
  buildInvoicePdfBuffer,
} from './invoice-pdf.builder';
import { buildSampleInvoicePdfInput } from './invoice-pdf.sample-data';
import type { InvoicePdfInput } from './invoice-pdf.types';

describe('compactStationAddressRows', () => {
  it('drops consecutive duplicate city lines', () => {
    expect(
      compactStationAddressRows([
        'Chennai International Airport',
        'Chennai',
        'Chennai',
        'Tamil Nadu',
      ]),
    ).toEqual(['Chennai International Airport', 'Chennai', 'Tamil Nadu']);
  });

  it('caps station address at 7 rows and merges overflow', () => {
    const lines = [
      'New Domestic Terminal Building T-1',
      'Chennai International Airport',
      'Domestic Terminal Level',
      'Airport Road',
      'Next to Tamil Nadu Tourism Centre',
      'Chennai',
      'Tamil Nadu',
      '600027',
    ];
    const compacted = compactStationAddressRows(lines, MAX_STATION_ADDRESS_ROWS);
    expect(compacted).toHaveLength(7);
    expect(compacted[0]).toBe('New Domestic Terminal Building T-1');
    expect(compacted[6]).toContain('600027');
  });
});

describe('chennaiInvoiceTerms', () => {
  it('matches SI/MA/327 sample wording with the invoicing entity name', () => {
    const entity = 'BIRD AIRPORT SERVICES (CHENNAI) PRIVATE LIMITED';
    const terms = chennaiInvoiceTerms(entity);
    expect(terms).toHaveLength(11);
    expect(terms[0]).toBe(
      'Rates are excluding royalty / concession fee payable to Airport Authority Of India.',
    );
    expect(terms[1]).toContain(entity);
    expect(terms[9]).toBe('GST is not payable under Reverse Charge.');
    expect(terms[10]).toContain('within three working days');
  });
});

function withPdfDoc<T>(fn: (doc: PDFKit.PDFDocument) => T): T {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  try {
    return fn(doc);
  } finally {
    doc.end();
  }
}

function longBillToInput(): InvoicePdfInput {
  const input = buildSampleInvoicePdfInput();
  return {
    ...input,
    invoiceNumber: 'DRAFT/MAA/20260901/11567449',
    billTo: {
      ...input.billTo,
      name: 'Biman Bangladesh',
      addressLines: [
        'Biman Bangladesh Airlines Ltd',
        'Balaka, Kurmitola',
        'Dhaka-1229',
        'Bangladesh',
        'Attn: Finance Department',
        'Accounts Payable Desk',
        'Station Coordination Office',
        'Chennai Operations',
      ],
      stateCode: '33',
    },
  };
}

describe('fitBillToAddressLines', () => {
  const emiratesAddress = [
    'Ground Floor',
    'Door No. 129 TO 140',
    'Prestige',
    'Palladium Bayan',
    'Greams Road',
    'Egmore',
    'Chennai',
  ];

  it('keeps all rows when height budget is generous', () => {
    withPdfDoc((doc) => {
      const fitted = fitBillToAddressLines(doc, emiratesAddress, 240, 200);
      expect(fitted).toEqual(emiratesAddress);
    });
  });

  it('compacts rows to fit a tight Bill To address band', () => {
    withPdfDoc((doc) => {
      const fitted = fitBillToAddressLines(doc, emiratesAddress, 240, 48);
      expect(fitted.length).toBeLessThan(emiratesAddress.length);
      expect(fitted.join(' ')).toContain('Chennai');
    });
  });
});

describe('layoutInvoiceHeaderGrid', () => {
  it('keeps Invoice No. and Service Station at natural row height', () => {
    const layout = withPdfDoc((doc) => layoutInvoiceHeaderGrid(doc, longBillToInput()));
    const invoiceDateH = layout.topMetaHs[1];
    const gstinH = layout.topMetaHs[2];
    const serviceStationH = layout.billAlignHs[2];
    const stateH = layout.billAlignHs[3];

    expect(layout.topMetaHs[0]).toBeCloseTo(invoiceDateH, 5);
    expect(layout.topMetaHs[0]).toBeCloseTo(gstinH, 5);
    expect(serviceStationH).toBeCloseTo(stateH, 5);
    expect(layout.topMetaHs[0]).toBeLessThan(layout.sellerH * 0.6);
    expect(serviceStationH).toBeLessThan(layout.billAddressH * 0.5);
  });

  it('aligns Bill To top with Flight Category and bottom with SAC', () => {
    const shortInput = buildSampleInvoicePdfInput();
    const longInput = longBillToInput();
    const short = withPdfDoc((doc) => layoutInvoiceHeaderGrid(doc, shortInput));
    const long = withPdfDoc((doc) => layoutInvoiceHeaderGrid(doc, longInput));

    expect(long.billBodyH).toBeGreaterThan(short.billBodyH);
    expect(long.billToH).toBeCloseTo(long.billAddressH + long.sacRowH, 5);

    // Bill To top || Flight Category top (seller ends at Description bottom).
    expect(short.sellerH).toBeCloseTo(
      short.topMetaHs.reduce((s, h) => s + h, 0),
      5,
    );
    expect(short.billAlignRightRows[0][0]).toBe('Flight Category');
    expect(short.topRightMetaRows[4][0]).toBe('Description of Services');

    const sacBottomFromStart = (layout: ReturnType<typeof layoutInvoiceHeaderGrid>) =>
      layout.topMetaHs.reduce((s, h) => s + h, 0) +
      layout.sellerExtraH +
      layout.billAlignHs.reduce((s, h) => s + h, 0) +
      layout.addressExtraH +
      layout.sacRowH;

    // Primary address ends on the SAC bottom. A second address starts on that line.
    expect(short.sellerH + short.primaryAddressH).toBeCloseTo(sacBottomFromStart(short), 5);
    expect(long.sellerH + long.primaryAddressH).toBeCloseTo(sacBottomFromStart(long), 5);
  });

  it('locks left and right header bottoms at Place of Supply for the particulars table', () => {
    const short = withPdfDoc((doc) => layoutInvoiceHeaderGrid(doc, buildSampleInvoicePdfInput()));
    const long = withPdfDoc((doc) => layoutInvoiceHeaderGrid(doc, longBillToInput()));

    expect(short.leftHeaderH).toBeCloseTo(short.rightHeaderH, 5);
    expect(long.leftHeaderH).toBeCloseTo(long.rightHeaderH, 5);
  });

  it('renders a full PDF for a long Bill To address', async () => {
    const buf = await buildInvoicePdfBuffer(longBillToInput());
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

