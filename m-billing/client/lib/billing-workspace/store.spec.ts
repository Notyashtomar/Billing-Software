import {
  bindBillingWorkspaceIdentity,
  getBillingWorkspacePageSlice,
  resetBillingWorkspace,
  setBillingWorkspacePageSlice,
} from './store';
import { createSourcePageWorkspaceSlice } from './slices';
import { BILLING_WORKSPACE_PAGE_KEYS } from './page-keys';

describe('billing workspace store', () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
    resetBillingWorkspace({ clearIdentity: true });
  });

  it('keeps slices for the same user+station across re-bind', () => {
    bindBillingWorkspaceIdentity({ userId: 'user-a', stationCode: 'MAA' });
    setBillingWorkspacePageSlice(
      BILLING_WORKSPACE_PAGE_KEYS.source('listAds'),
      createSourcePageWorkspaceSlice({
        from: '2026-07-01',
        to: '2026-07-31',
        dateBasis: 'schedule-date',
        searchSubmitted: true,
      }),
    );

    bindBillingWorkspaceIdentity({ userId: 'user-a', stationCode: 'MAA' });
    expect(
      getBillingWorkspacePageSlice<{ queryFrom: string }>(
        BILLING_WORKSPACE_PAGE_KEYS.source('listAds'),
      )?.queryFrom,
    ).toBe('2026-07-01');
  });

  it('does not leak slices across users or stations', () => {
    bindBillingWorkspaceIdentity({ userId: 'user-a', stationCode: 'MAA' });
    setBillingWorkspacePageSlice(
      BILLING_WORKSPACE_PAGE_KEYS.source('listAds'),
      createSourcePageWorkspaceSlice({
        from: '2026-07-01',
        to: '2026-07-31',
        dateBasis: 'schedule-date',
        searchSubmitted: true,
      }),
    );

    bindBillingWorkspaceIdentity({ userId: 'user-b', stationCode: 'MAA' });
    expect(
      getBillingWorkspacePageSlice(
        BILLING_WORKSPACE_PAGE_KEYS.source('listAds'),
      ),
    ).toBeUndefined();

    bindBillingWorkspaceIdentity({ userId: 'user-a', stationCode: 'DEL' });
    expect(
      getBillingWorkspacePageSlice(
        BILLING_WORKSPACE_PAGE_KEYS.source('listAds'),
      ),
    ).toBeUndefined();
  });

  it('clears pages on reset but keeps identity by default', () => {
    bindBillingWorkspaceIdentity({ userId: 'user-a', stationCode: 'DEL' });
    setBillingWorkspacePageSlice('masters.customers', { search: 'AI', selectedIds: [] });
    resetBillingWorkspace();
    expect(getBillingWorkspacePageSlice('masters.customers')).toBeUndefined();
    bindBillingWorkspaceIdentity({ userId: 'user-a', stationCode: 'DEL' });
    expect(getBillingWorkspacePageSlice('masters.customers')).toBeUndefined();
  });

  it('restores that user filters after the tab memory is cleared', () => {
    bindBillingWorkspaceIdentity({ userId: 'user-a', stationCode: 'DEL' });
    setBillingWorkspacePageSlice(
      BILLING_WORKSPACE_PAGE_KEYS.source('listScheduledFlights'),
      createSourcePageWorkspaceSlice({
        from: '2026-08-01',
        to: '2026-08-31',
        dateBasis: 'atd-date',
        searchSubmitted: true,
      }),
    );
    resetBillingWorkspace({ clearIdentity: true });
    expect(
      getBillingWorkspacePageSlice(
        BILLING_WORKSPACE_PAGE_KEYS.source('listScheduledFlights'),
      ),
    ).toBeUndefined();

    bindBillingWorkspaceIdentity({ userId: 'user-a', stationCode: 'DEL' });
    expect(
      getBillingWorkspacePageSlice<{ queryFrom: string; searchSubmitted: boolean }>(
        BILLING_WORKSPACE_PAGE_KEYS.source('listScheduledFlights'),
      ),
    ).toMatchObject({ queryFrom: '2026-08-01', searchSubmitted: true });

    bindBillingWorkspaceIdentity({ userId: 'user-b', stationCode: 'DEL' });
    expect(
      getBillingWorkspacePageSlice(
        BILLING_WORKSPACE_PAGE_KEYS.source('listScheduledFlights'),
      ),
    ).toBeUndefined();
  });
});
