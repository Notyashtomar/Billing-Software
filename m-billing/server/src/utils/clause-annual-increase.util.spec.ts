import {
  annualSteps,
  priceWithAnnualIncrease,
} from './clause-annual-increase.util';

describe('clause annual increase', () => {
  const clauses = [
    {
      clauseType: 'cpi',
      label: 'Current-year rates',
      appliesTo: ['BHS', 'ADS'],
      percent: 4.5,
      validFrom: '2026-06-01',
    },
  ];

  it('counts one step on the start date and the next step a year later', () => {
    expect(annualSteps('2026-06-01', undefined, '2026-05-31')).toBe(0);
    expect(annualSteps('2026-06-01', undefined, '2026-06-01')).toBe(1);
    expect(annualSteps('2026-06-01', undefined, '2027-05-31')).toBe(1);
    expect(annualSteps('2026-06-01', undefined, '2027-06-01')).toBe(2);
  });

  it('compounds the annex price and leaves a price that is already at this step', () => {
    expect(
      priceWithAnnualIncrease(19660, clauses, '2026-09-15', 'BHS', { basePrice: 19660 }),
    ).toBe(20545);
    expect(
      priceWithAnnualIncrease(20545, clauses, '2026-09-15', 'ADS', { bakedSteps: 1 }),
    ).toBe(20545);
    expect(
      priceWithAnnualIncrease(20545, clauses, '2027-09-15', 'ADS', { bakedSteps: 1 }),
    ).toBe(21470);
  });

  it('does not change the price when the clause has not started', () => {
    expect(
      priceWithAnnualIncrease(19660, clauses, '2026-05-01', 'BHS', { basePrice: 19660 }),
    ).toBe(19660);
  });
});
