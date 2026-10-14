import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DelayReportSummaryService } from './delay-report-summary.service';

function envEnabled(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function toYmdUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Keeps `delay_reports` daily shards fresh without a heavy startup warmup.
 *
 * - Nightly cron materializes yesterday + today (small, bounded).
 * - Report API calls still call `ensureRangeMaterialized` for the UI date range
 *   so missing days are stored on first request, then served from the collection.
 *
 * Startup 210-day warm is intentionally not run (AUD-H12).
 */
@Injectable()
export class DelayReportDailyMaterializeService {
  private readonly logger = new Logger(DelayReportDailyMaterializeService.name);

  private readonly cronEnabled = envEnabled(
    'DELAY_REPORT_DAILY_MATERIALIZE_ENABLED',
    true,
  );

  constructor(
    private readonly delayReportSummaryService: DelayReportSummaryService,
  ) {
    this.logger.log(
      `[delay_report_summary] daily materialize cron=${this.cronEnabled ? 'on' : 'off'} (startup 210-day warm disabled)`,
    );
  }

  /** UTC 01:00 — rebuild recent day shards from FHR. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  scheduledMaterializeRecentDays(): void {
    if (!this.cronEnabled) return;
    void this.materializeRecentDays().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[delay_report_summary] daily materialize failed: ${message}`,
      );
    });
  }

  /**
   * Materialize yesterday + today so the Delay Report stays current without
   * scanning months of history on every process boot.
   */
  async materializeRecentDays(): Promise<number> {
    const end = new Date();
    const start = new Date(end.getTime());
    start.setUTCDate(start.getUTCDate() - 1);

    const fromYmd = toYmdUtc(start);
    const toYmd = toYmdUtc(end);
    const startedAt = Date.now();
    const recomputedDays =
      await this.delayReportSummaryService.ensureRangeMaterialized(
        fromYmd,
        toYmd,
      );

    this.logger.log(
      `[delay_report_summary] daily materialize range=${fromYmd}..${toYmd} recomputedDays=${recomputedDays} wallMs=${Date.now() - startedAt}`,
    );
    return recomputedDays;
  }
}
