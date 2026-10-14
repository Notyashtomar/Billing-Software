import {
  parseDashboardFlightScope,
  type DashboardFlightScope,
} from 'src/dashboard-summary/constants/dashboard-flight-scope';

export type StationWiseFlightScope = DashboardFlightScope;

export function parseStationWiseFlightScope(
  raw?: string | null,
): StationWiseFlightScope {
  return parseDashboardFlightScope(raw);
}

export function isNonScheduledStationWiseScope(
  scope?: StationWiseFlightScope | null,
): boolean {
  return scope === 'nonScheduled';
}

function nonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/** Mirrors FhrCollectionService.resolveMainDetailsHandlingText (pure). */
function resolveMainDetailsHandlingText(
  m: Record<string, unknown> | null | undefined,
): string {
  if (!m) return '';
  return nonEmpty(
    m['TypeofHandling'],
    m['typeOfHandling'],
    m['typeofHandling'],
    m['Type_of_Handling'],
    m['Type of Handling'],
    m['Typeofflight'],
    m['typeofflight'],
    m['ops'],
    m['operations'],
    m['opsType'],
  ).trim();
}

/** Mirrors FhrCollectionService.resolveFhrRowHandlingText (pure). */
function resolveFhrRowHandlingText(doc: Record<string, unknown>): string {
  const m = doc.mainDetails as Record<string, unknown> | null | undefined;
  const r1 = doc.rampDetails1 as Record<string, unknown> | null | undefined;
  const r3 = doc.rampDetails3 as Record<string, unknown> | null | undefined;
  return nonEmpty(
    resolveMainDetailsHandlingText(m),
    resolveMainDetailsHandlingText(r1 ?? undefined),
    resolveMainDetailsHandlingText(r3 ?? undefined),
  );
}

/**
 * Mirrors FhrCollectionService.classifyDashboardHandlingBucket (pure).
 * SCH / SCHEDULED / TURNAROUND → scheduled; ADDL / NS / ferry → additional.
 */
export function classifyStationWiseHandlingBucket(
  handlingRaw: string,
): 'scheduled' | 'additional' | null {
  const n = String(handlingRaw ?? '')
    .trim()
    .toUpperCase();
  if (!n) return null;
  if (/(^|[^A-Z])(ADDL|ADDITIONAL)([^A-Z]|$)/.test(n)) return 'additional';
  if (/(FERRY|DIVERTED|RETURN\s*TO\s*RAMP|LOAD\s*IN|LOAD\s*OUT)/.test(n)) {
    return 'additional';
  }
  if (n.includes('NON-SCHEDULED') || n.includes('NON SCHEDULED')) {
    return 'additional';
  }
  if (/(^|[^A-Z])(SCH|SCHEDULED|TURNAROUND)([^A-Z]|$)/.test(n)) {
    return 'scheduled';
  }
  return null;
}

/**
 * Rows that belong on Non-Scheduled Airlines / ns_fhr — exclude from Scheduled MIS.
 * Mirrors Scheduled Airlines list filtering (Typeofflight / TypeofHandling / booking stamps).
 */
export function isNonScheduledFhrDoc(doc: Record<string, unknown>): boolean {
  const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
  const norm = (v: unknown) =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  const flightType = norm(
    m.Typeofflight ??
      m.typeofflight ??
      m['Type of flight'] ??
      m.flightType ??
      m.TypeofFlight,
  );
  if (
    flightType.includes('non-scheduled') ||
    flightType.includes('non scheduled') ||
    flightType.includes('nonschedule') ||
    flightType.includes('non-skd') ||
    flightType.includes('nonskd')
  ) {
    return true;
  }

  const handling = norm(
    m.TypeofHandling ??
      m.typeOfHandling ??
      m['Type of Handling'] ??
      m.typeofHandling,
  );
  if (
    handling.includes('non-scheduled') ||
    handling.includes('non scheduled') ||
    handling.includes('nonschedule') ||
    handling === 'ns' ||
    handling.includes('non-skd') ||
    handling.includes('nonskd')
  ) {
    return true;
  }

  const booking = norm(m.bookingNo ?? m.BookingNo ?? m['Booking No']);
  const challan = norm(m.challanNo ?? m.ChallanNo ?? m['Challan No']);
  if (booking.includes('/bkg/') || challan.includes('/cln/')) {
    return true;
  }

  return false;
}

function dashboardHandlingBucket(
  doc: Record<string, unknown>,
): 'scheduled' | 'additional' | null {
  return classifyStationWiseHandlingBucket(resolveFhrRowHandlingText(doc));
}

function compactAirlineKey(name: string): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Charter / trip-support leftovers that must never appear on Scheduled MIS. */
const SCHEDULED_LEFTOVER_AIRLINE_KEYS = [
  'manahaerospace',
  'aviaarc',
  'flysbs',
] as const;

export function isScheduledMonthwiseLeftoverAirline(name: string): boolean {
  const key = compactAirlineKey(name);
  if (!key) return false;
  return SCHEDULED_LEFTOVER_AIRLINE_KEYS.some((needle) => key.includes(needle));
}

function airlineNameFromDoc(doc: Record<string, unknown>): string {
  const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
  const t = (doc.terminalDetails ?? {}) as Record<string, unknown>;
  return nonEmpty(
    m.Airline,
    m.airline,
    m.AirlineName,
    m.airlineName,
    t.airlinesOperator,
    t.Airline,
    t.AirlineName,
    doc.airline,
  );
}

/**
 * Scheduled MIS Monthwise: every fhr_collection row except charter leftovers
 * and explicit NS stamps. MAA bird TOTAL includes Additional Turnaround
 * (SpiceJet) and Additional Diverted (Air India Express) — those are still
 * scheduled-carrier flights, not leftovers.
 */
export function belongsInScheduledStationWise(
  doc: Record<string, unknown>,
): boolean {
  if (isScheduledMonthwiseLeftoverAirline(airlineNameFromDoc(doc))) return false;
  if (isNonScheduledFhrDoc(doc)) return false;
  return true;
}

/**
 * Non Schedule MIS Monthwise: keep NS stamps / ADDL / unknown; drop pure SCH.
 * Used as defense-in-depth on ns_fhr_collection rows.
 */
export function belongsInNonScheduledStationWise(
  doc: Record<string, unknown>,
): boolean {
  if (isNonScheduledFhrDoc(doc)) return true;
  return dashboardHandlingBucket(doc) !== 'scheduled';
}
