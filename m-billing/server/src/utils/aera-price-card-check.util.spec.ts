import { checkPriceCardAgainstAera } from './aera-price-card-check.util';

const MAA = {
  orderNumber: '28/2023-24',
  currency: 'INR',
  effectiveFrom: new Date('2023-12-11'),
  controlPeriodTo: new Date('2028-03-31'),
  financialYears: ['2023-24', '2024-25', '2025-26', '2026-27', '2027-28'],
  cargoRateColumn: 'full' as const,
  scheduled: [
    { flightClass: 'DomesticPassenger' as const, aircraftCode: 'C', pax: [9000, 9630, 10320, 11070, 11850], ramp: [21000, 22470, 24080, 25830, 27650], full: [30000, 32100, 34400, 36900, 39500] },
    { flightClass: 'InternationalPassenger' as const, aircraftCode: 'E', pax: [82500, 88290, 94500, 101130, 108210], ramp: [192500, 206010, 220500, 235970, 252490], full: [275000, 294300, 315000, 337100, 360700] },
  ],
};
const master = [
  { aircraftType: 'A320', icaoCode: 'C', categoryCode: 'C' },
  { aircraftType: 'B737-800', icaoCode: 'C', categoryCode: 'C' },
  { aircraftType: 'B777-300ER', icaoCode: 'E', categoryCode: 'E' },
];

describe('price card vs AERA ceiling', () => {
  it('passes a domestic card under the ceiling and reports the ceiling it was checked against', () => {
    const check = checkPriceCardAgainstAera(
      { handlingType: 'BHS', aircraftType: 'A320', category: 'Dom', price: 22136, validFrom: '2026-01-01', validTo: '2026-12-31' },
      MAA,
      master,
    );
    expect(check).toMatchObject({ aeraCeiling: 34400, aeraFinancialYear: '2025-26', aeraAircraftCode: 'C', exceedsAeraCeiling: false, aeraWarning: '' });
  });

  it('flags an international card above the ceiling in any year it covers', () => {
    const check = checkPriceCardAgainstAera(
      { handlingType: 'BHS', aircraftType: 'B777-300ER', category: 'Int', price: 300000, validFrom: '2025-06-01', validTo: '2027-05-31' },
      MAA,
      master,
    );
    // FY 2025-26 ceiling 315000 is fine, but the card also covers nothing lower; 300000 < all → not exceeded.
    expect(check.exceedsAeraCeiling).toBe(false);
    const over = checkPriceCardAgainstAera(
      { handlingType: 'BHS', aircraftType: 'B777-300ER', category: 'Int', price: 320000, validFrom: '2025-06-01', validTo: '2027-05-31' },
      MAA,
      master,
    );
    expect(over.exceedsAeraCeiling).toBe(true);
    expect(over.aeraWarning).toContain('3,15,000');
    expect(over.aeraWarning).toContain('FY 2025-26');
  });

  it('returns an empty check for ADS rows, unknown aircraft, or stations without an order', () => {
    expect(checkPriceCardAgainstAera({ handlingType: 'ADS', aircraftType: 'A320', category: 'Dom', price: 100, validFrom: '2026-01-01' }, MAA, master).aeraCeiling).toBeNull();
    expect(checkPriceCardAgainstAera({ handlingType: 'BHS', aircraftType: 'XYZ', category: 'Dom', price: 100, validFrom: '2026-01-01' }, MAA, master).aeraCeiling).toBeNull();
    expect(checkPriceCardAgainstAera({ handlingType: 'BHS', aircraftType: 'A320', category: 'Dom', price: 100, validFrom: '2026-01-01' }, null, master).aeraCeiling).toBeNull();
  });
});
