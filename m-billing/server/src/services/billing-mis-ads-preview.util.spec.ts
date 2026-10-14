import { buildAdsMisBillingSheet } from './billing-mis-ads-billing-sheet.util';
import { buildAdsMisPreviewSheets } from './billing-mis-ads-preview.util';
import type { BillingSourceRow } from '../shared/billing-sources';

function row(particular: string, used: number, unitPrice: number): BillingSourceRow {
  return {
    sourceType: 'ads',
    sourceRef: { usageRowId: particular },
    operationalData: {
      customerCode: 'IX',
      customerName: 'Air India Express',
      adsParticular: particular,
      adsUsedUnits: used,
    },
    billingEligibility: { eligible: true },
    contractMatch: { matched: true, royaltyAtGross: 3 },
    rateMatch: {
      matched: true,
      particular,
      usedUnits: used,
      unitPrice,
      pricingBasis: unitPrice > 0 ? 'rate_card' : 'package_inclusive',
    },
    validationStatus: { passed: true, errors: [] },
  };
}

describe('billing-mis-ads-preview.util', () => {
  it('builds one preview section per ADS MIS sheet with station/month rows', () => {
    const billing = buildAdsMisBillingSheet(
      [row('GPU-NB', 4, 1000), row('Cabin Cleaning', 9, 0)],
      [{ customerCode: 'IX', customerName: 'Air India Express', invoiceNumber: 'ADS-1' }],
    );
    const sheets = buildAdsMisPreviewSheets({
      billing,
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
      roeToInr: 83,
    });
    expect(sheets.map((s) => s.id)).toEqual([
      'working-sheet',
      'exported-eq-data',
      'billing-sheet',
      'check-equip',
      'check-revenue',
      'revenue-working',
      'sheet2',
      'check-wch',
    ]);
    const billingSheet = sheets.find((s) => s.id === 'billing-sheet');
    expect(billingSheet?.rows.some((r) => r[0] === 'Cabin Cleaning')).toBe(true);
    expect(billingSheet?.rows.some((r) => r[0] === 'GPU-NB')).toBe(true);
    const uncharged = billingSheet?.rows.find((r) => r[0] === 'Cabin Cleaning');
    expect(uncharged?.[9]).toBe('-');
  });
});
