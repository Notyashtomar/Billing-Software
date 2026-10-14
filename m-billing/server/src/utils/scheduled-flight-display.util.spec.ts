import {
  inferWideBodyFromAircraftType,
  resolveAircraftBodyLabel,
} from './scheduled-flight-display.util';

describe('resolveAircraftBodyLabel', () => {
  it('keeps the flight record body when the aircraft catalog says the other way', () => {
    expect(
      resolveAircraftBodyLabel(
        { aircraftBody: 'WB', TypeCraft: 'B737-800' },
        'B737-800',
        'NB',
      ),
    ).toBe('WB');
    expect(
      resolveAircraftBodyLabel({ AircraftBody: 'wide body' }, 'A320', 'NB'),
    ).toBe('WB');
  });

  it('uses the catalog only when the flight has no stored body', () => {
    expect(resolveAircraftBodyLabel({ TypeCraft: 'B738' }, 'B738', 'WB')).toBe('WB');
    expect(resolveAircraftBodyLabel({}, 'B738', 'NB')).toBe('NB');
  });

  it('treats ICAO wide-body codes as WB when nothing else is stored', () => {
    expect(inferWideBodyFromAircraftType('B77W')).toBe(true);
    expect(inferWideBodyFromAircraftType('B788')).toBe(true);
    expect(inferWideBodyFromAircraftType('A333')).toBe(true);
    expect(inferWideBodyFromAircraftType('B763')).toBe(true);
    expect(inferWideBodyFromAircraftType('B738')).toBe(false);
    expect(resolveAircraftBodyLabel({}, 'B77W', null)).toBe('WB');
    expect(resolveAircraftBodyLabel({}, 'B737-800', null)).toBe('NB');
  });
});
