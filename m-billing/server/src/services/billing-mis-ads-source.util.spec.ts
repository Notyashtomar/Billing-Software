import type { BillingSourceRow } from '../shared/billing-sources';
import type { FhrAdsMappedRow } from '../shared/fhr-equipment-to-ads-row';
import {
  adsMisRateIndexKey,
  applyIndexedAdsRatesToUsage,
  adsMisRateMap,
  dedupeAdsMappedRows,
  indexAdsMisRateSamples,
} from './billing-mis-ads-source.util';

function mapped(partial: {
  usageRowId: string;
  customerCode: string;
  particular: string;
  aircraftType?: string;
  qty?: number;
}): FhrAdsMappedRow {
  return {
    sourceType: 'equipment',
    sourceRef: {
      serialNo: partial.usageRowId,
      flightNo: 'IX1',
      usageRowId: partial.usageRowId,
    },
    operationalData: {
      particular: partial.particular,
      qty: partial.qty ?? 2,
      customerCode: partial.customerCode,
      customerName: 'Air India Express',
      aircraftType: partial.aircraftType ?? 'B737',
    },
    customerCode: partial.customerCode,
    serviceCode: partial.particular,
    billingDate: '2026-07-01',
  };
}

function rateRow(partial: { unitPrice: number; uom?: string }): BillingSourceRow {
  return {
    sourceType: 'ads',
    sourceRef: { usageRowId: 'sample' },
    operationalData: { customerName: 'Air India Express' },
    billingEligibility: { eligible: true },
    contractMatch: { matched: true, royaltyAtGross: 3 },
    rateMatch: {
      matched: true,
      unitPrice: partial.unitPrice,
      uom: partial.uom ?? 'Per Unit',
      particular: 'GPU-NB',
    },
    validationStatus: { passed: true, errors: [] },
  };
}

describe('billing-mis-ads-source.util', () => {
  it('indexes one rate sample per airline × equipment × aircraft', () => {
    const samples = indexAdsMisRateSamples([
      mapped({ usageRowId: '1', customerCode: 'IX', particular: 'GPU-NB' }),
      mapped({ usageRowId: '2', customerCode: 'IX', particular: 'GPU-NB' }),
      mapped({
        usageRowId: '3',
        customerCode: 'IX',
        particular: 'GPU-NB',
        aircraftType: 'A320',
      }),
    ]);
    expect(samples).toHaveLength(2);
  });

  it('dedupes the same usage row id', () => {
    const a = mapped({ usageRowId: '1:0', customerCode: 'IX', particular: 'GPU-NB' });
    expect(dedupeAdsMappedRows([a, a])).toHaveLength(1);
  });

  it('replays indexed contract rates onto each unique usage line', () => {
    const usage = [
      mapped({ usageRowId: 'a', customerCode: 'IX', particular: 'GPU-NB', qty: 1 }),
      mapped({ usageRowId: 'b', customerCode: 'IX', particular: 'GPU-NB', qty: 3 }),
    ];
    const samples = indexAdsMisRateSamples(usage);
    const keyed = adsMisRateMap(samples, [rateRow({ unitPrice: 2146 })]);
    expect(keyed.get(adsMisRateIndexKey('IX', 'GPU-NB', 'B737'))?.rateMatch.unitPrice).toBe(
      2146,
    );
    const rows = applyIndexedAdsRatesToUsage(usage, keyed);
    expect(rows).toHaveLength(2);
    expect(rows[0].rateMatch.unitPrice).toBe(2146);
    expect(rows[0].rateMatch.usedUnits).toBe(1);
    expect(rows[1].rateMatch.usedUnits).toBe(3);
    expect(rows[0].operationalData.customerCode).toBe('IX');
  });

  it('keeps BME equipment on its own rate key so a BME omit flag cannot hide GPU-140KV', () => {
    const usage = [
      mapped({
        usageRowId: 'bme',
        customerCode: 'VS',
        particular: 'Ground Power Unit (BME)',
        aircraftType: 'A330',
      }),
      mapped({
        usageRowId: 'kv',
        customerCode: 'VS',
        particular: 'Ground Power Unit - 140KV',
        aircraftType: 'A330',
      }),
    ];
    const samples = indexAdsMisRateSamples(usage);
    expect(samples).toHaveLength(2);
    const keyed = adsMisRateMap(samples, [
      rateRow({ unitPrice: 0 }),
      rateRow({ unitPrice: 5000 }),
    ]);
    const rows = applyIndexedAdsRatesToUsage(usage, keyed);
    expect(rows[0].rateMatch.unitPrice).toBe(0);
    expect(rows[1].rateMatch.unitPrice).toBe(5000);
  });
});
