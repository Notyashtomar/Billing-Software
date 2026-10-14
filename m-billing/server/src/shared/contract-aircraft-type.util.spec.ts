import {
  isServiceLabelMisfiledAsAircraft,
  sanitizeContractAircraftTypes,
} from './contract-aircraft-type.util';

describe('contract-aircraft-type.util', () => {
  it('keeps airframes and drops HYD service labels', () => {
    expect(
      sanitizeContractAircraftTypes([
        'A320',
        'PAX-COACH',
        'CREW COACH',
        'TOILET CART',
        'TOILET SERVICE',
        'ADDITIONAL MANPOWER',
        '1 UH FOR OFFICE HOUSEKEEPING',
        'INTER STAND TOW',
        'ADDITIONAL PB',
        'C COACH',
        'B737-800',
      ]),
    ).toEqual(['A320', 'B737-800']);
  });

  it('flags toilet / coach / UH as misfiled services', () => {
    expect(isServiceLabelMisfiledAsAircraft('TOILET SERVICE')).toBe(true);
    expect(isServiceLabelMisfiledAsAircraft('A320')).toBe(false);
    expect(isServiceLabelMisfiledAsAircraft('F2TH')).toBe(false);
  });
});
