import {
  listCalendarMonthsInRange,
  monthBoundsFromYmd,
  monthSheetName,
  monthWiseExportFileName,
  stationWiseExportFileName,
  addDaysYmd,
  ymdRangeToDdMmYyyyList,
  ymdToDdMmYyyy,
  ymdToExcelSerial,
} from './station-wise-months.util';

describe('station-wise-months.util', () => {
  it('clips calendar months to the selected range', () => {
    const months = listCalendarMonthsInRange('2026-01-15', '2026-04-10');
    expect(months.map((m) => m.sheetName)).toEqual([
      'JAN26',
      'FEB26',
      'MAR26',
      'APR26',
    ]);
    expect(months[0]).toMatchObject({
      from: '2026-01-15',
      to: '2026-01-31',
    });
    expect(months[1]).toMatchObject({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(months[3]).toMatchObject({
      from: '2026-04-01',
      to: '2026-04-10',
    });
  });

  it('names sheets JAN26 style', () => {
    expect(monthSheetName(2026, 0)).toBe('JAN26');
    expect(monthSheetName(2025, 11)).toBe('DEC25');
    expect(monthBoundsFromYmd('2026-07-20')).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      label: 'July 2026',
    });
  });

  it('shifts YYYY-MM-DD across month bounds', () => {
    expect(addDaysYmd('2026-08-01', -1)).toBe('2026-07-31');
    expect(addDaysYmd('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('builds inclusive dd/MM/yyyy lists', () => {
    expect(ymdToDdMmYyyy('2026-01-05')).toBe('05/01/2026');
    expect(ymdRangeToDdMmYyyyList('2026-01-30', '2026-02-01')).toEqual([
      '30/01/2026',
      '31/01/2026',
      '01/02/2026',
    ]);
    expect(ymdToExcelSerial('2026-01-01')).toBe(46023);
  });

  it('names a single-month download with SCH/NS scope', () => {
    expect(stationWiseExportFileName('MAA', '2026-08-01', '2026-08-31')).toBe(
      'MAA_SCH_MONTHWISE_AUGUST-26.xlsx',
    );
    expect(
      stationWiseExportFileName('maa', '2026-08-15', '2026-08-20', 'nonScheduled'),
    ).toBe('NON-SKED_MIS_MONTHWISE_AUGUST-26.xlsx');
  });

  it('names a multi-month download with SCH/NS scope', () => {
    expect(stationWiseExportFileName('MAA', '2026-04-01', '2026-08-31')).toBe(
      'MAA_SCH_APRIL_TO_AUGUST-26.xlsx',
    );
    expect(
      stationWiseExportFileName('MAA', '2025-12-01', '2026-02-10', 'nonScheduled'),
    ).toBe('NON-SKED_MIS_DECEMBER-25_TO_FEBRUARY-26.xlsx');
  });

  it('names month-wise download STN_AIRLINEWISE_YEAR', () => {
    expect(monthWiseExportFileName('MAA', '2026-08-01', '2026-08-31')).toBe(
      'MAA_AIRLINEWISE_2026.xlsx',
    );
    expect(
      monthWiseExportFileName('maa', '2026-01-01', '2026-12-31', 'nonScheduled'),
    ).toBe('MAA_NON-SKED_AIRLINEWISE_2026.xlsx');
  });
});
