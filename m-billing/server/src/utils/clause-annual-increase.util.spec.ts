import {
  annualSteps,
  bakedAnnualSteps,
  increaseStartForRateCard,
  parseAnnualIncreaseRemark,
  priceWithAnnualIncrease,
  readAppliedAnnualIncrease,
} from './clause-annual-increase.util';

describe('applied annual increase field', () => {
  it('reads the structured field before the legacy CYI remark', () => {
    const row = {
      remarks: 'Band A CYI:MAA-IX-01:2026-06-01:4.5%x1',
      annualIncreaseApplied: { contractNumber: 'MAA-IX-01', validFrom: '2027-06-01', percent: 4.5, steps: 2 },
    };
    expect(readAppliedAnnualIncrease(row)).toEqual({
      contractNumber: 'MAA-IX-01',
      validFrom: '2027-06-01',
      percent: 4.5,
      steps: 2,
    });
    expect(bakedAnnualSteps(row, 4.5, '2027-06-01')).toBe(2);
    expect(bakedAnnualSteps(row, 4.5, '2026-06-01')).toBe(0);
  });

  it('falls back to the CYI remark tag when the field is missing', () => {
    expect(parseAnnualIncreaseRemark('CYI:MAA-IX-01:2026-06-01:4.5%x1')).toEqual({
      contractNumber: 'MAA-IX-01',
      validFrom: '2026-06-01',
      percent: 4.5,
      steps: 1,
    });
    expect(bakedAnnualSteps({ remarks: 'CYI:X:2026-06-01:4.5%x1' }, 4.5, '2026-06-01')).toBe(1);
    expect(bakedAnnualSteps('CYI:X:2026-06-01:4.5%x1', 4.5, '2026-06-01')).toBe(1);
    expect(bakedAnnualSteps('no tag here', 4.5, '2026-06-01')).toBe(0);
    expect(bakedAnnualSteps(undefined, 4.5, '2026-06-01')).toBe(0);
    expect(readAppliedAnnualIncrease({ annualIncreaseApplied: { steps: 0 } })).toBeNull();
  });
});

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

  it('keeps the listed rate-card price through the card year and increases next year', () => {
    const cpi = [
      {
        clauseType: 'cpi',
        label: 'Current-year rates',
        appliesTo: ['BHS'],
        percent: 5,
        validFrom: '2026-01-01',
      },
    ];
    expect(increaseStartForRateCard('2026-01-01', '2026-01-01')).toBe('2027-01-01');
    expect(
      priceWithAnnualIncrease(16032, cpi, '2026-10-15', 'BHS', {
        cardValidFrom: '2026-01-01',
      }),
    ).toBe(16032);
    expect(
      priceWithAnnualIncrease(16032, cpi, '2027-10-15', 'BHS', {
        cardValidFrom: '2026-01-01',
        bakedSteps: 1,
      }),
    ).toBe(16834);
  });

  it('does not change the price when the clause has not started', () => {
    expect(
      priceWithAnnualIncrease(19660, clauses, '2026-05-01', 'BHS', { basePrice: 19660 }),
    ).toBe(19660);
  });
});
