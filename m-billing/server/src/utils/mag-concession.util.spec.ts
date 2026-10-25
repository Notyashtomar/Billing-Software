import {
  aircraftTariffBand,
  magFloorForFlights,
  magServiceTypeForFlight,
} from './mag-concession.util';

const rates = [
  { aircraftCode: 'E', serviceType: 'Full Handling (Pax+Ramp)', amount: 38130 },
  { aircraftCode: 'E', serviceType: 'Cargo Ramp Handling', amount: 33689 },
  { aircraftCode: 'C', serviceType: 'Full Handling (Pax+Ramp)', amount: 19751 },
];

describe('mag concession', () => {
  const categories = new Map<string, string>([
    ['B787-900', 'E'],
    ['A320', 'C'],
  ]);

  it('uses full handling unless the flight is cargo or only ramp or passenger', () => {
    expect(magServiceTypeForFlight({ handling: 'Turnaround' })).toBe('Full Handling (Pax+Ramp)');
    expect(magServiceTypeForFlight({ cargo: true })).toBe('Cargo Ramp Handling');
    expect(magServiceTypeForFlight({ handling: 'Ramp only' })).toBe('Ramp Services');
    expect(magServiceTypeForFlight({ handling: 'Passenger terminal' })).toBe('Pax Terminal Services');
  });

  it('sums the MAG rate for each flight band', () => {
    expect(aircraftTariffBand('E', categories)).toBe('E');
    expect(aircraftTariffBand('B787-900', categories)).toBe('E');
    expect(
      magFloorForFlights(
        rates,
        [
          { aircraftType: 'B787-900', handling: 'Turnaround' },
          { aircraftType: 'B787-900', handling: 'Turnaround' },
          { aircraftType: 'A320', handling: 'Scheduled' },
        ],
        categories,
      ),
    ).toBe(38130 * 2 + 19751);
  });
});
