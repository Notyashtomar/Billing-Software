import {
  calculateInvoiceConcessionFromLines,
  resolveLineFeeConcessionPercent,
} from './invoice-concession.util';
import {
  preparationFlightConcessionSector,
  stationFlightConcessionPercents,
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

  it('reads the private-airport side saved on Royalty Setup', () => {
    expect(stationFlightConcessionPercents(settings, new Date('2026-09-15'))).toEqual({
      int: 5,
      dom: 12,
      ga: 8,
    });
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
    expect(preparationFlightConcessionSector({ sourceType: 'raf' })).toBe('GA');
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
        bhsConcessionCoverage: 'comprehensive',
        concessionRates: { dom: 1 },
        stationFlightConcession: percents,
      },
      { adsConcession: true },
    );
    expect(totals.concessionFeePercent).toBe(11);
    expect(totals.concessionFeeAmount).toBe(110);
  });
});
