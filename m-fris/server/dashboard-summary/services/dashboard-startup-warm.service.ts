import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AdminStationsService } from 'src/admin-stations/services/admin-stations.service';
import { fixedStationScope } from 'src/common/station/station-scope';
import { readDashboardRefreshEnv, readDashboardStartupWarmEnv } from '../config/dashboard-refresh-env';
import {
  buildWarmRangeContext,
  STARTUP_WARM_PHASES,
  type WarmPhaseSpec,
  type WarmRange,
} from '../registry/dashboard-startup-warm.registry';
import type { WarmPhase as PhaseSpec } from './dashboard-warm-state.service';
import { DashboardRefreshQueueService } from './dashboard-refresh-queue.service';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { DashboardWarmStateService } from './dashboard-warm-state.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import type { DashboardEquipmentMode } from '../interfaces';
import {
  FHR_WINDOW_CACHE_PROVIDER,
  type FhrWindowCacheProvider,
} from '../providers/fhr-window-cache.provider';
import { ymdToDdMmYyyy, expandYmdInRanges } from '../utils/dashboard-range.util';

const YIELD_MS = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Phased warmup — enqueues LOW-priority summary refresh jobs only when not fresh.
 */
@Injectable()
export class DashboardStartupWarmService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DashboardStartupWarmService.name);

  private readonly enabled: boolean;
  private readonly delayMs: number;
  private readonly phase2DelayMs: number;
  private readonly phase3DelayMs: number;
  private readonly staleTtlMs: number;

  constructor(
    private readonly dashboardSummaryService: DashboardSummaryService,
    private readonly refreshQueue: DashboardRefreshQueueService,
    private readonly metrics: DashboardMetricsService,
    private readonly warmState: DashboardWarmStateService,
    private readonly adminStationsService: AdminStationsService,
    @Inject(FHR_WINDOW_CACHE_PROVIDER)
    private readonly fhrWindowCache: FhrWindowCacheProvider,
  ) {
    const env = readDashboardStartupWarmEnv();
    this.enabled = env.enabled;
    this.delayMs = env.delayMs;
    this.phase2DelayMs = env.phase2DelayMs;
    this.phase3DelayMs = env.phase3DelayMs;
    this.staleTtlMs = readDashboardRefreshEnv().staleTtlMs;
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('[DashboardStartupWarm] disabled by env');
      return;
    }
    setTimeout(() => {
      void this.runAllPhases().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.warmState.onWarmError(err);
        this.logger.error(`[DashboardStartupWarm] fatal error: ${msg}`);
      });
    }, this.delayMs);
  }

  private async runAllPhases(): Promise<void> {
    this.warmState.onWarmStart();
    const ctx = buildWarmRangeContext();
    // Warm every active station's shards (legacy MAA always included).
    const stationCodes = await this.adminStationsService.listActiveStationCodes();

    try {
      await this.runPhase(STARTUP_WARM_PHASES[0], ctx, stationCodes);
      await sleep(this.phase2DelayMs);
      await this.runPhase(STARTUP_WARM_PHASES[1], ctx, stationCodes);
      await sleep(this.phase3DelayMs);
      await this.runPhase(STARTUP_WARM_PHASES[2], ctx, stationCodes);
    } catch (err) {
      this.warmState.onWarmError(err);
    }

    this.warmState.onWarmComplete();
  }

  private async runPhase(
    spec: WarmPhaseSpec,
    ctx: ReturnType<typeof buildWarmRangeContext>,
    stationCodes: string[],
  ): Promise<void> {
    const phase = spec.name as PhaseSpec;
    this.warmState.onPhaseStart(phase);
    const t0 = Date.now();
    const ranges = spec.getRanges(ctx);

    if (spec.warmFhrCache) {
      await this.warmFhrCache(ranges);
    }

    let enqueued = 0;
    let skippedFresh = 0;

    for (const stationCode of stationCodes) {
      for (const range of ranges) {
        for (const mode of spec.modes as DashboardEquipmentMode[]) {
          const { queued, fresh } = await this.maybeEnqueueSummary(
            range,
            mode,
            stationCode,
          );
          enqueued += queued;
          skippedFresh += fresh;
          await sleep(YIELD_MS);
        }
      }
    }

    this.warmState.onPhaseComplete({
      phase: spec.name,
      enqueued,
      skippedFresh,
      durationMs: Date.now() - t0,
      completedAt: new Date(),
    });

    this.logger.log(
      `[DashboardStartupWarm] phase=${spec.name} enqueued=${enqueued} ` +
        `skippedFresh=${skippedFresh} durationMs=${Date.now() - t0}`,
    );
  }

  private async warmFhrCache(ranges: WarmRange[]): Promise<void> {
    const dateSet = new Set<string>();
    for (const r of ranges) {
      for (const ymd of expandYmdInRanges([r])) {
        dateSet.add(ymdToDdMmYyyy(ymd));
      }
    }
    await this.fhrWindowCache.prewarm([...dateSet]);
  }

  private async maybeEnqueueSummary(
    range: WarmRange,
    mode: DashboardEquipmentMode,
    stationCode: string,
  ): Promise<{ queued: number; fresh: number }> {
    const days = expandYmdInRanges([range]);
    const scope = fixedStationScope(stationCode);
    let queued = 0;
    let fresh = 0;
    for (const ymd of days) {
      try {
        const existing = await this.dashboardSummaryService.findDailyShard(
          ymd,
          mode,
          scope,
        );
        if (
          this.dashboardSummaryService.isLogicallyFresh(existing, this.staleTtlMs)
        ) {
          this.metrics.recordStartupWarmSkippedFresh();
          fresh += 1;
          continue;
        }
      } catch {
        // enqueue on lookup failure
      }

      this.refreshQueue.enqueueSummary({
        summaryDate: ymd,
        equipmentMode: mode,
        stationCode,
        reason: 'startup_warm',
        priority: 'LOW',
      });
      this.metrics.recordStartupWarmEnqueued();
      queued += 1;
    }
    return { queued, fresh };
  }
}
