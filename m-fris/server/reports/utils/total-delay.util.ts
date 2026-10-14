/** Parse delay duration HH:mm or HH:mm:ss to total seconds (duration, not clock). */
export function parseDelayDurationToSeconds(t: string | undefined | null): number {
  if (!t?.trim()) return 0;
  const normalized = t.trim().replace(/\./g, ':');
  const parts = normalized.split(':').map((p) => Number(p.trim()));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return 0;
  const [h = 0, m = 0, s = 0] = parts;
  if (h < 0 || m < 0 || m > 59 || s < 0 || s > 59) return 0;
  return h * 3600 + m * 60 + s;
}

/** Format total seconds as HH:mm:ss (hours capped at 99 for display). */
export function formatSecondsAsHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.min(99, Math.floor(safe / 3600));
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Sum one or more delay duration strings into HH:mm:ss. */
export function sumDelayDurations(...parts: Array<string | undefined | null>): string {
  const total = parts.reduce((acc, p) => acc + parseDelayDurationToSeconds(p), 0);
  return formatSecondsAsHms(total);
}

function pickDelayFromRow(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  const o = row as Record<string, unknown>;
  return String(o.delay ?? o.Delay ?? o.DelayTime ?? o.delayTime ?? '').trim();
}

/**
 * FHR Total Delay = Arrival Delay + Departure Delay.
 * Falls back to summing delay-reason rows, then to an optional scalar fallback.
 */
export function resolveFhrTotalDelay(opts: {
  arrivalDelay?: string | null;
  actualDelay?: string | null;
  departureDelay?: string | null;
  arrivalDelays?: unknown;
  departureDelays?: unknown;
  fallback?: string | null;
}): string {
  const arrival = String(opts.arrivalDelay ?? opts.actualDelay ?? '').trim();
  const departure = String(opts.departureDelay ?? '').trim();
  if (arrival || departure) {
    return sumDelayDurations(arrival, departure);
  }

  const rowParts: string[] = [];
  for (const list of [opts.arrivalDelays, opts.departureDelays]) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const d = pickDelayFromRow(row);
      if (d) rowParts.push(d);
    }
  }
  if (rowParts.length > 0) {
    return sumDelayDurations(...rowParts);
  }

  return String(opts.fallback ?? '').trim();
}
