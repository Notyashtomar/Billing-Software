/**
 * Station GHA delay codes (whitelist only). Reason-of-delay must start with one of these two-digit codes.
 * Source: ops list — not the full 11–52 IATA band.
 */
export const FHR_GHA_STATION_DELAY_CODES = [
  11, 12, 13, 15, 17, 18, 19, 21, 22, 23, 28, 29, 31, 32, 33, 34, 35, 37, 38, 39, 52,
] as const;

export const FHR_GHA_STATION_DELAY_CODE_SET = new Set<number>(FHR_GHA_STATION_DELAY_CODES);

function isWhitelistedGhaCode(c: number): boolean {
  return FHR_GHA_STATION_DELAY_CODE_SET.has(c);
}

/**
 * Reads the delay code from the first two characters of the reason comment (after trim).
 * Both characters must be digits (e.g. `"81 ATC…"` → `81`, `"32 …"` → `32`).
 */
export function parseLeadingTwoDigitDelayCode(text: string): number | null {
  const s = String(text ?? '').trim();
  if (s.length < 2) return null;
  const pair = s.slice(0, 2);
  if (!/^\d{2}$/.test(pair)) return null;
  return Number(pair);
}

/** True if there is any non-empty text after the leading `NN` code (optional punctuation / space). */
export function reasonHasTextAfterLeadingCode(reasonRaw: string): boolean {
  const rest = String(reasonRaw ?? '')
    .trim()
    .replace(/^\d{2}\s*[-–—:.,]?\s*/, '')
    .trim();
  return rest.length > 0;
}

function pickReasonFromDelayEntry(o: Record<string, unknown>): string {
  const keys: (string | number | symbol)[] = [
    'reasonOfDelay',
    'ReasonofDelay',
    'ReasonOfDelay',
    'reason',
    'Reason',
    'Reason of Delay',
    'Reason Of Delay',
  ];
  for (const k of keys) {
    const v = o[k as keyof typeof o];
    const s = String(v ?? '').trim();
    if (s !== '') return s;
  }
  return '';
}

function pickDepartureStatus(container: Record<string, unknown>): string {
  const keys: (string | number | symbol)[] = ['departureStatus', 'DepartureStatus'];
  for (const k of keys) {
    const v = container[k as keyof typeof container];
    const s = String(v ?? '').trim();
    if (s !== '') return s;
  }
  return '';
}

function isDepartureStatusDelay(raw: string): boolean {
  const n = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return n === 'delay' || n === 'delayed';
}

function getDashboardDbRowData(row: unknown): Record<string, unknown> {
  const r = row as Record<string, unknown> | null | undefined;
  const inner = r?.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return (r ?? {}) as Record<string, unknown>;
}

export function firstNonEmptyStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const t = String(v).trim();
    if (t !== '') return t;
  }
  return '';
}

/** Display flight number from a dashboard `data` object. */
export function displayFlightNoFromDashboardData(d: Record<string, unknown>): string {
  return firstNonEmptyStr(d.flightNo, d['Flight No'], d.FlightNo);
}

/** Raw operational serial from dashboard row `data`. */
export function displaySerialFromDashboardData(d: Record<string, unknown>): string {
  return String(
    firstNonEmptyStr(
      d.slNo,
      d['Sl No'],
      d['Sl. No'],
      d['SL No'],
      d['Serial No'],
      d['Serial Number'],
      d.SlNo,
      d.SerialNo,
      d.serialNo,
    ),
  ).trim();
}

/**
 * One row per **operational flight instance** for GHA aggregation (matches scheduled dashboard serial fields).
 * Duplicate API legs with the same serial collapse so the headline count is **unique flights**, not raw rows.
 */
export function getFhrGhaAggregationFlightKey(row: unknown): string {
  const d = getDashboardDbRowData(row);
  let serial = displaySerialFromDashboardData(d);
  const sid = String(d.scheduleId ?? '').trim();
  if (!serial && sid.toLowerCase().startsWith('fhr_collection_')) {
    serial = sid.slice('fhr_collection_'.length).trim();
  }
  if (!serial && sid) serial = sid;
  if (serial) return `s:${serial}`;

  const staDate = firstNonEmptyStr(
    d.staDate,
    d['STA Date'],
    d.STADate,
    d.scheduleDate,
  );
  const staTime = firstNonEmptyStr(d.staTime, d['STA Time'], d.STATime);
  const flightNo = displayFlightNoFromDashboardData(d);
  return `leg:${flightNo}:${staDate}:${staTime}`;
}

function pickDepartureStatusMerged(
  d: Record<string, unknown>,
  nested: Record<string, unknown> | null,
): string {
  if (nested) {
    const s = pickDepartureStatus(nested);
    if (s !== '') return s;
  }
  return pickDepartureStatus(d);
}

function extractWhitelistCodesAndMissingFromContainer(container: Record<string, unknown>): {
  codes: Set<number>;
  missingDescriptionCodes: Set<number>;
} {
  const codes = new Set<number>();
  const missingDescriptionCodes = new Set<number>();
  const arrays = [
    container.arrivalDelays,
    container.ArrivalDelays,
    container.departureDelays,
    container.DepartureDelays,
  ];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (!e || typeof e !== 'object') continue;
      const o = e as Record<string, unknown>;
      const reason = pickReasonFromDelayEntry(o);
      if (!reason) continue;
      const c = parseLeadingTwoDigitDelayCode(reason);
      if (c == null || !isWhitelistedGhaCode(c)) continue;
      codes.add(c);
      if (!reasonHasTextAfterLeadingCode(reason)) {
        missingDescriptionCodes.add(c);
      }
    }
  }
  return { codes, missingDescriptionCodes };
}

function collectFhrDelayedGhaFromData(d: Record<string, unknown>): {
  codes: Set<number>;
  missingDescriptionCodes: Set<number>;
} {
  const nested =
    d.mainDetails && typeof d.mainDetails === 'object' && !Array.isArray(d.mainDetails)
      ? (d.mainDetails as Record<string, unknown>)
      : null;
  const status = pickDepartureStatusMerged(d, nested);
  if (!isDepartureStatusDelay(status)) {
    return { codes: new Set(), missingDescriptionCodes: new Set() };
  }
  const codes = new Set<number>();
  const missingDescriptionCodes = new Set<number>();
  const absorb = (container: Record<string, unknown>) => {
    const { codes: cc, missingDescriptionCodes: mm } = extractWhitelistCodesAndMissingFromContainer(container);
    for (const c of cc) codes.add(c);
    for (const c of mm) missingDescriptionCodes.add(c);
  };
  if (nested) absorb(nested);
  absorb(d);
  return { codes, missingDescriptionCodes };
}

/**
 * Whitelisted GHA codes from Reason of Delay when departure status is Delay/delayed (leading two digits only).
 */
export function collectFhrGhaBandCodesFromDashboardRowData(d: Record<string, unknown>): Set<number> {
  return collectFhrDelayedGhaFromData(d).codes;
}

export function collectFhrGhaBandCodesFromDashboardRow(row: unknown): Set<number> {
  return collectFhrGhaBandCodesFromDashboardRowData(getDashboardDbRowData(row));
}

export type FhrGhaFlightMissingDelayDescription = {
  flightNo: string;
  serial: string;
  /** Whitelist codes recorded with no free-text after the numeric prefix on at least one delay line. */
  codes: number[];
};

export type FhrGhaDelayCodeAggregate = {
  /** Whitelisted codes with at least one flight, ascending. */
  ghaOverviewCodes: { code: number; count: number }[];
  chartRows: { code: string; count: number }[];
  /** Unique operational flights (delayed + at least one whitelisted code), after collapsing duplicate rows per serial. */
  flightsWithAnyGhaCode: number;
  /** Sum of per-code flight counts after dedupe (one flight can contribute to multiple codes). */
  totalAttributedIncrements: number;
  /** Flights that carry a whitelisted code but have no description text after the code on at least one qualifying delay line. */
  flightsMissingDelayDescription: FhrGhaFlightMissingDelayDescription[];
};

type FlightBucket = {
  codes: Set<number>;
  missingDescriptionCodes: Set<number>;
  flightNo: string;
  serial: string;
};

/**
 * Count each whitelisted code at most once per flight (Delay status; reason text only).
 * Rows sharing the same {@link getFhrGhaAggregationFlightKey} are merged.
 */
export function aggregateFhrGhaDelayCodesFromDashboardRows(
  rowsInStaRange: unknown[],
): FhrGhaDelayCodeAggregate {
  const byFlightKey = new Map<string, FlightBucket>();
  for (const row of rowsInStaRange) {
    const d = getDashboardDbRowData(row);
    const { codes, missingDescriptionCodes } = collectFhrDelayedGhaFromData(d);
    if (codes.size === 0) continue;
    const key = getFhrGhaAggregationFlightKey(row);
    const flightNo = displayFlightNoFromDashboardData(d);
    const serial = displaySerialFromDashboardData(d);

    let bucket = byFlightKey.get(key);
    if (!bucket) {
      bucket = {
        codes: new Set(),
        missingDescriptionCodes: new Set(),
        flightNo,
        serial,
      };
      byFlightKey.set(key, bucket);
    } else {
      if (!bucket.flightNo && flightNo) bucket.flightNo = flightNo;
      if (!bucket.serial && serial) bucket.serial = serial;
    }
    for (const c of codes) bucket.codes.add(c);
    for (const c of missingDescriptionCodes) bucket.missingDescriptionCodes.add(c);
  }

  const counts = new Map<number, number>();
  let flightsWithAnyGhaCode = 0;
  const flightsMissingDelayDescription: FhrGhaFlightMissingDelayDescription[] = [];

  for (const b of byFlightKey.values()) {
    if (b.codes.size === 0) continue;
    flightsWithAnyGhaCode += 1;
    for (const c of b.codes) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (b.missingDescriptionCodes.size > 0) {
      flightsMissingDelayDescription.push({
        flightNo: b.flightNo || '—',
        serial: b.serial || '',
        codes: [...b.missingDescriptionCodes].sort((x, y) => x - y),
      });
    }
  }

  flightsMissingDelayDescription.sort((a, b) => {
    const af = a.flightNo.localeCompare(b.flightNo);
    if (af !== 0) return af;
    return String(a.serial).localeCompare(String(b.serial));
  });

  const ghaOverviewCodes = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([code, count]) => ({ code, count }));

  const chartRows = ghaOverviewCodes.map(({ code, count }) => ({
    code: String(code),
    count,
  }));

  let totalAttributedIncrements = 0;
  for (const { count } of ghaOverviewCodes) {
    totalAttributedIncrements += count;
  }

  return {
    ghaOverviewCodes,
    chartRows,
    flightsWithAnyGhaCode,
    totalAttributedIncrements,
    flightsMissingDelayDescription,
  };
}
