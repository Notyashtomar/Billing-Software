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

  it('prints the package rate and the diverted fraction in Charged', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [
        {
          ...bhsLine({
            bhsPackageRate: 140733,
            concessionPercent: 25,
            concessionAppliedToUnitPrice: true,
            usedQuantity: 1,
            categoryOfFlight: 'International-Domestic',
          }),
          description: 'Charges for Diverted Flight handling',
          quantity: 1,
          unitPrice: 35183.25,
          lineAmountExclTax: 35183.25,
        },
      ],
    });
    expect(input.lines[0].used).toBe(1);
    expect(input.lines[0].charged).toBe(0.25);
    expect(input.lines[0].unitPrice).toBe(140733);
    expect(input.lines[0].amount).toBe(35183.25);
  });

  it('prints the package rate and the technical fraction in Charged', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [
        {
          ...bhsLine({
            bhsPackageRate: 4222,
            concessionPercent: 50,
            concessionAppliedToUnitPrice: true,
            flightScenario: 'technical',
            usedQuantity: 2,
            categoryOfFlight: 'International-Cargo',
          }),
          description: 'Charges for Technical handling',
          quantity: 2,
          unitPrice: 2111,
          lineAmountExclTax: 4222,
        },
      ],
    });
    expect(input.lines[0].used).toBe(2);
    expect(input.lines[0].charged).toBe(1);
    expect(input.lines[0].unitPrice).toBe(4222);
    expect(input.lines[0].amount).toBe(4222);
  });

  it('keeps the billed rate when an add-on sits on top of the SGHA percent', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [
        {
          ...bhsLine({
            bhsPackageRate: 1000,
            concessionPercent: 50,
            concessionAppliedToUnitPrice: true,
            additionalChargePercent: 10,
            usedQuantity: 2,
          }),
          description: 'Charges for Technical handling [beyond 75 minutes ground time]',
          quantity: 2,
          unitPrice: 550,
          lineAmountExclTax: 1100,
        },
      ],
    });
    expect(input.lines[0].charged).toBe(2);
    expect(input.lines[0].unitPrice).toBe(550);
  });

  it('prints International Cargo for an international-only cargo airline', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [
        bhsLine({
          categoryOfFlight: 'International-Cargo',
          categoriesOfFlight: ['International-Cargo'],
        }),
      ],
      contractCategory: 'Int',
      contractCategories: [],
    });
    expect(input.flightCategory).toBe('International Cargo');
  });

  it('prints International for an international-only airline when the flight is International-Domestic', () => {
    const input = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ categoryOfFlight: 'International-Domestic' })],
      contractCategory: 'Int',
      contractCategories: ['Int'],
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
      'GRN FLOOR, ROOM NO 22',
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

  it('prints the customer master address when the draft still has an older address', () => {
    const input = buildInvoicePdfInput({
      header: {
        ...header,
        customerName: 'Biman Bangladesh',
        customerAddress: 'Old office\nDhaka',
      },
      lines: [bhsLine({ flightCount: 1 })],
      customer: {
        name: 'Biman Bangladesh',
        airlineInvoiceName: 'BIMAN BANGLADESH AIRLINES LIMITED',
        address: '8/2, JOSMANS COMPLEX GROUND FLOOR,\nTamil Nadu-600031\nIndia',
        gstRegistrationNo: '33AABCB3134C1ZI',
        showPanOnInvoice: true,
        panNumber: 'AABCB3134C',
      },
    });
    expect(input.billTo.name).toBe('BIMAN BANGLADESH AIRLINES LIMITED');
    expect(input.billTo.addressLines).toEqual([
      '8/2, JOSMANS COMPLEX GROUND FLOOR,',
      'Tamil Nadu-600031',
      'India',
    ]);
    expect(input.billTo.gstin).toBe('33AABCB3134C1ZI');
    expect(input.billTo.pan).toBe('AABCB3134C');
  });

  it('adds intermediary bank rows only when that account is switched on', () => {
    const off = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ flightCount: 1 })],
      customer: {
        name: 'Emirates',
        intermediaryAccountEnabled: false,
        intermediaryAccount: { accountNumber: '1234567890', bankName: 'CITIBANK' },
      },
    });
    expect(off.bankDetails?.intermediaryAccountNumber).toBeUndefined();

    const on = buildInvoicePdfInput({
      header,
      lines: [bhsLine({ flightCount: 1 })],
      customer: {
        name: 'Emirates',
        intermediaryAccountEnabled: true,
        intermediaryAccount: {
          bankName: 'CITIBANK',
          accountNumber: '1234567890',
          swiftCode: 'CITIUS33',
        },
      },
    });
    expect(on.bankDetails?.accountNumber).toBeTruthy();
    expect(on.bankDetails?.intermediaryBankName).toBe('CITIBANK');
    expect(on.bankDetails?.intermediaryAccountNumber).toBe('1234567890');
    expect(on.bankDetails?.intermediarySwiftCode).toBe('CITIUS33');
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

describe('buildInvoicePdfInput — invoice date and time', () => {
  const created = new Date('2026-11-05T09:08:00.000Z');
  const id = `${Math.floor(created.getTime() / 1000).toString(16)}aaaaaaaaaaaaaaaa`;
  const adsLine = { ...bhsLine({ chargedQuantity: 1 }), serviceCode: 'GPU-90KV', sourceType: 'ads' };
  const rafLine = { ...bhsLine({}), serviceCode: 'RAF', sourceType: 'raf', uom: 'Per Kg' };

  it('prints only the date on a BHS invoice, whatever clock data is stored', () => {
    const fromId = buildInvoicePdfInput({
      header: { ...header, documentDate: new Date('2026-11-05T00:00:00.000Z'), _id: id },
      lines: [bhsLine({ flightCount: 1 })],
    });
    const regenerated = buildInvoicePdfInput({
      header: {
        ...header,
        documentDate: new Date('2026-11-05T00:00:00.000Z'),
        generatedAt: new Date('2026-11-10T11:20:00.000Z'),
      },
      lines: [bhsLine({ flightCount: 1 })],
    });
    const storedClock = buildInvoicePdfInput({
      header: { ...header, documentDate: new Date('2026-11-05T04:15:00.000Z') },
      lines: [bhsLine({ flightCount: 1 })],
    });
    for (const input of [fromId, regenerated, storedClock]) {
      expect(input.serviceCode).toBe('BHS');
      expect(input.invoiceDate).toBe('05 November 2026');
    }
  });

  it('prints only the date on an ADS invoice at any station', () => {
    for (const stationCode of ['MAA', 'DEL', 'HYD', 'TRV', 'COK', 'IXC']) {
      const input = buildInvoicePdfInput({
        header: {
          ...header,
          stationCode,
          invoiceCategory: 'ADS',
          documentDate: new Date('2026-11-05T00:00:00.000Z'),
          generatedAt: new Date('2026-11-10T11:20:00.000Z'),
          _id: id,
        },
        lines: [adsLine],
      });
      expect(input.serviceCode).toBe('ADS');
      expect(input.invoiceDate).toBe('05 November 2026');
    }
  });

  it('keeps the 24-hour clock on services other than BHS and ADS', () => {
    const input = buildInvoicePdfInput({
      header: {
        ...header,
        invoiceCategory: 'RAF',
        documentDate: new Date('2026-11-05T00:00:00.000Z'),
        generatedAt: new Date('2026-11-10T11:20:00.000Z'),
      },
      lines: [rafLine],
    });
    expect(input.serviceCode).toBe('RAF');
    expect(input.invoiceDate).toBe('05 November 2026 16:50');
  });
});

describe('buildInvoicePdfInput — particulars in alphabetical order', () => {
  const line = (lineNo: number, description: string, aircraftType: string, amount: number) => ({
    ...bhsLine({ aircraftType, flightCount: 1 }),
    lineNo,
    description,
    quantity: 1,
    unitPrice: amount,
    lineAmountExclTax: amount,
    lineAmountInclTax: amount,
  });
  const stored = [
    line(1, 'Charges for Turnaround handling', 'B747-400F', 100),
    line(2, 'Charges for Turnaround handling', 'B777F', 200),
    line(3, 'Charges for Technical handling', 'B777-200F', 300),
    line(4, 'Charges for Technical handling', 'B777F', 400),
    line(5, 'Charges for Turnaround handling [ground time 2-4 hrs]', 'B777-200F', 500),
    line(6, 'charges for Diverted Flight handling', 'A320', 600),
  ];

  it('sorts particulars A to Z for every station and renumbers Sr. No.', () => {
    for (const stationCode of ['MAA', 'DEL', 'HYD', 'TRV', 'COK', 'GOI', 'IXC', 'CJB']) {
      const input = buildInvoicePdfInput({ header: { ...header, stationCode }, lines: stored });
      expect(input.lines.map((l) => `${l.lineNo}|${l.description}|${l.aircraftType}|${l.amount}`)).toEqual([
        '1|charges for Diverted Flight handling|A320|600',
        '2|Charges for Technical handling|B777-200F|300',
        '3|Charges for Technical handling|B777F|400',
        '4|Charges for Turnaround handling|B747-400F|100',
        '5|Charges for Turnaround handling|B777F|200',
        '6|Charges for Turnaround handling [ground time 2-4 hrs]|B777-200F|500',
      ]);
    }
  });

  it('sorts ADS particulars and leaves the totals untouched', () => {
    const ads = (lineNo: number, description: string, amount: number) => ({
      ...line(lineNo, description, 'A320', amount),
      serviceCode: description,
      sourceType: 'ads',
      sourceRef: { chargedQuantity: 1, aircraftType: 'A320' },
    });
    const lines = [ads(1, 'Wheel Chair - WCHC', 10), ads(2, 'GPU-90KV', 20), ads(3, 'Air Starter Unit', 30)];
    const unsortedTotal = buildInvoicePdfInput({
      header: { ...header, invoiceCategory: 'ADS', subtotalExclTax: 60 },
      lines: [...lines].reverse(),
    });
    const input = buildInvoicePdfInput({
      header: { ...header, invoiceCategory: 'ADS', subtotalExclTax: 60 },
      lines,
    });
    expect(input.lines.map((l) => l.description)).toEqual([
      'Air Starter Unit',
      'GPU-90KV',
      'Wheel Chair - WCHC',
    ]);
    expect(input.lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
    expect(input.totalInclTax).toBe(unsortedTotal.totalInclTax);
    expect(input.subtotalExclTax).toBe(60);
  });

  it('does not reorder or renumber the saved lines it was given', () => {
    const copy = stored.map((l) => ({ ...l }));
    buildInvoicePdfInput({ header, lines: copy });
    expect(copy.map((l) => l.lineNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(copy[0].description).toBe('Charges for Turnaround handling');
  });
});
