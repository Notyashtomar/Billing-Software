import { deriveStationCode } from './derive-station-code.util';

describe('deriveStationCode', () => {
  it('derives TRZ when explicit stationCode is TRZ', () => {
    expect(deriveStationCode({ stationCode: 'TRZ' })).toBe('TRZ');
  });

  it('derives TRZ from Tiruchirappalli city', () => {
    expect(deriveStationCode({ city: 'Tiruchirappalli' })).toBe('TRZ');
  });

  it('derives TRZ from Trichy city', () => {
    expect(deriveStationCode({ city: 'Trichy' })).toBe('TRZ');
  });

  it('derives TRZ from name containing Tiruchirappalli International Airport', () => {
    expect(
      deriveStationCode({
        name: 'Tiruchirappalli International Airport (TRZ)',
        code: 'TIR-01',
      }),
    ).toBe('TRZ');
  });

  it('derives TRZ from code prefix TIR-01 or TRICHY-01', () => {
    expect(deriveStationCode({ code: 'TIR-01' })).toBe('TRZ');
    expect(deriveStationCode({ code: 'TRICHY-01' })).toBe('TRZ');
  });

  it('derives BLR from Bengaluru or Bangalore', () => {
    expect(deriveStationCode({ city: 'Bengaluru' })).toBe('BLR');
    expect(deriveStationCode({ city: 'Bangalore' })).toBe('BLR');
  });

  it('derives BOM from Mumbai or Bombay', () => {
    expect(deriveStationCode({ city: 'Mumbai' })).toBe('BOM');
    expect(deriveStationCode({ city: 'Bombay' })).toBe('BOM');
  });

  it('derives MAA from Chennai or Madras', () => {
    expect(deriveStationCode({ city: 'Chennai' })).toBe('MAA');
    expect(deriveStationCode({ city: 'Madras' })).toBe('MAA');
  });

  it('derives TRV from Thiruvananthapuram or Trivandrum', () => {
    expect(deriveStationCode({ city: 'Thiruvananthapuram' })).toBe('TRV');
    expect(deriveStationCode({ city: 'Trivandrum' })).toBe('TRV');
  });

  it('derives COK from Kochi or Cochin', () => {
    expect(deriveStationCode({ city: 'Kochi' })).toBe('COK');
    expect(deriveStationCode({ city: 'Cochin' })).toBe('COK');
  });

  it('falls back to code prefix for custom station codes', () => {
    expect(deriveStationCode({ code: 'CUSTOM-01' })).toBe('CUSTOM');
  });
});
