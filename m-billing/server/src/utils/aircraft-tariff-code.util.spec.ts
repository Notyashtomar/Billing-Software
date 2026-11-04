import {
  priceCardIsTariffCode,
  resolveAircraftTariffCode,
} from './aircraft-tariff-code.util';

describe('resolveAircraftTariffCode', () => {
  const rows = [
    { aircraftType: '737-800', icaoCode: 'C', categoryCode: 'A' },
    { aircraftType: 'B737-800', icaoCode: 'B738', categoryCode: 'C' },
    { aircraftType: '777-300ER', icaoCode: 'E', categoryCode: 'A' },
    { aircraftType: 'A330-300', icaoCode: 'E', categoryCode: 'A' },
    { aircraftType: 'A330-300F', icaoCode: 'A333', categoryCode: 'C' },
    { aircraftType: 'A320', icaoCode: '', categoryCode: 'C' },
    { aircraftType: 'A330', icaoCode: 'A330', categoryCode: 'C' },
  ];

  it('reads the ICAO letter, including when a duplicate row stores the designator', () => {
    expect(resolveAircraftTariffCode('B737-800', rows)).toBe('C');
    expect(resolveAircraftTariffCode('777-300ER', rows)).toBe('E');
  });

  it('walks to the parent type when ICAO is a designator', () => {
    expect(resolveAircraftTariffCode('A330-300F', rows)).toBe('E');
  });

  it('uses the category code only when ICAO is blank', () => {
    expect(resolveAircraftTariffCode('A320', rows)).toBe('C');
  });

  it('does not treat a designator category as the tariff letter', () => {
    expect(resolveAircraftTariffCode('A330', rows)).toBeNull();
  });
});

describe('priceCardIsTariffCode', () => {
  it('matches a code label and not an aircraft type', () => {
    expect(priceCardIsTariffCode('Code C', 'C')).toBe(true);
    expect(priceCardIsTariffCode('ICAO E', 'E')).toBe(true);
    expect(priceCardIsTariffCode('B737-800', 'C')).toBe(false);
    expect(priceCardIsTariffCode('Code E', 'C')).toBe(false);
  });
});
