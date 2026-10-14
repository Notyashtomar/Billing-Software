import {
  airlineCodeFromFlight,
  buildProjSkdMatrix,
  excelColLetter,
  getProjSkdSheetLayout,
  projSkdClearUntilRow,
  splitProjectedByAirlineColumns,
  projSkdCount,
  projSkdDayTotal,
  ymdForDay,
} from './billing-mis-bhs-proj-skd.util';

describe('Proj_Skd matrix', () => {
  const now = new Date('2026-07-15T08:00:00+05:30');

  it('splits columns by airline and aircraft type', () => {
    const matrix = buildProjSkdMatrix(
      [
        {
          flightNo: 'UL101',
          customerCode: 'UL',
          aircraftType: 'A330-300',
          scheduleDate: '2026-07-01',
        },
        {
          flightNo: 'UL202',
          customerCode: 'UL',
          aircraftType: 'A320-200',
          scheduleDate: '2026-07-01',
        },
        {
          flightNo: 'EK501',
          customerCode: 'EK-MAA',
          aircraftType: 'B777-300ER',
          scheduleDate: '2026-07-01',
        },
        {
          flightNo: 'EK502',
          customerCode: 'EK-MAA',
          aircraftType: 'B777-300ER',
          scheduleDate: '2026-07-01',
        },
      ],
      '2026-07-01',
      '2026-07-31',
      now,
    );

    expect(matrix.numDays).toBe(31);
    expect(matrix.columns.map((c) => `${c.airlineCode}:${c.aircraftLabel}`)).toEqual([
      'EK:B777-300ER',
      'UL:A320-200',
      'UL:A330-300',
    ]);
    expect(projSkdCount(matrix, '2026-07-01', 'UL|A330-300')).toBe(1);
    expect(projSkdCount(matrix, '2026-07-01', 'UL|A320-200')).toBe(1);
    expect(projSkdCount(matrix, '2026-07-01', 'EK|B777-300ER')).toBe(2);
    expect(projSkdDayTotal(matrix, '2026-07-01')).toBe(4);
  });

  it('skips cancelled flights and future days after as-of', () => {
    const matrix = buildProjSkdMatrix(
      [
        {
          flightNo: 'IX1',
          customerCode: 'IX',
          aircraftType: 'A320',
          scheduleDate: '2026-07-10',
        },
        {
          flightNo: 'IX2',
          customerCode: 'IX',
          aircraftType: 'A320',
          scheduleDate: '2026-07-20',
        },
        {
          flightNo: 'IX3',
          customerCode: 'IX',
          aircraftType: 'A320',
          scheduleDate: '2026-07-10',
          cancelled: true,
        },
      ],
      '2026-07-01',
      '2026-07-31',
      now,
    );

    expect(projSkdCount(matrix, '2026-07-10', 'IX|A320')).toBe(1);
    expect(projSkdCount(matrix, '2026-07-20', 'IX|A320')).toBe(0);
    expect(matrix.countedFlights).toBe(1);
    expect(matrix.asOfYmd).toBe('2026-07-15');
  });

  it('dedupes the same flight number on a day', () => {
    const matrix = buildProjSkdMatrix(
      [
        {
          flightNo: 'BG101',
          customerCode: 'BG',
          aircraftType: 'B737-800',
          scheduleDate: '2026-07-04',
        },
        {
          flightNo: 'BG101',
          customerCode: 'BG',
          aircraftType: 'B737-800',
          scheduleDate: '2026-07-04',
        },
      ],
      '2026-07-01',
      '2026-07-31',
      now,
    );
    expect(projSkdCount(matrix, '2026-07-04', 'BG|B737-800')).toBe(1);
  });

  it('reads airline from flight number, not billing operator codes', () => {
    expect(airlineCodeFromFlight('', '8D4421')).toBe('8D');
    expect(airlineCodeFromFlight('UNK', 'UL123')).toBe('UL');
    expect(airlineCodeFromFlight('AAPL', 'IX1498')).toBe('IX');
    expect(airlineCodeFromFlight('SKP', 'IX 1604')).toBe('IX');
    expect(airlineCodeFromFlight('AAPL', 'VT-ABC')).toBe('UNK');
  });

  it('drops non-scheduled / operator rows from the matrix', () => {
    const matrix = buildProjSkdMatrix(
      [
        {
          flightNo: 'IX1686',
          customerCode: 'IX',
          aircraftType: 'B737-800',
          scheduleDate: '2026-07-01',
          skdNonSkd: 'Scheduled',
        },
        {
          flightNo: 'VT-ABC',
          customerCode: 'AAPL',
          aircraftType: 'F2TH',
          scheduleDate: '2026-07-01',
          skdNonSkd: 'Non-Scheduled',
        },
        {
          flightNo: 'Heli1',
          customerCode: 'SKP',
          aircraftType: 'A109S',
          scheduleDate: '2026-07-03',
        },
        {
          flightNo: 'ACS01',
          customerCode: 'ACS',
          aircraftType: 'A109S',
          scheduleDate: '2026-07-04',
        },
        {
          flightNo: '10123',
          customerCode: '10',
          aircraftType: 'B737',
          scheduleDate: '2026-07-05',
        },
      ],
      '2026-07-01',
      '2026-07-31',
      now,
    );
    expect(matrix.columns.map((c) => `${c.airlineCode}:${c.aircraftLabel}`)).toEqual([
      'IX:B737-800',
    ]);
    expect(matrix.countedFlights).toBe(1);
  });

  it('counts FHR STA dates in dd/MM/yyyy and hyphenated flight numbers', () => {
    const matrix = buildProjSkdMatrix(
      [
        {
          flightNo: 'IX-1686',
          customerCode: 'IX',
          aircraftType: 'B737-800',
          scheduleDate: '03/08/2026',
        },
      ],
      '2026-08-01',
      '2026-08-31',
      new Date('2026-09-08T08:00:00+05:30'),
    );
    expect(projSkdCount(matrix, '2026-08-03', 'IX|B737-800')).toBe(1);
    expect(matrix.columns[0]?.airlineCode).toBe('IX');
  });

  it('clears Proj past a short template when the month has 31 days', () => {
    expect(projSkdClearUntilRow(28, 37)).toBeGreaterThanOrEqual(37);
    expect(projSkdClearUntilRow(31, 37)).toBeGreaterThanOrEqual(41);
  });

  it('splits Reco nets across same-airline aircraft columns', () => {
    expect(
      splitProjectedByAirlineColumns(
        [
          { airlineCode: 'UL' },
          { airlineCode: 'UL' },
          { airlineCode: 'EK' },
        ],
        [
          { airlineCode: 'UL', netCurrent: 59 },
          { airlineCode: 'UL', netCurrent: 1 },
          { airlineCode: 'EK', netCurrent: 59 },
        ],
      ),
    ).toEqual([30, 30, 59]);
  });

  it('maps MAA vs DEL sheet layouts', () => {
    expect(getProjSkdSheetLayout('maa').firstAirlineCol).toBe(3);
    expect(getProjSkdSheetLayout('del').firstAirlineCol).toBe(4);
    expect(excelColLetter(16)).toBe('P');
    expect(ymdForDay(2026, 7, 9)).toBe('2026-07-09');
  });
});
