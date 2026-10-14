import { normalizeFhrFlightReportByLogicalSchema } from './fhr-flight-report-logical-type.schema';

describe('normalizeFhrFlightReportByLogicalSchema cleaning times', () => {
  it('preserves clock time from combined dd/mm/yyyy datetime strings', () => {
    const out = normalizeFhrFlightReportByLogicalSchema({
      cleaningFromTime: '15/04/2026 21:52',
      cleaningToTime: '15/04/2026 22:01',
    });

    expect(out.cleaningFromTime).toBe('15-04-2026 21:52');
    expect(out.cleaningToTime).toBe('15-04-2026 22:01');
  });
});

describe('normalizeFhrFlightReportByLogicalSchema IPOS / bag fields', () => {
  it('extracts IPOS time from combined datetime in date or time field', () => {
    const fromDateField = normalizeFhrFlightReportByLogicalSchema({
      iposDate: '03/08/2026 14:30',
      iposTime: '03/08/2026 14:30',
    });
    expect(fromDateField.iposDate).toBe('03-08-2026');
    expect(fromDateField.iposTime).toBe('14:30');

    const timeOnly = normalizeFhrFlightReportByLogicalSchema({
      iposTime: '9:05',
    });
    expect(timeOnly.iposTime).toBe('09:05');
  });

  it('converts Excel day-fraction numbers to HH:mm for TIME_24_HOURS', () => {
    // 0.5 day = 12:00
    const out = normalizeFhrFlightReportByLogicalSchema({
      iposTime: 0.5,
    });
    expect(out.iposTime).toBe('12:00');
  });

  it('keeps integer departure bag counts', () => {
    const out = normalizeFhrFlightReportByLogicalSchema({
      departureBag: '118',
    });
    expect(out.departureBag).toBe(118);
  });
});
