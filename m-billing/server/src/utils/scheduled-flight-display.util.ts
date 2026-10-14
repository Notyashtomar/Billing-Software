function pickField(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

const FHR_MAIN_OVERLAY_KEYS = [
  'aircraftBody',
  'AircraftBody',
  'turnaroundStatus',
  'turnaround_status',
  'TurnaroundStatus',
  'Cate_of_Flight',
  'flightCategory',
  'TypeCraft',
  'typeCraft',
  'aircraftType',
  'TypeofHandling',
  'typeOfHandling',
  'Typeofflight',
  'ops',
  'opsType',
] as const;

/** Merge sparse main-details with terminal / ramp embeds (parity with FHR dashboard). */
export function mergeFhrMainEmbeds(
  main: Record<string, unknown>,
  ...overlays: Array<Record<string, unknown> | undefined | null>
): Record<string, unknown> {
  const merged = { ...main };
  for (const src of overlays) {
    if (!src || typeof src !== 'object') continue;
    for (const key of FHR_MAIN_OVERLAY_KEYS) {
      if (!pickField(merged[key]) && pickField(src[key])) {
        merged[key] = src[key];
      }
    }
  }
  return merged;
}

/** Flight record wins. Catalog and type-name guesses fill only a blank body. */
export function normalizeStoredAircraftBody(value: unknown): 'NB' | 'WB' | '' {
  const embedded = String(value ?? '').trim().toUpperCase();
  if (!embedded) return '';
  if (embedded === 'WB' || embedded.includes('WIDE')) return 'WB';
  if (embedded === 'NB' || embedded.includes('NARROW')) return 'NB';
  return '';
}

/**
 * ICAO and marketing codes that are wide-body even when written as B77W / B788 / A333.
 * `\b777\b` misses those, and a miss used to display NB.
 */
export function inferWideBodyFromAircraftType(aircraftType: string): boolean {
  const tc = aircraftType.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!tc) return false;
  return /(?:777|787|767|747|MD11|DC10|B77[23WL]|B78[89X]|B76[234]|B74[0-8]|A3(?:00|10|3[2389]|4[2356]|5[09]|5K|8[08])|380|350|340|330|310|300|359)/.test(
    tc,
  );
}

export function resolveAircraftBodyLabel(
  merged: Record<string, unknown>,
  aircraftType: string,
  catalogHit?: 'NB' | 'WB' | null,
): string {
  const stored = normalizeStoredAircraftBody(
    pickField(merged.aircraftBody, merged.AircraftBody),
  );
  if (stored) return stored;

  if (catalogHit === 'NB' || catalogHit === 'WB') return catalogHit;

  const tc = aircraftType.trim();
  if (!tc) return '';
  return inferWideBodyFromAircraftType(tc) ? 'WB' : 'NB';
}

/** FHR report uses category of flight as turnaround status when not stored explicitly. */
export function resolveTurnaroundStatusLabel(
  merged: Record<string, unknown>,
  categoryOfFlight: string,
): string {
  const explicit = pickField(
    merged.turnaroundStatus,
    merged.turnaround_status,
    merged.TurnaroundStatus,
  );
  if (explicit) return explicit;
  if (categoryOfFlight.trim()) return categoryOfFlight.trim();
  return 'Scheduled';
}

export function enrichScheduledFlightOperationalRow(
  row: Record<string, unknown>,
  catalog: Map<string, 'NB' | 'WB'> | null,
  matchCatalog?: (catalog: Map<string, 'NB' | 'WB'>, rawType: string) => 'NB' | 'WB' | null,
): Record<string, unknown> {
  const aircraftType = pickField(row.aircraftType, row.TypeCraft, row.typeCraft);
  const categoryOfFlight = pickField(
    row.categoryOfFlight,
    row.Cate_of_Flight,
    row.flightCategory,
  );
  const merged = row as Record<string, unknown>;
  const catalogHit =
    catalog && matchCatalog ? matchCatalog(catalog, aircraftType) : null;

  const flightNo = pickField(row.flightNoEquipmentNo, row.flightNo, row.FlightNo);
  const isCancelled = resolveScheduledFlightCancelled(
    row as Record<string, unknown>,
    flightNo,
  );

  return {
    ...row,
    categoryOfFlight: categoryOfFlight || row.categoryOfFlight,
    aircraftBody: resolveAircraftBodyLabel(merged, aircraftType, catalogHit),
    turnaroundStatus: resolveTurnaroundStatusLabel(merged, categoryOfFlight),
    isCancelled,
  };
}

function scheduleFlightNoCancelled(raw: unknown): boolean {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .startsWith('CANC');
}

/** Parity with FRIS Scheduled Airlines cancellation detection. */
export function resolveScheduledFlightCancelled(
  dailyData: Record<string, unknown> | undefined,
  resolvedFlightNo: string,
): boolean {
  const dailyFlightNo = pickField(
    dailyData?.flightNo,
    dailyData?.['Flight No'],
    dailyData?.FlightNo,
  );
  const flightNos = [resolvedFlightNo, dailyFlightNo].filter(Boolean);

  if (dailyData) {
    if (
      dailyData.isCancelled === true ||
      dailyData.flightCancelled === true ||
      dailyData['Is Cancelled'] === true ||
      String(dailyData.flightStatus ?? '')
        .trim()
        .toLowerCase() === 'cancelled'
    ) {
      return true;
    }
  }

  return flightNos.some((fn) => scheduleFlightNoCancelled(fn));
}
