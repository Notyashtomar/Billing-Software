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

  it('does not treat a designator category as the tariff letter; the family variants decide', () => {
    // Row "A330" has ICAO designator A330 and category C → C must not be used;
    // the A330-300 variant carries the real letter E.
    expect(resolveAircraftTariffCode('A330', rows)).toBe('E');
    expect(resolveAircraftTariffCode('A330', rows)).not.toBe('C');
  });

  it('returns null when neither the type nor its family has a letter', () => {
    expect(resolveAircraftTariffCode('ATR72', rows)).toBeNull();
  });

  it('resolves bare family names from FHR (KLM HYD: B777 / B787) to the variants’ letter', () => {
    const master = [
      { aircraftType: '777-200', icaoCode: 'E', categoryCode: 'A' },
      { aircraftType: '777-300ER', icaoCode: 'E', categoryCode: 'A' },
      { aircraftType: '777-8', icaoCode: 'F', categoryCode: 'A' },
      { aircraftType: '787-8', icaoCode: 'E', categoryCode: 'A' },
      { aircraftType: '787-9', icaoCode: 'E', categoryCode: 'A' },
      { aircraftType: 'B777', icaoCode: 'B777', categoryCode: 'C' },
      { aircraftType: 'B787', icaoCode: 'B789', categoryCode: 'A' },
      { aircraftType: 'B787-9', icaoCode: 'E', categoryCode: 'C' },
    ];
    expect(resolveAircraftTariffCode('B787-9', master, 'HYD')).toBe('E');
    expect(resolveAircraftTariffCode('B777', master, 'HYD')).toBe('E');
    expect(resolveAircraftTariffCode('B787', master, 'HYD')).toBe('E');
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
