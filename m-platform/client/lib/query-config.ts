/** Shared TanStack Query v5 defaults for FRIS client apps. */

export const FRIS_QUERY_STALE_TIME_MS = 30_000;
export const FRIS_QUERY_GC_TIME_MS = 60_000;

/** Admin panels refresh more often — shorter stale window. */
export const ADMIN_QUERY_STALE_TIME_MS = 15_000;
export const ADMIN_QUERY_GC_TIME_MS = 60_000;

/** In-memory only. Do not persist FRIS query results to localStorage or sessionStorage. */
export const FRIS_QUERY_DEFAULTS = {
  staleTime: FRIS_QUERY_STALE_TIME_MS,
  gcTime: FRIS_QUERY_GC_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  retry: 1,
} as const;

export const ADMIN_QUERY_DEFAULTS = {
  staleTime: ADMIN_QUERY_STALE_TIME_MS,
  gcTime: ADMIN_QUERY_GC_TIME_MS,
  refetchOnWindowFocus: false,
  retry: 1,
} as const;
