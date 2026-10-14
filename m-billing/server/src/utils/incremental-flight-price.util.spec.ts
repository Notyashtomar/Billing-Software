import { incrementalSecondFlightIds } from './incremental-flight-price.util';

describe('incrementalSecondFlightIds', () => {
  const base = {
    sourceType: 'scheduled_flight',
    customerCode: '6E',
    aircraftType: 'B777',
    incrementalFlightsActive: true,
    incrementalPrice: 40000,
  };

  it('charges only the later flight on the same day', () => {
    const ids = incrementalSecondFlightIds([
      { ...base, id: 'a', flightDate: '2026-01-20', flightTime: '08:10' },
      { ...base, id: 'b', flightDate: '2026-01-20', flightTime: '18:40' },
      { ...base, id: 'c', flightDate: '2026-01-21', flightTime: '09:00' },
    ]);
    expect([...ids]).toEqual(['b']);
  });

  it('uses ATA date and ATD time, including DD-MM-YYYY from FHR', () => {
    const ids = incrementalSecondFlightIds([
      { ...base, id: 'early', flightDate: '20-01-2026', flightTime: '06:10' },
      { ...base, id: 'later', flightDate: '2026-01-20', flightTime: '19:05' },
    ]);
    expect([...ids]).toEqual(['later']);
  });

  it('keeps the package price when incremental flights are off', () => {
    const ids = incrementalSecondFlightIds([
      { ...base, id: 'a', flightDate: '2026-01-20', flightTime: '08:10', incrementalFlightsActive: false },
      { ...base, id: 'b', flightDate: '2026-01-20', flightTime: '18:40', incrementalFlightsActive: false },
    ]);
    expect(ids.size).toBe(0);
  });
});
