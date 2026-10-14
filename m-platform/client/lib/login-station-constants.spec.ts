import {
  findAdminStationForAirportCode,
  AIRPORT_STATION_ALIASES,
} from './login-station-constants';
import type { StationRecord } from './stationAnalyticsMock';

describe('findAdminStationForAirportCode', () => {
  const mockStations = [
    {
      id: 'station-trichy-id',
      name: 'Tiruchirappalli International Airport',
      code: 'TIR-01',
      stationCode: 'TRZ',
      city: 'Tiruchirappalli',
      company: 'Bird Airport Services',
      region: 'South',
      terminals: ['T1'],
      zone: 'T1',
      departmentCount: 5,
      activeStaff: 20,
    },
    {
      id: 'station-del-id',
      name: 'Indira Gandhi International Airport',
      code: 'DEL-01',
      stationCode: 'DEL',
      city: 'New Delhi',
      company: 'Bird Airport Services',
      region: 'North',
      terminals: ['T1', 'T2', 'T3'],
      zone: 'T1,T2,T3',
      departmentCount: 10,
      activeStaff: 100,
    },
  ] as unknown as StationRecord[];

  it('matches Trichy station when query has TRZ code and hints from landing map', () => {
    const matched = findAdminStationForAirportCode(mockStations, 'TRZ', {
      stationName: 'Tiruchirappalli International Airport (TRZ)',
      stationCity: 'Trichy',
    });
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('station-trichy-id');
  });

  it('matches Trichy station when DB only has Tiruchirappalli city and TIR-01 code without explicit stationCode', () => {
    const legacyStations: StationRecord[] = [
      {
        ...mockStations[0]!,
        stationCode: undefined,
        code: 'TIR-01',
        city: 'Tiruchirappalli',
      },
    ];
    const matched = findAdminStationForAirportCode(legacyStations, 'TRZ', {
      stationName: 'Tiruchirappalli International Airport (TRZ)',
      stationCity: 'Trichy',
    });
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('station-trichy-id');
  });

  it('matches Trichy station when DB has TRICHY-01 code and Trichy city', () => {
    const customStations: StationRecord[] = [
      {
        ...mockStations[0]!,
        stationCode: undefined,
        code: 'TRICHY-01',
        city: 'Trichy',
      },
    ];
    const matched = findAdminStationForAirportCode(customStations, 'TRZ', {
      stationName: 'Tiruchirappalli International Airport (TRZ)',
      stationCity: 'Trichy',
    });
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('station-trichy-id');
  });

  it('matches when stationCode query is a direct Mongo ObjectId', () => {
    const matched = findAdminStationForAirportCode(
      mockStations,
      'station-trichy-id',
    );
    expect(matched?.id).toBe('station-trichy-id');
  });

  it('has TRZ defined in AIRPORT_STATION_ALIASES with both Trichy and Tiruchirappalli', () => {
    expect(AIRPORT_STATION_ALIASES['TRZ']).toBeDefined();
    expect(AIRPORT_STATION_ALIASES['TRZ']?.cities).toContain('trichy');
    expect(AIRPORT_STATION_ALIASES['TRZ']?.cities).toContain('tiruchirappalli');
  });
});
