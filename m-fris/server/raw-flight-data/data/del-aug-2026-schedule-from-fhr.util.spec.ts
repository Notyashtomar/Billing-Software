import {
  buildDelAug2026ScheduleRowsFromFhr,
  flightNoFromFhrMain,
  routingFromFhrRoute,
} from './del-aug-2026-schedule-from-fhr.util';

describe('del-aug-2026-schedule-from-fhr.util', () => {
  it('strips terminal tokens from routing', () => {
    expect(routingFromFhrRoute('DXB-DEL-T-1')).toBe('DXB-DEL');
    expect(routingFromFhrRoute('PVG - DEL - PVG')).toBe('PVG-DEL-PVG');
  });

  it('strips CANC and prefixes split legs', () => {
    expect(
      flightNoFromFhrMain('MU', { FlightNo: 'CANC -MU563/564' }).flightNo,
    ).toBe('MU563/564');
    const split = flightNoFromFhrMain('6E', {
      ArrivalFltNo: '04',
      DepartureFltNo: '33',
      ifOperationSplit: true,
      FlightNo: '04/33',
    });
    expect(split.flightNo).toBe('6E04/6E33');
    expect(split.ifOperationSplit).toBe(true);
  });

  it('merges same flight+route and unions weekdays', () => {
    const rows = buildDelAug2026ScheduleRowsFromFhr([
      {
        mainDetails: {
          Airline: 'China Eastern',
          Arline_Code: 'MU',
          FlightNo: 'CANC -MU563/564',
          Route: 'PVG - DEL - PVG',
          STADate: '03/08/2026',
          STATime: '17:45',
          STDTime: '19:55',
          TypeCraft: 'A330-200',
          aircraftBody: 'WB',
          Typeofflight: 'Turnaround',
          Cate_of_Flight: 'International',
        },
      },
      {
        mainDetails: {
          Airline: 'China Eastern',
          Arline_Code: 'MU',
          FlightNo: 'MU563/564',
          Route: 'PVG - DEL - PVG',
          STADate: '10/08/2026',
          STATime: '17:45',
          STDTime: '19:55',
          TypeCraft: 'A330-200',
          aircraftBody: 'WB',
          Typeofflight: 'Turnaround',
          Cate_of_Flight: 'International',
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].flightNo).toBe('MU563/564');
    expect(rows[0].routing).toBe('PVG-DEL-PVG');
    expect(rows[0].scheduleDays.Mon).toBe(true);
    expect(rows[0].fhrCount).toBe(2);
    expect(rows[0].seasonKey).toBe('summer-2026');
  });
});
