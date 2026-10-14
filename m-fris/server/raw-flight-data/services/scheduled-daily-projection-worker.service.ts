import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { readScheduledDailyReadModelEnv } from '../config/scheduled-daily-read-model.env';
import { ScheduledDailyProjectionOutboxService } from './scheduled-daily-projection-outbox.service';
import { ScheduledDailyProjectorService } from './scheduled-daily-projector.service';

/**
 * Drains `scheduled_daily_projection_outbox` when
 * `SCHEDULED_DAILY_PROJECTOR_ENABLED=1`. Default off — no background CPU.
 */
@Injectable()
export class ScheduledDailyProjectionWorkerService {
  private readonly logger = new Logger(
    ScheduledDailyProjectionWorkerService.name,
  );
  private running = false;

  constructor(
    private readonly outbox: ScheduledDailyProjectionOutboxService,
    private readonly projector: ScheduledDailyProjectorService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  scheduledDrain(): void {
    if (!readScheduledDailyReadModelEnv().projectorEnabled) return;
    if (this.running) return;
    void this.drainOnce().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[scheduled_daily_worker] drain failed: ${msg}`);
    });
  }

  async drainOnce(): Promise<{ claimed: number; ok: number; failed: number }> {
    if (this.running) return { claimed: 0, ok: 0, failed: 0 };
    this.running = true;
    let ok = 0;
    let failed = 0;
    try {
      const batch = readScheduledDailyReadModelEnv().projectorBatchSize;
      const claimed = await this.outbox.claimPendingBatch(batch);
      for (const job of claimed) {
        const id = String(job._id);
        try {
          if (job.eventType === 'rebuild_day') {
            await this.projector.rebuildDay({
              stationCode: job.stationCode,
              staYmd: job.staYmd,
            });
          } else {
            throw new Error(`unknown eventType=${String(job.eventType)}`);
          }
          await this.outbox.markDone(id);
          ok += 1;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await this.outbox.markFailed(id, msg);
          failed += 1;
        }
      }
      if (claimed.length > 0) {
        this.logger.log(
          `[scheduled_daily_worker] drained claimed=${claimed.length} ok=${ok} failed=${failed}`,
        );
      }
      return { claimed: claimed.length, ok, failed };
    } finally {
      this.running = false;
    }
  }

  /**
   * Drain pending outbox until empty, max cycles, or a cycle claims nothing
   * while pending remains (backoff / dead). Used by Phase 4 backfill.
   */
  async drainUntilIdle(params?: {
    maxCycles?: number;
    stationCode?: string;
  }): Promise<{
    cycles: number;
    totalClaimed: number;
    totalOk: number;
    totalFailed: number;
    pendingLeft: number;
  }> {
    const maxCycles = Math.min(500, Math.max(1, params?.maxCycles ?? 50));
    let cycles = 0;
    let totalClaimed = 0;
    let totalOk = 0;
    let totalFailed = 0;
    for (let i = 0; i < maxCycles; i += 1) {
      cycles += 1;
      const r = await this.drainOnce();
      totalClaimed += r.claimed;
      totalOk += r.ok;
      totalFailed += r.failed;
      const byStatus = await this.outbox.countByStatus(params?.stationCode);
      const pending = Number(byStatus.pending ?? 0);
      if (pending === 0) break;
      if (r.claimed === 0) break;
    }
    const byStatus = await this.outbox.countByStatus(params?.stationCode);
    return {
      cycles,
      totalClaimed,
      totalOk,
      totalFailed,
      pendingLeft: Number(byStatus.pending ?? 0),
    };
  }
}
