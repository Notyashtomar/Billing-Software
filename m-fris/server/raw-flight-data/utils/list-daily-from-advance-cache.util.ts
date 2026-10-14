/**
 * In-memory cache for Scheduled Airlines daily list (by local from–to day).
 * Kept outside RawFlightDataService so FHR/auth can invalidate without importing
 * that service module (SWC circular TDZ on startup).
 */

const listDailyFromAdvanceCache = new Map<
  string,
  { expiresAt: number; payload: Array<{ data: Record<string, unknown> }> }
>();

export const LIST_DAILY_ADVANCE_CACHE_TTL_MS = 5 * 60 * 1000;
/** Hard cap — expired entries are swept on write; oldest evicted when over max. */
export const LIST_DAILY_ADVANCE_CACHE_MAX_ENTRIES = 8;

export function sweepListDailyFromAdvanceCache(nowMs = Date.now()): void {
  for (const [key, entry] of listDailyFromAdvanceCache) {
    if (entry.expiresAt <= nowMs) listDailyFromAdvanceCache.delete(key);
  }
  while (listDailyFromAdvanceCache.size > LIST_DAILY_ADVANCE_CACHE_MAX_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestExp = Infinity;
    for (const [key, entry] of listDailyFromAdvanceCache) {
      if (entry.expiresAt < oldestExp) {
        oldestExp = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    listDailyFromAdvanceCache.delete(oldestKey);
  }
}

/** Bust every station-day. Use when the write does not name a date. */
export function invalidateListDailyFromAdvanceCache(): void {
  listDailyFromAdvanceCache.clear();
}

function cacheKeyOverlapsStationDay(
  key: string,
  stationCode: string,
  days: readonly string[],
): boolean {
  const parts = key.split(':');
  if (parts.length < 3) return false;
  const to = parts.pop() ?? '';
  const from = parts.pop() ?? '';
  const station = parts.join(':');
  if (station !== stationCode) return false;
  return days.some((day) => day >= from && day <= to);
}

function parseCacheKey(
  key: string,
): { station: string; from: string; to: string } | null {
  const parts = key.split(':');
  if (parts.length < 3) return null;
  const to = parts.pop() ?? '';
  const from = parts.pop() ?? '';
  return { station: parts.join(':'), from, to };
}

/**
 * Drop cached windows for one station that include any of these yyyy-MM-dd days.
 * Other stations and other days stay cached.
 * No station or no days clears everything (unknown write).
 */
export function invalidateListDailyFromAdvanceCacheForStationDays(
  stationCode: string,
  days: Iterable<string>,
): void {
  const station = stationCode.trim().toUpperCase();
  const wanted = [...days]
    .map((day) => day.trim())
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  if (!station || wanted.length === 0) {
    listDailyFromAdvanceCache.clear();
    return;
  }
  for (const key of listDailyFromAdvanceCache.keys()) {
    if (cacheKeyOverlapsStationDay(key, station, wanted)) {
      listDailyFromAdvanceCache.delete(key);
    }
  }
}

/** Drop cached windows for one station that overlap [fromYmd, toYmd]. */
export function invalidateListDailyFromAdvanceCacheForStationRange(
  stationCode: string,
  fromYmd: string,
  toYmd: string,
): void {
  const station = stationCode.trim().toUpperCase();
  const from = fromYmd.trim();
  const to = toYmd.trim();
  if (!station || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    listDailyFromAdvanceCache.clear();
    return;
  }
  for (const key of listDailyFromAdvanceCache.keys()) {
    const parsed = parseCacheKey(key);
    if (!parsed || parsed.station !== station) continue;
    if (parsed.from <= to && parsed.to >= from) {
      listDailyFromAdvanceCache.delete(key);
    }
  }
}

export function getListDailyFromAdvanceCacheEntry(
  cacheKey: string,
): { expiresAt: number; payload: Array<{ data: Record<string, unknown> }> } | undefined {
  return listDailyFromAdvanceCache.get(cacheKey);
}

export function setListDailyFromAdvanceCacheEntry(
  cacheKey: string,
  entry: { expiresAt: number; payload: Array<{ data: Record<string, unknown> }> },
): void {
  listDailyFromAdvanceCache.set(cacheKey, entry);
}
