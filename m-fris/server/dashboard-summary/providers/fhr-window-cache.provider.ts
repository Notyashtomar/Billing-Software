/**
 * Abstraction over the FHR STA-window row cache.
 *
 * The current implementation delegates to {@link FhrCollectionService}'s
 * in-process Map cache.  Replace with a Redis-backed adapter here to
 * distribute warm state across horizontal replicas without changing callers.
 */
export interface FhrWindowCacheProvider {
  /**
   * Trigger a cache pre-warm for the given dd/MM/yyyy date strings.
   * Implementations may fire-and-forget the underlying load.
   */
  prewarm(dateStrings: string[]): Promise<void>;

  /**
   * Invalidate cache entries for the given date strings (or all if omitted).
   */
  invalidate(dateStrings?: string[]): void;
}

export const FHR_WINDOW_CACHE_PROVIDER = Symbol('FHR_WINDOW_CACHE_PROVIDER');
