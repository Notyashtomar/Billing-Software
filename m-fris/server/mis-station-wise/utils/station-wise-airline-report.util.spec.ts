import { buildAirlineFlightReport } from './station-wise-airline-report.util';
import type { StationWiseInputRow } from './station-wise-map-fhr.util';
import { parseToExcelTime } from './station-wise-map-fhr.util';

function row(overrides: Partial<StationWiseInputRow> = {}): StationWiseInputRow {
  return {
    serialNo: 1,
    airline: 'Emirates',
    airlineCode: 'EK',
    flightNo: 'EK123',
    typeCraft: 'A380',
    staTime: parseToExcelTime('10:00'),
    staDate: '01/08/2026',
    stdTime: parseToExcelTime('12:00'),
    stdDate: '01/08/2026',
    ataTime: parseToExcelTime('10:00'),
    ataDate: '01/08/2026',
    atdTime: parseToExcelTime('12:00'),
    atdDate: '01/08/2026',
    delay: 'On Time',
    actualDelay: parseToExcelTime('00:00'),
    delay1: '',
    reasonOfDelay: '',
    delay2: '',
    delaycode2: '',
    delay3: '',
    delaycode3: '',
    staYmd: '2026-08-01',
    ...overrides,
  };
}

describe('station-wise-airline-report.util', () => {
  it('builds COMBINED + per-airline totals matching FA = EM+EN+ES', () => {
    const report = buildAirlineFlightReport([
      row({ airline: 'Emirates', flightNo: 'EK1' }),
      row({ airline: 'Emirates', flightNo: 'EK2' }),
      row({
        airline: 'SpiceJet',
        flightNo: 'CANC SG1',
        ataTime: '',
        ataDate: '',
        atdTime: '',
        atdDate: '',
      }),
    ]);

    expect(report[0]?.name).toBe('COMBINED');
    expect(report[0]?.flights).toBe(3);
    expect(report[0]?.metrics.xxld).toBe(1);
    expect(report[0]?.metrics.total).toBe(
      report[0]!.metrics.xxld +
        report[0]!.metrics.lateSta +
        report[0]!.metrics.arrivedOnOrBeforeSta,
    );

    const emirates = report.find((r) => r.name === 'Emirates');
    expect(emirates?.flights).toBe(2);
    expect(emirates?.metrics.xxld).toBe(0);

    const spice = report.find((r) => r.name === 'SpiceJet');
    expect(spice?.metrics.xxld).toBe(1);
  });

  it('lists airlines A–Z after COMBINED', () => {
    const report = buildAirlineFlightReport([
      row({ airline: 'US-Bangla Airlines', flightNo: 'BS1' }),
      row({ airline: 'Air India Express', flightNo: 'IX1' }),
      row({ airline: 'Emirates', flightNo: 'EK1' }),
      row({ airline: 'Biman Bangladesh Airlines', flightNo: 'BG1' }),
    ]);
    expect(report.map((r) => r.name)).toEqual([
      'COMBINED',
      'Air India Express',
      'Biman Bangladesh Airlines',
      'Emirates',
      'US-Bangla Airlines',
    ]);
  });
});
