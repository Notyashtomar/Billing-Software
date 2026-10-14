import { buildAirlineWiseModel } from './airline-wise-layout.util';
import type { StationWiseInputRow } from './station-wise-map-fhr.util';
import type { CalendarMonthSlice } from './station-wise-months.util';

function row(
  airlineCode: string,
  stationCode: string,
  staYmd: string,
  flightNo: string,
): StationWiseInputRow {
  return {
    serialNo: 1,
    airline: airlineCode === '6E' ? 'INDIGO' : 'OTHER AIR',
    airlineCode,
    flightNo,
    typeCraft: 'A320',
    staTime: 0.4,
    staDate: '01/08/2026',
    stdTime: 0.5,
    stdDate: '01/08/2026',
    ataTime: 0.4,
    ataDate: '01/08/2026',
    atdTime: 0.5,
    atdDate: '01/08/2026',
    delay: 'On Time',
    actualDelay: 0,
    delay1: '',
    reasonOfDelay: '',
    delay2: '',
    delaycode2: '',
    delay3: '',
    delaycode3: '',
    staYmd,
    stationCode,
  };
}

describe('airline-wise-layout.util', () => {
  const months: CalendarMonthSlice[] = [
    {
      key: '2026-08',
      sheetName: 'AUG-26',
      label: 'August 2026',
      from: '2026-08-01',
      to: '2026-08-31',
    },
  ];

  it('keeps catalog airlines and appends extra FHR codes', () => {
    const model = buildAirlineWiseModel(months, [
      row('6E', 'AMD', '2026-08-01', '6E101'),
      row('6E', 'MAA', '2026-08-02', '6E202'),
      row('QQ', 'DEL', '2026-08-03', 'QQ9'),
    ]);
    const codes = model.map((a) => a.code);
    expect(codes).toContain('6E');
    expect(codes).toContain('LH');
    expect(codes).toContain('QQ');
    const indigo = model.find((a) => a.code === '6E')!;
    expect(indigo.stations.map((s) => s.stationCode)).toEqual(['AMD', 'MAA']);
    expect(indigo.stations[0]?.sheetName).toMatch(/^AMD_6E_/);
  });
});
