import {
  adsEffectiveMonthDateRange,
  effectiveMonthFromYmd,
  normalizeAdsEffectiveMonth,
  yearMonthFromDate,
} from './ads-effective-month.util';

describe('ads-effective-month.util', () => {
  it('defaults legacy months to June 2026', () => {
    expect(normalizeAdsEffectiveMonth(undefined)).toBe('2026-06');
    expect(normalizeAdsEffectiveMonth('')).toBe('2026-06');
    expect(normalizeAdsEffectiveMonth('2026-07')).toBe('2026-07');
  });

  it('builds UTC month boundaries', () => {
    const { validFrom, validTo } = adsEffectiveMonthDateRange('2026-06');
    expect(validFrom.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(validTo.getUTCMonth()).toBe(5);
    expect(validTo.getUTCDate()).toBe(30);
  });

  it('derives year-month from date', () => {
    expect(yearMonthFromDate(new Date('2026-07-15T12:00:00.000Z'))).toBe('2026-07');
  });

  it('derives effective month from YMD', () => {
    expect(effectiveMonthFromYmd('2026-07-15')).toBe('2026-07');
    expect(effectiveMonthFromYmd('15/07/2026')).toBeUndefined();
  });
});
