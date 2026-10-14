import { EventEmitter2 } from '@nestjs/event-emitter';
import { normalizeStationCode } from '../../common/station/station.constants';
import type { StationScopeContext } from '../../common/station/station-scope';
import {
  SCHEDULED_DAILY_REFRESH_EVENT,
  type ScheduledDailyRefreshPayload,
} from '../events/scheduled-daily-refresh.events';
import {
  invalidateListDailyFromAdvanceCache,
  invalidateListDailyFromAdvanceCacheForStationDays,
  invalidateListDailyFromAdvanceCacheForStationRange,
} from '../utils/list-daily-from-advance-cache.util';
import { dateToYmd, parseYmd } from '../utils/scheduled-daily-row.util';

/**
 * Bust Nest list cache + emit projection refresh (Phase 8).
 * Safe no-op when station is cross-station / missing.
 */
export function bustScheduledListAndEnqueueRefresh(
  eventEmitter: EventEmitter2,
  station: StationScopeContext,
  opts?: {
    staYmd?: string;
    staYmds?: string[];
    fromYmd?: string;
    toYmd?: string;
    reason?: string;
  },
): void {
  if (station.crossStation) {
    invalidateListDailyFromAdvanceCache();
    return;
  }
  const stationCode = normalizeStationCode(station.stationCode);
  if (!stationCode) {
    invalidateListDailyFromAdvanceCache();
    return;
  }

  const namedDays = [
    ...(opts?.staYmds ?? []),
    ...(opts?.staYmd ? [opts.staYmd] : []),
  ].filter(Boolean);
  if (namedDays.length > 0) {
    invalidateListDailyFromAdvanceCacheForStationDays(stationCode, namedDays);
  } else if (opts?.fromYmd && opts?.toYmd) {
    invalidateListDailyFromAdvanceCacheForStationRange(
      stationCode,
      opts.fromYmd,
      opts.toYmd,
    );
  } else {
    invalidateListDailyFromAdvanceCache();
  }

  const payload: ScheduledDailyRefreshPayload = {
    stationCode,
    reason: opts?.reason ?? 'write_hook',
  };
  if (opts?.staYmds?.length) {
    payload.staYmds = opts.staYmds;
  } else if (opts?.staYmd && parseYmd(opts.staYmd)) {
    payload.staYmds = [opts.staYmd];
  } else if (opts?.fromYmd && opts?.toYmd) {
    payload.fromYmd = opts.fromYmd;
    payload.toYmd = opts.toYmd;
  } else {
    payload.staYmds = [dateToYmd(new Date())];
  }

  try {
    eventEmitter.emit(SCHEDULED_DAILY_REFRESH_EVENT, payload);
  } catch {
    // never block the write path
  }
}

/** Normalize dd/MM/yyyy or yyyy-MM-dd → yyyy-MM-dd when possible. */
export function toStaYmdFlexible(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (parseYmd(s)) return s;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return '';
}
