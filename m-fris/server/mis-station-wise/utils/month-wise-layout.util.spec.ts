import {
  buildMonthWiseModel,
  excelSheetName,
  monthWiseRowTotal,
  performanceFromMetrics,
} from './month-wise-layout.util';
import { emptyMonthWiseMetrics } from './month-wise-layout.util';
import type { StationWiseInputRow } from './station-wise-map-fhr.util';

function row(airline: string, staYmd: string, cancelled = false): StationWiseInputRow {
  return {
    serialNo: 1,
    airline,
    airlineCode: '',
    flightNo: cancelled ? 'CANC SG1' : airline.startsWith('E') ? 'EK1' : 'SG1',
    typeCraft: 'A380',
    staTime: 0.4,
    staDate: '01/08/2026',
    stdTime: 0.5,
    stdDate: '01/08/2026',
    ataTime: cancelled ? '' : 0.4,
    ataDate: cancelled ? '' : '01/08/2026',
    atdTime: cancelled ? '' : 0.5,
    atdDate: cancelled ? '' : '01/08/2026',
    delay: cancelled ? 'Delay' : 'On Time',
    actualDelay: 0,
    delay1: '',
    reasonOfDelay: '',
    delay2: '',
    delaycode2: '',
    delay3: '',
    delaycode3: '',
    staYmd,
  };
}

describe('month-wise-layout.util', () => {
  it('keeps FA identity: total = cancelled + late STA + arrived before STA', () => {
    const m = emptyMonthWiseMetrics();
    m.xxld = 2;
    m.lateSta = 5;
    m.arrivedOnOrBeforeSta = 10;
    m.onTime = 3;
    expect(monthWiseRowTotal(m)).toBe(17);
  });

  it('matches LH performance identities', () => {
    const m = emptyMonthWiseMetrics();
    m.onTime = 10;
    m.xxld = 1;
    m.depOnOrBeforeStd = 2;
    m.depPostStdAgtLeSgt = 3;
    m.depBeforeStdAgtLtSgt = 4;
    m.depBeforeStdAgtEqSgt = 1;
    m.exceedingSgtBeforeStd = 1;
    m.agtGtSgtNonGha = 2;
    m.agtGtSgtPostStdNonGha = 1;
    m.agtGtSgtGha = 1;
    m.agtGtSgtPostStdGha = 1;
    const p = performanceFromMetrics(m);
    expect(p.gtSaved).toBe(9);
    expect(p.beforeStd).toBe(2);
    expect(p.nonGha).toBe(3);
    expect(p.gha).toBe(2);
    expect(p.offSked).toBe(16);
    expect(p.total).toBe(27);
  });

  it('pivots every station airline into month rows and unique sheets', () => {
    const months = [
      {
        key: '2026-07',
        sheetName: 'JUL26',
        label: 'July 2026',
        from: '2026-07-01',
        to: '2026-07-31',
      },
      {
        key: '2026-08',
        sheetName: 'AUG26',
        label: 'August 2026',
        from: '2026-08-01',
        to: '2026-08-31',
      },
    ];
    const model = buildMonthWiseModel(
      months,
      new Map([
        ['2026-07', [row('Emirates', '2026-07-02'), row('SpiceJet', '2026-07-03', true)]],
        ['2026-08', [row('Emirates', '2026-08-02')]],
      ]),
    );
    expect(model.airlines.map((a) => a.name)).toEqual(['Emirates', 'SpiceJet']);
    expect(model.airlines.map((a) => a.sheetName)).toEqual(['EK', 'SG']);
    expect(model.combined.sheetName).toBe('COMBINED');
    expect(model.combined.months).toHaveLength(2);
    expect(model.airlines[0]?.months).toHaveLength(2);
    expect(model.airlines.find((a) => a.name === 'SpiceJet')?.months[1]?.metrics.total).toBe(0);
    const used = new Set<string>(['summary']);
    expect(excelSheetName('Lufthansa / MAA', used)).toBe('Lufthansa MAA');
    expect(excelSheetName('Lufthansa / MAA', used)).toBe('Lufthansa MAA_2');
  });

  it('only includes airlines that have FHR flights in the window', () => {
    const months = [
      {
        key: '2026-08',
        sheetName: 'AUG26',
        label: 'August 2026',
        from: '2026-08-01',
        to: '2026-08-31',
      },
    ];
    const model = buildMonthWiseModel(
      months,
      new Map([['2026-08', [row('Emirates', '2026-08-02')]]]),
    );
    expect(model.airlines.map((a) => a.name)).toEqual(['Emirates']);
    expect(model.airlines.map((a) => a.sheetName)).toEqual(['EK']);
  });
});
