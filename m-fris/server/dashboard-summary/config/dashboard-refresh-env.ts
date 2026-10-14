/**
 * Environment-driven dashboard refresh flags.
 * Defaults: read-only HTTP; rebuild via worker/CLI/cron only (all flags off).
 */

function bool(v: string | undefined, defaultTrue: boolean): boolean {
  if (v == null || v === '') return defaultTrue;
  return !['0', 'false', 'no', 'off'].includes(v.toLowerCase());
}

function posInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function readDashboardRefreshEnv(): {
  eventRefreshEnabled: boolean;
  swrEnabled: boolean;
  backgroundRefresh: boolean;
  refreshConcurrency: number;
  dailyAggregateConcurrency: number;
  staleTtlMs: number;
  safetySweepCron: boolean;
} {
  const staleMinutes = Number(process.env.DASHBOARD_STALE_TTL_MINUTES);
  const ttlFromLegacy = Number(process.env.DASHBOARD_SUMMARY_TTL_MS);
  const staleTtlMs =
    Number.isFinite(staleMinutes) && staleMinutes > 0
      ? staleMinutes * 60_000
      : Number.isFinite(ttlFromLegacy) && ttlFromLegacy > 0
        ? ttlFromLegacy
        : 15 * 60_000;

  return {
    eventRefreshEnabled: bool(process.env.DASHBOARD_EVENT_REFRESH_ENABLED, false),
    swrEnabled: bool(process.env.DASHBOARD_SWR_ENABLED, false),
    backgroundRefresh: bool(process.env.DASHBOARD_BACKGROUND_REFRESH, false),
    refreshConcurrency: posInt(process.env.DASHBOARD_REFRESH_CONCURRENCY, 4),
    /** Caps parallel per-day aggregate regeneration inside a single card merge. */
    dailyAggregateConcurrency: posInt(
      process.env.DASHBOARD_DAILY_AGGREGATE_CONCURRENCY,
      4,
    ),
    staleTtlMs,
    safetySweepCron: bool(process.env.DASHBOARD_SAFETY_SWEEP_ENABLED, false),
  };
}

export function readDashboardStartupWarmEnv(): {
  enabled: boolean;
  /** Milliseconds to wait after bootstrap before beginning Phase 1. */
  delayMs: number;
  /** Max parallel warm jobs (separate from event-refresh concurrency). */
  concurrency: number;
  /** Abort a single warm job if it takes longer than this. */
  timeoutMs: number;
  /** Milliseconds between Phase 1 completion and Phase 2 start. */
  phase2DelayMs: number;
  /** Milliseconds between Phase 2 completion and Phase 3 start. */
  phase3DelayMs: number;
} {
  return {
    enabled: bool(process.env.DASHBOARD_STARTUP_WARM_ENABLED, false),
    delayMs: posInt(process.env.DASHBOARD_STARTUP_WARM_DELAY_MS, 15_000),
    concurrency: posInt(process.env.DASHBOARD_STARTUP_WARM_CONCURRENCY, 2),
    timeoutMs: posInt(process.env.DASHBOARD_STARTUP_WARM_TIMEOUT_MS, 120_000),
    phase2DelayMs: posInt(process.env.DASHBOARD_STARTUP_WARM_PHASE2_DELAY_MS, 5_000),
    phase3DelayMs: posInt(process.env.DASHBOARD_STARTUP_WARM_PHASE3_DELAY_MS, 10_000),
  };
}
