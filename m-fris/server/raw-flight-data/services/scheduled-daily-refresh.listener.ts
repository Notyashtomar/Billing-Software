import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SCHEDULED_DAILY_REFRESH_EVENT,
  type ScheduledDailyRefreshPayload,
} from '../events/scheduled-daily-refresh.events';
import {
  dateToYmd,
  eachYmdInclusive,
  parseYmd,
} from '../utils/scheduled-daily-row.util';
import { ScheduledDailyProjectionOutboxService } from './scheduled-daily-projection-outbox.service';

const MAX_ENQUEUE_DAYS = 31;

/**
 * Phase 8 — listens for schedule-universe mutations and enqueues day rebuilds.
 * Coalesce is handled by the outbox service.
 */
@Injectable()
export class ScheduledDailyRefreshListener {
  private readonly logger = new Logger(ScheduledDailyRefreshListener.name);

  constructor(
    private readonly outbox: ScheduledDailyProjectionOutboxService,
  ) {}

  @OnEvent(SCHEDULED_DAILY_REFRESH_EVENT, { async: true })
  async handleRefresh(payload: ScheduledDailyRefreshPayload): Promise<void> {
    const stationCode = String(payload?.stationCode ?? '')
      .trim()
      .toUpperCase();
    if (!stationCode) return;

    const days = resolveDays(payload);
    if (days.length === 0) return;
    const reason = payload.reason ?? 'write_hook';

    try {
      let enqueued = 0;
      let skipped = 0;
      for (const staYmd of days) {
        const r = await this.outbox.enqueueRebuildDay({
          stationCode,
          staYmd,
          reason,
        });
        if (r.enqueued) enqueued += 1;
        else skipped += 1;
      }
      this.logger.debug(
        `[scheduled_daily_refresh] station=${stationCode} days=${days.length} enqueued=${enqueued} skipped=${skipped} reason=${reason}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[scheduled_daily_refresh] failed: ${msg}`);
    }
  }
}

function resolveDays(payload: ScheduledDailyRefreshPayload): string[] {
  if (payload.staYmds && payload.staYmds.length > 0) {
    const uniq = [
      ...new Set(
        payload.staYmds
          .map((d) => String(d ?? '').trim())
          .filter((d) => Boolean(parseYmd(d))),
      ),
    ].sort();
    return uniq.slice(0, MAX_ENQUEUE_DAYS);
  }
  if (payload.fromYmd && payload.toYmd) {
    const all = eachYmdInclusive(payload.fromYmd, payload.toYmd);
    if (all.length <= MAX_ENQUEUE_DAYS) return all;
    return all.slice(0, MAX_ENQUEUE_DAYS);
  }
  return [dateToYmd(new Date())];
}
