import { BILLING_QUERY_DEFAULTS } from '../../../../m-billing/client/lib/billing-workspace/query-config';
import { billingQueryKey } from '../../../../m-billing/client/lib/billing-workspace/query-keys';
import { frisQueryKeys } from './fris-query-keys';

describe('station scoped query keys', () => {
  it('keeps Delhi and Chennai billing lists apart', () => {
    const delhi = billingQueryKey(
      { userId: 'u1', stationCode: 'DEL' },
      'review-queue',
    );
    const chennai = billingQueryKey(
      { userId: 'u1', stationCode: 'MAA' },
      'review-queue',
    );
    expect(delhi).not.toEqual(chennai);
    expect(delhi[2]).toBe('DEL');
    expect(chennai[2]).toBe('MAA');
  });

  it('keeps Delhi and Chennai scheduled-flight queries apart', () => {
    const delhi = frisQueryKeys.dailyScheduledFlights('DEL', '04/10/2026', '04/10/2026');
    const chennai = frisQueryKeys.dailyScheduledFlights('MAA', '04/10/2026', '04/10/2026');
    expect(delhi).not.toEqual(chennai);
    expect(delhi[1]).toBe('DEL');
    expect(chennai[1]).toBe('MAA');
  });

  it('refetches billing on mount only after the result is stale', () => {
    expect(BILLING_QUERY_DEFAULTS.refetchOnMount).toBe(true);
  });
});
