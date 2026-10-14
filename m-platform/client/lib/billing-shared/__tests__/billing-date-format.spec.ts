import {
  formatBillingDate,
  formatBillingDateRange,
  toBillingIsoDate,
} from '../billing-date-format';

describe('billing-date-format', () => {
  it('formats ISO dates as dd-mm-yyyy for display', () => {
    expect(formatBillingDate('2026-06-01')).toBe('01-06-2026');
    expect(formatBillingDate('2026-06-01T00:00:00.000Z')).toBe('01-06-2026');
    expect(formatBillingDate('')).toBe('—');
    expect(formatBillingDate(null)).toBe('—');
  });

  it('formats ranges for tables and headers', () => {
    expect(formatBillingDateRange('2026-06-01', '2027-05-31')).toBe('01-06-2026 → 31-05-2027');
    expect(formatBillingDateRange('2026-06-01', '2099-12-31', { openEndedTo: true })).toBe(
      '01-06-2026 → Open',
    );
    expect(formatBillingDateRange('2026-08-01', '2026-08-31')).toBe('01-08-2026 → 31-08-2026');
  });

  it('parses display dates back to ISO for API wire format', () => {
    expect(toBillingIsoDate('01/06/2026')).toBe('2026-06-01');
    expect(toBillingIsoDate('01-06-2026')).toBe('2026-06-01');
    expect(toBillingIsoDate('2026-06-01')).toBe('2026-06-01');
  });
});
