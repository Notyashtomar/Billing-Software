/**
 * Aviation schedule seasons (IATA-style windows used by FRIS Schedule Setup).
 *
 * Summer: 1 Apr – 30 Sep
 * Winter: 1 Oct – 31 Mar (spans calendar year boundary)
 *
 * Season is always derived from Valid From.
 */

export const SCHEDULE_SEASON = {
  SUMMER: 'Summer',
  WINTER: 'Winter',
} as const;

export type ScheduleSeason =
  (typeof SCHEDULE_SEASON)[keyof typeof SCHEDULE_SEASON];

export const SCHEDULE_SEASON_MONTH = {
  SUMMER_START: 4,
  SUMMER_END: 9,
  WINTER_START: 10,
  WINTER_END: 3,
} as const;

export type ScheduleSeasonInfo = {
  season: ScheduleSeason;
  /** Stable identity for one season period, e.g. summer-2026 / winter-2026 */
  seasonKey: string;
  /** Calendar year when the season period starts (Apr for Summer, Oct for Winter) */
  seasonStartYear: number;
};

export type ScheduleValidityRange = {
  validFrom: string;
  validTo: string;
};

export type ScheduleSaveAction = 'created' | 'updated';

const DD_MM_YYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function normalizeScheduleDateDdMmYyyy(input: string): string {
  if (!input?.trim()) return '';
  const s = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d}/${m}/${y}`;
  }
  const parts = s.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  return s;
}

export function parseScheduleDateDdMmYyyy(input: string): Date | null {
  const s = normalizeScheduleDateDdMmYyyy(input);
  const m = DD_MM_YYYY.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!day || !month || !year) return null;
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatScheduleDateDdMmYyyy(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Compare two dd/MM/yyyy (or yyyy-MM-dd) dates. Returns negative if a < b. */
export function compareScheduleDates(a: string, b: string): number {
  const da = parseScheduleDateDdMmYyyy(a);
  const db = parseScheduleDateDdMmYyyy(b);
  if (!da || !db) return 0;
  return da.getTime() - db.getTime();
}

/**
 * Later Valid To only. Returns target when current is empty or earlier.
 * Returns null when target is invalid or current is already on/after target.
 */
export function pickExtendedValidTo(
  currentValidTo: string,
  targetValidTo: string,
): string | null {
  const target = normalizeScheduleDateDdMmYyyy(targetValidTo);
  if (!target) return null;
  const current = normalizeScheduleDateDdMmYyyy(currentValidTo);
  if (!current) return target;
  if (compareScheduleDates(current, target) >= 0) return null;
  return target;
}

/**
 * Detect Summer/Winter from Valid From.
 * Apr–Sep → Summer; Oct–Mar → Winter.
 */
export function detectScheduleSeason(validFrom: string): ScheduleSeasonInfo {
  const date = parseScheduleDateDdMmYyyy(validFrom);
  if (!date) {
    throw new Error(
      `Valid From must be a valid date (dd/MM/yyyy). Received: "${validFrom}"`,
    );
  }

  const month = date.getMonth() + 1; // 1–12
  const year = date.getFullYear();

  if (
    month >= SCHEDULE_SEASON_MONTH.SUMMER_START &&
    month <= SCHEDULE_SEASON_MONTH.SUMMER_END
  ) {
    return {
      season: SCHEDULE_SEASON.SUMMER,
      seasonStartYear: year,
      seasonKey: `summer-${year}`,
    };
  }

  // Winter: Oct–Dec → season starts this year; Jan–Mar → season started prior year
  const seasonStartYear =
    month >= SCHEDULE_SEASON_MONTH.WINTER_START ? year : year - 1;

  return {
    season: SCHEDULE_SEASON.WINTER,
    seasonStartYear,
    seasonKey: `winter-${seasonStartYear}`,
  };
}

/** Try detect; return null when date missing/invalid (legacy rows). */
export function tryDetectScheduleSeason(
  validFrom: string,
): ScheduleSeasonInfo | null {
  try {
    if (!String(validFrom ?? '').trim()) return null;
    return detectScheduleSeason(validFrom);
  } catch {
    return null;
  }
}

/**
 * Expand validity window: earliest Valid From, latest Valid To.
 */
export function mergeScheduleValidityRange(
  existingFrom: string,
  existingTo: string,
  incomingFrom: string,
  incomingTo: string,
): ScheduleValidityRange {
  const candidatesFrom = [existingFrom, incomingFrom]
    .map((v) => normalizeScheduleDateDdMmYyyy(v))
    .filter(Boolean);
  const candidatesTo = [existingTo, incomingTo]
    .map((v) => normalizeScheduleDateDdMmYyyy(v))
    .filter(Boolean);

  if (candidatesFrom.length === 0 || candidatesTo.length === 0) {
    return {
      validFrom: normalizeScheduleDateDdMmYyyy(incomingFrom) || existingFrom,
      validTo: normalizeScheduleDateDdMmYyyy(incomingTo) || existingTo,
    };
  }

  let earliest = candidatesFrom[0];
  for (const f of candidatesFrom) {
    if (compareScheduleDates(f, earliest) < 0) earliest = f;
  }

  let latest = candidatesTo[0];
  for (const t of candidatesTo) {
    if (compareScheduleDates(t, latest) > 0) latest = t;
  }

  return { validFrom: earliest, validTo: latest };
}

/** Union weekday flags so expanded ranges keep all operating days. */
export function unionScheduleDays(
  a: unknown,
  b: unknown,
): Record<string, boolean> {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  const out: Record<string, boolean> = {};
  const left =
    a && typeof a === 'object' && !Array.isArray(a)
      ? (a as Record<string, unknown>)
      : {};
  const right =
    b && typeof b === 'object' && !Array.isArray(b)
      ? (b as Record<string, unknown>)
      : {};
  for (const day of days) {
    out[day] = left[day] === true || right[day] === true;
  }
  return out;
}

export function normalizeRoutingForMatch(routing: string): string {
  return String(routing ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/–/g, '-');
}

/** Persist Schedule Setup routing: A–Z and `-` only (e.g. DEL-IXC-DEL). */
export function normalizeScheduleRoutingForStorage(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/–/g, '-')
    .replace(/[^A-Z-]/g, '');
}

/** Valid empty or DEL-IXC / DEL-IXC-DEL. */
export function isValidScheduleRouting(raw: string): boolean {
  const v = normalizeScheduleRoutingForStorage(raw);
  if (!v) return true;
  return /^[A-Z]{3}(-[A-Z]{3}){1,2}$/.test(v);
}

/**
 * Persist Schedule Setup flight no exactly as typed (upper, no spaces),
 * keep `/`, drop other symbols, max 15.
 */
const SCHEDULE_WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function padHm(raw: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? '').trim());
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Persist optional per-weekday STA/STD (view airline schedule day columns). */
export function normalizeScheduleDayTimes(
  raw: unknown,
): Record<string, { sta: string; std: string }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, { sta: string; std: string }> = {};
  for (const day of SCHEDULE_WEEKDAY_KEYS) {
    const slot = src[day];
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) continue;
    const rec = slot as Record<string, unknown>;
    const sta = padHm(String(rec.sta ?? rec.staTime ?? ''));
    const std = padHm(String(rec.std ?? rec.stdTime ?? ''));
    if (!sta || !std) continue;
    out[day] = { sta, std };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeScheduleFlightNoForStorage(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/[^A-Z0-9/]/g, '')
    .slice(0, 15);
}

function firstNonEmptyStr(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const t = String(v).trim();
    if (t) return t;
  }
  return '';
}

/** True when Schedule Setup / main details mark Operation Split. */
export function isScheduleOperationSplit(data: Record<string, unknown>): boolean {
  if (data.ifOperationSplit === true) return true;
  const raw = firstNonEmptyStr(
    data['Operation Split'],
    data.ifOperationSplit,
    data.IsSplit,
  ).toLowerCase();
  return raw === 'yes' || raw === 'true' || raw === '1';
}

/**
 * Prefix a flight leg with airline code when the leg does not already start with it.
 * e.g. code=IX, leg=1089 → IX1089; leg=IX1089 → IX1089.
 */
export function withAirlineCodePrefix(airlineCode: string, leg: string): string {
  const code = String(airlineCode ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const raw = normalizeScheduleFlightNoForStorage(leg);
  if (!raw) return '';
  if (!code) return raw;
  if (raw.startsWith(code)) return raw;
  return `${code}${raw}`;
}

/**
 * Scheduled Airlines table flight number:
 * - Non-split → Schedule Setup `flightNo` as entered
 * - Split → `airlineCode+arrival/airlineCode+departure`
 */
/** Excel cancelled numbers keep every character except spaces (`CANC -FD 196/197` → `CANC-FD196/197`). */
function cancelledFlightNoAsStored(data: Record<string, unknown>): string {
  const compact = firstNonEmptyStr(data.flightNo, data['Flight No'], data.FlightNo).replace(
    /\s+/g,
    '',
  );
  return /^CANC/i.test(compact) ? compact : '';
}

export function displayFlightNoFromScheduleData(
  data: Record<string, unknown>,
): string {
  const storedCancelled = cancelledFlightNoAsStored(data);
  if (storedCancelled) return storedCancelled;

  const airlineCode = firstNonEmptyStr(
    data.airlineCode,
    data['Airline Code'],
    data.Arline_Code,
  );
  const stored = normalizeScheduleFlightNoForStorage(
    firstNonEmptyStr(data.flightNo, data['Flight No'], data.FlightNo),
  );
  const arr = normalizeScheduleFlightNoForStorage(
    firstNonEmptyStr(
      data.arrivalFlightNo,
      data['Arrival Flight No'],
      data.ArrivalFltNo,
      data.arrivalFltNo,
    ),
  );
  const dep = normalizeScheduleFlightNoForStorage(
    firstNonEmptyStr(
      data.departureFlightNo,
      data['Departure Flight No'],
      data.DepartureFltNo,
      data.departureFltNo,
    ),
  );

  if (isScheduleOperationSplit(data)) {
    const a = withAirlineCodePrefix(airlineCode, arr);
    const d = withAirlineCodePrefix(airlineCode, dep);
    if (a && d) return a.toUpperCase() === d.toUpperCase() ? a : `${a}/${d}`;
    return a || d || stored;
  }

  if (stored) return stored;
  if (arr && dep) {
    const a = withAirlineCodePrefix(airlineCode, arr);
    const d = withAirlineCodePrefix(airlineCode, dep);
    if (a && d) return a.toUpperCase() === d.toUpperCase() ? a : `${a}/${d}`;
  }
  return withAirlineCodePrefix(airlineCode, arr || dep);
}

/** Single leg or one slash pair, ≤15 chars. */
export function isValidScheduleFlightNo(raw: string): boolean {
  const v = normalizeScheduleFlightNoForStorage(raw);
  if (!v) return false;
  if (/^[A-Z0-9]{1,15}$/.test(v)) return true;
  return /^[A-Z0-9]+\/[A-Z0-9]+$/.test(v) && v.length <= 15;
}

/** Strip spaces/dashes/slashes for stable flight identity (matches Creation find rules). */
export function normalizeFlightNoForScheduleIdentity(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-/]/g, '');
}

/**
 * Identity for one schedule per flight per season (station scoped separately).
 * airline|flightNo|routing|seasonKey
 */
export function buildScheduleIdentityKey(parts: {
  seasonKey: string;
  airline: string;
  flightNo: string;
  routing?: string;
}): string {
  const airline = String(parts.airline ?? '')
    .trim()
    .toLowerCase();
  const flightNo = normalizeFlightNoForScheduleIdentity(parts.flightNo ?? '');
  const routing = normalizeRoutingForMatch(parts.routing ?? '');
  const seasonKey = String(parts.seasonKey ?? '')
    .trim()
    .toLowerCase();
  return `${seasonKey}|${airline}|${flightNo}|${routing}`;
}

export function scheduleSaveSuccessMessage(
  season: ScheduleSeason,
  action: ScheduleSaveAction,
): string {
  if (action === 'updated') {
    return season === SCHEDULE_SEASON.SUMMER
      ? 'Summer schedule updated successfully.'
      : 'Winter schedule updated successfully.';
  }
  return season === SCHEDULE_SEASON.SUMMER
    ? 'New Summer schedule created.'
    : 'New Winter schedule created.';
}
