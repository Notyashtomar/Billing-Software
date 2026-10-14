import { Injectable, Logger } from '@nestjs/common';
import type { DashboardEquipmentMode } from '../interfaces';
import {
  DASHBOARD_FLIGHT_SCOPES,
  type DashboardFlightScope,
} from '../constants/dashboard-flight-scope';
import { readDashboardRefreshEnv } from '../config/dashboard-refresh-env';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { DashboardRefreshLockService } from './dashboard-refresh-lock.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardSummaryWorkerService } from './dashboard-summary-worker.service';

export type RefreshPriority = 'HIGH' | 'LOW';

export type SummaryRefreshJob = {
  kind: 'summary';
  summaryDate: string;
  equipmentMode: DashboardEquipmentMode;
  /** Concrete station this shard is materialized for (default MAA). */
  stationCode?: string;
  flightScope?: DashboardFlightScope;
  reason?: string;
  priority?: RefreshPriority;
};

export function summaryRefreshIdentity(job: SummaryRefreshJob): string {
  const station = (job.stationCode ?? 'MAA').trim().toUpperCase() || 'MAA';
  const scope = job.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;
  return `dashboard:summary:${station}:${scope}:${job.summaryDate}:${job.equipmentMode}`;
}

/**
 * Summary-only refresh queue — materializes daily `dashboard_summaries` shards.
 */
@Injectable()
export class DashboardRefreshQueueService {
  private readonly logger = new Logger(DashboardRefreshQueueService.name);

  private readonly waiting = new Set<string>();
  private readonly inflight = new Set<string>();

  private readonly highQueue: SummaryRefreshJob[] = [];
  private readonly lowQueue: SummaryRefreshJob[] = [];

  private active = 0;
  private pumpScheduled = false;

  private readonly maxConcurrency: number;

  constructor(
    private readonly summaryWorker: DashboardSummaryWorkerService,
    private readonly summaryService: DashboardSummaryService,
    private readonly lock: DashboardRefreshLockService,
    private readonly metrics: DashboardMetricsService,
  ) {
    this.maxConcurrency = readDashboardRefreshEnv().refreshConcurrency;
  }

  enqueueSummary(job: Omit<SummaryRefreshJob, 'kind'>): void {
    const full: SummaryRefreshJob = { kind: 'summary', ...job };
    this.tryPush(full);
  }

  queueDepth(): { high: number; low: number; inflight: number } {
    return {
      high: this.highQueue.length,
      low: this.lowQueue.length,
      inflight: this.inflight.size,
    };
  }

  private tryPush(job: SummaryRefreshJob): void {
    const id = summaryRefreshIdentity(job);
    if (this.waiting.has(id) || this.inflight.has(id)) {
      this.logger.debug(`[dashboard_queue] dedup_skip id=${id}`);
      return;
    }
    this.waiting.add(id);
    const queue = job.priority === 'LOW' ? this.lowQueue : this.highQueue;
    queue.push(job);
    this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      void this.pump();
    });
  }

  private nextJob(): SummaryRefreshJob | undefined {
    return this.highQueue.shift() ?? this.lowQueue.shift();
  }

  private async pump(): Promise<void> {
    while (
      this.active < this.maxConcurrency &&
      (this.highQueue.length > 0 || this.lowQueue.length > 0)
    ) {
      const job = this.nextJob();
      if (!job) break;
      const id = summaryRefreshIdentity(job);
      this.waiting.delete(id);
      this.inflight.add(id);
      this.active += 1;
      void this.runSummary(job, id)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[dashboard_queue] job_failed id=${id} priority=${job.priority ?? 'HIGH'} ${msg}`,
          );
        })
        .finally(() => {
          this.inflight.delete(id);
          this.active -= 1;
          void this.pump();
        });
    }
  }

  private async runSummary(job: SummaryRefreshJob, id: string): Promise<void> {
    const t0 = Date.now();
    const flightScope = job.flightScope ?? DASHBOARD_FLIGHT_SCOPES.SCHEDULED;
    await this.lock.runExclusive(id, async () => {
      await this.summaryService.setRefreshState(
        {
          summaryDate: job.summaryDate,
          equipmentMode: job.equipmentMode,
        },
        { refreshInProgress: true },
        job.stationCode,
        flightScope,
      );
      try {
        await this.summaryWorker.recomputeAndStore({
          summaryDate: job.summaryDate,
          equipmentMode: job.equipmentMode,
          stationCode: job.stationCode,
          flightScope,
          invalidateFhrCache: false,
        });
        this.metrics.recordRefreshComplete(Date.now() - t0);
        this.logger.log(
          `[dashboard_queue] summary_refreshed id=${id} reason=${job.reason ?? ''} ` +
            `priority=${job.priority ?? 'HIGH'} ms=${Date.now() - t0}`,
        );
      } catch (err) {
        this.metrics.recordRefreshFailed('summary', {
          id,
          reason: job.reason ?? '',
        });
        await this.summaryService.setRefreshState(
          {
            summaryDate: job.summaryDate,
            equipmentMode: job.equipmentMode,
          },
          {
            refreshInProgress: false,
            refreshFailedAt: new Date(),
            isStale: true,
          },
          job.stationCode,
          flightScope,
        );
        throw err;
      }
    });
  }
}
