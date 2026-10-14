/** Normalize / detect legacy `dashboard_summaries` performance drill flight rows on read. */

function parseIsoMs(value: unknown): number | null {
  const t = Date.parse(String(value ?? '').trim());
  return Number.isFinite(t) ? t : null;
}

function inferCancelled(raw: Record<string, unknown>): boolean {
  if (typeof raw.isCancelled === 'boolean') return raw.isCancelled;
  const delay = String(raw.delay ?? raw.Delay ?? '')
    .trim()
    .toUpperCase();
  return delay.includes('CANC') || delay === 'CANCELLED';
}

function inferOnTime(raw: Record<string, unknown>): boolean {
  if (inferCancelled(raw)) return false;
  if (typeof raw.isOnTime === 'boolean') return raw.isOnTime;
  const staMs = parseIsoMs(raw.sta);
  const ataMs = parseIsoMs(raw.ata);
  if (staMs != null && ataMs != null) return staMs === ataMs;
  return false;
}

/** True when stored drill cannot be bucket-filtered reliably (empty or missing v2 flags). */
export function storedPerformanceDrillNeedsRecompose(flights: unknown[]): boolean {
  if (!Array.isArray(flights) || flights.length === 0) return true;
  for (const raw of flights) {
    if (!raw || typeof raw !== 'object') return true;
    const f = raw as Record<string, unknown>;
    if (typeof f.isOnTime !== 'boolean' || typeof f.isCancelled !== 'boolean') {
      return true;
    }
  }
  return false;
}

/** Backfill `isOnTime` / `isCancelled` from STA/ATA and delay text when shards predate schema v2. */
export function normalizeStoredPerformanceDrillFlights(
  flights: unknown[],
): unknown[] {
  if (!Array.isArray(flights)) return [];
  return flights.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const f = { ...(raw as Record<string, unknown>) };
    const cancelled = inferCancelled(f);
    f.isCancelled = cancelled;
    f.isOnTime = inferOnTime(f);
    return f;
  });
}
