import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  FHR_GHA_STATION_DELAY_CODE_SET,
} from '../constants/dashboard-gha-delay-codes';

export type DashboardPerformanceReportSnapshot = {
  onTimeCount: number;
  cancelledCount: number;
  offSkdCount: number;
  aCount: number;
  bCount: number;
  cCount: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  ghaImprovement: number;
  totalFlights: number;
};

export type DashboardGhaDelayCodeAggregate = {
  ghaOverviewCodes: { code: number; count: number }[];
  chartRows: { code: string; count: number }[];
  flightsWithAnyGhaCode: number;
  totalAttributedIncrements: number;
  flightsMissingDelayDescription: {
    flightNo: string;
    serial: string;
    codes: number[];
  }[];
};

export type DashboardOnTimePerformanceCard = {
  matrix: number[][];
  greenSum: number;
  matrixGrandTotal: number;
  greenOverTotalFlightsPct: number;
  totalNonCancelled: number;
};

type PerformanceLeg = {
  ataMs: number | null;
  staMs: number | null;
  atdMs: number | null;
  stdMs: number | null;
  isCancelled: boolean;
  flightNo: string;
  departureStatus: string;
  mainDetails: Record<string, unknown> | null;
  arrivalDelays: unknown[];
  departureDelays: unknown[];
  serial: string;
};

function nonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function pickReasonFromDelayEntry(o: Record<string, unknown>): string {
  for (const k of [
    'reasonOfDelay',
    'ReasonofDelay',
    'ReasonOfDelay',
    'reason',
    'Reason',
    'Reason of Delay',
    'Reason Of Delay',
  ]) {
    const s = String(o[k] ?? '').trim();
    if (s) return s;
  }
  return '';
}

function parseLeadingTwoDigitDelayCode(text: string): number | null {
  const s = String(text ?? '').trim();
  if (s.length < 2) return null;
  const pair = s.slice(0, 2);
  if (!/^\d{2}$/.test(pair)) return null;
  return Number(pair);
}

function reasonHasTextAfterLeadingCode(reasonRaw: string): boolean {
  const rest = String(reasonRaw ?? '')
    .trim()
    .replace(/^\d{2}\s*[-–—:.,]?\s*/, '')
    .trim();
  return rest.length > 0;
}

function isDepartureStatusDelay(raw: string): boolean {
  const n = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return n === 'delay' || n === 'delayed';
}

function extractGhaCodesFromDelays(
  container: Record<string, unknown>,
): { codes: Set<number>; missingDescriptionCodes: Set<number> } {
  const codes = new Set<number>();
  const missingDescriptionCodes = new Set<number>();
  for (const key of [
    'arrivalDelays',
    'ArrivalDelays',
    'departureDelays',
    'DepartureDelays',
  ]) {
    const arr = container[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (!e || typeof e !== 'object') continue;
      const o = e as Record<string, unknown>;
      const reason = pickReasonFromDelayEntry(o);
      if (!reason) continue;
      const c = parseLeadingTwoDigitDelayCode(reason);
      if (c == null || !FHR_GHA_STATION_DELAY_CODE_SET.has(c)) continue;
      codes.add(c);
      if (!reasonHasTextAfterLeadingCode(reason)) {
        missingDescriptionCodes.add(c);
      }
    }
  }
  return { codes, missingDescriptionCodes };
}

function legHasGhaDelayCode(leg: PerformanceLeg): boolean {
  if (!isDepartureStatusDelay(leg.departureStatus)) return false;
  const codes = new Set<number>();
  if (leg.mainDetails) {
    const fromMain = extractGhaCodesFromDelays(leg.mainDetails);
    for (const c of fromMain.codes) codes.add(c);
  }
  const fromLeg = extractGhaCodesFromDelays({
    arrivalDelays: leg.arrivalDelays,
    departureDelays: leg.departureDelays,
  });
  for (const c of fromLeg.codes) codes.add(c);
  return codes.size > 0;
}

function isCancelledLeg(leg: PerformanceLeg): boolean {
  if (leg.isCancelled) return true;
  return leg.flightNo.toUpperCase().startsWith('CANC');
}

function groundMetrics(leg: PerformanceLeg): {
  ata: number;
  sta: number;
  atd: number;
  std: number;
  AGT: number;
  SGT: number;
} | null {
  const { ataMs, staMs, atdMs, stdMs } = leg;
  if (ataMs == null || staMs == null || atdMs == null || stdMs == null) {
    return null;
  }
  /** Actual ground time: ATD instant − ATA instant (each instant uses its own FHR date+time). */
  const AGT = atdMs - ataMs;
  /** Scheduled ground time: STD instant − STA instant. */
  const SGT = stdMs - staMs;
  return {
    ata: ataMs,
    sta: staMs,
    atd: atdMs,
    std: stdMs,
    AGT,
    SGT,
  };
}

function mapLeanFhrRowToLeg(doc: Record<string, unknown>): PerformanceLeg | null {
  const m = doc.mainDetails as Record<string, unknown> | null | undefined;
  const lc = doc.loadControlDetails as
    | Record<string, unknown>
    | null
    | undefined;
  const td = doc.terminalDetails as Record<string, unknown> | null | undefined;
  const r1 = doc.rampDetails1 as Record<string, unknown> | null | undefined;
  const r3 = doc.rampDetails3 as Record<string, unknown> | null | undefined;

  const timings = FhrCollectionService.performanceTimingMsFromFhrEmbeds(
    m ?? undefined,
    lc ?? undefined,
  );
  const ataMs = timings?.ataMs ?? null;
  const staMs = timings?.staMs ?? null;
  const atdMs = timings?.atdMs ?? null;
  const stdMs = timings?.stdMs ?? null;

  const arr = nonEmpty(m?.ArrivalFltNo, m?.arrivalFltNo);
  const dep = nonEmpty(m?.DepartureFltNo, m?.departureFltNo);
  const tFn = nonEmpty(
    td?.FlightNo,
    td?.flightNo,
    r1?.FlightNo,
    r1?.flightNo,
    r3?.FlightNo,
    r3?.flightNo,
  );
  const flightNo = nonEmpty(
    arr && dep && arr.toUpperCase() === dep.toUpperCase()
      ? arr
      : arr && dep
        ? `${arr}/${dep}`
        : arr || dep,
    tFn,
  );

  const departureStatus = nonEmpty(
    m?.departureStatus,
    m?.DepartureStatus,
    doc.departureStatus,
    doc.DepartureStatus,
  );

  const serial = nonEmpty(
    doc.SerialNo,
    doc.flightSerialNumber,
    m?.flightSerialNumber,
    doc.scheduleId,
  );

  return {
    ataMs,
    staMs,
    atdMs,
    stdMs,
    isCancelled: FhrCollectionService.fhrLeanDocIsCancelled(doc),
    flightNo,
    departureStatus,
    mainDetails: m ?? null,
    arrivalDelays: (m?.arrivalDelays ?? doc.arrivalDelays ?? []) as unknown[],
    departureDelays: (m?.departureDelays ??
      doc.departureDelays ??
      []) as unknown[],
    serial,
  };
}

export function mapLeanFhrRowsToPerformanceLegs(
  rows: Array<Record<string, unknown>>,
): PerformanceLeg[] {
  const out: PerformanceLeg[] = [];
  for (const doc of rows) {
    const leg = mapLeanFhrRowToLeg(doc);
    if (leg) out.push(leg);
  }
  return out;
}

export function aggregatePerformanceReportSnapshotFromLegs(
  legs: PerformanceLeg[],
): DashboardPerformanceReportSnapshot {
  const onTimeFlights: PerformanceLeg[] = [];
  const cancelledFlights: PerformanceLeg[] = [];

  for (const f of legs) {
    if (isCancelledLeg(f)) {
      cancelledFlights.push(f);
      continue;
    }
    if (f.ataMs != null && f.staMs != null && f.ataMs === f.staMs) {
      onTimeFlights.push(f);
    }
  }

  let groundTimeSavedSplitA = 0;
  let groundTimeSavedSplitB = 0;
  let groundTimeSavedSplitD = 0;
  let rowBSplitAValue = 0;
  let rowBSplitBValue = 0;
  let rowCFromBValue = 0;
  let rowCFromFValue = 0;
  let rowDFromBValue = 0;
  let rowDFromDValue = 0;

  for (const f of legs) {
    if (isCancelledLeg(f)) continue;
    const metrics = groundMetrics(f);
    if (!metrics) continue;
    const hasGhaDelayCode = legHasGhaDelayCode(f);

    if (metrics.ata > metrics.sta) {
      if (metrics.atd <= metrics.std) {
        groundTimeSavedSplitA += 1;
      } else if (metrics.atd > metrics.std && metrics.AGT <= metrics.SGT) {
        groundTimeSavedSplitB += 1;
      }
      if (!hasGhaDelayCode && metrics.AGT > metrics.SGT) {
        rowCFromBValue += 1;
      }
      if (hasGhaDelayCode && metrics.AGT > metrics.SGT) {
        rowDFromBValue += 1;
      }
    }
    if (
      metrics.ata < metrics.sta &&
      metrics.atd < metrics.std &&
      metrics.AGT < metrics.SGT
    ) {
      groundTimeSavedSplitD += 1;
    }
    if (
      metrics.ata < metrics.sta &&
      metrics.atd <= metrics.std &&
      metrics.AGT === metrics.SGT
    ) {
      rowBSplitAValue += 1;
    }
    if (
      metrics.ata < metrics.sta &&
      metrics.atd <= metrics.std &&
      metrics.AGT > metrics.SGT
    ) {
      rowBSplitBValue += 1;
    }
    if (
      !hasGhaDelayCode &&
      metrics.ata < metrics.sta &&
      metrics.atd > metrics.std &&
      metrics.AGT > metrics.SGT
    ) {
      rowCFromFValue += 1;
    }
    if (
      hasGhaDelayCode &&
      metrics.ata < metrics.sta &&
      metrics.atd > metrics.std &&
      metrics.AGT > metrics.SGT
    ) {
      rowDFromDValue += 1;
    }
  }

  const groundTimeSavedTotal =
    groundTimeSavedSplitA + groundTimeSavedSplitB + groundTimeSavedSplitD;
  const rowBSplitValue = rowBSplitAValue + rowBSplitBValue;
  const rowCSplitValue = rowCFromBValue + rowCFromFValue;
  const rowDSplitValue = rowDFromBValue + Math.max(0, rowDFromDValue);
  const row3FromAbc =
    groundTimeSavedTotal + rowBSplitValue + rowCSplitValue + rowDSplitValue;

  return {
    onTimeCount: onTimeFlights.length,
    cancelledCount: cancelledFlights.length,
    offSkdCount: row3FromAbc,
    aCount: groundTimeSavedTotal,
    bCount: rowBSplitValue,
    cCount: rowCSplitValue,
    row3cGhaCount: 0,
    row3cNonGhaCount: 0,
    ghaImprovement: rowDSplitValue,
    totalFlights: legs.length,
  };
}

function matchesOtpBeforeStaGtLeStd(
  ataMs: number,
  staMs: number,
  atdMs: number,
  stdMs: number,
  agtMs: number,
  sgtMs: number,
): boolean {
  return ataMs < staMs && agtMs > sgtMs && atdMs <= stdMs;
}

function matchesOtpGtGtStd(
  ataMs: number,
  staMs: number,
  atdMs: number,
  stdMs: number,
  agtMs: number,
  sgtMs: number,
): boolean {
  return agtMs > sgtMs && atdMs > stdMs && ataMs > staMs;
}

export function aggregateOtpMatrixFromLegs(legs: PerformanceLeg[]): number[][] {
  const matrix: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (const f of legs) {
    if (isCancelledLeg(f)) continue;
    const gt = groundMetrics(f);
    if (!gt) continue;
    const { ata: ataMs, sta: staMs, atd: atdMs, std: stdMs, AGT: agtMs, SGT: sgtMs } = gt;

    if (ataMs < staMs && agtMs < sgtMs) matrix[0]![0]! += 1;
    else if (ataMs === staMs && agtMs < sgtMs) matrix[1]![0]! += 1;
    else if (ataMs > staMs && agtMs < sgtMs) matrix[2]![0]! += 1;

    if (ataMs < staMs && agtMs === sgtMs) matrix[0]![1]! += 1;
    if (ataMs === staMs && atdMs === stdMs && agtMs === sgtMs) matrix[1]![1]! += 1;
    if (ataMs > staMs && agtMs === sgtMs) matrix[2]![1]! += 1;

    if (matchesOtpBeforeStaGtLeStd(ataMs, staMs, atdMs, stdMs, agtMs, sgtMs)) {
      matrix[0]![2]! += 1;
    }
    if (ataMs < staMs && agtMs > sgtMs && atdMs > stdMs) matrix[0]![3]! += 1;
    else if (ataMs === staMs && agtMs > sgtMs && atdMs > stdMs) matrix[1]![3]! += 1;
    else if (matchesOtpGtGtStd(ataMs, staMs, atdMs, stdMs, agtMs, sgtMs)) {
      matrix[2]![3]! += 1;
    }
  }

  return matrix;
}

const OTP_GREEN_CELLS: Array<[number, number]> = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [2, 0],
  [2, 1],
];

export function buildOnTimePerformanceCardFromLegs(
  legs: PerformanceLeg[],
): DashboardOnTimePerformanceCard {
  const matrix = aggregateOtpMatrixFromLegs(legs);
  let greenSum = 0;
  let matrixGrandTotal = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      matrixGrandTotal += matrix[r]![c] ?? 0;
    }
  }
  for (const [r, c] of OTP_GREEN_CELLS) {
    greenSum += matrix[r]![c] ?? 0;
  }
  const totalNonCancelled = legs.filter((f) => !isCancelledLeg(f)).length;
  const denom = totalNonCancelled > 0 ? totalNonCancelled : matrixGrandTotal;
  const greenOverTotalFlightsPct =
    denom <= 0 ? 0 : Math.round((greenSum / denom) * 1000) / 10;

  return {
    matrix,
    greenSum,
    matrixGrandTotal,
    greenOverTotalFlightsPct,
    totalNonCancelled,
  };
}

function ghaFlightKey(leg: PerformanceLeg): string {
  if (leg.serial) return `s:${leg.serial}`;
  return `leg:${leg.flightNo}`;
}

export function aggregateGhaDelayCodesFromLegs(
  legs: PerformanceLeg[],
): DashboardGhaDelayCodeAggregate {
  type Bucket = {
    codes: Set<number>;
    missingDescriptionCodes: Set<number>;
    flightNo: string;
    serial: string;
  };
  const byFlightKey = new Map<string, Bucket>();

  for (const leg of legs) {
    if (!isDepartureStatusDelay(leg.departureStatus)) continue;
    const codes = new Set<number>();
    const missingDescriptionCodes = new Set<number>();
    if (leg.mainDetails) {
      const fromMain = extractGhaCodesFromDelays(leg.mainDetails);
      for (const c of fromMain.codes) codes.add(c);
      for (const c of fromMain.missingDescriptionCodes) {
        missingDescriptionCodes.add(c);
      }
    }
    const fromLeg = extractGhaCodesFromDelays({
      arrivalDelays: leg.arrivalDelays,
      departureDelays: leg.departureDelays,
    });
    for (const c of fromLeg.codes) codes.add(c);
    for (const c of fromLeg.missingDescriptionCodes) {
      missingDescriptionCodes.add(c);
    }
    if (codes.size === 0) continue;

    const key = ghaFlightKey(leg);
    let bucket = byFlightKey.get(key);
    if (!bucket) {
      bucket = {
        codes: new Set(),
        missingDescriptionCodes: new Set(),
        flightNo: leg.flightNo || '—',
        serial: leg.serial,
      };
      byFlightKey.set(key, bucket);
    }
    for (const c of codes) bucket.codes.add(c);
    for (const c of missingDescriptionCodes) bucket.missingDescriptionCodes.add(c);
  }

  const counts = new Map<number, number>();
  let flightsWithAnyGhaCode = 0;
  const flightsMissingDelayDescription: DashboardGhaDelayCodeAggregate['flightsMissingDelayDescription'] =
    [];

  for (const b of byFlightKey.values()) {
    if (b.codes.size === 0) continue;
    flightsWithAnyGhaCode += 1;
    for (const c of b.codes) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (b.missingDescriptionCodes.size > 0) {
      flightsMissingDelayDescription.push({
        flightNo: b.flightNo,
        serial: b.serial,
        codes: [...b.missingDescriptionCodes].sort((x, y) => x - y),
      });
    }
  }

  const ghaOverviewCodes = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([code, count]) => ({ code, count }));

  let totalAttributedIncrements = 0;
  for (const { count } of ghaOverviewCodes) {
    totalAttributedIncrements += count;
  }

  return {
    ghaOverviewCodes,
    chartRows: ghaOverviewCodes.map(({ code, count }) => ({
      code: String(code),
      count,
    })),
    flightsWithAnyGhaCode,
    totalAttributedIncrements,
    flightsMissingDelayDescription,
  };
}

export type DashboardKpiStripSnapshot = {
  totalFlights: number;
  cancelledFlights: number;
  didFlyFlights: number;
  scheduledFlights: number;
  additionalFlights: number;
};

export function aggregateKpiStripFromLeanRows(
  rows: Array<Record<string, unknown>>,
): DashboardKpiStripSnapshot {
  let totalFlights = 0;
  let cancelledFlights = 0;
  let scheduledFlights = 0;
  let additionalFlights = 0;

  for (const doc of rows) {
    totalFlights += 1;
    if (FhrCollectionService.fhrLeanDocIsCancelled(doc)) {
      cancelledFlights += 1;
      continue;
    }
    const handling = FhrCollectionService.resolveFhrRowHandlingText(doc);
    const bucket = FhrCollectionService.classifyDashboardHandlingBucket(handling);
    if (bucket === 'additional') {
      additionalFlights += 1;
    } else if (bucket === 'scheduled') {
      scheduledFlights += 1;
    }
  }

  return {
    totalFlights,
    cancelledFlights,
    didFlyFlights: Math.max(0, totalFlights - cancelledFlights),
    scheduledFlights,
    additionalFlights,
  };
}

/** Compact UI-only row for performance drill modals (no FHR blobs, no duplicate lists). */
export type PerformanceDrillFlightRow = {
  serialNo: number | null;
  flightNo: string;
  sta: string;
  ata: string;
  std: string;
  atd: string;
  delay: string;
  isCancelled: boolean;
  isOnTime: boolean;
  /** Off-SKD Row 3 bucket; null when on-time or cancelled. */
  partition: 'A' | 'B' | 'C' | null;
  ghaCategory: 'improved' | 'notImproved';
  /** Station GHA code (11–52) present on delay reasons (same notion as row d). */
  hasStationGhaDelayCode: boolean;
  /** Matches performance report `ghaImprovement` / row d. */
  inPerformanceReportGhaImprovementRow: boolean;
  airline: string;
  typeCraft: string;
  /** Turnaround minutes (ATD−ATA) when all four timestamps exist; else null. */
  agtMinutes: number | null;
  /** Scheduled ground minutes (STD−STA) when all four timestamps exist; else null. */
  sgtMinutes: number | null;
};

export type DashboardPerformanceDrilldownPartitionMeta = {
  row3bCond1Count: number;
  row3bCond2Count: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  row3cTotalCount: number;
};

export type DashboardPerformanceDrilldownPayload = {
  /** Bump when drill flight row shape / row-d classification changes (clients may gate filters on this). */
  schemaVersion?: number;
  flights: PerformanceDrillFlightRow[];
  partitionMeta: DashboardPerformanceDrilldownPartitionMeta;
};

function msToIso(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
}

function parseSerialNo(leg: PerformanceLeg): number | null {
  const s = String(leg.serial ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  return Math.abs(n - t) < 1e-9 ? t : null;
}

/**
 * Row **d. Improvement for GHA** — Path 1 OR Path 2; each path requires station GHA code + AGT > SGT.
 * - Path 1: ATA > STA, GHA code, AGT > SGT.
 * - Path 2: ATA < STA, ATD > STD, GHA code, AGT > SGT.
 */
function legMatchesPerformanceReportGhaImprovementRow(leg: PerformanceLeg): boolean {
  if (isCancelledLeg(leg)) return false;
  const metrics = groundMetrics(leg);
  if (!metrics) return false;
  if (!legHasGhaDelayCode(leg)) return false;
  if (metrics.ata > metrics.sta && metrics.AGT > metrics.SGT) return true;
  if (
    metrics.ata < metrics.sta &&
    metrics.atd > metrics.std &&
    metrics.AGT > metrics.SGT
  ) {
    return true;
  }
  return false;
}

function legToDrillFlightRow(
  leg: PerformanceLeg,
  ctx: {
    isOnTime: boolean;
    isCancelled: boolean;
    partition: 'A' | 'B' | 'C' | null;
  },
): PerformanceDrillFlightRow {
  const m = leg.mainDetails;
  const airline = nonEmpty(
    m?.airlineName,
    m?.AirlineName,
    m?.airline,
    m?.Airline,
  );
  const typeCraft = nonEmpty(
    m?.TypeCraft,
    m?.typeCraft,
    m?.aircraftType,
    m?.AircraftType,
  );
  const gm = groundMetrics(leg);
  const agtMinutes =
    gm != null && Number.isFinite(gm.AGT) ? gm.AGT / 60000 : null;
  const sgtMinutes =
    gm != null && Number.isFinite(gm.SGT) ? gm.SGT / 60000 : null;
  const hasStationGhaDelayCode = legHasGhaDelayCode(leg);
  const inPerformanceReportGhaImprovementRow =
    legMatchesPerformanceReportGhaImprovementRow(leg);
  const ghaCategory: 'improved' | 'notImproved' = inPerformanceReportGhaImprovementRow
    ? 'improved'
    : 'notImproved';
  return {
    serialNo: parseSerialNo(leg),
    sta: msToIso(leg.staMs),
    ata: msToIso(leg.ataMs),
    std: msToIso(leg.stdMs),
    atd: msToIso(leg.atdMs),
    flightNo: leg.flightNo,
    delay: leg.departureStatus,
    isCancelled: ctx.isCancelled,
    isOnTime: ctx.isOnTime,
    partition: ctx.partition,
    ghaCategory,
    hasStationGhaDelayCode,
    inPerformanceReportGhaImprovementRow,
    airline,
    typeCraft,
    agtMinutes,
    sgtMinutes,
  };
}

function partitionOffSkdLegs(legs: PerformanceLeg[]): {
  a: PerformanceLeg[];
  b: PerformanceLeg[];
  c: PerformanceLeg[];
  ghaImprovement: PerformanceLeg[];
  row3bCond1Count: number;
  row3bCond2Count: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  row3cTotalCount: number;
} {
  const a: PerformanceLeg[] = [];
  const b: PerformanceLeg[] = [];
  const c: PerformanceLeg[] = [];
  const ghaImprovement: PerformanceLeg[] = [];
  const row3bCond1Flights: PerformanceLeg[] = [];
  const row3bCond2Flights: PerformanceLeg[] = [];

  for (const f of legs) {
    const metrics = groundMetrics(f);
    if (!metrics) {
      a.push(f);
      continue;
    }
    const inRow3BCond1 =
      metrics.atd < metrics.std && metrics.AGT === metrics.SGT;
    const inRow3BCond2 =
      metrics.atd < metrics.std && metrics.AGT > metrics.SGT;
    const inRow3B = inRow3BCond1 || inRow3BCond2;
    const inRow3A =
      metrics.atd <= metrics.std ||
      (metrics.atd > metrics.std && metrics.AGT <= metrics.SGT);
    const inRow3C = metrics.atd > metrics.std && metrics.AGT > metrics.SGT;
    if (inRow3B) {
      b.push(f);
      if (inRow3BCond1) row3bCond1Flights.push(f);
      if (inRow3BCond2) row3bCond2Flights.push(f);
    } else if (inRow3A) {
      a.push(f);
    } else if (inRow3C) {
      c.push(f);
    } else {
      c.push(f);
    }
    if (metrics.AGT > metrics.SGT) ghaImprovement.push(f);
  }

  const row3C_GHA = ghaImprovement.filter((f) => legHasGhaDelayCode(f));
  const row3C_NON_GHA = ghaImprovement.filter((f) => !legHasGhaDelayCode(f));

  return {
    a,
    b,
    c,
    ghaImprovement,
    row3bCond1Count: row3bCond1Flights.length,
    row3bCond2Count: row3bCond2Flights.length,
    row3cGhaCount: row3C_GHA.length,
    row3cNonGhaCount: row3C_NON_GHA.length,
    row3cTotalCount: row3C_GHA.length + row3C_NON_GHA.length,
  };
}

/** Worker-only: modal drill-down flight lists for the performance report. */
export function buildPerformanceDrilldownFromLeanRows(
  rows: Array<Record<string, unknown>>,
): DashboardPerformanceDrilldownPayload {
  const legs = mapLeanFhrRowsToPerformanceLegs(rows);
  const offSkdLegs: PerformanceLeg[] = [];

  for (const leg of legs) {
    if (isCancelledLeg(leg)) {
      continue;
    }
    if (leg.ataMs != null && leg.staMs != null && leg.ataMs === leg.staMs) {
      continue;
    }
    offSkdLegs.push(leg);
  }

  const partitionLegs = partitionOffSkdLegs(offSkdLegs);
  const setA = new Set(partitionLegs.a);
  const setB = new Set(partitionLegs.b);
  const setC = new Set(partitionLegs.c);

  const flights: PerformanceDrillFlightRow[] = legs.map((leg) => {
    const cancelled = isCancelledLeg(leg);
    const onTime =
      !cancelled &&
      leg.ataMs != null &&
      leg.staMs != null &&
      leg.ataMs === leg.staMs;
    let partition: 'A' | 'B' | 'C' | null = null;
    if (!cancelled && !onTime) {
      if (setA.has(leg)) partition = 'A';
      else if (setB.has(leg)) partition = 'B';
      else if (setC.has(leg)) partition = 'C';
    }
    return legToDrillFlightRow(leg, {
      isOnTime: onTime,
      isCancelled: cancelled,
      partition,
    });
  });

  return {
    schemaVersion: 2,
    flights,
    partitionMeta: {
      row3bCond1Count: partitionLegs.row3bCond1Count,
      row3bCond2Count: partitionLegs.row3bCond2Count,
      row3cGhaCount: partitionLegs.row3cGhaCount,
      row3cNonGhaCount: partitionLegs.row3cNonGhaCount,
      row3cTotalCount: partitionLegs.row3cTotalCount,
    },
  };
}

export function aggregatePerformanceCardsFromLeanFhrRows(
  rows: Array<Record<string, unknown>>,
): {
  performanceReport: DashboardPerformanceReportSnapshot;
  ghaImprovement: DashboardGhaDelayCodeAggregate;
  onTimePerformance: DashboardOnTimePerformanceCard;
} {
  const legs = mapLeanFhrRowsToPerformanceLegs(rows);
  return {
    performanceReport: aggregatePerformanceReportSnapshotFromLegs(legs),
    ghaImprovement: aggregateGhaDelayCodesFromLegs(legs),
    onTimePerformance: buildOnTimePerformanceCardFromLegs(legs),
  };
}
