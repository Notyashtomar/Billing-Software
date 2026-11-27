import { inflateSync } from 'zlib';
import { buildInvoicePdfBuffer } from './invoice-pdf.builder';
import { buildInvoicePdfInput, type BuildInvoicePdfInputParams } from './invoice-pdf.mapper';

/**
 * Reads the text actually drawn into the PDF, one entry per printed cell.
 * These checks look at the finished invoice, not at the formatting helpers.
 */
function printedCells(pdf: Buffer): string[] {
  const raw = pdf.toString('latin1');
  const cells: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw))) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    const showPattern = /\[((?:[^\]])*)\]\s*TJ/g;
    let show: RegExpExecArray | null;
    while ((show = showPattern.exec(content))) {
      const text = [...show[1].matchAll(/<([0-9a-fA-F]*)>/g)]
        .map((hex) => Buffer.from(hex[1], 'hex').toString('latin1'))
        .join('');
      if (text.trim()) cells.push(text.trim());
    }
  }
  return cells;
}

const STATIONS = ['MAA', 'DEL', 'HYD', 'TRV', 'COK', 'GOI', 'IXC', 'CJB', 'TRZ', 'IMF', 'IXA'];

const createdAt = new Date('2026-11-05T09:08:00.000Z');
const savedId = `${Math.floor(createdAt.getTime() / 1000).toString(16)}aaaaaaaaaaaaaaaa`;

function header(
  overrides: Partial<BuildInvoicePdfInputParams['header']>,
): BuildInvoicePdfInputParams['header'] {
  return {
    _id: savedId,
    draftNumber: 'DRAFT/TEST/1',
    customerCode: 'CI',
    customerName: 'CHINA AIRLINES LIMITED',
    documentDate: new Date('2026-11-05T00:00:00.000Z'),
    generatedAt: new Date('2026-11-10T11:20:00.000Z'),
    currencyCode: 'INR',
    subtotalExclTax: 0,
    taxTotal: 0,
    totalInclTax: 0,
    billingPeriodStart: new Date('2026-10-01'),
    billingPeriodEnd: new Date('2026-10-31'),
    stationCode: 'MAA',
    ...overrides,
  };
}

function bhsLine(lineNo: number, description: string, aircraftType: string, qty: number, rate: number) {
  const amount = Math.round(qty * rate * 100) / 100;
  return {
    lineNo,
    description,
    quantity: qty,
    uom: 'Per Flight',
    unitPrice: rate,
    lineAmountExclTax: amount,
    lineAmountInclTax: amount,
    serviceCode: 'Scheduled Flight',
    sourceType: 'scheduled_flight',
    sourceRef: { aircraftType, usedQuantity: qty, flightCount: qty },
  };
}

function adsLine(lineNo: number, description: string, qty: number, rate: number) {
  const amount = Math.round(qty * rate * 100) / 100;
  return {
    lineNo,
    description,
    quantity: qty,
    uom: 'Per Hour',
    unitPrice: rate,
    lineAmountExclTax: amount,
    lineAmountInclTax: amount,
    serviceCode: description,
    sourceType: 'ads',
    sourceRef: { aircraftType: 'A320', usedQuantity: qty, chargedQuantity: qty },
  };
}

// Rates with paise on purpose: none of it may reach an INR figure on the invoice.
const bhsLines = [
  bhsLine(1, 'Charges for Turnaround handling', 'B747-400F', 17, 19968.37),
  bhsLine(2, 'Charges for Turnaround handling', 'B777F', 5, 18153.55),
  bhsLine(3, 'Charges for Technical handling', 'B777-200F', 2, 9076.78),
  bhsLine(4, 'Charges for Diverted Flight handling', 'A320', 1, 4538.39),
];
const adsLines = [
  adsLine(1, 'Wheel Chair - WCHC', 3, 1250.75),
  adsLine(2, 'GPU-90KV', 2, 9500.5),
  adsLine(3, 'Air Starter Unit', 1, 15250.25),
];

const subtotal = (lines: Array<{ lineAmountExclTax: number }>) =>
  Math.round(lines.reduce((sum, line) => sum + line.lineAmountExclTax, 0) * 100) / 100;

/** A printed cell that is a bare number carrying decimals, e.g. `19968.37` or `1,07,669.33`. */
const DECIMAL_NUMBER_CELL = /^-?\d[\d,]*\.\d+$/;
const CLOCK_AFTER_DATE = /\b20\d\d \d{1,2}:\d{2}\b/;

async function render(params: BuildInvoicePdfInputParams) {
  const input = buildInvoicePdfInput(params);
  const cells = printedCells(await buildInvoicePdfBuffer(input));
  return { input, cells };
}

function expectInOrder(cells: string[], particulars: string[]) {
  const positions = particulars.map((text) => cells.indexOf(text));
  expect(positions.every((index) => index >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
}

describe('rendered tax invoice PDF', () => {
  it('reads real text out of the PDF', async () => {
    const { cells } = await render({
      header: header({ subtotalExclTax: subtotal(bhsLines) }),
      lines: bhsLines,
    });
    expect(cells).toContain('TAX INVOICE');
    expect(cells).toContain('Invoice Date');
    expect(cells).toContain('Particular');
  });

  it.each(STATIONS)('%s BHS in INR: date only, A to Z particulars, no paise', async (stationCode) => {
    const { cells } = await render({
      header: header({ stationCode, invoiceCategory: 'BHS', subtotalExclTax: subtotal(bhsLines) }),
      lines: bhsLines,
    });
    expect(cells).toContain('05 November 2026');
    expect(cells.filter((cell) => CLOCK_AFTER_DATE.test(cell))).toEqual([]);
    expect(
      cells.filter((cell) => cell.startsWith('Charges for')),
    ).toEqual([
      'Charges for Diverted Flight handling',
      'Charges for Technical handling',
      'Charges for Turnaround handling',
      'Charges for Turnaround handling',
    ]);
    expect(cells.filter((cell) => DECIMAL_NUMBER_CELL.test(cell))).toEqual([]);
    // Unit rate and line amount for the first stored line, in whole rupees.
    expect(cells).toContain('19968');
    expect(cells).toContain('3,39,462');
  });

  it.each(STATIONS)('%s ADS in INR: date only, A to Z particulars, no paise', async (stationCode) => {
    const { input, cells } = await render({
      header: header({ stationCode, invoiceCategory: 'ADS', subtotalExclTax: subtotal(adsLines) }),
      lines: adsLines,
    });
    expect(input.serviceCode).toBe('ADS');
    expect(cells).toContain('05 November 2026');
    expect(cells.filter((cell) => CLOCK_AFTER_DATE.test(cell))).toEqual([]);
    expectInOrder(cells, ['Air Starter Unit', 'GPU-90KV', 'Wheel Chair - WCHC']);
    expect(cells.filter((cell) => DECIMAL_NUMBER_CELL.test(cell))).toEqual([]);
  });

  it('USD invoice with INR receivable: USD keeps decimals, every INR figure is whole rupees', async () => {
    const usdLines = [
      bhsLine(1, 'Charges for Turnaround handling', 'B747-400F', 17, 4222.49),
      bhsLine(2, 'Charges for Technical handling', 'B777-200F', 2, 2111.25),
    ];
    const { input, cells } = await render({
      header: header({
        stationCode: 'DEL',
        invoiceCategory: 'BHS',
        currencyCode: 'USD',
        currencyFactor: 88.4567,
        subtotalExclTax: subtotal(usdLines),
      }),
      lines: usdLines,
    });
    expect(cells).toContain('4222.49');
    expect(cells).toContain('71,782.33');
    expect(cells).toContain('05 November 2026');
    expect(cells.filter((cell) => CLOCK_AFTER_DATE.test(cell))).toEqual([]);
    expectInOrder(cells, ['Charges for Technical handling', 'Charges for Turnaround handling']);

    const inrFigures = [input.grossAmountInr, input.cgstInr, input.sgstInr, input.totalReceivableInr]
      .filter((value): value is number => typeof value === 'number' && value > 0);
    expect(inrFigures.length).toBeGreaterThanOrEqual(2);
    for (const value of inrFigures) {
      const withPaise = value.toFixed(2);
      const grouped = new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
      expect(cells).not.toContain(withPaise);
      expect(cells).not.toContain(grouped);
    }
    // The only decimal cells left are USD: unit rates, line amounts and USD totals.
    const usdFigures = new Set(
      [
        ...input.lines.flatMap((line) => [line.unitPrice.toFixed(2), line.amount]),
        input.subtotalExclTax,
        input.concessionFeeAmount,
        input.grossAmount,
      ].map((value) =>
        typeof value === 'string'
          ? value
          : new Intl.NumberFormat('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(value),
      ),
    );
    const unexpected = cells.filter((cell) => DECIMAL_NUMBER_CELL.test(cell) && !usdFigures.has(cell));
    expect(unexpected).toEqual([]);
  });

  it('USD and INR side by side: the INR column has no paise', async () => {
    const usdLines = [
      bhsLine(1, 'Charges for Turnaround handling', 'B747-400F', 3, 4222.49),
      bhsLine(2, 'Charges for Technical handling', 'B777-200F', 1, 2111.25),
    ];
    const { input, cells } = await render({
      header: header({
        stationCode: 'HYD',
        invoiceCategory: 'BHS',
        currencyCode: 'USD',
        currencyFactor: 88.4567,
        subtotalExclTax: subtotal(usdLines),
      }),
      lines: usdLines,
      inrUsdInvoiceCategories: ['BHS'],
    });
    expect(input.dualCurrencyLayout).toBe(true);
    expect(cells).toContain('Amount (INR)');
    expect(cells).toContain('4,222.49');
    for (const line of input.lines) {
      const inr = line.amountInr ?? 0;
      expect(inr % 1).not.toBe(0);
      expect(cells).toContain(new Intl.NumberFormat('en-IN').format(Math.round(inr)));
      expect(cells).not.toContain(
        new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(inr),
      );
    }
    expectInOrder(cells, ['Charges for Technical handling', 'Charges for Turnaround handling']);
  });

  it('RAF keeps the clock beside the invoice date', async () => {
    const { input, cells } = await render({
      header: header({ invoiceCategory: 'RAF', subtotalExclTax: 1000 }),
      lines: [
        {
          ...bhsLine(1, 'Screening charges', '', 1000, 1),
          uom: 'Per Kg',
          serviceCode: 'RAF',
          sourceType: 'raf',
          sourceRef: { chargedQuantity: 1000 },
        },
      ],
    });
    expect(input.serviceCode).toBe('RAF');
    expect(cells).toContain('05 November 2026 16:50');
  });
});
