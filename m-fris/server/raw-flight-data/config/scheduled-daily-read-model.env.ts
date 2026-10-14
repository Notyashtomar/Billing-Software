/**
 * CP-01 — Scheduled daily read-model + projector env.
 *
 * Read path (Phase 3+):
 *   SCHEDULED_DAILY_READ_MODEL=off|shadow|on
 *   SCHEDULED_DAILY_READ_MODEL_STATIONS=MAA,DEL
 *
 * Write / worker (Phase 2):
 *   SCHEDULED_DAILY_PROJECTOR_ENABLED=0|1   (default 0 — cron off)
 *   SCHEDULED_DAILY_PROJECTOR_BATCH=20
 *   SCHEDULED_DAILY_PROJECTOR_MAX_ATTEMPTS=8
 *   SCHEDULED_DAILY_RETENTION_DAYS=120
 */

export type ScheduledDailyReadModelMode = 'off' | 'shadow' | 'on';

function bool(v: string | undefined, defaultTrue: boolean): boolean {
  if (v == null || v === '') return defaultTrue;
  return !['0', 'false', 'no', 'off'].includes(v.toLowerCase());
}

function posInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseMode(raw: string | undefined): ScheduledDailyReadModelMode {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'shadow' || v === 'on') return v;
  return 'off';
}

function parseStationList(raw: string | undefined): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function readScheduledDailyReadModelEnv(): {
  mode: ScheduledDailyReadModelMode;
  stationAllowlist: string[];
  retentionDays: number;
  /** Cron drains outbox when true. Default false. */
  projectorEnabled: boolean;
  projectorBatchSize: number;
  projectorMaxAttempts: number;
} {
  const retention = Number(process.env.SCHEDULED_DAILY_RETENTION_DAYS);
  const mode = parseMode(process.env.SCHEDULED_DAILY_READ_MODEL);
  return {
    mode,
    stationAllowlist: parseStationList(
      process.env.SCHEDULED_DAILY_READ_MODEL_STATIONS,
    ),
    retentionDays:
      Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : 120,
    /**
     * When READ_MODEL is shadow/on, projector cron defaults on so write-hook
     * outbox drains. Explicit SCHEDULED_DAILY_PROJECTOR_ENABLED=0 disables.
     */
    projectorEnabled:
      process.env.SCHEDULED_DAILY_PROJECTOR_ENABLED != null &&
      String(process.env.SCHEDULED_DAILY_PROJECTOR_ENABLED).trim() !== ''
        ? bool(process.env.SCHEDULED_DAILY_PROJECTOR_ENABLED, false)
        : mode === 'on' || mode === 'shadow',
    projectorBatchSize: posInt(process.env.SCHEDULED_DAILY_PROJECTOR_BATCH, 20),
    projectorMaxAttempts: posInt(
      process.env.SCHEDULED_DAILY_PROJECTOR_MAX_ATTEMPTS,
      8,
    ),
  };
}

export function isScheduledDailyReadModelEnabledForStation(
  stationCode: string | null | undefined,
  mode: ScheduledDailyReadModelMode = readScheduledDailyReadModelEnv().mode,
): boolean {
  if (mode === 'off') return false;
  const allow = readScheduledDailyReadModelEnv().stationAllowlist;
  if (allow.length === 0) return true;
  const code = String(stationCode ?? '')
    .trim()
    .toUpperCase();
  return allow.includes(code);
}
