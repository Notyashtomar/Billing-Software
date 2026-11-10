import {
  scheduledFlightBillingWindowYmd,
  scheduledFlightFhrDateMatch,
} from './billing-date.util';

describe('scheduledFlightFhrDateMatch', () => {
  const september = ['2026-09-01', '01/09/2026', '2026-09-23', '23/09/2026'];
  const widened = [...september, '2026-08-29', '29/08/2026'];

  it('includes the departure date when the bill is filtered on ATD', () => {
    const match = scheduledFlightFhrDateMatch('atd-date', widened, september);
    const clauses = match.$or as Array<Record<string, { $in: string[] }>>;
    const atd = clauses.find((clause) => clause['mainDetails.ATDDate']);
    expect(atd?.['mainDetails.ATDDate'].$in).toEqual(september);
    expect(atd?.['mainDetails.ATDDate'].$in).not.toContain('29/05/2026');
  });

  it('keeps a schedule-date bill on scheduled arrival only', () => {
    const match = scheduledFlightFhrDateMatch('schedule-date', september, september);
    const clauses = match.$or as Array<Record<string, unknown>>;
    expect(clauses.some((clause) => 'mainDetails.ATDDate' in clause)).toBe(false);
  });
});

describe('scheduledFlightBillingWindowYmd', () => {
  it('bills a long-stay flight on its September departure when the basis is ATD', () => {
    expect(
      scheduledFlightBillingWindowYmd(
        {},
        {
          atdYmd: '2026-09-23',
          staYmd: '2026-05-29',
          stdYmd: '2026-09-23',
          exportedYmd: null,
        },
        'atd-date',
      ),
    ).toBe('2026-09-23');
  });
});
