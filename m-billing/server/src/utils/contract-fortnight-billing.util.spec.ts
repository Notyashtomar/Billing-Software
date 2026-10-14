import {
  extractPreparationFlightYmd,
  fortnightExchangeRateForBillingPeriod,
  normalizeContractFortnightBillingConfig,
  resolveFortnightPartForFlights,
  resolveFortnightPartRangeForMonth,
} from './contract-fortnight-billing.util';

describe('contract fortnight billing util', () => {
  it('normalizes valid contiguous ranges', () => {
    const normalized = normalizeContractFortnightBillingConfig({
      enabled: true,
      partCount: 4,
      ranges: [
        { startDay: 11, endDay: 16, exchangeRatePerUsd: 83.2 },
        { startDay: 1, endDay: 10, exchangeRatePerUsd: 83.1 },
        { startDay: 17, endDay: 22, exchangeRatePerUsd: 83.3 },
        { startDay: 23, endDay: 31, exchangeRatePerUsd: 83.4 },
      ],
    });
    expect(normalized.enabled).toBe(true);
    expect(normalized.partCount).toBe(4);
    expect(normalized.ranges).toEqual([
      { startDay: 1, endDay: 10, exchangeRatePerUsd: 83.1 },
      { startDay: 11, endDay: 16, exchangeRatePerUsd: 83.2 },
      { startDay: 17, endDay: 22, exchangeRatePerUsd: 83.3 },
      { startDay: 23, endDay: 31, exchangeRatePerUsd: 83.4 },
    ]);
  });

  it('keeps day ranges when a part has no standing exchange rate', () => {
    const normalized = normalizeContractFortnightBillingConfig({
      enabled: true,
      partCount: 2,
      ranges: [
        { startDay: 1, endDay: 15, exchangeRatePerUsd: 84 },
        { startDay: 16, endDay: 31 },
      ],
    });
    expect(normalized.ranges?.[1]).toEqual({ startDay: 16, endDay: 31 });
  });

  it('uses a saved August rate only in August', () => {
    const contract = {
      enabled: true,
      partCount: 2,
      ranges: [
        { startDay: 1, endDay: 15, exchangeRatePerUsd: 84.25 },
        { startDay: 16, endDay: 31, exchangeRatePerUsd: 85.1 },
      ],
    };
    expect(fortnightExchangeRateForBillingPeriod(contract, '2026-08-01', '2026-08-15')).toBe(84.25);
    expect(fortnightExchangeRateForBillingPeriod(contract, '2026-09-01', '2026-09-15')).toBeNull();
  });

  it('uses the ROE saved for that month', () => {
    const contract = {
      enabled: true,
      partCount: 2,
      ranges: [
        { startDay: 1, endDay: 15 },
        { startDay: 16, endDay: 31 },
      ],
      monthRates: [
        {
          month: '2026-09',
          parts: [
            { startDay: 1, exchangeRatePerUsd: 86.1 },
            { startDay: 16, exchangeRatePerUsd: 86.4 },
          ],
        },
      ],
    };
    expect(fortnightExchangeRateForBillingPeriod(contract, '2026-09-16', '2026-09-30')).toBe(86.4);
    expect(fortnightExchangeRateForBillingPeriod(contract, '2026-08-16', '2026-08-31')).toBeNull();
  });

  it('returns the part rate for that invoice window', () => {
    const contract = {
      enabled: true,
      partCount: 2,
      ranges: [
        { startDay: 1, endDay: 15, exchangeRatePerUsd: 84.25 },
        { startDay: 16, endDay: 31, exchangeRatePerUsd: 85.1 },
      ],
    };
    expect(
      fortnightExchangeRateForBillingPeriod(contract, '2026-08-01', '2026-08-15'),
    ).toBe(84.25);
    expect(
      fortnightExchangeRateForBillingPeriod(contract, '2026-08-16T00:00:00.000Z', '2026-08-31'),
    ).toBe(85.1);
  });

  it('rejects overlapping ranges', () => {
    expect(() =>
      normalizeContractFortnightBillingConfig({
        enabled: true,
        partCount: 2,
        ranges: [
          { startDay: 1, endDay: 20, exchangeRatePerUsd: 80 },
          { startDay: 15, endDay: 31, exchangeRatePerUsd: 81 },
        ],
      }),
    ).toThrow(/overlap/i);
  });

  it('rejects gaps', () => {
    expect(() =>
      normalizeContractFortnightBillingConfig({
        enabled: true,
        partCount: 2,
        ranges: [
          { startDay: 1, endDay: 10, exchangeRatePerUsd: 80 },
          { startDay: 12, endDay: 31, exchangeRatePerUsd: 81 },
        ],
      }),
    ).toThrow(/gaps/i);
  });

  it('places a flight by ATA, ignoring STA', () => {
    expect(
      extractPreparationFlightYmd({
        sourceRef: { staDate: '2026-08-14' },
        operationalSnapshot: { ataDate: '2026-08-16' },
      }),
    ).toBe('2026-08-16');
    expect(
      extractPreparationFlightYmd({
        operationalSnapshot: { ATADate: '2026-08-22T18:40:00.000Z', staDate: '2026-08-01' },
      }),
    ).toBe('2026-08-22');
    expect(
      extractPreparationFlightYmd({
        sourceRef: { staDate: '2026-08-14' },
      }),
    ).toBeNull();
  });

  it('accepts a closing part that ends on a 30-day month', () => {
    const normalized = normalizeContractFortnightBillingConfig({
      enabled: true,
      partCount: 2,
      ranges: [
        { startDay: 1, endDay: 15 },
        { startDay: 16, endDay: 30 },
      ],
      monthRates: [
        {
          month: '2026-09',
          parts: [
            { startDay: 1, exchangeRatePerUsd: 86 },
            { startDay: 16, exchangeRatePerUsd: 86.4 },
          ],
        },
        {
          month: '2026-08',
          parts: [
            { startDay: 1, exchangeRatePerUsd: 84 },
            { startDay: 16, exchangeRatePerUsd: 84.5 },
          ],
        },
      ],
    });
    expect(normalized.ranges?.[1].endDay).toBe(30);
    const september = resolveFortnightPartForFlights(
      { ...normalized, enabled: true },
      ['2026-09-30'],
    );
    expect(september?.end.toISOString().slice(0, 10)).toBe('2026-09-30');
    const august = resolveFortnightPartForFlights(
      { ...normalized, enabled: true },
      ['2026-08-31'],
    );
    expect(august?.start.toISOString().slice(0, 10)).toBe('2026-08-16');
    expect(august?.end.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('clamps month end for short months', () => {
    const range = resolveFortnightPartRangeForMonth('2026-02-01', {
      startDay: 23,
      endDay: 31,
    });
    expect(range.start.toISOString().slice(0, 10)).toBe('2026-02-23');
    expect(range.end.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('caps the 1st onto the previous month last part and the month-end onto the next first part', () => {
    const contract = {
      enabled: true,
      edgeDayCap: true,
      partCount: 2,
      ranges: [
        { startDay: 1, endDay: 15 },
        { startDay: 16, endDay: 31 },
      ],
      monthRates: [
        {
          month: '2026-08',
          parts: [
            { startDay: 1, exchangeRatePerUsd: 84 },
            { startDay: 16, exchangeRatePerUsd: 85 },
          ],
        },
        {
          month: '2026-09',
          parts: [
            { startDay: 1, exchangeRatePerUsd: 86 },
            { startDay: 16, exchangeRatePerUsd: 87 },
          ],
        },
      ],
    };
    const septemberFirst = resolveFortnightPartForFlights(contract, ['2026-09-01']);
    expect(septemberFirst?.start.toISOString().slice(0, 10)).toBe('2026-08-16');
    expect(septemberFirst?.end.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(septemberFirst?.exchangeRatePerUsd).toBe(85);
    const augustLast = resolveFortnightPartForFlights(contract, ['2026-08-31']);
    expect(augustLast?.start.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(augustLast?.end.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(augustLast?.exchangeRatePerUsd).toBe(86);
  });

  it('keeps the part rate that matches ATA when regenerating', () => {
    const contract = {
      enabled: true,
      partCount: 2,
      ranges: [
        { startDay: 1, endDay: 15, exchangeRatePerUsd: 95.4263 },
        { startDay: 16, endDay: 31, exchangeRatePerUsd: 95.4509 },
      ],
    };
    const part2 = resolveFortnightPartForFlights(contract, ['2026-08-18']);
    expect(part2?.exchangeRatePerUsd).toBe(95.4509);
    expect(part2?.start.toISOString().slice(0, 10)).toBe('2026-08-16');
    const part1 = resolveFortnightPartForFlights(contract, ['2026-08-01', '2026-08-15']);
    expect(part1?.exchangeRatePerUsd).toBe(95.4263);
  });
});
