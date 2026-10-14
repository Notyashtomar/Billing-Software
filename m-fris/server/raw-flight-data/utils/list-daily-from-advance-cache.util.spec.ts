import {
  getListDailyFromAdvanceCacheEntry,
  invalidateListDailyFromAdvanceCache,
  invalidateListDailyFromAdvanceCacheForStationDays,
  invalidateListDailyFromAdvanceCacheForStationRange,
  setListDailyFromAdvanceCacheEntry,
} from './list-daily-from-advance-cache.util';

function put(key: string, marker: string) {
  setListDailyFromAdvanceCacheEntry(key, {
    expiresAt: Date.now() + 60_000,
    payload: [{ data: { marker } }],
  });
}

describe('scheduled airlines list cache', () => {
  beforeEach(() => {
    invalidateListDailyFromAdvanceCache();
  });

  it('keeps Chennai and other Delhi days when one Delhi day is saved', () => {
    put('DEL:2026-10-04:2026-10-04', 'delhi-4');
    put('DEL:2026-10-05:2026-10-05', 'delhi-5');
    put('DEL:2026-10-01:2026-10-07', 'delhi-week');
    put('MAA:2026-10-04:2026-10-04', 'chennai-4');

    invalidateListDailyFromAdvanceCacheForStationDays('DEL', ['2026-10-04']);

    expect(getListDailyFromAdvanceCacheEntry('DEL:2026-10-04:2026-10-04')).toBeUndefined();
    expect(getListDailyFromAdvanceCacheEntry('DEL:2026-10-01:2026-10-07')).toBeUndefined();
    expect(getListDailyFromAdvanceCacheEntry('DEL:2026-10-05:2026-10-05')?.payload[0].data.marker).toBe(
      'delhi-5',
    );
    expect(getListDailyFromAdvanceCacheEntry('MAA:2026-10-04:2026-10-04')?.payload[0].data.marker).toBe(
      'chennai-4',
    );
  });

  it('drops every cached window that overlaps a saved range', () => {
    put('DEL:2026-10-03:2026-10-03', 'before');
    put('DEL:2026-10-05:2026-10-05', 'inside');
    put('DEL:2026-10-09:2026-10-09', 'after');
    put('MAA:2026-10-05:2026-10-05', 'chennai');

    invalidateListDailyFromAdvanceCacheForStationRange('del', '2026-10-04', '2026-10-06');

    expect(getListDailyFromAdvanceCacheEntry('DEL:2026-10-05:2026-10-05')).toBeUndefined();
    expect(getListDailyFromAdvanceCacheEntry('DEL:2026-10-03:2026-10-03')?.payload[0].data.marker).toBe(
      'before',
    );
    expect(getListDailyFromAdvanceCacheEntry('DEL:2026-10-09:2026-10-09')?.payload[0].data.marker).toBe(
      'after',
    );
    expect(getListDailyFromAdvanceCacheEntry('MAA:2026-10-05:2026-10-05')?.payload[0].data.marker).toBe(
      'chennai',
    );
  });

  it('returns the stored payload without cloning it', () => {
    const payload = [{ data: { marker: 'same' } }];
    setListDailyFromAdvanceCacheEntry('DEL:2026-10-04:2026-10-04', {
      expiresAt: Date.now() + 60_000,
      payload,
    });
    expect(getListDailyFromAdvanceCacheEntry('DEL:2026-10-04:2026-10-04')?.payload).toBe(payload);
  });
});
