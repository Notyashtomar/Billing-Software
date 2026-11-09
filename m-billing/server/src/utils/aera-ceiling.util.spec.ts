import {
  aeraCeilingCheck,
  aeraFlightClassFor,
  financialYearOf,
  resolveAeraCeiling,
  resolveAeraNonScheduledCeiling,
} from './aera-ceiling.util';

/** Subset of the DEL order 34/2022-23 as stored (Annexure I / II). */
const DEL = {
  orderNumber: '34/2022-23',
  currency: 'INR',
  effectiveFrom: new Date('2023-01-16'),
  controlPeriodTo: new Date('2026-03-31'),
  financialYears: ['2022-23', '2023-24', '2024-25', '2025-26'],
  cargoRateColumn: 'ramp' as const,
  scheduled: [
    { flightClass: 'DomesticPassenger' as const, aircraftCode: 'C', pax: [4000, 4600, 5300, 6100], ramp: [12200, 14100, 16300, 18800], full: [16200, 18700, 21600, 24900] },
    { flightClass: 'InternationalPassenger' as const, aircraftCode: 'E', pax: [48900, 52400, 56100, 60100], ramp: [195600, 209300, 224000, 239700], full: [244500, 261700, 280100, 299800] },
    { flightClass: 'InternationalCargo' as const, aircraftCode: 'F', pax: null, ramp: [286500, 306600, 328100, 351100], full: null },
    { flightClass: 'InternationalPassenger' as const, aircraftCode: 'B', pax: null, ramp: null, full: null, notApplicable: true },
  ],
  internationalNonScheduled: [
    { mtowFromKg: 0, mtowToKg: 5000, rates: [48150, 51521, 55127, 58986] },
    { mtowFromKg: 300001, mtowToKg: null, rates: [702188, 751341, 803935, 860210] },
  ],
};

describe('AERA ceiling lookup', () => {
  it('maps dates to Indian financial years', () => {
    expect(financialYearOf('2024-03-31')).toBe('2023-24');
    expect(financialYearOf('2024-04-01')).toBe('2024-25');
    expect(financialYearOf('2026-10-15')).toBe('2026-27');
  });

  it('classifies flights: any international leg is international, cargo wins its own rows', () => {
    expect(aeraFlightClassFor({ categoryOfFlight: 'Domestic' })).toBe('DomesticPassenger');
    expect(aeraFlightClassFor({ categoryOfFlight: 'International' })).toBe('InternationalPassenger');
    expect(aeraFlightClassFor({ categoryOfFlight: 'International-Domestic' })).toBe('InternationalPassenger');
    expect(aeraFlightClassFor({ categoryOfFlight: 'Domestic', departureSector: 'Int' })).toBe('InternationalPassenger');
    expect(aeraFlightClassFor({ categoryOfFlight: 'Domestic', cargo: true })).toBe('DomesticCargo');
    expect(aeraFlightClassFor({ categoryOfFlight: 'International Cargo' })).toBe('InternationalCargo');
    expect(aeraFlightClassFor({ categoryOfFlight: 'Domestic', aircraftType: 'B777F' })).toBe('DomesticCargo');
  });

  it('returns the full-handling ceiling for the flight year', () => {
    const hit = resolveAeraCeiling(DEL, { aircraftCode: 'C', flightClass: 'DomesticPassenger', flightDate: '2024-09-10' });
    expect(hit).toMatchObject({ found: true, amount: 21600, financialYear: '2024-25', scope: 'full' });
    const ramp = resolveAeraCeiling(DEL, { aircraftCode: 'E', flightClass: 'InternationalPassenger', flightDate: '2023-06-01', scope: 'ramp' });
    expect(ramp).toMatchObject({ found: true, amount: 209300, financialYear: '2023-24' });
  });

  it('reads cargo from the printed column and reports N/A rows', () => {
    const cargo = resolveAeraCeiling(DEL, { aircraftCode: 'F', flightClass: 'InternationalCargo', flightDate: '2025-12-01' });
    expect(cargo).toMatchObject({ found: true, amount: 351100, scope: 'ramp' });
    const na = resolveAeraCeiling(DEL, { aircraftCode: 'B', flightClass: 'InternationalPassenger', flightDate: '2025-12-01' });
    expect(na).toMatchObject({ found: false, reason: 'not_applicable' });
  });

  it('carries the last approved column forward after the control period until a new order is loaded', () => {
    const later = resolveAeraCeiling(DEL, { aircraftCode: 'C', flightClass: 'DomesticPassenger', flightDate: '2026-09-10' });
    expect(later).toMatchObject({ found: true, amount: 24900, financialYear: '2025-26', carriedForward: true });
    const inside = resolveAeraCeiling(DEL, { aircraftCode: 'C', flightClass: 'DomesticPassenger', flightDate: '2025-09-10' });
    expect(inside).toMatchObject({ found: true, amount: 24900 });
    expect((inside as { carriedForward?: boolean }).carriedForward).toBeUndefined();
    expect(resolveAeraNonScheduledCeiling(DEL, { mtowKg: 4200, flightDate: '2026-09-10' })).toMatchObject({ found: true, amount: 58986 });
  });

  it('misses cleanly before the order took effect or without an aircraft code', () => {
    expect(resolveAeraCeiling(DEL, { aircraftCode: 'C', flightClass: 'DomesticPassenger', flightDate: '2022-12-01' })).toMatchObject({ found: false, reason: 'date_outside_order' });
    expect(resolveAeraCeiling(DEL, { aircraftCode: '', flightClass: 'DomesticPassenger', flightDate: '2024-09-10' })).toMatchObject({ found: false, reason: 'no_aircraft_code' });
    expect(resolveAeraCeiling(DEL, { aircraftCode: 'D', flightClass: 'DomesticPassenger', flightDate: '2024-09-10' })).toMatchObject({ found: false, reason: 'no_row' });
    expect(resolveAeraCeiling(null, { aircraftCode: 'C', flightClass: 'DomesticPassenger', flightDate: '2024-09-10' })).toMatchObject({ found: false, reason: 'no_order' });
  });

  it('looks up international non-scheduled by MTOW band', () => {
    expect(resolveAeraNonScheduledCeiling(DEL, { mtowKg: 4200, flightDate: '2024-05-05' })).toMatchObject({ found: true, amount: 55127 });
    expect(resolveAeraNonScheduledCeiling(DEL, { mtowKg: 560000, flightDate: '2023-05-05' })).toMatchObject({ found: true, amount: 751341 });
    expect(resolveAeraNonScheduledCeiling(DEL, { mtowKg: 0, flightDate: '2023-05-05' })).toMatchObject({ found: false, reason: 'no_mtow' });
  });

  it('flags a billed rate above the ceiling', () => {
    const hit = resolveAeraCeiling(DEL, { aircraftCode: 'C', flightClass: 'DomesticPassenger', flightDate: '2024-09-10' });
    expect(aeraCeilingCheck(21600, hit)).toEqual({ exceeds: false, ceiling: 21600, excessAmount: 0 });
    expect(aeraCeilingCheck(22136, hit)).toEqual({ exceeds: true, ceiling: 21600, excessAmount: 536 });
    expect(aeraCeilingCheck(22136, { found: false, reason: 'no_order' })).toEqual({ exceeds: false, ceiling: null, excessAmount: 0 });
  });
});
