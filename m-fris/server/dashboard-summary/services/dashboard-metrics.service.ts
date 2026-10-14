import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DashboardMetricsService {
  private readonly logger = new Logger(DashboardMetricsService.name);

  // ---- refresh ----
  private refreshTotal = 0;
  private refreshFailed = 0;
  private refreshDurationMsTotal = 0;

  // ---- cache ----
  private cacheHits = 0;
  private cacheStaleHits = 0;
  private cacheMisses = 0;

  // ---- startup warm ----
  private startupWarmTotal = 0;
  private startupWarmCompleted = 0;
  private startupWarmSkippedFresh = 0;
  private startupWarmFailed = 0;
  private startupWarmDurationMsTotal = 0;

  // ---- refresh ----

  recordRefreshComplete(durationMs: number): void {
    this.refreshTotal += 1;
    this.refreshDurationMsTotal += durationMs;
  }

  recordRefreshFailed(reason: string, meta?: Record<string, string>): void {
    this.refreshFailed += 1;
    const parts = meta
      ? Object.entries(meta)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')
      : '';
    this.logger.warn(
      `[dashboard_metrics] refresh_failed reason=${reason}${parts ? ` ${parts}` : ''}`,
    );
  }

  /** Served from persisted card / aggregate row (includes stale-while-revalidate hits). */
  recordServedFromCache(servedStale: boolean): void {
    this.cacheHits += 1;
    if (servedStale) this.cacheStaleHits += 1;
  }

  recordServedMiss(): void {
    this.cacheMisses += 1;
  }

  // ---- startup warm ----

  recordStartupWarmEnqueued(): void {
    this.startupWarmTotal += 1;
  }

  recordStartupWarmCompleted(durationMs: number): void {
    this.startupWarmCompleted += 1;
    this.startupWarmDurationMsTotal += durationMs;
  }

  recordStartupWarmSkippedFresh(): void {
    this.startupWarmSkippedFresh += 1;
  }

  recordStartupWarmFailed(): void {
    this.startupWarmFailed += 1;
  }

  // ---- snapshot ----

  snapshot(): {
    dashboard_refresh_total: number;
    dashboard_refresh_failed: number;
    dashboard_refresh_duration_avg_ms: number;
    dashboard_cache_hits: number;
    dashboard_cache_stale_hits: number;
    dashboard_cache_misses: number;
    dashboard_startup_warm_total: number;
    dashboard_startup_warm_completed: number;
    dashboard_startup_warm_skipped_fresh: number;
    dashboard_startup_warm_failed: number;
    dashboard_startup_warm_duration_avg_ms: number;
  } {
    return {
      dashboard_refresh_total: this.refreshTotal,
      dashboard_refresh_failed: this.refreshFailed,
      dashboard_refresh_duration_avg_ms:
        this.refreshTotal > 0
          ? Math.round(this.refreshDurationMsTotal / this.refreshTotal)
          : 0,
      dashboard_cache_hits: this.cacheHits,
      dashboard_cache_stale_hits: this.cacheStaleHits,
      dashboard_cache_misses: this.cacheMisses,
      dashboard_startup_warm_total: this.startupWarmTotal,
      dashboard_startup_warm_completed: this.startupWarmCompleted,
      dashboard_startup_warm_skipped_fresh: this.startupWarmSkippedFresh,
      dashboard_startup_warm_failed: this.startupWarmFailed,
      dashboard_startup_warm_duration_avg_ms:
        this.startupWarmCompleted > 0
          ? Math.round(this.startupWarmDurationMsTotal / this.startupWarmCompleted)
          : 0,
    };
  }
}
