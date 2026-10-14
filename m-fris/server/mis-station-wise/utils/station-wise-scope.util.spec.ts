import {
  belongsInNonScheduledStationWise,
  belongsInScheduledStationWise,
  isNonScheduledFhrDoc,
  isScheduledMonthwiseLeftoverAirline,
  parseStationWiseFlightScope,
} from './station-wise-scope.util';

describe('station-wise-scope.util', () => {
  it('parses flightScope aliases', () => {
    expect(parseStationWiseFlightScope(undefined)).toBe('scheduled');
    expect(parseStationWiseFlightScope('ns')).toBe('nonScheduled');
    expect(parseStationWiseFlightScope('non-scheduled')).toBe('nonScheduled');
  });

  it('detects NS leftovers in fhr_collection', () => {
    expect(
      isNonScheduledFhrDoc({
        mainDetails: { Typeofflight: 'Non-Scheduled', bookingNo: 'B1' },
      }),
    ).toBe(true);
    expect(
      isNonScheduledFhrDoc({
        mainDetails: { TypeofHandling: 'SCH', Typeofflight: 'Scheduled' },
      }),
    ).toBe(false);
    expect(
      isNonScheduledFhrDoc({
        mainDetails: { TypeofHandling: 'SCH', bookingNo: 'SG-1' },
      }),
    ).toBe(false);
    expect(
      isNonScheduledFhrDoc({
        mainDetails: {
          Typeofflight: 'Turnaround',
          TypeofHandling: 'Turnaround',
          bookingNo: 'IXC/BKG/000097/20-09-2026/SKP/VT-OSH',
        },
      }),
    ).toBe(true);
  });

  it('Scheduled MIS keeps SCH/TURNAROUND/Additional and drops NS/leftovers', () => {
    expect(
      belongsInScheduledStationWise({
        mainDetails: { TypeofHandling: 'SCH', Typeofflight: 'Scheduled' },
      }),
    ).toBe(true);
    expect(
      belongsInScheduledStationWise({
        mainDetails: { TypeofHandling: 'TURNAROUND' },
      }),
    ).toBe(true);
    expect(
      belongsInScheduledStationWise({
        mainDetails: { TypeofHandling: 'ADDL', Airline: 'SpiceJet' },
      }),
    ).toBe(true);
    expect(
      belongsInScheduledStationWise({
        mainDetails: {
          TypeofHandling: 'Additional',
          Typeofflight: 'Turnaround',
          Airline: 'SpiceJet',
        },
      }),
    ).toBe(true);
    expect(
      belongsInScheduledStationWise({
        mainDetails: {
          TypeofHandling: 'Additional',
          Typeofflight: 'Diverted Flight',
          Airline: 'Air India Express',
        },
      }),
    ).toBe(true);
    expect(
      belongsInScheduledStationWise({
        mainDetails: { TypeofHandling: 'Non-Scheduled' },
      }),
    ).toBe(false);
    expect(
      belongsInScheduledStationWise({
        mainDetails: {
          Typeofflight: 'Turnaround',
          bookingNo: 'IXC/BKG/000097/20-09-2026/SKP/VT-OSH',
        },
      }),
    ).toBe(false);
    expect(
      belongsInScheduledStationWise({
        mainDetails: { TypeofHandling: 'SCH', bookingNo: 'NS-1' },
      }),
    ).toBe(true);
    expect(
      belongsInScheduledStationWise({
        mainDetails: {
          TypeofHandling: 'TURNAROUND',
          Airline: 'SpiceJet',
          bookingNo: 'SG-BOOK',
        },
      }),
    ).toBe(true);
    expect(
      belongsInScheduledStationWise({
        mainDetails: { Airline: 'SpiceJet' },
      }),
    ).toBe(true);
    expect(
      belongsInScheduledStationWise({
        mainDetails: { AirlineName: 'MANAH AEROSPACE AND ENGINEERING PVT LTD' },
      }),
    ).toBe(false);
    expect(
      belongsInScheduledStationWise({
        mainDetails: {
          TypeofHandling: 'SCH',
          Airline: 'FLYSBS AVIATION LIMITED',
        },
      }),
    ).toBe(false);
    expect(
      isScheduledMonthwiseLeftoverAirline('Aviaarc Trip Support Pvt Ltd'),
    ).toBe(true);
  });

  it('Non Schedule MIS drops pure SCH and keeps NS/ADDL/unknown', () => {
    expect(
      belongsInNonScheduledStationWise({
        mainDetails: { TypeofHandling: 'SCH', Typeofflight: 'Scheduled' },
      }),
    ).toBe(false);
    expect(
      belongsInNonScheduledStationWise({
        mainDetails: { TypeofHandling: 'Non-Scheduled' },
      }),
    ).toBe(true);
    expect(
      belongsInNonScheduledStationWise({
        mainDetails: { TypeofHandling: 'ADDL' },
      }),
    ).toBe(true);
    expect(
      belongsInNonScheduledStationWise({
        mainDetails: { AirlineName: 'Aviaarc Trip Support Pvt Ltd' },
      }),
    ).toBe(true);
  });
});
