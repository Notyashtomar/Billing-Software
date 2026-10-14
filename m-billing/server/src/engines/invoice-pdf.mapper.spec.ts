import { buildInvoicePdfInput, type BuildInvoicePdfInputParams } from './invoice-pdf.mapper';
import { amountInWordsInr } from './amount-in-words';

const header: BuildInvoicePdfInputParams['header'] = {
  draftNumber: 'DRAFT-1',
  customerCode: 'IX',
  customerName: 'AIR INDIA EXPRESS LIMITED',
  documentDate: new Date('2026-08-01'),
  currencyCode: 'INR',
  subtotalExclTax: 7500,
  taxTotal: 1350,
  totalInclTax: 8850,
  billingPeriodStart: new Date('2026-07-01'),
  billingPeriodEnd: new Date('2026-07-31'),
  stationCode: 'MAA',
};

function bhsLine(sourceRef: Record<string, unknown>) {
  return {
    lineNo: 1,
    description: 'Charges for Turnaround Handling',
    quantity: 10,
    uom: 'Per Flight',
    unitPrice: 750,
    lineAmountExclTax: 7500,
    lineAmountInclTax: 8850,
    serviceCode: 'Scheduled Flight',
    sourceType: 'scheduled_flight',
    sourceRef,
  };
}

describe('buildInvoicePdfInput — flight category', () => {
  it('uses the flight category carried on BHS lines even when the service catalog has no match', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ categoryOfFlight: 'Int', categoriesOfFlight: ['Int'] })],
    });
    expect(input.flightCategory).toBe('International');
  });

  it('reads the category from the ADS operational snapshot', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [
        {
          ...bhsLine({ operationalSnapshot: { Cate_of_Flight: 'Domestic' } }),
          serviceCode: 'GPU-90KV',
          sourceType: 'ads',
        },
      ],
    });
    expect(input.flightCategory).toBe('Domestic');
  });

  it('falls back to the contract category for legacy lines without flight data', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ flightCount: 10 })],
      contractCategory: 'Dom',
    });
    expect(input.flightCategory).toBe('Domestic');
  });

  it('falls back to the service catalog category last', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ flightCount: 10 })],
      serviceCatalog: [{ serviceCode: 'Scheduled Flight', category: 'international' }],
    });
    expect(input.flightCategory).toBe('International');
  });

  it('reports both categories when one invoice mixes domestic and international flights', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ categoriesOfFlight: ['Dom', 'Int'] })],
    });
    expect(input.flightCategory).toBe('Domestic & International');
  });

  it('prints For the Period as month and year only', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ categoryOfFlight: 'Int' })],
    });
    expect(input.billingPeriodLabel).toBe('July 2026');
  });

  it('prints multi-month For the Period as a month span', () => {
    const input = buildInvoicePdfInput({
      header: {
        ...header,
        billingPeriodStart: new Date('2026-03-01'),
        billingPeriodEnd: new Date('2026-07-31'),
      },
      lines: [bhsLine({ categoryOfFlight: 'Dom' })],
    });
    expect(input.billingPeriodLabel).toBe('March - July 2026');
  });

  it('prints fortnight For the Period as the billed day range', () => {
    const firstHalf = buildInvoicePdfInput({
      header: {
        ...header,
        billingPeriodStart: new Date(Date.UTC(2026, 7, 1)),
        billingPeriodEnd: new Date(Date.UTC(2026, 7, 15, 23, 59, 59, 999)),
      },
      lines: [bhsLine({ categoryOfFlight: 'Int' })],
      fortnightBilling: true,
    });
    expect(firstHalf.billingPeriodLabel).toBe('[1-15] Aug 2026');

    const secondHalf = buildInvoicePdfInput({
      header: {
        ...header,
        billingPeriodStart: new Date(Date.UTC(2026, 7, 16)),
        billingPeriodEnd: new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999)),
      },
      lines: [bhsLine({ categoryOfFlight: 'Int' })],
      fortnightBilling: true,
    });
    expect(secondHalf.billingPeriodLabel).toBe('[16-31] Aug 2026');
  });

  it('keeps a full-month label when the contract is not fortnight', () => {
    const input = buildInvoicePdfInput({
      header: {
        ...header,
        billingPeriodStart: new Date(Date.UTC(2026, 7, 1)),
        billingPeriodEnd: new Date(Date.UTC(2026, 7, 15, 23, 59, 59, 999)),
      },
      lines: [bhsLine({ categoryOfFlight: 'Int' })],
    });
    expect(input.billingPeriodLabel).toBe('August 2026');
  });

  it('keeps fractional RAF used/charged quantities on the PDF', () => {
    const input = buildInvoicePdfInput({
      header: { ...header, invoiceCategory: 'RAF' },
      lines: [
        {
          lineNo: 1,
          description: 'Floor Walkers/Welcome staff',
          quantity: 1.5,
          uom: 'per personnel/hr',
          unitPrice: 1678,
          lineAmountExclTax: 2517,
          lineAmountInclTax: 2517,
          serviceCode: 'RAF',
          sourceType: 'raf',
          sourceRef: {
            particular: 'Floor Walkers/Welcome staff',
            usedQuantity: 1.5,
            chargedQuantity: 1.5,
            invoiceCategory: 'RAF',
          },
        },
      ],
    });
    expect(input.lines[0]?.used).toBe(1.5);
    expect(input.lines[0]?.charged).toBe(1.5);
    expect(input.lines[0]?.uom).toBe('per personnel/hr');
  });

  it('keeps the airline name and uses the parent-company address on the bill-to block', () => {
    const input = buildInvoicePdfInput({
      header: {
        ...header,
        customerName: 'Air India Express',
        customerAddress: 'GRN FLOOR, ROOM NO 22\nCHENNAI INTERNATIONAL AIRPORT',
      },
      lines: [bhsLine({ categoryOfFlight: 'Int' })],
      customer: {
        name: 'Air India Express',
        address: 'GRN FLOOR, ROOM NO 22\nCHENNAI INTERNATIONAL AIRPORT',
      },
    });
    expect(input.billTo.name).toBe('Air India Express');
    expect(input.billTo.addressLines).toEqual([
      'GRN FLOOR',
      'ROOM NO 22',
      'CHENNAI INTERNATIONAL AIRPORT',
    ]);
  });

  it('uses ADS as header and line service code for ADS-category invoices', () => {
    const input = buildInvoicePdfInput({
      header: { ...header, invoiceCategory: 'ADS' },
      lines: [
        {
          ...bhsLine({
            chargedQuantity: 2,
            freeAllowance: 0,
            particular: 'GPU-NB',
            equipmentServiceCode: 'GPU-NB',
          }),
          serviceCode: 'GPU-NB',
          description: 'GPU-NB',
          sourceType: 'ads',
        },
      ],
    });
    expect(input.serviceCode).toBe('ADS');
    expect(input.lines[0]?.serviceCode).toBe('ADS');
    expect(input.lines[0]?.description).toBe('GPU-NB');
  });

  it('uses RAF as header and line service code with cleaning particular description', () => {
    const input = buildInvoicePdfInput({
      header: { ...header, invoiceCategory: 'RAF' },
      lines: [
        {
          lineNo: 1,
          description: 'Deep Cleaning',
          quantity: 3,
          uom: 'Per Service',
          unitPrice: 5000,
          lineAmountExclTax: 15000,
          lineAmountInclTax: 15000,
          serviceCode: 'RAF',
          sourceType: 'raf',
          sourceRef: {
            particular: 'Deep Cleaning',
            chargedQuantity: 3,
            usedQuantity: 3,
            invoiceCategory: 'RAF',
          },
        },
      ],
    });
    expect(input.serviceCode).toBe('RAF');
    expect(input.lines[0]?.serviceCode).toBe('RAF');
    expect(input.lines[0]?.description).toBe('Deep Cleaning');
  });

  it('uses ADS as header and line service code for CUSTOM-category invoices', () => {
    const input = buildInvoicePdfInput({
      header: { ...header, invoiceCategory: 'CUSTOM' },
      lines: [
        {
          lineNo: 1,
          description: 'Wheelchair',
          quantity: 2,
          uom: 'Per Service',
          unitPrice: 50,
          lineAmountExclTax: 100,
          lineAmountInclTax: 118,
          serviceCode: 'Custom Billing',
          sourceType: 'custom',
          sourceRef: {
            particular: 'Wheelchair',
            chargedQuantity: 2,
            usedQuantity: 2,
            ratePerUnit: 50,
          },
        },
      ],
    });
    expect(input.serviceCode).toBe('ADS');
    expect(input.lines[0]?.serviceCode).toBe('ADS');
  });
});

describe('buildInvoicePdfInput — customer PAN toggle', () => {
  const gstin = '33AAACI1681G1ZN';

  it('omits customer PAN by default even when GSTIN is present', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ flightCount: 1 })],
      customer: {
        name: 'AIR INDIA EXPRESS LIMITED',
        gstRegistrationNo: gstin,
      },
    });
    expect(input.billTo.gstin).toBe(gstin);
    expect(input.billTo.pan).toBeFalsy();
  });

  it('prints customer PAN only when showPanOnInvoice is enabled', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ flightCount: 1 })],
      customer: {
        name: 'AIR INDIA EXPRESS LIMITED',
        gstRegistrationNo: gstin,
        showPanOnInvoice: true,
      },
    });
    expect(input.billTo.pan).toBe('AAACI1681G');
    expect(input.billTo.vat).toBeFalsy();
  });

  it('prints a stored PAN and VAT only when those toggles are on', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ flightCount: 1 })],
      customer: {
        name: 'AIR INDIA EXPRESS LIMITED',
        gstRegistrationNo: gstin,
        showPanOnInvoice: true,
        panNumber: 'ABCDE1234F',
        showVatOnInvoice: true,
        vatNumber: 'VAT-99',
      },
    });
    expect(input.billTo.pan).toBe('ABCDE1234F');
    expect(input.billTo.vat).toBe('VAT-99');
  });

  it('keeps a second bill-to address in its own lines when the toggle is on', () => {
    const input = buildInvoicePdfInput({
      header: {
        ...header,
        customerAddress:
          'Off Lvl, IGI Terminal III, New Delhi\n233 S. Wacker Drive, Chicago',
      },
      lines: [bhsLine({ flightCount: 1 })],
      customer: {
        name: 'UNITED AIRLINES INC.',
        address: 'Off Lvl, IGI Terminal III, New Delhi\n233 S. Wacker Drive, Chicago',
        secondaryAddressEnabled: true,
        secondaryAddress: '233 S. Wacker Drive, Chicago',
        showPanOnInvoice: false,
        gstRegistrationNo: '07AACCC6506G3ZV',
      },
    });
    expect(input.billTo.addressLines.join(' ')).toContain('New Delhi');
    expect(input.billTo.addressLines.join(' ')).not.toContain('Chicago');
    expect(input.billTo.secondaryAddressLines?.join(' ')).toContain('Chicago');
    expect(input.billTo.pan).toBeFalsy();
  });
});

describe('invoice particulars and receivable words', () => {
  it('does not print the comprehensive package rate in the particular', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [
        {
          ...bhsLine({}),
          description: 'Charges for Turnaround Handling @ 160425',
        },
        {
          ...bhsLine({}),
          lineNo: 2,
          description:
            'Charges for Turnaround Handling [beyond 75 minutes ground time] @ 29800.80',
        },
      ],
    });
    expect(input.lines.map((line) => line.description)).toEqual([
      'Charges for Turnaround Handling',
      'Charges for Turnaround Handling [beyond 75 minutes ground time]',
    ]);
  });

  it('writes the rounded rupee figure, matching the number on the invoice', () => {
    expect(amountInWordsInr(6289215.92)).toBe(
      'SIXTY TWO LAKH EIGHTY NINE THOUSAND TWO HUNDRED SIXTEEN RUPEES',
    );
  });
});
