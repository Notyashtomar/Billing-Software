import { normalizeFlightCategory } from './aircraft-type-match.util';

/** Comprehensive (BHS package) volume scopes from a station price card. */
export const BHS_VOLUME_FLIGHT_SCOPES = [
  'domestic_t1',
  'domestic_t2',
  'international',
  'charter_domestic',
  'charter_international',
] as const;

export type BhsVolumeFlightScope = (typeof BHS_VOLUME_FLIGHT_SCOPES)[number];

export type BhsVolumeCarrierKind = 'any' | 'passenger' | 'freighter' | 'cargo';

export type BhsVolumeAllocation = 'marginal' | 'flat';

export type BhsVolumeBand = {
  /** Inclusive 1-based position in the month for this scope. */
  fromCount: number;
  /** Inclusive. Null / omitted = no upper limit. */
  toCount?: number | null;
  unitPriceINR: number;
};

/**
 * Contract-owned comprehensive rates that replace the saved price-card / rate-card
 * BHS package price. Marginal allocation fills bands in order (flight 1..N),
 * not one rate for every flight in the month.
 */
export type BhsVolumeSchedule = {
  chargeKind: 'comprehensive' | 'ramp';
  /** One of BHS_VOLUME_FLIGHT_SCOPES. Stored as text so older documents still load. */
  flightScope: string;
  carrierKind?: BhsVolumeCarrierKind;
  allocation: BhsVolumeAllocation;
  /** When false, the schedule is stored but invoice generation keeps the saved rate. */
  overridesSavedRate?: boolean;
  /** YYYY-MM-DD inclusive. Empty = contract validity. */
  effectiveFrom?: string;
  effectiveTo?: string;
  label?: string;
  note?: string;
  bands: BhsVolumeBand[];
};

export type BhsVolumeFlightInput = {
  id: string;
  sourceType?: string;
  billingPeriodStart?: Date | string | null;
  operationalSnapshot?: Record<string, unknown> | null;
  sourceRef?: Record<string, unknown> | null;
  rateMatch?: { serviceCode?: string; unitPrice?: number } | null;
  validationResults?: Array<{ rule?: string; passed?: boolean }> | null;
};

export type BhsVolumePriceHit = {
  unitPrice: number;
  flightScope: string;
  monthIndex: number;
  fromCount: number;
  toCount: number | null;
  savedUnitPrice: number;
  label?: string;
};

const SCOPE_SET = new Set<string>(BHS_VOLUME_FLIGHT_SCOPES);

export function bhsVolumeFlightId(
  rec: {
    _id?: unknown;
    sourceRef?: { serialNo?: string; flightNo?: string } | null;
  },
  index: number,
): string {
  if (rec._id != null && String(rec._id)) return String(rec._id);
  const serial = String(rec.sourceRef?.serialNo ?? '').trim();
  if (serial) return `serial:${serial}`;
  const flightNo = String(rec.sourceRef?.flightNo ?? '').trim();
  if (flightNo) return `flight:${flightNo}:${index}`;
  return `idx:${index}`;
}

export function priceForMonthIndex(bands: BhsVolumeBand[], monthIndex: number): BhsVolumeBand | null {
  const sorted = [...bands].sort((a, b) => a.fromCount - b.fromCount);
  for (const band of sorted) {
    const from = Number(band.fromCount);
    const price = Number(band.unitPriceINR);
    if (!Number.isFinite(from) || from < 1) continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    const rawTo = band.toCount;
    const to =
      rawTo == null || !Number.isFinite(Number(rawTo)) || Number(rawTo) <= 0
        ? Number.POSITIVE_INFINITY
        : Number(rawTo);
    if (monthIndex >= from && monthIndex <= to) return band;
  }
  return null;
}

export function marginalMonthTotal(flightCount: number, bands: BhsVolumeBand[]): number {
  let total = 0;
  for (let index = 1; index <= flightCount; index += 1) {
    const band = priceForMonthIndex(bands, index);
    if (!band) return Number.NaN;
    total += Number(band.unitPriceINR);
  }
  return Math.round(total * 100) / 100;
}

function snapshotBlob(snap: Record<string, unknown> | null | undefined): string {
  if (!snap) return '';
  return [
    snap.categoryOfFlight,
    snap.Cate_of_Flight,
    snap.flightCategory,
    snap.typeOfHandling,
    snap.TypeofHandling,
    snap.typeOfFlight,
    snap.Typeofflight,
    snap.ops,
    snap.opsType,
    snap.paxFreight,
    snap.paxFreightLabel,
    snap.aircraftType,
    snap.TypeCraft,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function categoryText(snap: Record<string, unknown> | null | undefined): string {
  if (!snap) return '';
  return String(
    snap.categoryOfFlight ??
      snap.Cate_of_Flight ??
      snap.CateofFlight ??
      snap.flightCategory ??
      snap.domInt ??
      '',
  ).trim();
}

export function isSplitSectorCategory(category: string): boolean {
  const compact = category.toLowerCase().replace(/[^a-z]/g, '');
  return (
    compact.includes('domesticinternational') ||
    compact.includes('internationaldomestic') ||
    compact.includes('domint') ||
    compact.includes('intdom')
  );
}

function terminalBucket(snap: Record<string, unknown> | null | undefined): 'T1' | 'T2' | null {
  const raw = String(
    snap?.terminal ?? snap?.Terminal ?? snap?.terminalCode ?? snap?.arrivalTerminal ?? snap?.arrTerminal ?? '',
  )
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!raw) return null;
  if (raw.includes('T2') || raw.includes('TERMINAL2') || raw.includes('TERM2')) return 'T2';
  if (raw.includes('T1') || raw.includes('TERMINAL1') || raw.includes('TERM1')) return 'T1';
  return null;
}

export function classifyBhsVolumeCarrier(
  snap: Record<string, unknown> | null | undefined,
): Exclude<BhsVolumeCarrierKind, 'any'> {
  const blob = snapshotBlob(snap);
  if (/\bcargo\b/.test(blob)) return 'cargo';
  if (/freighter|\bfreight\b/.test(blob)) return 'freighter';
  return 'passenger';
}

export type SplitTurnaroundKind =
  | 'int_arrival_dom_departure'
  | 'dom_arrival_int_departure';

/**
 * Arrival sector is the first category named, departure the second.
 * `International-Domestic` = international arrival and domestic departure.
 */
export function classifySplitTurnaround(category: string): SplitTurnaroundKind | null {
  const compact = category.toLowerCase().replace(/[^a-z]/g, '');
  if (!compact) return null;
  const domesticAt = compact.indexOf('domestic');
  const internationalAt = compact.indexOf('international');
  if (domesticAt >= 0 && internationalAt >= 0) {
    return internationalAt < domesticAt
      ? 'int_arrival_dom_departure'
      : 'dom_arrival_int_departure';
  }
  if (compact.includes('intdom')) return 'int_arrival_dom_departure';
  if (compact.includes('domint')) return 'dom_arrival_int_departure';
  return null;
}

export function isDelhiBillingStation(stationCode: string | undefined | null): boolean {
  const station = String(stationCode ?? '').trim().toUpperCase();
  if (!station) return true;
  return station === 'DEL' || station === 'DELHI';
}

function comprehensiveSchedule(
  schedules: BhsVolumeSchedule[],
  flightScope: string,
): BhsVolumeSchedule | null {
  return (
    schedules.find(
      (schedule) =>
        schedule.chargeKind === 'comprehensive' &&
        schedule.overridesSavedRate !== false &&
        schedule.flightScope === flightScope,
    ) ?? null
  );
}

function rateForScopeIndex(
  schedules: BhsVolumeSchedule[],
  flightScope: string,
  monthIndex: number,
): number | null {
  const schedule = comprehensiveSchedule(schedules, flightScope);
  if (!schedule) return null;
  const band =
    schedule.allocation === 'flat'
      ? priceForMonthIndex(schedule.bands, schedule.bands[0]?.fromCount || 1)
      : priceForMonthIndex(schedule.bands, monthIndex);
  const price = Number(band?.unitPriceINR);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export type SplitComprehensivePrice = {
  kind: SplitTurnaroundKind;
  baseScope: string;
  baseUnitPrice: number;
  additionalPercent: number;
  monthIndex: number;
  unitPrice: number;
};

/**
 * Delhi split turnaround.
 * International arrival + domestic departure: domestic comprehensive + extra %.
 * Domestic arrival + international departure: international comprehensive + extra %.
 * Pure domestic and international flights are unchanged. Split flights are not
 * inserted into those volume counts; they take the next band in the base scope.
 */
export function splitComprehensiveUnitPrice(input: {
  category: string;
  stationCode?: string | null;
  snapshot?: Record<string, unknown> | null;
  schedules: BhsVolumeSchedule[];
  scopeCounts: Map<string, number>;
  splitOrdinal: Map<string, number>;
  savedUnitPrice: number;
  intArrivalDomDeparturePercent?: number | null;
  domArrivalIntDeparturePercent?: number | null;
}): SplitComprehensivePrice | null {
  if (!isDelhiBillingStation(input.stationCode)) return null;
  const kind = classifySplitTurnaround(input.category);
  if (!kind) return null;
  const percent = Number(
    kind === 'int_arrival_dom_departure'
      ? input.intArrivalDomDeparturePercent
      : input.domArrivalIntDeparturePercent,
  );
  if (!Number.isFinite(percent) || percent <= 0) return null;

  const baseScope =
    kind === 'int_arrival_dom_departure'
      ? terminalBucket(input.snapshot) === 'T2'
        ? 'domestic_t2'
        : 'domestic_t1'
      : 'international';
  const used = (input.splitOrdinal.get(baseScope) ?? 0) + 1;
  input.splitOrdinal.set(baseScope, used);
  const monthIndex = (input.scopeCounts.get(baseScope) ?? 0) + used;
  const scheduled = rateForScopeIndex(input.schedules, baseScope, monthIndex);
  const baseUnitPrice =
    scheduled ??
    (Number.isFinite(input.savedUnitPrice) && input.savedUnitPrice > 0
      ? input.savedUnitPrice
      : 0);
  if (!(baseUnitPrice > 0)) return null;
  const unitPrice = Math.round(baseUnitPrice * (1 + percent / 100) * 100) / 100;
  return {
    kind,
    baseScope,
    baseUnitPrice,
    additionalPercent: percent,
    monthIndex,
    unitPrice,
  };
}

/** Null when the flight should keep the saved comprehensive rate. */
export function classifyBhsVolumeScope(
  snap: Record<string, unknown> | null | undefined,
): BhsVolumeFlightScope | null {
  const category = categoryText(snap);
  if (!category && !snapshotBlob(snap)) return null;
  if (isSplitSectorCategory(category)) return null;

  const blob = snapshotBlob(snap);
  const charter = /charter/.test(blob);
  const normalized = normalizeFlightCategory(category);
  const lower = category.toLowerCase();
  const isInt = normalized === 'Int' || lower.includes('international');
  const isDom = normalized === 'Dom' || lower.includes('domestic');

  if (charter) {
    if (isInt && !isDom) return 'charter_international';
    if (isInt && isDom) return null;
    return 'charter_domestic';
  }
  if (isInt && !isDom) return 'international';
  if (!isDom) return null;
  const terminal = terminalBucket(snap);
  if (terminal === 'T2') return 'domestic_t2';
  if (terminal === 'T1') return 'domestic_t1';
  return null;
}

function flightYmd(flight: BhsVolumeFlightInput): string {
  const snap = flight.operationalSnapshot ?? {};
  for (const key of ['atdDate', 'ATDDate', 'stdDate', 'STDDate', 'staDate', 'STADate']) {
    const text = String(snap[key] ?? '').trim();
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
  }
  const period = flight.billingPeriodStart;
  if (period instanceof Date && !Number.isNaN(period.getTime())) {
    return period.toISOString().slice(0, 10);
  }
  const text = String(period ?? '').trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? '';
}

function inEffect(flight: BhsVolumeFlightInput, schedule: BhsVolumeSchedule): boolean {
  const ymd = flightYmd(flight);
  const from = String(schedule.effectiveFrom ?? '').slice(0, 10);
  const to = String(schedule.effectiveTo ?? '').slice(0, 10);
  if (!from && !to) return true;
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

function isCancelledFlight(flight: BhsVolumeFlightInput): boolean {
  const snap = flight.operationalSnapshot ?? {};
  if (snap.isCancelled === true || snap.cancelled === true || snap.flightCancelled === true) {
    return true;
  }
  return (flight.validationResults ?? []).some(
    (result) => result.rule === 'not_cancelled' && result.passed === false,
  );
}

function clockPart(value: unknown): string {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function datePart(value: unknown): string {
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? '';
}

/**
 * Departure order from the station. Actual takeoff (ATD date + time) fills
 * band 1 first. Scheduled departure is used only when ATD is incomplete.
 */
export function bhsVolumeArrivalSortKey(flight: BhsVolumeFlightInput): string {
  const snap = flight.operationalSnapshot ?? {};
  const atdDate = datePart(snap.atdDate ?? snap.ATDDate);
  const atdTime = clockPart(snap.atdTime ?? snap.ATDTime);
  const stdDate = datePart(snap.stdDate ?? snap.STDDate);
  const stdTime = clockPart(snap.stdTime ?? snap.STDTime);
  const hasAtd = Boolean(atdDate && atdTime);
  const date = hasAtd ? atdDate : stdDate;
  const time = hasAtd ? atdTime : stdTime || '99:99';
  const flightNo = String(
    flight.sourceRef?.flightNo ?? snap.flightNoEquipmentNo ?? snap.flightNo ?? '',
  );
  const serial = String(flight.sourceRef?.serialNo ?? '');
  return `${date}|${time}|${flightNo}|${serial}|${flight.id}`;
}

/** Package codes that carry the comprehensive BHS rate. Equipment suffixes stay out. */
export function isComprehensiveBhsServiceCode(serviceCode: string | undefined | null): boolean {
  const code = String(serviceCode ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (!code) return true;
  return code === 'BHS' || code === 'TRND' || code === 'SCHEDULED FLIGHT';
}

function scheduleMatches(flight: BhsVolumeFlightInput, schedule: BhsVolumeSchedule): boolean {
  if (schedule.chargeKind !== 'comprehensive') return false;
  if (schedule.overridesSavedRate === false) return false;
  if (!inEffect(flight, schedule)) return false;
  const scope = classifyBhsVolumeScope(flight.operationalSnapshot);
  if (!scope || scope !== schedule.flightScope) return false;
  const kind = schedule.carrierKind ?? 'any';
  if (kind !== 'any' && kind !== classifyBhsVolumeCarrier(flight.operationalSnapshot)) return false;
  return true;
}

function pickScheduleIndex(flight: BhsVolumeFlightInput, schedules: BhsVolumeSchedule[]): number {
  let anyIndex = -1;
  for (let index = 0; index < schedules.length; index += 1) {
    const schedule = schedules[index];
    if (!scheduleMatches(flight, schedule)) continue;
    const kind = schedule.carrierKind ?? 'any';
    if (kind !== 'any') return index;
    if (anyIndex < 0) anyIndex = index;
  }
  return anyIndex;
}

/**
 * Rank every non-cancelled scheduled flight in `population` inside its scope,
 * then return the comprehensive INR rate for flights that hit a band.
 * Callers pass the whole month so a partial invoice still uses month position.
 */
export function resolveBhsVolumePrices(
  population: BhsVolumeFlightInput[],
  schedules: BhsVolumeSchedule[],
): Map<string, BhsVolumePriceHit> {
  const hits = new Map<string, BhsVolumePriceHit>();
  if (schedules.length === 0 || population.length === 0) return hits;

  const groups = new Map<number, BhsVolumeFlightInput[]>();
  for (const flight of population) {
    if (flight.sourceType && flight.sourceType !== 'scheduled_flight') continue;
    if (isCancelledFlight(flight)) continue;
    if (!isComprehensiveBhsServiceCode(flight.rateMatch?.serviceCode)) continue;
    const scheduleIndex = pickScheduleIndex(flight, schedules);
    if (scheduleIndex < 0) continue;
    const list = groups.get(scheduleIndex) ?? [];
    list.push(flight);
    groups.set(scheduleIndex, list);
  }

  for (const [scheduleIndex, flights] of groups) {
    const schedule = schedules[scheduleIndex];
    flights.sort((a, b) => bhsVolumeArrivalSortKey(a).localeCompare(bhsVolumeArrivalSortKey(b)));
    flights.forEach((flight, offset) => {
      const monthIndex = offset + 1;
      const band =
        schedule.allocation === 'flat'
          ? priceForMonthIndex(schedule.bands, schedule.bands[0]?.fromCount || 1)
          : priceForMonthIndex(schedule.bands, monthIndex);
      if (!band) return;
      const saved = Number(flight.rateMatch?.unitPrice ?? 0);
      hits.set(flight.id, {
        unitPrice: Math.round(Number(band.unitPriceINR) * 100) / 100,
        flightScope: schedule.flightScope,
        monthIndex,
        fromCount: Number(band.fromCount),
        toCount:
          band.toCount == null || !Number.isFinite(Number(band.toCount))
            ? null
            : Number(band.toCount),
        savedUnitPrice: Number.isFinite(saved) ? saved : 0,
        label: schedule.label,
      });
    });
  }

  return hits;
}

function asScope(value: unknown): BhsVolumeFlightScope | null {
  const text = String(value ?? '').trim();
  return SCOPE_SET.has(text) ? (text as BhsVolumeFlightScope) : null;
}

export function sanitizeBhsVolumeSchedules(raw: unknown): BhsVolumeSchedule[] {
  if (!Array.isArray(raw)) return [];
  const out: BhsVolumeSchedule[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const source = row as Record<string, unknown>;
    const flightScope = asScope(source.flightScope);
    const chargeKind = source.chargeKind === 'ramp' ? 'ramp' : 'comprehensive';
    const allocation = source.allocation === 'flat' ? 'flat' : 'marginal';
    if (!flightScope) continue;
    const carrierRaw = String(source.carrierKind ?? 'any').trim();
    const carrierKind: BhsVolumeCarrierKind =
      carrierRaw === 'passenger' || carrierRaw === 'freighter' || carrierRaw === 'cargo'
        ? carrierRaw
        : 'any';
    const bands: BhsVolumeBand[] = [];
    if (Array.isArray(source.bands)) {
      for (const bandRow of source.bands) {
        if (!bandRow || typeof bandRow !== 'object') continue;
        const band = bandRow as Record<string, unknown>;
        const fromCount = Number(band.fromCount);
        const unitPriceINR = Number(band.unitPriceINR);
        if (!Number.isFinite(fromCount) || fromCount < 1) continue;
        if (!Number.isFinite(unitPriceINR) || unitPriceINR < 0) continue;
        const toRaw = band.toCount;
        const toCount =
          toRaw == null || toRaw === ''
            ? null
            : Number.isFinite(Number(toRaw)) && Number(toRaw) > 0
              ? Math.trunc(Number(toRaw))
              : null;
        bands.push({
          fromCount: Math.trunc(fromCount),
          toCount,
          unitPriceINR,
        });
      }
    }
    if (bands.length === 0) continue;
    const effectiveFrom = String(source.effectiveFrom ?? '').slice(0, 10);
    const effectiveTo = String(source.effectiveTo ?? '').slice(0, 10);
    out.push({
      chargeKind,
      flightScope,
      carrierKind,
      allocation,
      overridesSavedRate: source.overridesSavedRate !== false,
      ...(effectiveFrom ? { effectiveFrom } : {}),
      ...(effectiveTo ? { effectiveTo } : {}),
      ...(String(source.label ?? '').trim()
        ? { label: String(source.label).trim() }
        : {}),
      ...(String(source.note ?? '').trim() ? { note: String(source.note).trim() } : {}),
      bands,
    });
  }
  return out;
}

const AKASA_NOTE =
  'SGHA paragraph 1.1, price row effective 01 Jun 2026–31 May 2027 (4.5% escalation), rounded to the nearest rupee. Stepwise: flights are ordered by ATD date and time, earliest departure from the station first. Flight 1 fills the first band.';

/** Akasa (QP) Delhi comprehensive handling from workbook row 5. Ramp and equipment are not included. */
export function akasaDelhiComprehensiveSchedules(): BhsVolumeSchedule[] {
  const window = { effectiveFrom: '2026-06-01', effectiveTo: '2027-05-31', note: AKASA_NOTE };
  return [
    {
      chargeKind: 'comprehensive',
      flightScope: 'domestic_t1',
      carrierKind: 'any',
      allocation: 'marginal',
      overridesSavedRate: true,
      label: 'Domestic T1 comprehensive',
      ...window,
      bands: [
        { fromCount: 1, toCount: 500, unitPriceINR: 25603 },
        { fromCount: 501, toCount: 600, unitPriceINR: 24834 },
        { fromCount: 601, toCount: null, unitPriceINR: 24322 },
      ],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'domestic_t2',
      carrierKind: 'any',
      allocation: 'marginal',
      overridesSavedRate: true,
      label: 'Domestic T2 comprehensive',
      ...window,
      bands: [
        { fromCount: 1, toCount: 400, unitPriceINR: 20545 },
        { fromCount: 401, toCount: 500, unitPriceINR: 18455 },
        { fromCount: 501, toCount: null, unitPriceINR: 16365 },
      ],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'international',
      carrierKind: 'any',
      allocation: 'marginal',
      overridesSavedRate: true,
      label: 'International comprehensive',
      ...window,
      bands: [
        { fromCount: 1, toCount: 150, unitPriceINR: 24140 },
        { fromCount: 151, toCount: 250, unitPriceINR: 23415 },
        { fromCount: 251, toCount: null, unitPriceINR: 22933 },
      ],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'charter_domestic',
      carrierKind: 'any',
      allocation: 'flat',
      overridesSavedRate: true,
      label: 'Charter domestic comprehensive',
      ...window,
      bands: [{ fromCount: 1, toCount: null, unitPriceINR: 27693 }],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'charter_international',
      carrierKind: 'any',
      allocation: 'flat',
      overridesSavedRate: true,
      label: 'Charter international comprehensive',
      ...window,
      bands: [{ fromCount: 1, toCount: null, unitPriceINR: 40639 }],
    },
  ];
}
