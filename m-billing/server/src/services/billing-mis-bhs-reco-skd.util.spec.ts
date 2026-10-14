import {
  buildRecoSkdMatrix,
  extraDaysAfter28,
  recoSkdClearUntilRow,
  isClosedRecoFlight,
  isoWeekdayMon1,
  isFhrCoreFormsFilled,
  mapFhrCollectionDocToRecoFlights,
  previousCalendarMonth,
} from './billing-mis-bhs-reco-skd.util';

describe('billing-mis-bhs-reco-skd.util', () => {
  it('clears Reco past template when a station has more rows', () => {
    expect(recoSkdClearUntilRow(16, 25)).toBeGreaterThanOrEqual(25);
    expect(recoSkdClearUntilRow(40, 25)).toBeGreaterThanOrEqual(58);
    expect(recoSkdClearUntilRow(0, 0)).toBeGreaterThanOrEqual(40);
  });

  it('maps extra days after the 28th to ISO weekdays', () => {
    const extras = extraDaysAfter28(2026, 8);
    expect(extras.map((d) => [d.ymd, d.weekday])).toEqual([
      ['2026-08-29', 6],
      ['2026-08-30', 7],
      ['2026-08-31', 1],
    ]);
    expect(isoWeekdayMon1('2026-05-29')).toBe(5);
  });

  it('builds one row per airline + flight from schedule, closed only', () => {
    const masters = [
      {
        data: {
          active: true,
          airlineCode: 'IX',
          flightNo: 'IX1686/IX1062',
          validFrom: '01/07/2026',
          validTo: '30/09/2026',
          staTime: '06:05',
          stdTime: '06:40',
          scheduleDays: {
            Mon: true,
            Tue: true,
            Wed: true,
            Thu: true,
            Fri: true,
            Sat: true,
            Sun: true,
          },
        },
      },
      {
        data: {
          active: true,
          airlineCode: 'IX',
          flightNo: 'IX1236',
          validFrom: '01/08/2026',
          validTo: '31/08/2026',
          staTime: '12:20',
          stdTime: '12:50',
          scheduleDays: { Tue: true },
        },
      },
    ];

    const current = [
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-03', flightStatus: 'Closed' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-04', flightStatus: 'Closed' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-05', flightStatus: 'Closed' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-06', flightStatus: 'Closed' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-07', flightStatus: 'Closed' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-08', flightStatus: 'Closed' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-09', flightStatus: 'Closed' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-10', flightStatus: 'Open' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-08-29', flightStatus: 'Closed' },
      { flightNo: 'IX1236', customerCode: 'IX', scheduleDate: '2026-08-04', flightStatus: 'Closed' },
      { flightNo: 'SKP01', customerCode: 'SKP', scheduleDate: '2026-08-03', flightStatus: 'Closed' },
    ];
    const last = [
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-07-06', flightStatus: 'Closed' },
      { flightNo: 'IX1686', customerCode: 'IX', scheduleDate: '2026-07-29', flightStatus: 'Closed' },
    ];

    const matrix = buildRecoSkdMatrix(masters, current, last, '2026-08-01', '2026-08-31');
    expect(matrix.rows).toHaveLength(2);
    const daily = matrix.rows.find((r) => r.flightNo.includes('1686'));
    const tueOnly = matrix.rows.find((r) => r.flightNo.includes('1236'));
    expect(daily?.weekdayCounts).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(daily?.weeklyTotal).toBe(7);
    expect(daily?.completedWeeks).toBe(7);
    expect(daily?.extraCounts).toEqual([1, 0, 0]);
    expect(daily?.netCurrent).toBe(8);
    expect(daily?.netLast).toBe(2);
    expect(tueOnly?.weekdayCounts[1]).toBe(1);
    expect(tueOnly?.weeklyTotal).toBe(1);
    expect(isClosedRecoFlight({ flightStatus: 'Open' })).toBe(false);
  });

  it('treats FHR with core forms as Closed even when flightStatus is empty', () => {
    const doc = {
      staDates: ['03/08/2026'],
      mainDetails: { ArrivalFltNo: 'LH758', DepartureFltNo: 'LH759', Arline_Code: 'LH' },
      terminalDetails: { STADate: '03/08/2026' },
      rampDetails1: { STADate: '03/08/2026' },
      loadControlDetails: { SerialNo: 1 },
    };
    expect(isFhrCoreFormsFilled(doc)).toBe(true);
    const mapped = mapFhrCollectionDocToRecoFlights(doc);
    expect(mapped[0]?.flightStatus).toBe('Closed');
    expect(isClosedRecoFlight(mapped[0]!)).toBe(true);
  });

  it('maps fhr_collection arrival/departure + STA into a reco flight', () => {
    const mapped = mapFhrCollectionDocToRecoFlights({
      staDates: ['03/08/2026'],
      mainDetails: {
        ArrivalFltNo: 'IX1089',
        DepartureFltNo: 'IX1685',
        Arline_Code: 'IX',
        flightStatus: 'Closed',
      },
      terminalDetails: { STADate: '03/08/2026' },
      rampDetails1: {},
      loadControlDetails: {},
    });
    expect(mapped).toEqual([
      {
        flightNo: 'IX1089/IX1685',
        customerCode: 'IX',
        scheduleDate: '2026-08-03',
        cancelled: false,
        flightStatus: 'Closed',
      },
    ]);
  });

  it('builds reco rows from FHR when Advance masters miss the month', () => {
    const expiredMasters = [
      {
        data: {
          active: true,
          airlineCode: 'IX',
          flightNo: 'IX1168/IX2662',
          validFrom: '01/06/2026',
          validTo: '30/06/2026',
          scheduleDays: {
            Mon: true,
            Tue: true,
            Wed: true,
            Thu: true,
            Fri: true,
            Sat: true,
            Sun: true,
          },
        },
      },
    ];
    const current = [
      {
        flightNo: 'IX1168/IX2662',
        customerCode: 'IX',
        scheduleDate: '2026-08-03',
        flightStatus: 'Closed',
      },
      {
        flightNo: 'IX1168/IX2662',
        customerCode: 'IX',
        scheduleDate: '2026-08-04',
        flightStatus: 'Closed',
      },
      {
        flightNo: '6E1234',
        customerCode: '6E',
        scheduleDate: '2026-08-05',
        flightStatus: 'Closed',
      },
    ];

    const matrix = buildRecoSkdMatrix(
      expiredMasters,
      current,
      [],
      '2026-08-01',
      '2026-08-31',
    );
    expect(matrix.rows.length).toBeGreaterThanOrEqual(2);
    expect(matrix.weeklyCurrent).toBeGreaterThan(0);
    expect(matrix.rows.some((row) => row.flightNo.includes('1168'))).toBe(true);
  });

  it('includes MAA season masters whose Valid To ended before the export month', () => {
    const masters = [
      {
        data: {
          active: true,
          airlineCode: 'UL',
          flightNo: 'UL530/UL531',
          seasonKey: 'summer-2026',
          validFrom: '01/04/2026',
          validTo: '30/04/2026',
          scheduleDays: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: true },
        },
      },
    ];
    const current = [
      { flightNo: 'UL530', customerCode: 'UL', scheduleDate: '2026-08-03', flightStatus: 'Closed' },
    ];
    const matrix = buildRecoSkdMatrix(masters, current, [], '2026-08-01', '2026-08-31');
    expect(matrix.rows.some((r) => r.airlineCode === 'UL' && r.flightNo.includes('530'))).toBe(true);
  });

  it('counts each Closed FHR day once and does not multiply by 4 weeks', () => {
    const masters = [
      {
        data: {
          active: true,
          airlineCode: 'LH',
          flightNo: 'LH758/LH759',
          validFrom: '01/08/2026',
          validTo: '31/08/2026',
          scheduleDays: {
            Mon: true,
            Tue: true,
            Wed: true,
            Thu: true,
            Fri: true,
            Sat: true,
            Sun: true,
          },
        },
      },
    ];
    const current = [
      { flightNo: 'LH758/LH759', customerCode: 'LH', scheduleDate: '2026-08-03', flightStatus: 'Closed' },
      { flightNo: 'LH758/LH759', customerCode: 'LH', scheduleDate: '2026-08-10', flightStatus: 'Closed' },
      { flightNo: 'LH758/LH759', customerCode: 'LH', scheduleDate: '2026-08-17', flightStatus: 'Closed' },
      { flightNo: 'LH758/LH759', customerCode: 'LH', scheduleDate: '2026-08-24', flightStatus: 'Closed' },
      { flightNo: 'LH758/LH759', customerCode: 'LH', scheduleDate: '2026-08-04', flightStatus: 'Closed' },
      { flightNo: 'LH758/LH759', customerCode: 'LH', scheduleDate: '2026-08-29', flightStatus: 'Closed' },
      { flightNo: 'LH758/LH759', customerCode: 'LH', scheduleDate: '2026-08-05', flightStatus: 'Open' },
      { flightNo: 'LH758/LH759', customerCode: 'LH', scheduleDate: '2026-08-03', flightStatus: 'Closed' },
    ];
    const matrix = buildRecoSkdMatrix(masters, current, [], '2026-08-01', '2026-08-31');
    const lh = matrix.rows.find((r) => r.airlineCode === 'LH');
    expect(lh?.weekdayCounts[0]).toBe(4);
    expect(lh?.weekdayCounts[1]).toBe(1);
    expect(lh?.extraCounts[0]).toBe(1);
    expect(lh?.weeklyTotal).toBe(5);
    expect(lh?.netCurrent).toBe(6);
    expect(lh?.completedWeeks).toBe(5);
  });

  it('computes previous calendar month bounds', () => {
    expect(previousCalendarMonth('2026-08-01')).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });
});
