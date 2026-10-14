import ExcelJS from 'exceljs';
import { buildAdsMisWorkbook } from './billing-mis-ads-export.util';
import { ADS_BILLING_COL, ADS_BILLING_FIRST_ROW, ADS_BILLING_HEADER_ROW, ADS_BILLING_HEADERS, adsMisHeaderColumnWidth } from './billing-mis-ads-source.util';

describe('billing-mis-ads-export.util', () => {
  it('writes a real xlsx with Billing Sheet values by cell index', async () => {
    const buffer = await buildAdsMisWorkbook({
      stationCode: 'MAA',
      from: '2026-07-01',
      to: '2026-07-31',
      roeToInr: 83,
      invoices: [],
      equipmentRows: [
        {
          serialNumber: 1,
          customerName: 'Air India Express',
          customerCode: 'IX',
          flightNo: '',
          equipmentNo: 'GPU-NB',
          quantity: 4,
          unitType: 'Unit',
        },
      ],
      billingRows: [
        {
          kind: 'airline',
          label: 'Air India Express',
          used: 4,
          chargeable: 4,
          revenue: 8584,
          royalty: 257.52,
          gst: 1591.47,
          total: 10432.99,
          invoiceNumbers: 'ADS-1',
        },
        {
          kind: 'equipment',
          label: 'GPU-NB',
          used: 4,
          chargeable: 4,
          revenue: 8584,
          royalty: 257.52,
          gst: 1591.47,
          total: 10432.99,
          invoiceNumbers: 'ADS-1',
        },
      ],
      billingSheet: {
        groups: [
          {
            kind: 'airline',
            customerCode: 'IX',
            customerName: 'Air India Express',
            used: 4,
            chargeable: 4,
            revenue: 8584,
            royalty: 257.52,
            gst: 1591.47,
            total: 10432.99,
            invoiceNumbers: ['ADS-1'],
            lines: [
              {
                kind: 'equipment',
                label: 'GPU-NB',
                used: 4,
                unitPrice: 2146,
                chargeable: 4,
                revenue: 8584,
                royalty: 257.52,
                gst: 1591.47,
                total: 10432.99,
                invoiceNumbers: ['ADS-1'],
              },
            ],
          },
        ],
      },
    });

    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = wb.getWorksheet('Billing Sheet');
    expect(sheet).toBeDefined();
    expect(sheet!.getCell(ADS_BILLING_FIRST_ROW, ADS_BILLING_COL.label).value).toBe(
      'Air India Express',
    );
    expect(sheet!.getCell(ADS_BILLING_FIRST_ROW, ADS_BILLING_COL.used).value).toBe(4);
    expect(sheet!.getCell(ADS_BILLING_FIRST_ROW + 1, ADS_BILLING_COL.label).value).toBe(
      'GPU-NB',
    );
    expect(wb.getWorksheet('WorkingSheet')?.getCell(2, 7).value).toBe('GPU-NB');
    expect(wb.getWorksheet('Check Equip')).toBeDefined();
    ADS_BILLING_HEADERS.forEach((header, i) => {
      expect(sheet!.getColumn(i + 1).width).toBe(adsMisHeaderColumnWidth(header));
      expect(sheet!.getCell(ADS_BILLING_HEADER_ROW, i + 1).value).toBe(header);
    });
    const charged = sheet!.getCell(ADS_BILLING_FIRST_ROW + 1, ADS_BILLING_COL.label);
    expect(charged.fill?.type === 'pattern' ? charged.fill.pattern : undefined).not.toBe('solid');
    expect(sheet!.getRow(ADS_BILLING_FIRST_ROW).height).toBe(15);
    expect(sheet!.getRow(ADS_BILLING_FIRST_ROW + 1).height).toBe(15);
  }, 15000);
});
