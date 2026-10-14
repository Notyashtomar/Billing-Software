import type { StationWiseInputRow } from './station-wise-map-fhr.util';
import { buildMonthWiseModel } from './month-wise-layout.util';
import { buildMonthWiseWorkbook } from './month-wise-workbook.util';
import ExcelJS from 'exceljs';

function sampleRow(airline: string, staYmd: string): StationWiseInputRow {
  return {
    serialNo: 1,
    airline,
    airlineCode: '',
    flightNo: airline.startsWith('E') ? 'EK1' : 'SG1',
    typeCraft: 'B737',
    staTime: 0.1,
    staDate: '01/08/2026',
    stdTime: 0.2,
    stdDate: '01/08/2026',
    ataTime: 0.1,
    ataDate: '01/08/2026',
    atdTime: 0.2,
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
  };
}

describe('month-wise-workbook.util', () => {
  it('writes SUMMARY + COMBINED + one sheet per airline with live formulas', async () => {
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
      new Map([
        [
          '2026-08',
          [sampleRow('Emirates', '2026-08-01'), sampleRow('SpiceJet', '2026-08-02')],
        ],
      ]),
    );
    const buffer = await buildMonthWiseWorkbook({
      stationCode: 'MAA',
      stationLabel: 'Chennai',
      from: '2026-08-01',
      to: '2026-08-31',
      months,
      combined: model.combined,
      airlines: model.airlines,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'SUMMARY',
      'COMBINED',
      'EK',
      'SG',
    ]);
    const combined = wb.getWorksheet('COMBINED')!;
    expect(combined.getCell('A1').value).toBe('TOTAL IN NOS.');
    expect(combined.getCell('P4').value).toBe('TOTAL');
    expect(String((combined.getCell('P5').value as { formula?: string })?.formula)).toBe(
      'B5+C5+H5',
    );
    expect(String((combined.getCell('V7').value as { formula?: string })?.formula)).toBe('I1');
    expect(String((combined.getCell('V10').value as { formula?: string })?.formula)).toBe(
      'D1+E1+K1',
    );
    const summary = wb.getWorksheet('SUMMARY')!;
    expect(summary.getCell('A3').value).toBe('EK');
    expect(summary.getCell('A4').value).toBe('SG');
    expect(summary.getCell('A5').value).toBe('TOTAL');
  });
});
