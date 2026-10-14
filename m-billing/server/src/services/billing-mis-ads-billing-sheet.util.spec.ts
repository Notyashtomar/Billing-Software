import type { BillingSourceRow } from '../shared/billing-sources';
import {
  adsMisIndexedEquipmentRows,
  adsMisUsageDedupKey,
  buildAdsMisBillingSheet,
} from './billing-mis-ads-billing-sheet.util';

function row(partial: {
  usageRowId?: string;
  serialNo?: string;
  customerCode: string;
  customerName?: string;
  particular: string;
  used: number;
  unitPrice: number;
  free?: number;
  basis?: BillingSourceRow['rateMatch']['pricingBasis'];
  royaltyAtGross?: number;
}): BillingSourceRow {
  return {
    sourceType: 'ads',
    sourceRef: {
      usageRowId: partial.usageRowId,
      serialNo: partial.serialNo,
      flightNo: 'IX1',
    },
    operationalData: {
      customerCode: partial.customerCode,
      customerName: partial.customerName ?? 'Air India Express',
      adsParticular: partial.particular,
      adsUsedUnits: partial.used,
    },
    billingEligibility: { eligible: true },
    contractMatch: {
      matched: true,
      royaltyAtGross: partial.royaltyAtGross ?? 3,
    },
    rateMatch: {
      matched: true,
      particular: partial.particular,
      usedUnits: partial.used,
      freeAllowance: partial.free ?? 0,
      unitPrice: partial.unitPrice,
      pricingBasis: partial.basis ?? 'rate_card',
    },
    validationStatus: { passed: true, errors: [] },
  };
}

describe('billing-mis-ads-billing-sheet.util', () => {
  it('dedupes the same usage row id', () => {
    const a = row({
      usageRowId: '1:0',
      customerCode: 'IX',
      particular: 'GPU-NB',
      used: 1,
      unitPrice: 2146,
    });
    expect(adsMisUsageDedupKey(a)).toBe(adsMisUsageDedupKey({ ...a }));
    const sheet = buildAdsMisBillingSheet([a, a], []);
    expect(sheet.groups).toHaveLength(1);
    expect(sheet.groups[0].lines).toHaveLength(1);
    expect(sheet.groups[0].lines[0].used).toBe(1);
  });

  it('builds airline totals and chargeable revenue from contract rates', () => {
    const sheet = buildAdsMisBillingSheet(
      [
        row({
          usageRowId: 'a',
          customerCode: 'IX',
          particular: 'GPU-NB',
          used: 2,
          unitPrice: 1000,
          free: 0,
        }),
        row({
          usageRowId: 'b',
          customerCode: 'IX',
          particular: 'CK',
          used: 5,
          unitPrice: 0,
          basis: 'package_inclusive',
        }),
      ],
      [],
    );
    const group = sheet.groups[0];
    expect(group.customerName).toBe('Air India Express');
    expect(group.used).toBe(7);
    const gpu = group.lines.find((l) => l.label === 'GPU-NB');
    const ck = group.lines.find((l) => l.label === 'CK');
    expect(gpu?.chargeable).toBe(2);
    expect(gpu?.revenue).toBe(2000);
    expect(gpu?.royalty).toBe(60);
    expect(gpu?.gst).toBe(370.8);
    expect(gpu?.total).toBe(2430.8);
    expect(ck?.chargeable).toBe(0);
    expect(ck?.revenue).toBe(0);
    expect(group.revenue).toBe(2000);
  });

  it('keeps invoice numbers on invoice-only airline groups', () => {
    const sheet = buildAdsMisBillingSheet(
      [],
      [
        {
          customerCode: 'IX',
          customerName: 'Air India Express',
          invoiceNumber: 'ADS-9',
          concessionFeeAmount: 10,
          taxTotal: 18,
          totalInclTax: 128,
        },
      ],
    );
    expect(sheet.groups).toHaveLength(1);
    expect(sheet.groups[0].invoiceNumbers).toEqual(['ADS-9']);
    expect(sheet.groups[0].total).toBe(128);
    expect(adsMisIndexedEquipmentRows(sheet, 'MAA')).toEqual([]);
  });

  it('keeps uncharged FHR equipment on the billing sheet', () => {
    const sheet = buildAdsMisBillingSheet(
      [
        row({
          usageRowId: 'a',
          customerCode: 'IX',
          particular: 'GPU-NB',
          used: 2,
          unitPrice: 1000,
        }),
        row({
          usageRowId: 'c',
          customerCode: 'IX',
          particular: 'Cabin Cleaning',
          used: 8,
          unitPrice: 0,
          basis: 'package_inclusive',
        }),
        row({
          usageRowId: 'd',
          customerCode: 'IX',
          particular: 'Cones',
          used: 12,
          unitPrice: 0,
          basis: 'not_on_contract',
        }),
      ],
      [],
    );
    const labels = sheet.groups[0].lines.map((l) => l.label);
    expect(labels).toEqual(expect.arrayContaining(['GPU-NB', 'Cabin Cleaning', 'Cones']));
    expect(sheet.groups[0].lines).toHaveLength(3);
  });

  it('drops impossible used-unit totals instead of scientific-notation garbage', () => {
    const sheet = buildAdsMisBillingSheet(
      [
        row({
          usageRowId: 'w',
          customerCode: 'AI',
          customerName: 'Air India',
          particular: 'WCHR',
          used: 1.04191e12,
          unitPrice: 0,
        }),
      ],
      [],
    );
    expect(sheet.groups[0].used).toBe(0);
    expect(sheet.groups[0].lines[0].used).toBe(0);
  });

  it('indexes unique airline × equipment working rows', () => {
    const sheet = buildAdsMisBillingSheet(
      [
        row({
          usageRowId: 'a',
          customerCode: 'IX',
          particular: 'GPU-NB',
          used: 2,
          unitPrice: 1000,
        }),
        row({
          usageRowId: 'b',
          customerCode: 'IX',
          particular: 'GPU-NB',
          used: 1,
          unitPrice: 1000,
        }),
      ],
      [],
    );
    const indexed = adsMisIndexedEquipmentRows(sheet, 'MAA');
    expect(indexed).toHaveLength(1);
    expect(indexed[0].equipmentNo).toBe('GPU-NB');
    expect(indexed[0].quantity).toBe(3);
    expect(indexed[0].customerCode).toBe('IX');
  });
});
