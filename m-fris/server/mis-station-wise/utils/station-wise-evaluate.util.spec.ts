import { evaluateStationWiseRow, previewCellsFromRow } from './station-wise-evaluate.util';
import type { StationWiseInputRow } from './station-wise-map-fhr.util';
import { parseToExcelTime } from './station-wise-map-fhr.util';

function sampleRow(overrides: Partial<StationWiseInputRow> = {}): StationWiseInputRow {
  return {
    serialNo: 1,
    airline: 'SpiceJet',
    airlineCode: 'SG',
    flightNo: 'SG674/660',
    typeCraft: 'B737-800',
    staTime: parseToExcelTime('17:10'),
    staDate: '28/02/2026',
    stdTime: parseToExcelTime('07:00'),
    stdDate: '01/03/2026',
    ataTime: parseToExcelTime('17:40'),
    ataDate: '28/02/2026',
    atdTime: parseToExcelTime('07:00'),
    atdDate: '01/03/2026',
    delay: 'On Time',
    actualDelay: parseToExcelTime('00:00'),
    delay1: '',
    reasonOfDelay: '',
    delay2: '',
    delaycode2: '',
    delay3: '',
    delaycode3: '',
    staYmd: '2026-02-28',
    ...overrides,
  };
}

describe('station-wise-evaluate.util', () => {
  it('fills formula cells with real values for a late-ATA on-time-dep row', () => {
    const ev = evaluateStationWiseRow(sampleRow());
    expect(ev.U).toBe(0);
    expect(ev.V).toBe(0);
    expect(typeof ev.W).toBe('number');
    expect(ev.X).toBe('Before STD');
    expect(ev.Z).toBe(1);
    expect(ev.BB).toBe(0);
  });

  it('previewCells includes A–T inputs and evaluated formula letters', () => {
    const cells = previewCellsFromRow(sampleRow());
    expect(cells.B).toBe('SpiceJet');
    expect(cells.E).toBe('17:10');
    expect(cells.I).toBe('17:40');
    expect(cells.U).toBe('-'); // zero → dash
    expect(cells.X).toBe('Before STD');
    expect(cells.BD).toBe('SG67');
  });

  it('counts blank ATA like Excel (empty = 0) so FA includes the row', () => {
    const ev = evaluateStationWiseRow(
      sampleRow({
        flightNo: 'SG100',
        ataTime: '',
        ataDate: '',
        atdTime: '',
        atdDate: '',
      }),
    );
    expect(ev.BE).toBe(0);
    expect(ev.DW).toBe(0);
    expect(ev.EB).toBe(1);
  });

  it('maps numeric zero formula results to dash', () => {
    const cells = previewCellsFromRow(sampleRow());
    expect(cells.V).toBe('-');
    expect(cells.BB).toBe('-');
    expect(cells.BC).toBe('-');
  });
});
