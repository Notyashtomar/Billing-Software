/** TanStack Query defaults for Billing only — never share with FRIS/Admin clients. */

export const BILLING_QUERY_STALE_TIME_MS = 15_000;
export const BILLING_QUERY_GC_TIME_MS = 60_000;

/**
 * Remount uses the in-memory result while it is still fresh.
 * After staleTime, or after a save calls invalidateQueries, the list refetches.
 * Never persist this cache to localStorage or sessionStorage.
 */
export const BILLING_QUERY_DEFAULTS = {
  staleTime: BILLING_QUERY_STALE_TIME_MS,
  gcTime: BILLING_QUERY_GC_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: true as const,
  retry: 1,
};
