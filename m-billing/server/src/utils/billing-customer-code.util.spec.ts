import {
  normalizeBillingCustomerCode,
  resolveBillingCustomerCode,
  resolveKnownBillingCustomerCode,
  sameBillingAirlineName,
} from './billing-customer-code.util';

describe('billing-customer-code.util', () => {
  it('extracts airline from flight-style Arline_Code', () => {
    expect(normalizeBillingCustomerCode('IX2718')).toBe('IX');
    expect(normalizeBillingCustomerCode('SG9151A/SG9151D')).toBe('SG');
    expect(normalizeBillingCustomerCode('CANC - IX100')).toBe('IX');
    expect(normalizeBillingCustomerCode('CANCIX472')).toBe('IX');
    expect(normalizeBillingCustomerCode('CANC IX472')).toBe('IX');
  });

  it('extracts airline from spaced flight-style Arline_Code (IXC FHR)', () => {
    expect(normalizeBillingCustomerCode('IX 1498/ IX 1604')).toBe('IX');
    expect(normalizeBillingCustomerCode('IX 2385/ 2386')).toBe('IX');
  });

  it('keeps clean airline codes', () => {
    expect(normalizeBillingCustomerCode('IX')).toBe('IX');
    expect(normalizeBillingCustomerCode('3K')).toBe('3K');
  });

  it('resolves from mainDetails flight-number Arline_Code', () => {
    expect(
      resolveBillingCustomerCode(
        { Arline_Code: 'IX2718', Airline: 'Air India Express' },
        {},
        'IX2718',
      ),
    ).toBe('IX');
  });

  it('keeps a customer code that already exists on the station master', () => {
    expect(
      resolveKnownBillingCustomerCode({
        directCodes: ['AI', 'AI'],
        flightCodes: ['AI101'],
        isKnown: (code) => code === 'AI',
        customerName: () => 'Air India',
        operationalName: 'Air India',
      }),
    ).toBe('AI');
  });

  it('maps Somon ICAO SMR to saved billing customer SZ when the names match', () => {
    expect(
      sameBillingAirlineName('Somon Air', 'Aircompany Somon Air LLC'),
    ).toBe(true);
    expect(
      resolveKnownBillingCustomerCode({
        directCodes: ['SMR', 'SMR'],
        flightCodes: ['SZ109/110'],
        isKnown: (code) => code === 'SZ',
        customerName: (code) => (code === 'SZ' ? 'Somon Air' : ''),
        operationalName: 'Aircompany Somon Air LLC',
      }),
    ).toBe('SZ');
  });

  it('does not remap an unknown code when the flight carrier is a different airline', () => {
    expect(
      resolveKnownBillingCustomerCode({
        directCodes: ['SMR'],
        flightCodes: ['SZ109/110'],
        isKnown: (code) => code === 'SZ',
        customerName: () => 'Somon Air',
        operationalName: 'Other Carrier LLC',
      }),
    ).toBe('SMR');
  });
});
