import {
  calculateInvoiceConcessionFromLines,
  resolveLineFeeConcessionPercent,
} from './invoice-concession.util';
import {
  preparationFlightConcessionSector,
  stationFlightConcessionPercents,
  stationRoyaltyOnGross,
} from './station-flight-concession.util';
import { preparationInvoiceGroupKey } from '../common/billing-invoice-period.util';

describe('station flight concession', () => {
  const settings = {
    airportCommercial: { ownership: 'private', revenueShareMechanism: 'gross' },
    royaltyMaster: {
      gross: {
        scheduledInternational: { percent: 5 },
        scheduledDomestic: { percent: 12 },
        generalAviation: { percent: 8 },
      },
    },
  };

  it('keeps Royalty on Gross for a private airport when the fee card misses the invoice month', () => {
    expect(
      stationRoyaltyOnGross(
        {
          airportCommercial: { ownership: 'private', revenueShareMechanism: 'gross' },
          royaltyMaster: {
            gross: {
              effectiveFrom: '2026-10-16',
              effectiveTo: '2027-03-31',
              scheduledInternational: { percent: 18 },
            },
          },
        },
        new Date('2026-10-01'),
        { start: '2026-09-01', end: '2026-09-30' },
      ),
    ).toBe(true);
  });

  it('uses the royalty type saved for an Airport Authority', () => {
    const authority = {
      airportCommercial: { ownership: 'aai' as const, revenueShareMechanism: 'net' as const },
      royaltyMaster: {
        gross: { scheduledInternational: { percent: 18 } },
        net: { scheduledInternational: { percent: 9 }, scheduledDomestic: { percent: 4 } },
      },
    };
    expect(stationRoyaltyOnGross(authority, new Date('2026-09-15'))).toBe(false);
    expect(stationFlightConcessionPercents(authority, new Date('2026-09-15'))).toEqual({
      int: 9,
      dom: 4,
      ga: undefined,
      gaDom: undefined,
      gaInt: undefined,
    });
  });

  it('keeps an Airport Authority on the gross card when no royalty type is saved', () => {
    const authority = {
      airportCommercial: { ownership: 'aai' as const },
      royaltyMaster: {
        gross: { scheduledInternational: { percent: 18 } },
        net: { scheduledInternational: { percent: 9 } },
      },
    };
    expect(stationRoyaltyOnGross(authority, new Date('2026-09-15'))).toBe(true);
    expect(stationFlightConcessionPercents(authority, new Date('2026-09-15'))?.int).toBe(18);
  });

  it('reads the private-airport side saved on Royalty Setup', () => {
    expect(stationFlightConcessionPercents(settings, new Date('2026-09-15'))).toEqual({
      int: 5,
      dom: 12,
      ga: 8,
      gaDom: 8,
      gaInt: 8,
    });
  });

  it('keeps GA-Domestic and GA-International as separate fees', () => {
    const percents = stationFlightConcessionPercents(
      {
        airportCommercial: { ownership: 'private', revenueShareMechanism: 'gross' },
        royaltyMaster: {
          gross: {
            scheduledInternational: { percent: 5 },
            scheduledDomestic: { percent: 12 },
            generalAviationDomestic: { percent: 6 },
            generalAviationInternational: { percent: 9 },
          },
        },
      },
      new Date('2026-09-15'),
    );
    expect(percents).toEqual({ int: 5, dom: 12, ga: undefined, gaDom: 6, gaInt: 9 });
    expect(
      preparationFlightConcessionSector({
        operationalSnapshot: { categoryOfFlight: 'GA-Domestic' },
      }),
    ).toBe('GA_DOM');
    expect(
      preparationFlightConcessionSector({
        operationalSnapshot: { categoryOfFlight: 'General Aviation International' },
      }),
    ).toBe('GA_INT');
    const contract = { stationFlightConcession: percents };
    expect(
      resolveLineFeeConcessionPercent(
        { sourceRef: { operationalSnapshot: { categoryOfFlight: 'GA-Domestic' } } },
        contract,
      ),
    ).toBe(6);
    expect(
      resolveLineFeeConcessionPercent(
        { sourceRef: { operationalSnapshot: { categoryOfFlight: 'GA International' } } },
        contract,
      ),
    ).toBe(9);
  });

  it('puts domestic and international flights on different invoice groups', () => {
    const base = {
      customerCode: 'VS',
      billingPeriodStart: '2026-09-01',
      billingPeriodEnd: '2026-09-30',
      sourceType: 'scheduled_flight',
    };
    const dom = preparationInvoiceGroupKey({
      ...base,
      operationalSnapshot: { categoryOfFlight: 'Domestic' },
    });
    const intl = preparationInvoiceGroupKey({
      ...base,
      operationalSnapshot: { categoryOfFlight: 'International' },
    });
    expect(dom.endsWith('|DOM')).toBe(true);
    expect(intl.endsWith('|INT')).toBe(true);
    expect(dom).not.toEqual(intl);
  });

  it('uses the station percent that matches the flight category', () => {
    const percents = stationFlightConcessionPercents(settings, new Date('2026-09-15'));
    const contract = { concessionRates: { int: 1, dom: 2 }, stationFlightConcession: percents };
    expect(
      resolveLineFeeConcessionPercent(
        { sourceRef: { operationalSnapshot: { categoryOfFlight: 'Domestic' } } },
        contract,
      ),
    ).toBe(12);
    expect(
      resolveLineFeeConcessionPercent(
        { sourceRef: { operationalSnapshot: { categoryOfFlight: 'International' } } },
        contract,
      ),
    ).toBe(5);
    // RAF with no category falls back to the international GA royalty.
    expect(preparationFlightConcessionSector({ sourceType: 'raf' })).toBe('GA_INT');
    expect(
      preparationFlightConcessionSector({
        sourceType: 'raf',
        operationalSnapshot: { categoryOfFlight: 'Domestic' },
      }),
    ).toBe('GA_DOM');
  });

  it('uses the international royalty for an international airline flight tagged International-Domestic', () => {
    const percents = { int: 15, dom: 3, ga: 15, gaDom: 15, gaInt: 15 };
    const line = {
      sourceRef: { operationalSnapshot: { categoryOfFlight: 'International-Domestic' } },
    };
    expect(
      resolveLineFeeConcessionPercent(line, {
        category: 'Int',
        categories: ['Int'],
        stationFlightConcession: percents,
        concessionRates: { int: 1, dom: 2 },
      }),
    ).toBe(15);
    expect(
      resolveLineFeeConcessionPercent(line, {
        category: 'Both',
        categories: ['Dom', 'Int'],
        stationFlightConcession: percents,
        concessionRates: { int: 1, dom: 2 },
      }),
    ).toBe(3);
  });

  it('keeps a September royalty fee for an ADS invoice regenerated in October', () => {
    const percents = stationFlightConcessionPercents(
      {
        airportCommercial: { ownership: 'private', revenueShareMechanism: 'gross' },
        royaltyMaster: {
          gross: {
            effectiveFrom: new Date('2026-09-01'),
            effectiveTo: new Date('2026-09-30'),
            scheduledInternational: { percent: 7 },
            scheduledDomestic: { percent: 11 },
            generalAviation: { percent: 4 },
          },
        },
      },
      new Date('2026-10-21'),
      { start: '2026-09-01', end: '2026-09-30' },
    );
    const totals = calculateInvoiceConcessionFromLines(
      1000,
      [
        {
          lineAmountExclTax: 1000,
          sourceType: 'ads',
          sourceRef: { operationalSnapshot: { categoryOfFlight: 'Domestic' } },
        },
      ],
      {
        concessionRates: { dom: 1 },
        stationFlightConcession: percents,
      },
      { adsConcession: true },
    );
    expect(totals.concessionFeePercent).toBe(11);
    expect(totals.concessionFeeAmount).toBe(110);

    const inclusive = calculateInvoiceConcessionFromLines(
      1000,
      [
        {
          lineAmountExclTax: 1000,
          sourceType: 'ads',
          sourceRef: { operationalSnapshot: { categoryOfFlight: 'Domestic' } },
        },
      ],
      {
        bhsConcessionCoverage: 'comprehensive',
        concessionRates: { dom: 1 },
        stationFlightConcession: percents,
      },
      { adsConcession: true },
    );
    expect(inclusive.concessionFeePercent).toBe(0);
    expect(inclusive.concessionFeeAmount).toBe(0);
  });

  it('uses the invoice-date station fee when the ADS contract has no concession', () => {
    const totals = calculateInvoiceConcessionFromLines(
      1503868,
      [
        {
          lineAmountExclTax: 1503868,
          sourceType: 'ads',
          sourceRef: { categoryOfFlight: 'International' },
        },
      ],
      {
        royaltyAtGross: 0,
        concessionRates: {},
        bhsConcessionCoverage: 'non_comprehensive',
        stationFlightConcessionFallback: { int: 18, dom: 5, ga: 18 },
      },
      { adsConcession: true },
    );
    expect(totals.concessionFeePercent).toBe(18);
    expect(totals.concessionFeeAmount).toBe(270696.24);
  });
});
