import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { readDashboardRefreshEnv } from '../config/dashboard-refresh-env';
import { DashboardRefreshQueueService } from './dashboard-refresh-queue.service';
import { DashboardSummaryService } from './dashboard-summary.service';

/** Hourly safety sweep for stale `dashboard_summaries` documents. */
@Injectable()
export class DashboardSummaryMaintenanceService {
  private readonly logger = new Logger(DashboardSummaryMaintenanceService.name);

  private readonly safetySweepCron: boolean;

  constructor(
    private readonly dashboardSummaryService: DashboardSummaryService,
    private readonly refreshQueue: DashboardRefreshQueueService,
  ) {
    this.safetySweepCron = readDashboardRefreshEnv().safetySweepCron;
  }

  @Cron(CronExpression.EVERY_HOUR)
  scheduledSafetySweepStaleSummaries(): void {
    if (!this.safetySweepCron) return;
    void this.safetySweepStaleSummaries().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[dashboard_summary] safetySweep failed: ${msg}`);
    });
  }

  private async safetySweepStaleSummaries(): Promise<void> {
    const docs =
      await this.dashboardSummaryService.findStaleSummariesLimited(48);
    for (const s of docs) {
      const day = s.summaryDate ?? s.fromDate;
      this.refreshQueue.enqueueSummary({
        summaryDate: day,
        equipmentMode: s.equipmentMode,
        stationCode: s.stationCode,
        reason: 'hourly_safety_sweep',
        priority: 'LOW',
      });
    }
    if (docs.length > 0) {
      this.logger.log(`[dashboard_summary] safetySweep enqueued=${docs.length}`);
    }
  }
}
