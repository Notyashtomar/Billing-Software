import type { StationWiseInputRow } from './station-wise-map-fhr.util';
import {
  buildStationWiseWorkbook,
  flightReportLastDataRow,
} from './station-wise-workbook.util';

function sampleRow(
  airline: string,
  staYmd: string,
  staDate: string,
): StationWiseInputRow {
  return {
    serialNo: 14754,
    airline,
    airlineCode: 'SG',
    flightNo: 'SG648/640',
    typeCraft: 'B737-800',
    staTime: 0.142361,
    staDate,
    stdTime: 0.284722,
    stdDate: staDate,
    ataTime: 0.120833,
    ataDate: staDate,
    atdTime: 0.291667,
    atdDate: staDate,
    delay: 'Delay',
    actualDelay: 0.006944,
    delay1: 0.006944,
    reasonOfDelay: '93 Aircraft rotation',
    delay2: '',
    delaycode2: '',
    delay3: '',
    delaycode3: '',
    staYmd,
  };
}

function hasThinGrid(cell: { border?: { top?: { style?: string }; left?: { style?: string }; bottom?: { style?: string }; right?: { style?: string } } }) {
  const b = cell.border;
  return (
    b?.top?.style === 'thin' &&
    b?.left?.style === 'thin' &&
    b?.bottom?.style === 'thin' &&
    b?.right?.style === 'thin'
  );
}

describe('station-wise-workbook.util', () => {
  it('builds PREVIEW plus clipped month sheets with formulas', async () => {
    const buffer = await buildStationWiseWorkbook({
      stationCode: 'MAA',
      stationLabel: 'Chennai',
      from: '2026-01-15',
      to: '2026-02-10',
      months: [
        {
          key: '2026-01',
          sheetName: 'JAN26',
          label: 'January 2026',
          from: '2026-01-15',
          to: '2026-01-31',
        },
        {
          key: '2026-02',
          sheetName: 'FEB26',
          label: 'February 2026',
          from: '2026-02-01',
          to: '2026-02-10',
        },
      ],
      rowsByMonth: new Map([
        [
          '2026-01',
          [
            sampleRow('SpiceJet', '2026-01-15', '15/01/2026'),
            sampleRow('Emirates', '2026-01-16', '16/01/2026'),
          ],
        ],
        ['2026-02', []],
      ]),
    });

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(buffer.length).toBeGreaterThan(2000);

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const jan = wb.getWorksheet('JAN26');
    expect(jan).toBeDefined();
    const inputs = Array.from({ length: 20 }, (_, i) => jan!.getCell(4, i + 1).value);
    expect(inputs.some((v) => v === '-')).toBe(false);
    expect(jan!.getCell('E4').value).not.toBeNull();
    expect(typeof jan!.getCell('E4').value === 'number' || jan!.getCell('E4').value instanceof Date).toBe(true);
    expect(typeof jan!.getCell('F4').value === 'number' || jan!.getCell('F4').value instanceof Date).toBe(true);
    expect(jan!.getCell('EL3').value).toBe('FLIGHT REPORT');
    expect(jan!.getCell('FA5').value).toMatchObject({ formula: 'EM5+EN5+ES5' });

    expect(flightReportLastDataRow(0)).toBe(5);
    expect(flightReportLastDataRow(2)).toBe(7);
    expect(flightReportLastDataRow(10)).toBe(15);
    const last = flightReportLastDataRow(2);
    expect(hasThinGrid(jan!.getCell('EL3'))).toBe(true);
    expect(hasThinGrid(jan!.getCell('FA4'))).toBe(true);
    expect(hasThinGrid(jan!.getCell('EL5'))).toBe(true);
    expect(hasThinGrid(jan!.getCell(`FA${last}`))).toBe(true);
    expect(hasThinGrid(jan!.getCell(`EL${last + 1}`))).toBe(false);

    const feb = wb.getWorksheet('FEB26');
    expect(hasThinGrid(feb!.getCell('FA5'))).toBe(true);
    expect(hasThinGrid(feb!.getCell('EL6'))).toBe(false);
  });
});
