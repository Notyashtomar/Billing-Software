/** CP-01 Phase 8 — fire-and-forget projection refresh after schedule universe writes. */

export const SCHEDULED_DAILY_REFRESH_EVENT = 'scheduled-daily.refresh';

export type ScheduledDailyRefreshPayload = {
  stationCode: string;
  /** Explicit days to rebuild (yyyy-MM-dd). */
  staYmds?: string[];
  fromYmd?: string;
  toYmd?: string;
  reason?: string;
};
