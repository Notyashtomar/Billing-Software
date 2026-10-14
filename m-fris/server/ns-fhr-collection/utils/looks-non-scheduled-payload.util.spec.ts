import { looksNonScheduledFhrPayload } from './looks-non-scheduled-payload.util';

describe('looksNonScheduledFhrPayload', () => {
  it('detects TypeofHandling Non-Scheduled when ops is Turnaround', () => {
    expect(
      looksNonScheduledFhrPayload({
        mainDetails: {
          Typeofflight: 'Turnaround',
          TypeofHandling: 'Non-Scheduled',
        },
      }),
    ).toBe(true);
  });

  it('detects NS booking / challan numbers', () => {
    expect(
      looksNonScheduledFhrPayload({
        mainDetails: {
          Typeofflight: 'Turnaround',
          bookingNo: 'IXC/BKG/000097/20-09-2026/SKP/VT-OSH',
        },
      }),
    ).toBe(true);
  });

  it('does not treat leftover SCH booking stamps as NS', () => {
    expect(
      looksNonScheduledFhrPayload({
        mainDetails: { TypeofHandling: 'SCH', bookingNo: 'SG-1' },
      }),
    ).toBe(false);
  });
});
