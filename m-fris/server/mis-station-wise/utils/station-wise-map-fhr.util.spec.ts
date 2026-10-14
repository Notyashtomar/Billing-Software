import {
  mapFhrDocToStationWiseRow,
  parseToExcelTime,
  parseToYmd,
} from './station-wise-map-fhr.util';

describe('station-wise-map-fhr.util', () => {
  it('parses STA dates and times', () => {
    expect(parseToYmd('01/01/2026')).toBe('2026-01-01');
    expect(parseToExcelTime('03:25')).toBeCloseTo((3 * 60 + 25) / (24 * 60), 8);
  });

  it('maps an FHR embed to input columns and prefixes CANC', () => {
    const row = mapFhrDocToStationWiseRow({
      SerialNo: 14754,
      mainDetails: {
        Airline: 'SpiceJet',
        ArrivalFltNo: 'SG648',
        DepartureFltNo: 'SG640',
        TypeCraft: 'B737-800',
        ATADate: '01/01/2026',
        ATATime: '02:54',
        ATDDate: '01/01/2026',
        ATDTime: '07:00',
        departureStatus: 'Delay',
        ActualDelay: '00:10',
        flightCancelled: true,
        departureDelays: [{ Delay: '00:10', ReasonofDelay: '93 Aircraft rotation' }],
      },
      terminalDetails: { STADate: '01/01/2026' },
      loadControlDetails: {
        STADate: '01/01/2026',
        STATime: '03:25',
        STDDate: '01/01/2026',
        STDTime: '06:50',
      },
    });
    expect(row?.staYmd).toBe('2026-01-01');
    expect(row?.airline).toBe('SpiceJet');
    expect(row?.flightNo).toMatch(/^CANC /);
    expect(row?.reasonOfDelay).toBe('93 Aircraft rotation');
    expect(row?.staDate).toBe('01/01/2026');
    expect(row?.airline).toBe('SpiceJet');
  });

  it('keeps SCH SpiceJet rows even when a leftover bookingNo is stamped', () => {
    const row = mapFhrDocToStationWiseRow({
      SerialNo: 1,
      mainDetails: {
        Airline: 'SPICE JET',
        FlightNo: 'SG201',
        TypeofHandling: 'SCH',
        bookingNo: 'NS-LEFTOVER',
        STADate: '01/08/2026',
        STATime: '10:00',
      },
    });
    expect(row?.airline).toBe('SpiceJet');
    expect(row?.staYmd).toBe('2026-08-01');
  });

  it('buckets overnight STA→STD into the STD month', () => {
    const row = mapFhrDocToStationWiseRow({
      SerialNo: 20627,
      staDates: ['31/07/2026'],
      mainDetails: {
        Airline: 'Air India Express',
        FlightNo: 'CANC -IX2787/1929',
        TypeofHandling: 'Scheduled',
        Typeofflight: 'Turnaround',
        flightCancelled: true,
        STADate: '31/07/2026',
        STDDate: '01/08/2026',
      },
      terminalDetails: {
        STADate: '31/07/2026',
        STDDate: '01/08/2026',
        FlightNo: 'CANC -IX2787/1929',
      },
    });
    expect(row?.staYmd).toBe('2026-08-01');
    expect(row?.staDate).toBe('31/07/2026');
    expect(row?.stdDate).toBe('01/08/2026');
    expect(row?.airline).toBe('Air India Express');
    expect(row?.flightNo.toUpperCase()).toContain('IX2787');
  });

  it('maps ns_fhr_collection rows that only stamp FlightNo + staDates', () => {
    const row = mapFhrDocToStationWiseRow({
      SerialNo: 2201,
      staDates: ['20/07/2026'],
      mainDetails: {
        Airline: 'YTO CARGO',
        FlightNo: 'YG9042',
        TypeofHandling: 'Non-Scheduled',
        Typeofflight: 'Turnaround',
        STADate: '20/07/2026',
        STATime: '04:10',
        STDTime: '06:40',
      },
    });
    expect(row?.staYmd).toBe('2026-07-20');
    expect(row?.flightNo).toBe('YG9042');
    expect(row?.airline).toBe('YTO CARGO');
    expect(row?.staDate).toBe('20/07/2026');
  });
});
