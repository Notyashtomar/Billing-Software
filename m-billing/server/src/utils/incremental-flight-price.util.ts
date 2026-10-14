import { bhsAircraftFamily } from './bhs-package-price.util';

export type IncrementalFlightCandidate = {
  id: string;
  sourceType?: string | null;
  customerCode?: string | null;
  aircraftType?: string | null;
  flightDate?: string | null;
  flightTime?: string | null;
  incrementalFlightsActive?: boolean | null;
  incrementalPrice?: number | null;
};

function compactAircraft(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function aircraftKey(raw: string): string {
  const family = bhsAircraftFamily(raw);
  return family || compactAircraft(raw);
}

function timeKey(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '99:99';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** ATA date from FHR, as YYYY-MM-DD. Accepts ISO, DD-MM-YYYY, and DD/MM/YYYY. */
export function calendarDayKey(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(raw ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return '';
}

export function ataAtdFromFhrMain(main: Record<string, unknown> | null | undefined): {
  ataDate: string;
  atdTime: string;
} {
  const row = main ?? {};
  return {
    ataDate: calendarDayKey(row.ATADate ?? row.ataDate ?? row['ATA Date']),
    atdTime: String(row.ATDTime ?? row.atdTime ?? row['ATD Time'] ?? '').trim(),
  };
}

export function aircraftKeysMatch(left: string, right: string): boolean {
  const a = aircraftKey(left);
  const b = aircraftKey(right);
  return Boolean(a) && a === b;
}

/**
 * Later flights of the same airline and aircraft on the same calendar day
 * at the station use the incremental rate when that rate card is active.
 * The earliest flight that day keeps the package price.
 */
export function incrementalSecondFlightIds(
  flights: IncrementalFlightCandidate[],
): Set<string> {
  const groups = new Map<string, IncrementalFlightCandidate[]>();
  for (const flight of flights) {
    if (flight.sourceType && flight.sourceType !== 'scheduled_flight') continue;
    if (flight.incrementalFlightsActive !== true) continue;
    const price = Number(flight.incrementalPrice);
    if (!(price > 0)) continue;
    const airline = String(flight.customerCode ?? '').trim().toUpperCase();
    const aircraft = aircraftKey(String(flight.aircraftType ?? ''));
    const day = calendarDayKey(flight.flightDate);
    if (!airline || !aircraft || !day) continue;
    const key = `${airline}|${aircraft}|${day}`;
    const list = groups.get(key) ?? [];
    list.push(flight);
    groups.set(key, list);
  }

  const ids = new Set<string>();
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => {
      const byTime = timeKey(a.flightTime).localeCompare(timeKey(b.flightTime));
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
    for (const flight of ordered.slice(1)) ids.add(flight.id);
  }
  return ids;
}
