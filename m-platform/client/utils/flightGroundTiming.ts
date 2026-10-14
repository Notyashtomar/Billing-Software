/**
 * Shared UTC/local `Date` parsing and AGT/SGT for OTP (`getGroundTimes`) and other dashboard math.
 */

export type FlightTimingInput = {
  ata?: string | null;
  atd?: string | null;
  sta?: string | null;
  std?: string | null;
};

export type GroundTimes = {
  ata: number;
  atd: number;
  sta: number;
  std: number;
  AGT: number;
  SGT: number;
};

/** Full-datetime string → ms (`YYYY-MM-DDTHH:mm:ss` and similar). */
export function parseFlightTimingLocalMs(t?: string | null): number | null {
  if (t == null) return null;
  const s = String(t).trim();
  if (!s) return null;
  const ms = new Date(s).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function parseTimeMs(t?: string | null): number | null {
  return parseFlightTimingLocalMs(t);
}

export function getAGT(ata: number, atd: number): number {
  return atd - ata;
}

export function getSGT(sta: number, std: number): number {
  return std - sta;
}

/**
 * Renders a duration in **minutes** (may be fractional) as `HH:mm` — hours before the colon,
 * minutes after (e.g. 810.2 min → `13:30` after rounding).
 */
export function formatGroundDurationMinutesAsHhMm(
  totalMinutes: number | null | undefined,
): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return '—';
  const rounded = Math.round(totalMinutes);
  if (rounded < 0) return '—';
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getGroundTimes(f: FlightTimingInput): GroundTimes | null {
  const ata = parseFlightTimingLocalMs(f.ata);
  const atd = parseFlightTimingLocalMs(f.atd);
  const sta = parseFlightTimingLocalMs(f.sta);
  const std = parseFlightTimingLocalMs(f.std);
  if (ata == null || atd == null || sta == null || std == null) return null;
  return {
    ata,
    atd,
    sta,
    std,
    AGT: getAGT(ata, atd),
    SGT: getSGT(sta, std),
  };
}
