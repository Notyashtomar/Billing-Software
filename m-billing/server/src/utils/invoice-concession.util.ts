import { normalizeFlightCategory } from './aircraft-type-match.util';
import {
  classifyFlightScenarioFromText,
  FLIGHT_SCENARIO_FIELD,
  isDivertedText,
  isReturnToRampText,
  isStandbyText,
  isTechnicalText,
  readStoredFlightScenario,
  type FlightScenario,
} from './flight-scenario.util';
import { isInternationalOnlyAirline } from './invoice-flight-category.util';
import {
  actualGroundMinutes,
  clockMinutes,
  flightSnapshotBlob,
  hasActualClock,
  lateArrivalMinutes,
  lateDepartureMinutes,
  parseLocalDateTime,
  pickFlightText,
  snapshotDateTime,
  type InvoiceLineConcessionInput,
} from './flight-snapshot-clock.util';

import {
  concessionSectorForAirline,
  flightConcessionSectorFromText,
  stationPercentForSector,
} from './station-flight-concession.util';

// Re-exported so existing importers keep working after these helpers moved out.
export {
  actualGroundMinutes,
  lateArrivalMinutes,
  lateDepartureMinutes,
  type InvoiceLineConcessionInput,
} from './flight-snapshot-clock.util';
export {
  invalidateInvoiceContractCache,
  resolveActiveContractForInvoice,
  type InvoiceContractLookup,
} from './invoice-contract-lookup.util';

export const INVOICE_CGST_PERCENT = 9;
export const INVOICE_SGST_PERCENT = 9;

/** Normal exclusive royalty is amount × percent/100. Extended is amount × percent/(100−percent). */
export function exclusiveRoyaltyRate(extended: boolean, percent = 0): number {
  const rate = Number(percent);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (!extended || rate >= 100) return rate / 100;
  return rate / (100 - rate);
}

export function usesExtendedRoyalty(
  contract?: {
    bhsConcessionCoverage?: string | null;
    extendedRoyaltyEnabled?: boolean | null;
  } | null,
): boolean {
  return isExclusiveBhsConcessionContract(contract) && Boolean(contract?.extendedRoyaltyEnabled);
}

export function isInclusiveBhsConcessionContract(
  contract?: { bhsConcessionCoverage?: string | null } | null,
): boolean {
  return contract?.bhsConcessionCoverage === 'comprehensive';
}

export function isExclusiveBhsConcessionContract(
  contract?: { bhsConcessionCoverage?: string | null } | null,
): boolean {
  return contract?.bhsConcessionCoverage === 'non_comprehensive';
}

export type ContractConcessionScenarioKey =
  | 'Int'
  | 'Dom'
  | 'DivDom'
  | 'DivInt'
  | 'ReturnToRamp'
  | 'OriginateTerminatePercent'
  | 'CancellationWithinHoursPercent'
  | 'TechnicalHandlingChargesPercent'
  | 'StandbyChargesPercent'
  | 'FiloLifoChargesPercent'
  | 'FiloChargesPercent'
  | 'LifoChargesPercent'
  | 'DelayChargesPercent'
  | 'DomCargo'
  | 'IntCargo';

/** Concessions-page fee % by sector (additive after Total Amount). */
export type ContractConcessionRatesShape = {
  int?: number | null;
  dom?: number | null;
  divertedDom?: number | null;
  divertedInt?: number | null;
  domesticCargo?: number | null;
  internationalCargo?: number | null;
};

/** Fee scenarios a Concessions-page percent can apply to. */
export type ContractFeeScenarioKey = 'Int' | 'Dom' | 'DivDom' | 'DivInt' | 'DomCargo' | 'IntCargo';

/** Contracts-page conditional chargeable % of BHS package. */
export type ContractConditionalChargesShape = {
  divertedDom?: number | null;
  divertedInt?: number | null;
  divertedDomBme?: number | null;
  divertedIntBme?: number | null;
  divertedDomCargo?: number | null;
  divertedIntCargo?: number | null;
  divertedDomInt?: number | null;
  divertedIntDom?: number | null;
  returnToRamp?: number | null;
  originateTerminatePercent?: number | null;
  cancellationWithinHoursPercent?: number | null;
  technicalHandlingChargesPercent?: number | null;
  standbyChargesPercent?: number | null;
  filoLifoChargesPercent?: number | null;
  filoChargesPercent?: number | null;
  lifoChargesPercent?: number | null;
  ronAdditionalPercent?: number | null;
  lateArrivalAdditionalPercent?: number | null;
  extraGroundTimeAdditionalPercent?: number | null;
  delayChargesPercent?: number | null;
  /** International arrival + domestic departure: % over the domestic comprehensive rate. */
  splitIntArrivalDomDeparturePercent?: number | null;
  /** Domestic arrival + international departure: % over the international comprehensive rate. */
  splitDomArrivalIntDeparturePercent?: number | null;
};

export type InvoiceChargeContractShape = {
  royaltyAtGross?: number | null;
  cancellationWithinHours?: number | null;
  /** Concessions-page fee % (additive after Total Amount). */
  concessionRates?: ContractConcessionRatesShape | null;
  /** When true, concessionRates.int / dom win over the station Royalty Master percent. */
  concessionRatesOverrideStation?: boolean | null;
  /** Contracts-page conditional charges (BHS Charged / Amount). */
  conditionalCharges?: ContractConditionalChargesShape | null;
  bhsConcessionCoverage?: 'comprehensive' | 'non_comprehensive' | 'mixed' | null;
  extendedRoyaltyEnabled?: boolean | null;
  /**
   * What the concession percent is applied to. `invoice_amount` (default) uses
   * the billed handling amount. `aera_ceiling` uses the AERA ceiling rate per
   * flight (e.g. KLM HYD: "24% of the AERA ceiling rate") — the engine stamps
   * `aeraCeiling` on each line; lines without it fall back to the invoice amount.
   */
  concessionBase?: 'invoice_amount' | 'aera_ceiling' | null;
  /**
   * Station Royalty Setup fees. When set, a plain scheduled or general-aviation
   * flight uses this percent instead of the contract fee for that category.
   */
  stationFlightConcession?: {
    dom?: number;
    int?: number;
    ga?: number;
    gaDom?: number;
    gaInt?: number;
  } | null;
  /**
   * Station fee used only when the contract has no concession for that flight.
   * ADS invoices use this when the royalty dates miss the billing period but
   * cover the invoice date, so a blank contract does not bill at 0%.
   */
  stationFlightConcessionFallback?: {
    dom?: number;
    int?: number;
    ga?: number;
    gaDom?: number;
    gaInt?: number;
  } | null;
  /** Contract category. An international-only airline always uses the international royalty. */
  category?: string | null;
  categories?: Array<string | null | undefined> | null;
};

/** Ceiling is a contract charge, not a flight particular. */
export function isCeilingParticularLine(line: InvoiceLineConcessionInput): boolean {
  if (String(line.serviceCode ?? '').trim().toUpperCase() === 'CEILING') return true;
  if (line.sourceRef?.ceilingRate === true) return true;
  return /^ceiling rate$/i.test(String(line.description ?? '').trim());
}

export function roundBillingMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Per-flight ceiling in billing currency — keep 4 dp before × flight count. */
export function roundCeilingRatePerFlight(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10_000) / 10_000;
}

/** Ceiling concession total (rate × flights) — 2 dp on invoice money fields. */
export function roundCeilingConcessionTotal(n: number): number {
  return roundBillingMoney(n);
}

function positiveRate(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resolveRateOrDefault(
  value: unknown,
  fallback: unknown,
  defaultRate = 100,
): number {
  if (value != null && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (fallback != null && Number.isFinite(Number(fallback))) {
    return Number(fallback);
  }
  return defaultRate;
}

function pickStoredConcessionPercent(
  sourceRef: Record<string, unknown> | undefined,
): number | null {
  if (!sourceRef) return null;
  // Unit-scale (conditional charge) must not suppress the separate Concessions-page fee %.
  // Fee % is resolved from contract concessionRates in calculateInvoiceConcessionFromLines.
  const feeDirect = [
    sourceRef.concessionFeePercent,
    sourceRef.feeConcessionPercent,
  ];
  for (const candidate of feeDirect) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * Scenario for a line: the explicit `flightScenario` saved at preparation time
 * wins; text matching is only the fallback for records that predate the field.
 */
export function resolveLineFlightScenario(line: InvoiceLineConcessionInput): FlightScenario {
  const blob = flightSnapshotBlob(line);
  const stored = readStoredFlightScenario(blob.snap, blob.ref);
  if (stored) return stored;
  return classifyFlightScenarioFromText({
    allText: blob.allText,
    handlingCorpus: blob.handlingCorpus,
    categoryLower: blob.categoryRaw.toLowerCase(),
    snap: blob.snap,
  });
}

/**
 * Text-only classification used when a preparation record is (re)built.
 * Never reads a stored scenario, so a refresh always re-derives from source data.
 */
export function classifyFlightScenarioForPreparation(input: {
  sourceRef?: Record<string, unknown> | null;
  operationalData: Record<string, unknown>;
}): FlightScenario {
  const snapshot: Record<string, unknown> = { ...input.operationalData };
  delete snapshot[FLIGHT_SCENARIO_FIELD];
  const blob = flightSnapshotBlob({
    sourceRef: { ...(input.sourceRef ?? {}), operationalSnapshot: snapshot },
  } as InvoiceLineConcessionInput);
  return classifyFlightScenarioFromText({
    allText: blob.allText,
    handlingCorpus: blob.handlingCorpus,
    categoryLower: blob.categoryRaw.toLowerCase(),
    snap: blob.snap,
  });
}

function isDivertedFlightSnapshot(line: InvoiceLineConcessionInput): boolean {
  const blob = flightSnapshotBlob(line);
  const stored = readStoredFlightScenario(blob.snap, blob.ref);
  if (stored) return stored === 'diverted';
  return isDivertedText(blob);
}

function isTechnicalFlightSnapshot(line: InvoiceLineConcessionInput): boolean {
  const blob = flightSnapshotBlob(line);
  const stored = readStoredFlightScenario(blob.snap, blob.ref);
  if (stored) return stored === 'technical';
  return isTechnicalText({
    handlingCorpus: blob.handlingCorpus,
    categoryLower: blob.categoryRaw.toLowerCase(),
  });
}

function isStandbyFlightSnapshot(line: InvoiceLineConcessionInput): boolean {
  const blob = flightSnapshotBlob(line);
  const stored = readStoredFlightScenario(blob.snap, blob.ref);
  if (stored) return stored === 'standby';
  return isStandbyText({
    handlingCorpus: blob.handlingCorpus,
    categoryLower: blob.categoryRaw.toLowerCase(),
  });
}

type DivertedUnitChargeKey =
  | 'divertedDom'
  | 'divertedInt'
  | 'divertedDomBme'
  | 'divertedIntBme'
  | 'divertedDomCargo'
  | 'divertedIntCargo'
  | 'divertedDomInt'
  | 'divertedIntDom';

/** Most specific diverted percent for the flight's category of flight. */
export function divertedChargeKeyForCategory(categoryRaw: string): DivertedUnitChargeKey {
  const text = categoryRaw
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const domAt = text.search(/\b(?:domestic|dom)\b/);
  const intAt = text.search(/\b(?:international|int)\b/);
  const cargo = /\bcargo\b/.test(text);
  const bme = /\bbme\b/.test(text);
  if (domAt >= 0 && intAt >= 0) {
    return domAt < intAt ? 'divertedDomInt' : 'divertedIntDom';
  }
  if (bme && domAt >= 0) return 'divertedDomBme';
  if (bme && intAt >= 0) return 'divertedIntBme';
  if (cargo && domAt >= 0) return 'divertedDomCargo';
  if (cargo && intAt >= 0) return 'divertedIntCargo';
  if (domAt >= 0) return 'divertedDom';
  return 'divertedInt';
}

/**
 * Percent that replaces the BHS package on a diverted flight.
 * `diverted` with a null percent means the flight is diverted and its type has no saved rate.
 */
export function divertedUnitPricePercent(
  line: InvoiceLineConcessionInput,
  contract?: InvoiceChargeContractShape | null,
): { diverted: boolean; percent: number | null } {
  if (!isDivertedFlightSnapshot(line)) return { diverted: false, percent: null };
  const { categoryRaw } = flightSnapshotBlob(line);
  const key = divertedChargeKeyForCategory(categoryRaw);
  const value = resolveConditionalCharges(contract)[key];
  if (!hasExplicitConcessionRate(value)) return { diverted: true, percent: null };
  return { diverted: true, percent: Number(value) };
}

function isCancelledFlightSnapshot(
  line: InvoiceLineConcessionInput,
): boolean {
  const ref = line.sourceRef ?? {};
  const snap = (ref.operationalSnapshot as Record<string, unknown> | undefined) ?? ref;
  return (
    Boolean(snap.isCancelled) ||
    Boolean(snap.flightCancelled) ||
    String(snap.flightStatus ?? '').trim().toLowerCase() === 'cancelled'
  );
}

function ferryKindFromText(handling: string): 'filo' | 'lifo' | null {
  const text = handling.toLowerCase();
  if (
    /\blifo\b/.test(text) ||
    /last in first out/.test(text) ||
    /l(?:ive|oad)[\s/-]*in[\s/-]*ferry[\s/-]*out/.test(text)
  ) {
    return 'lifo';
  }
  if (
    /\bfilo\b/.test(text) ||
    /first in last out/.test(text) ||
    /ferry[\s/-]*in[\s/-]*l(?:ive|oad)[\s/-]*out/.test(text)
  ) {
    return 'filo';
  }
  return null;
}

const FERRY_TEXT_KEYS = [
  'TypeofHandling',
  'typeOfHandling',
  'typeofHandling',
  'Type of Handling',
  'Typeofflight',
  'typeofflight',
  'Type of flight',
  'flightType',
  'ops',
  'opsType',
  'operations',
  'ferryKind',
];

const ARRIVAL_PAX_KEYS = ['arrivalpax', 'ArrivalPax', 'arrPax', 'passengerArrived', 'paxArr'];
const DEPARTURE_PAX_KEYS = ['deppax', 'DepPax', 'depPax', 'departed', 'paxDep'];

function numericPax(row: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!row) return null;
  for (const key of keys) {
    const raw = row[key];
    if (raw == null || String(raw).trim() === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/**
 * FILO and LIFO from an fhr_collection document.
 * Explicit handling text wins. Otherwise arrival pax 0 and departure pax > 0 is FILO,
 * and arrival pax > 0 with departure pax 0 is LIFO. FIFO stays unclassified.
 */
export function ferryKindFromFhrDocument(
  doc: Record<string, unknown> | null | undefined,
): 'filo' | 'lifo' | null {
  if (!doc) return null;
  const embeds = [
    doc.mainDetails,
    doc.terminalDetails,
    doc.rampDetails1,
    doc.rampDetails3,
    doc.loadControlDetails,
    doc.loadDetails,
  ].filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');

  const text = embeds
    .flatMap((row) => FERRY_TEXT_KEYS.map((key) => String(row[key] ?? '').trim()))
    .filter(Boolean)
    .join(' ');
  const fromText = ferryKindFromText(text);
  if (fromText) return fromText;
  if (/\bfifo\b/.test(text.toLowerCase()) || /ferry[\s/-]*in[\s/-]*ferry[\s/-]*out/.test(text.toLowerCase())) {
    return null;
  }

  let arrival: number | null = null;
  let departure: number | null = null;
  for (const row of embeds) {
    if (arrival == null) arrival = numericPax(row, ARRIVAL_PAX_KEYS);
    if (departure == null) departure = numericPax(row, DEPARTURE_PAX_KEYS);
  }
  if (arrival == null || departure == null) return null;
  if (arrival === 0 && departure > 0) return 'filo';
  if (arrival > 0 && departure === 0) return 'lifo';
  return null;
}

/** Ferry-in/load-out is FILO. Load-in/ferry-out is LIFO. FIFO is neither. Remarks are ignored. */
function ferryHandlingKind(line: InvoiceLineConcessionInput): 'filo' | 'lifo' | null {
  const { snap, ref, handlingCorpus } = flightSnapshotBlob(line);
  const stamped = String(snap.ferryKind ?? ref.ferryKind ?? '').trim().toLowerCase();
  if (stamped === 'filo' || stamped === 'lifo') return stamped;
  const header = [
    'typeOfHandling',
    'TypeofHandling',
    'typeofHandling',
    'flightType',
    'ops',
    'opsType',
    'typeOfFlight',
    'Typeofflight',
  ]
    .map((key) => pickFlightText(snap, ref, [key]))
    .join(' ');
  return ferryKindFromText(header) ?? ferryKindFromText(handlingCorpus);
}

function groundMinutesOf(line: InvoiceLineConcessionInput): number | null {
  return actualGroundMinutes(line);
}

/**
 * Clause 1.2.9: 10% is added only when ATA passes STA, or ATD passes STD, by more than six hours.
 * A few minutes of delay does not qualify.
 */
function scheduleExceedsBySixHours(line: InvoiceLineConcessionInput): boolean {
  const arrival = lateArrivalMinutes(line);
  const departure = lateDepartureMinutes(line);
  const longest = Math.max(arrival ?? 0, departure ?? 0);
  return longest > 6 * 60;
}

function isSplitSectorFlight(line: InvoiceLineConcessionInput): boolean {
  const { categoryRaw } = flightSnapshotBlob(line);
  const compact = categoryRaw.toLowerCase().replace(/[^a-z]/g, '');
  return (
    compact.includes('domesticinternational') ||
    compact.includes('internationaldomestic') ||
    compact.includes('domint') ||
    compact.includes('intdom')
  );
}

function isSameSectorFlight(line: InvoiceLineConcessionInput): boolean {
  if (isSplitSectorFlight(line)) return false;
  const { categoryRaw } = flightSnapshotBlob(line);
  const normalized = normalizeFlightCategory(categoryRaw);
  return normalized === 'Dom' || normalized === 'Int';
}

/** RON: arrive 22:00–04:00, depart by 06:00, ground time at least 75 minutes. */
function matchesRemainOvernight(line: InvoiceLineConcessionInput): boolean {
  const ground = groundMinutesOf(line);
  if (ground == null || ground < 75) return false;
  const { snap, ref } = flightSnapshotBlob(line);
  const ata = snapshotDateTime(snap, ref, ['ataDate', 'ATADate'], ['ataTime', 'ATATime']);
  const atd = snapshotDateTime(snap, ref, ['atdDate', 'ATDDate'], ['atdTime', 'ATDTime']);
  if (!ata || !atd) return false;
  const arrival = clockMinutes(ata);
  const depart = clockMinutes(atd);
  const overnightArrival = arrival >= 22 * 60 || arrival <= 4 * 60;
  return overnightArrival && depart <= 6 * 60;
}

const ORIGINATE_TERMINATE_LABEL_KEYS = [
  'TypeofHandling',
  'typeOfHandling',
  'typeofHandling',
  'Typeofflight',
  'typeOfFlight',
  'flightType',
  'ops',
  'opsType',
] as const;

/**
 * FHR writes originate as Departure and terminate as Arrival on type-of-flight / ops.
 * Match that label exactly so a turnaround that merely mentions both legs is left alone.
 */
function isFhrOriginateOrTerminateLabel(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text.length > 40) return false;
  if (/\boriginat/.test(text) || /\bterminat/.test(text)) return true;
  return /^(departure|arrival)(\s+flight)?$/.test(text);
}

/** Originate has ATA only. Terminate has ATD only. FHR also labels them Departure / Arrival. */
export function isOriginateOrTerminateFlight(line: InvoiceLineConcessionInput): boolean {
  const { snap, ref } = flightSnapshotBlob(line);
  for (const key of ORIGINATE_TERMINATE_LABEL_KEYS) {
    if (isFhrOriginateOrTerminateLabel(snap[key]) || isFhrOriginateOrTerminateLabel(ref[key])) {
      return true;
    }
  }
  const hasAta = hasActualClock(line, ['ataTime', 'ATATime', 'ATA Time']);
  const hasAtd = hasActualClock(line, ['atdTime', 'ATDTime', 'ATD Time']);
  return hasAta !== hasAtd;
}

function isReturnToRampFlightSnapshot(line: InvoiceLineConcessionInput): boolean {
  const blob = flightSnapshotBlob(line);
  const stored = readStoredFlightScenario(blob.snap, blob.ref);
  if (stored) return stored === 'returnToRamp';
  return isReturnToRampText(blob);
}

/** True when cancellation falls inside the contract hours window (STA − intimation). */
export function matchesCancellationWithinHoursWindow(
  line: InvoiceLineConcessionInput,
  contract?: {
    cancellationWithinHours?: number | null;
  } | null,
): boolean {
  const threshold = Number(contract?.cancellationWithinHours ?? 0);
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  if (!isCancelledFlightSnapshot(line)) return false;

  const ref = line.sourceRef ?? {};
  const snap = (ref.operationalSnapshot as Record<string, unknown> | undefined) ?? ref;
  const staDate = String(
    snap.staDate ?? snap.STADate ?? snap.cancelledDate ?? ref.staDate ?? '',
  ).trim();
  const staTime = String(snap.staTime ?? snap.STATime ?? ref.staTime ?? '').trim();
  const intimationTime = String(
    snap.cancellationIntimationTime ??
      snap.intimationTime ??
      snap.cancelledAt ??
      snap.cancellationTime ??
      ref.cancellationIntimationTime ??
      '',
  ).trim();
  if (!staDate || !intimationTime) return false;

  const cancelledAt = new Date(intimationTime);
  const scheduledAt =
    parseLocalDateTime(staDate, staTime) ??
    (staDate ? new Date(`${staDate}T00:00:00`) : null);
  if (!scheduledAt || Number.isNaN(cancelledAt.getTime())) return false;

  const diffHours = (scheduledAt.getTime() - cancelledAt.getTime()) / 36e5;
  return Number.isFinite(diffHours) && diffHours >= 0 && diffHours <= threshold;
}

/**
 * Contracts-page conditional charges that scale BHS unit price (Charged / Amount).
 * Concessions-page Dom/Int/Div fees stay on the header path after Total Amount.
 */
export const BHS_UNIT_PRICE_CONCESSION_SCENARIOS: ReadonlySet<ContractConcessionScenarioKey> =
  new Set([
    'DivDom',
    'DivInt',
    'OriginateTerminatePercent',
    'CancellationWithinHoursPercent',
    'TechnicalHandlingChargesPercent',
    'StandbyChargesPercent',
    'FiloLifoChargesPercent',
    'FiloChargesPercent',
    'LifoChargesPercent',
    'DelayChargesPercent',
    'ReturnToRamp',
  ]);

function hasExplicitConcessionRate(value: unknown): boolean {
  return value != null && String(value).trim() !== '' && Number.isFinite(Number(value));
}

/**
 * Contracts-page conditional charges (chargeable % of the BHS package).
 * These live only on `conditionalCharges`; `concessionRates` holds the
 * Concessions-page fee percents (Dom / Int / diverted / cargo) and nothing else.
 */
function resolveConditionalCharges(
  contract?: InvoiceChargeContractShape | null,
): ContractConditionalChargesShape {
  return contract?.conditionalCharges ?? {};
}

/**
 * Whether compose should multiply BHS package rate by the conditional charge %.
 */
export function shouldApplyConcessionToBhsUnitPrice(
  scenario: ContractConcessionScenarioKey,
  contract?: InvoiceChargeContractShape | null,
): boolean {
  if (!BHS_UNIT_PRICE_CONCESSION_SCENARIOS.has(scenario)) return false;
  const charges = resolveConditionalCharges(contract);
  switch (scenario) {
    case 'DivDom':
      return hasExplicitConcessionRate(charges.divertedDom);
    case 'DivInt':
      return hasExplicitConcessionRate(charges.divertedInt);
    case 'OriginateTerminatePercent':
      return hasExplicitConcessionRate(charges.originateTerminatePercent);
    case 'CancellationWithinHoursPercent':
      return hasExplicitConcessionRate(charges.cancellationWithinHoursPercent);
    case 'TechnicalHandlingChargesPercent':
      return hasExplicitConcessionRate(charges.technicalHandlingChargesPercent);
    case 'StandbyChargesPercent':
      return hasExplicitConcessionRate(charges.standbyChargesPercent);
    case 'FiloLifoChargesPercent':
      return hasExplicitConcessionRate(charges.filoLifoChargesPercent);
    case 'FiloChargesPercent':
      return (
        hasExplicitConcessionRate(charges.filoChargesPercent) ||
        hasExplicitConcessionRate(charges.filoLifoChargesPercent)
      );
    case 'LifoChargesPercent':
      return (
        hasExplicitConcessionRate(charges.lifoChargesPercent) ||
        hasExplicitConcessionRate(charges.filoLifoChargesPercent)
      );
    case 'DelayChargesPercent':
      return hasExplicitConcessionRate(charges.delayChargesPercent);
    case 'ReturnToRamp':
      return positiveRate(charges.returnToRamp) > 0;
    default:
      return false;
  }
}

function resolveConditionalRatesByScenario(
  contract?: InvoiceChargeContractShape | null,
): Record<ContractConcessionScenarioKey, number> {
  const charges = resolveConditionalCharges(contract);
  return {
    Int: 0,
    Dom: 0,
    DivDom: positiveRate(charges.divertedDom),
    DivInt: positiveRate(charges.divertedInt),
    ReturnToRamp: positiveRate(charges.returnToRamp),
    OriginateTerminatePercent: positiveRate(charges.originateTerminatePercent),
    CancellationWithinHoursPercent: positiveRate(charges.cancellationWithinHoursPercent),
    TechnicalHandlingChargesPercent: positiveRate(charges.technicalHandlingChargesPercent),
    StandbyChargesPercent: positiveRate(charges.standbyChargesPercent),
    FiloLifoChargesPercent: positiveRate(charges.filoLifoChargesPercent),
    FiloChargesPercent: positiveRate(charges.filoChargesPercent),
    LifoChargesPercent: positiveRate(charges.lifoChargesPercent),
    DelayChargesPercent: positiveRate(charges.delayChargesPercent),
    DomCargo: 0,
    IntCargo: 0,
  };
}

function ferryReplacementPercent(
  line: InvoiceLineConcessionInput,
  contract?: InvoiceChargeContractShape | null,
): number | null {
  const kind = ferryHandlingKind(line);
  if (!kind) return null;
  const charges = resolveConditionalCharges(contract);
  const specific =
    kind === 'lifo' ? charges.lifoChargesPercent : charges.filoChargesPercent;
  if (hasExplicitConcessionRate(specific)) return Number(specific);
  if (hasExplicitConcessionRate(charges.filoLifoChargesPercent)) {
    return Number(charges.filoLifoChargesPercent);
  }
  return null;
}

/**
 * Extra percent added on top of the handling amount (not a replacement of it).
 * Return to ramp is not an add-on: that percent replaces the package rate.
 * RON is exclusive of late-arrival and extra-ground add-ons.
 * Split-sector flights do not get RON or extra ground time.
 */
export function resolveLineAdditionalChargePercent(
  line: InvoiceLineConcessionInput,
  contract?: InvoiceChargeContractShape | null,
): number {
  const charges = resolveConditionalCharges(contract);
  const ron = positiveRate(charges.ronAdditionalPercent);
  const late = positiveRate(charges.lateArrivalAdditionalPercent);
  const ground = positiveRate(charges.extraGroundTimeAdditionalPercent);
  const delayAdditional =
    positiveRate(charges.delayChargesPercent) > 0 && scheduleExceedsBySixHours(line)
      ? positiveRate(charges.delayChargesPercent)
      : 0;
  if (ron <= 0 && late <= 0 && ground <= 0 && delayAdditional <= 0) return 0;

  const split = isSplitSectorFlight(line);
  if (!split && ron > 0 && matchesRemainOvernight(line)) return ron + delayAdditional;

  let extra = delayAdditional;
  const lateMinutes = lateArrivalMinutes(line);
  if (late > 0 && lateMinutes != null && lateMinutes > 75) extra += late;
  const groundMinutes = groundMinutesOf(line);
  if (
    !split &&
    ground > 0 &&
    isSameSectorFlight(line) &&
    groundMinutes != null &&
    groundMinutes > 75
  ) {
    extra += ground;
  }
  return extra;
}

/** Conditional charge % for BHS unit scaling (Contracts-page terms). */
export function resolveLineConcessionPercent(
  line: InvoiceLineConcessionInput,
  contract?: InvoiceChargeContractShape | null,
): number {
  const rates = resolveConditionalRatesByScenario(contract);
  const cancellationConfigured = hasExplicitConcessionRate(
    resolveConditionalCharges(contract).cancellationWithinHoursPercent,
  );
  if (cancellationConfigured && matchesCancellationWithinHoursWindow(line, contract)) {
    return rates.CancellationWithinHoursPercent;
  }

  const ferryPercent = ferryReplacementPercent(line, contract);
  if (ferryPercent != null) return ferryPercent;

  const divertedUnit = divertedUnitPricePercent(line, contract);
  const returnToRamp = positiveRate(resolveConditionalCharges(contract).returnToRamp);
  const isTechnicalHandling = isTechnicalFlightSnapshot(line);
  const isStandby = isStandbyFlightSnapshot(line);

  if (divertedUnit.diverted) return divertedUnit.percent ?? 0;
  if (returnToRamp > 0 && isReturnToRampFlightSnapshot(line)) return returnToRamp;
  if (isTechnicalHandling) return rates.TechnicalHandlingChargesPercent;
  if (isStandby) return rates.StandbyChargesPercent;
  if (isOriginateOrTerminateFlight(line) && rates.OriginateTerminatePercent > 0) {
    return rates.OriginateTerminatePercent;
  }
  return 0;
}

/** Concessions-page fee % (additive after Total Amount). */
export function resolveLineFeeConcessionPercent(
  line: InvoiceLineConcessionInput,
  contract?: InvoiceChargeContractShape | null,
): number {
  const rates = resolveConcessionRatesByScenario(contract);
  const { handlingRaw, categoryRaw } = flightSnapshotBlob(line);
  const categoryLower = categoryRaw.toLowerCase();
  const isDiverted = isDivertedFlightSnapshot(line);
  const normalized = normalizeFlightCategory(categoryRaw);
  const internationalAirline = isInternationalOnlyAirline(contract);
  const isDom =
    !internationalAirline &&
    (normalized === 'Dom' ||
      (/domestic/.test(categoryLower) && !/international/.test(categoryLower)));
  const isCargo = /cargo/.test(categoryLower);

  const sector = concessionSectorForAirline(
    flightConcessionSectorFromText(categoryRaw, handlingRaw),
    contract,
  );
  const rawRates = contract?.concessionRates;
  const explicitDiverted = isDiverted
    ? isDom
      ? rawRates?.divertedDom
      : rawRates?.divertedInt
    : undefined;
  const fromContract = (() => {
    if (
      isDiverted &&
      explicitDiverted != null &&
      Number.isFinite(Number(explicitDiverted))
    ) {
      return Number(explicitDiverted);
    }
    if (!isCargo) {
      // Airline-specific agreement: the contract's own fee % beats the station default.
      if (contract?.concessionRatesOverrideStation === true) {
        const own = positiveRate(isDom ? rawRates?.dom : rawRates?.int);
        if (own > 0) return own;
      }
      const stationPercent = stationPercentForSector(contract?.stationFlightConcession, sector);
      if (stationPercent != null && stationPercent > 0) return stationPercent;
    }
    if (isCargo && isDom) return resolveRateOrDefault(rates.DomCargo, contract?.royaltyAtGross);
    if (isCargo) return resolveRateOrDefault(rates.IntCargo, contract?.royaltyAtGross);
    if (isDom) return resolveRateOrDefault(rates.Dom, contract?.royaltyAtGross);
    return resolveRateOrDefault(rates.Int, contract?.royaltyAtGross);
  })();
  if (fromContract > 0) return fromContract;
  const fallback = stationPercentForSector(contract?.stationFlightConcessionFallback, sector);
  return fallback != null && fallback > 0 ? fallback : fromContract;
}

/** Legacy single % on contract — used when scenario rates are not set. */
export function legacyConcessionPercentFromContract(
  contract?: { royaltyAtGross?: number | null } | null,
): number {
  return positiveRate(contract?.royaltyAtGross);
}

export function resolveConcessionRatesByScenario(
  contract?: InvoiceChargeContractShape | null,
): Record<ContractFeeScenarioKey, number> {
  const legacy = legacyConcessionPercentFromContract(contract);
  const rates = contract?.concessionRates ?? {};
  return {
    Int: positiveRate(rates.int) || legacy,
    Dom: positiveRate(rates.dom) || legacy,
    DivDom: positiveRate(rates.divertedDom) || legacy,
    DivInt: positiveRate(rates.divertedInt) || legacy,
    DomCargo: positiveRate(rates.domesticCargo),
    IntCargo: positiveRate(rates.internationalCargo),
  };
}

export function inferConcessionScenarioFromLine(
  line: InvoiceLineConcessionInput,
  contract?: {
    royaltyAtGross?: number | null;
    cancellationWithinHours?: number | null;
    concessionRates?: ContractConcessionRatesShape | null;
  } | null,
): ContractConcessionScenarioKey {
  if (matchesCancellationWithinHoursWindow(line, contract)) {
    return 'CancellationWithinHoursPercent';
  }

  const { categoryRaw } = flightSnapshotBlob(line);
  const categoryLower = categoryRaw.toLowerCase();
  if (
    isReturnToRampFlightSnapshot(line) &&
    positiveRate(resolveConditionalCharges(contract).returnToRamp) > 0
  ) {
    return 'ReturnToRamp';
  }
  const ferryKind = ferryHandlingKind(line);
  if (ferryKind === 'filo' && ferryReplacementPercent(line, contract) != null) {
    return 'FiloChargesPercent';
  }
  if (ferryKind === 'lifo' && ferryReplacementPercent(line, contract) != null) {
    return 'LifoChargesPercent';
  }
  const isDiverted = isDivertedFlightSnapshot(line);
  const isTechnicalHandling = isTechnicalFlightSnapshot(line);
  const isStandby = isStandbyFlightSnapshot(line);

  const normalized = normalizeFlightCategory(categoryRaw);
  const isDom =
    normalized === 'Dom' ||
    (/domestic/.test(categoryLower) && !/international/.test(categoryLower));
  const isCargo = /cargo/.test(categoryLower);

  if (isDiverted && isDom) return 'DivDom';
  if (isDiverted) return 'DivInt';
  if (isTechnicalHandling) return 'TechnicalHandlingChargesPercent';
  if (isStandby) return 'StandbyChargesPercent';
  if (
    isOriginateOrTerminateFlight(line) &&
    positiveRate(resolveConditionalCharges(contract).originateTerminatePercent) > 0
  ) {
    return 'OriginateTerminatePercent';
  }
  if (isCargo && isDom) return 'DomCargo';
  if (isCargo) return 'IntCargo';
  if (isDom) return 'Dom';
  return 'Int';
}

export type InvoiceCurrencyTaxOptions = {
  /** Invoice billing currency for Fields 1–5 (Rate/Amount/Total/Concession/Gross). */
  currencyCode?: string | null;
  /** USD→INR ROE. Used only when currencyCode is USD to build Field 6 tax base. */
  currencyFactor?: number | null;
  /** When true on USD invoices, CGST/SGST and receivable stay in USD (no INR conversion). */
  totalReceivableInUsd?: boolean | null;
  /** Scheduled flights on this invoice. Overrides the count derived from lines. */
  scheduledFlightCount?: number;
  /**
   * ADS / RAF / custom invoices follow the airline's Inclusive / Exclusive mode
   * without the BHS ceiling × scheduled-flight comparison.
   * Prefer `invoiceCategory`; this flag remains for older callers.
   */
  adsConcession?: boolean;
  /** Invoice service type (BHS, ADS, RAF, …). Drives Inclusive/Exclusive for every airline. */
  invoiceCategory?: string | null;
  /**
   * Typed on the invoice edit screen. Replaces the contract percent.
   * Exclusive + royalty on gross uses percent / (100 − percent) on every service type.
   */
  concessionPercentOverride?: number | null;
  /**
   * Uploaded MAG total for this airline's flights in the invoice month.
   * When set, it replaces the contract ceiling on every exclusive invoice.
   */
  magFloorAmount?: number | null;
};

function invoiceCategoryCode(options?: InvoiceCurrencyTaxOptions): string {
  return String(options?.invoiceCategory ?? '').trim().toUpperCase();
}

/** ADS, RAF, custom, and MAAS — same Inclusive/Exclusive percent, no BHS flight ceiling. */
function isNonBhsInvoiceConcession(options?: InvoiceCurrencyTaxOptions): boolean {
  if (options?.adsConcession) return true;
  const category = invoiceCategoryCode(options);
  return category === 'ADS' || category === 'RAF' || category === 'CUSTOM' || category === 'MAAS';
}

export type InvoiceConcessionTotals = {
  subtotalExclTax: number;
  concessionFeePercent: number;
  concessionFeeAmount: number;
  /** Gross in billing currency (Field 5). */
  grossAmount: number;
  /** Gross in INR after FX for USD bills; equals grossAmount for INR bills (Field 6). */
  grossAmountInr: number;
  cgstPercent: number;
  cgstAmount: number;
  sgstPercent: number;
  sgstAmount: number;
  taxTotal: number;
  /** Always INR receivable = Field 6 + Field 7. */
  totalInclTax: number;
};

/** CGST/SGST are each 9% of the USD gross when receivable is billed in USD. */
function taxTotalsFromUsdGross(grossAmountUsd: number): Pick<
  InvoiceConcessionTotals,
  'cgstPercent' | 'cgstAmount' | 'sgstPercent' | 'sgstAmount' | 'taxTotal' | 'totalInclTax'
> {
  const grossUsd = roundBillingMoney(grossAmountUsd);
  const cgstAmount =
    grossUsd > 0 ? roundBillingMoney(grossUsd * (INVOICE_CGST_PERCENT / 100)) : 0;
  const sgstAmount =
    grossUsd > 0 ? roundBillingMoney(grossUsd * (INVOICE_SGST_PERCENT / 100)) : 0;
  const taxTotal = roundBillingMoney(cgstAmount + sgstAmount);
  const totalInclTax = roundBillingMoney(grossUsd + taxTotal);
  return {
    cgstPercent: INVOICE_CGST_PERCENT,
    cgstAmount,
    sgstPercent: INVOICE_SGST_PERCENT,
    sgstAmount,
    taxTotal,
    totalInclTax,
  };
}

/**
 * CGST/SGST are each 9% of the INR gross (Field 6).
 * For USD invoices, convert billing-currency gross → INR first; do not tax USD amounts.
 */
function taxTotalsFromInrGross(grossAmountInr: number): Pick<
  InvoiceConcessionTotals,
  'cgstPercent' | 'cgstAmount' | 'sgstPercent' | 'sgstAmount' | 'taxTotal' | 'totalInclTax'
> {
  const grossInr = roundBillingMoney(grossAmountInr);
  const cgstAmount =
    grossInr > 0 ? roundBillingMoney(grossInr * (INVOICE_CGST_PERCENT / 100)) : 0;
  const sgstAmount =
    grossInr > 0 ? roundBillingMoney(grossInr * (INVOICE_SGST_PERCENT / 100)) : 0;
  const taxTotal = roundBillingMoney(cgstAmount + sgstAmount);
  const totalInclTax = roundBillingMoney(grossInr + taxTotal);
  return {
    cgstPercent: INVOICE_CGST_PERCENT,
    cgstAmount,
    sgstPercent: INVOICE_SGST_PERCENT,
    sgstAmount,
    taxTotal,
    totalInclTax,
  };
}

export function resolveGrossAmountInr(
  grossAmountBilling: number,
  options?: InvoiceCurrencyTaxOptions,
): number {
  const gross = roundBillingMoney(grossAmountBilling);
  const currency = String(options?.currencyCode ?? 'INR').trim().toUpperCase();
  if (currency !== 'USD') return gross;
  const factor = Number(options?.currencyFactor);
  if (!Number.isFinite(factor) || factor <= 0) return gross;
  return roundBillingMoney(gross * factor);
}

/** CGST/SGST are each 9% of (subtotal + concession), always on the INR gross. */
export function calculateInvoiceConcessionTotals(
  subtotalExclTax: number,
  concessionPercent = 0,
  options?: InvoiceCurrencyTaxOptions,
): InvoiceConcessionTotals {
  const subtotal = roundBillingMoney(subtotalExclTax);
  const concessionFeePercent = concessionPercent > 0 ? concessionPercent : 0;
  const concessionFeeAmount =
    concessionFeePercent > 0 && subtotal > 0
      ? roundBillingMoney(subtotal * (concessionFeePercent / 100))
      : 0;
  const grossAmount = roundBillingMoney(subtotal + concessionFeeAmount);
  const currency = String(options?.currencyCode ?? 'INR').trim().toUpperCase();
  const usdReceivable =
    currency === 'USD' && Boolean(options?.totalReceivableInUsd);
  const grossAmountInr = usdReceivable
    ? 0
    : resolveGrossAmountInr(grossAmount, options);
  const taxTotals = usdReceivable
    ? taxTotalsFromUsdGross(grossAmount)
    : taxTotalsFromInrGross(grossAmountInr);
  return {
    subtotalExclTax: subtotal,
    concessionFeePercent,
    concessionFeeAmount,
    grossAmount,
    grossAmountInr,
    ...taxTotals,
  };
}

function lineExclAmount(line: InvoiceLineConcessionInput): number {
  const amt = Number(line.lineAmountExclTax);
  return Number.isFinite(amt) && amt > 0 ? amt : 0;
}

function preparationIdsOf(line: InvoiceLineConcessionInput): unknown[] {
  if (Array.isArray(line.preparationRecordIds) && line.preparationRecordIds.length > 0) {
    return line.preparationRecordIds;
  }
  const nested = line.sourceRef?.preparationRecordIds;
  return Array.isArray(nested) ? nested : [];
}

function isBhsFlightLine(line: InvoiceLineConcessionInput): boolean {
  const sourceType = String(line.sourceType ?? '').trim().toLowerCase();
  const service = String(line.serviceCode ?? '').trim().toLowerCase();
  return (
    sourceType === 'scheduled_flight' ||
    sourceType === 'bhs' ||
    service === 'bhs' ||
    service === 'scheduled flight' ||
    service === 'trnd' ||
    /^charges for turnaround handling/i.test(String(line.description ?? ''))
  );
}

/** Flights on this invoice: unique prep rows, otherwise the particular quantities. */
export function invoiceScheduledFlightCount(lines: InvoiceLineConcessionInput[]): number {
  const ids = new Set<string>();
  let qty = 0;
  for (const line of lines) {
    if (isCeilingParticularLine(line)) continue;
    const prepIds = preparationIdsOf(line).filter((id) => {
      const key = String(id ?? '').trim();
      return key.length > 0 && key !== 'undefined' && key !== 'null';
    });
    if (prepIds.length > 0) {
      for (const id of prepIds) ids.add(String(id).trim());
      continue;
    }
    if (!isBhsFlightLine(line)) continue;
    const count = Number(line.quantity);
    if (Number.isFinite(count) && count > 0) qty += count;
  }
  return ids.size > 0 ? ids.size : qty;
}

/** Ceiling per flight in invoice billing currency (INR or USD), converting when only the other currency is saved. */
export function resolveCeilingRatePerFlightInBillingCurrency(
  contract:
    | {
        ceilingRatePerFlightINR?: number | null;
        ceilingRatePerFlightUSD?: number | null;
      }
    | null
    | undefined,
  currencyCode: string,
  currencyFactor?: number | null,
): number {
  const currency = String(currencyCode ?? 'INR').trim().toUpperCase();
  const inr = Number(contract?.ceilingRatePerFlightINR);
  const usd = Number(contract?.ceilingRatePerFlightUSD);
  const hasInr = Number.isFinite(inr) && inr > 0;
  const hasUsd = Number.isFinite(usd) && usd > 0;
  const factor = Number(currencyFactor);
  const hasFactor = Number.isFinite(factor) && factor > 0;

  if (currency === 'USD') {
    if (hasUsd) return roundCeilingRatePerFlight(usd);
    if (hasInr && hasFactor) return roundCeilingRatePerFlight(inr / factor);
    return 0;
  }
  if (hasInr) return roundCeilingRatePerFlight(inr);
  if (hasUsd && hasFactor) return roundCeilingRatePerFlight(usd * factor);
  return 0;
}

/**
 * Share of the comprehensive / BHS package this line was actually charged.
 * 50% technical or originate → 0.5. 20% extra → 1.2. Full package → 1.
 */
export function ceilingChargeFactorForLine(line: InvoiceLineConcessionInput): number {
  const ref = (line.sourceRef ?? {}) as Record<string, unknown>;
  const packageRate = Number(ref.bhsPackageRate ?? ref.chargeAmountPerFlight);
  const charged = Number(line.unitPrice);
  if (Number.isFinite(packageRate) && packageRate > 0 && Number.isFinite(charged) && charged > 0) {
    return charged / packageRate;
  }

  let factor = 1;
  const applied = ref.concessionAppliedToUnitPrice === true;
  const pct = Number(ref.concessionPercent);
  if (applied && Number.isFinite(pct) && pct >= 0) factor = pct / 100;
  const extra = Number(ref.additionalChargePercent);
  if (Number.isFinite(extra) && extra !== 0) factor *= 1 + extra / 100;
  const splitExtra = Number(ref.splitAdditionalPercent);
  if (Number.isFinite(splitExtra) && splitExtra !== 0) factor *= 1 + splitExtra / 100;
  const cancel = ref.cancellationChargeablePercent;
  if (cancel != null && cancel !== '' && Number.isFinite(Number(cancel)) && Number(cancel) >= 0) {
    factor *= Number(cancel) / 100;
  }
  return factor > 0 ? factor : 1;
}

function lineFlightCount(line: InvoiceLineConcessionInput): number {
  const qty = Number(line.quantity);
  if (Number.isFinite(qty) && qty > 0) return qty;
  const stored = Number((line.sourceRef ?? {}).flightCount);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return 0;
}

function contractCeilingAmount(
  contract:
    | {
        ceilingRatePerFlightINR?: number | null;
        ceilingRatePerFlightUSD?: number | null;
      }
    | null
    | undefined,
  currencyCode: string,
  flightCount: number,
  currencyFactor?: number | null,
): number {
  if (!(flightCount > 0)) return 0;
  const rate = resolveCeilingRatePerFlightInBillingCurrency(
    contract,
    currencyCode,
    currencyFactor,
  );
  if (rate <= 0) return 0;
  return roundCeilingConcessionTotal(rate * flightCount);
}

/** Ceiling × each flight’s charge factor (50% package → half ceiling, 120% → 1.2×). */
function scaledContractCeilingAmount(
  contract:
    | {
        ceilingRatePerFlightINR?: number | null;
        ceilingRatePerFlightUSD?: number | null;
      }
    | null
    | undefined,
  currencyCode: string,
  flightCount: number,
  currencyFactor: number | null | undefined,
  lines: InvoiceLineConcessionInput[],
): number {
  const rate = resolveCeilingRatePerFlightInBillingCurrency(
    contract,
    currencyCode,
    currencyFactor,
  );
  if (rate <= 0) return 0;
  const bhsLines = lines.filter((line) => isBhsFlightLine(line) && lineFlightCount(line) > 0);
  if (bhsLines.length === 0) return contractCeilingAmount(contract, currencyCode, flightCount, currencyFactor);

  let total = 0;
  let counted = 0;
  for (const line of bhsLines) {
    const count = lineFlightCount(line);
    counted += count;
    total += rate * count * ceilingChargeFactorForLine(line);
  }
  if (flightCount > counted) total += rate * (flightCount - counted);
  return roundCeilingConcessionTotal(total);
}

function bhsScheduledFlightSubtotal(particulars: InvoiceLineConcessionInput[]): number {
  return roundBillingMoney(
    particulars
      .filter((line) => isBhsFlightLine(line))
      .reduce((sum, line) => sum + lineExclAmount(line), 0),
  );
}

function adsLineFeePercent(
  line: InvoiceLineConcessionInput,
  contract?: InvoiceChargeContractShape | null,
): number {
  const stored = pickStoredConcessionPercent(
    line.sourceRef as Record<string, unknown> | undefined,
  );
  return stored != null ? stored : resolveLineFeeConcessionPercent(line, contract);
}

/**
 * Concession is saved as one invoice-level percent in contracts/royalty setup.
 * If rows only differ by zero/non-zero application, keep the single saved
 * positive percent instead of deriving a weighted one like 14.69%.
 */
function singleSavedPositivePercent(
  rows: InvoiceLineConcessionInput[],
  resolvePercent: (line: InvoiceLineConcessionInput) => number,
): number | null {
  const positive = new Set<number>();
  for (const line of rows) {
    const percent = resolvePercent(line);
    if (!(percent > 0)) continue;
    positive.add(roundBillingMoney(percent));
    if (positive.size > 1) return null;
  }
  return positive.size === 1 ? [...positive][0] : null;
}

/**
 * Exclusive ADS / RAF / custom: same saved percent and extended royalty as BHS,
 * without comparing against the BHS ceiling (that is per scheduled flight).
 */
function exclusiveNonBhsInvoiceConcession(
  particulars: InvoiceLineConcessionInput[],
  contract: InvoiceChargeContractShape | null | undefined,
  extended: boolean,
): { amount: number; labelPercent: number } {
  const rows = particulars.filter((line) => lineExclAmount(line) > 0);
  if (rows.length === 0) return { amount: 0, labelPercent: 0 };
  const singlePercent = singleSavedPositivePercent(
    rows,
    (line) => adsLineFeePercent(line, contract),
  );
  if (singlePercent != null) {
    const base = rows.reduce((sum, line) => sum + lineExclAmount(line), 0);
    return {
      amount: roundBillingMoney(base * exclusiveRoyaltyRate(extended, singlePercent)),
      labelPercent: singlePercent,
    };
  }

  let base = 0;
  let amount = 0;
  let weightedPercent = 0;
  const labels = new Set<number>();
  for (const line of rows) {
    const percent = adsLineFeePercent(line, contract);
    const lineAmount = lineExclAmount(line);
    base += lineAmount;
    weightedPercent += lineAmount * percent;
    amount += lineAmount * exclusiveRoyaltyRate(extended, percent);
    labels.add(roundBillingMoney(percent));
  }
  const labelPercent =
    labels.size === 1
      ? [...labels][0]
      : base > 0
        ? roundBillingMoney(weightedPercent / base)
        : 0;
  return { amount: roundBillingMoney(amount), labelPercent };
}

function exclusivePercentConcession(
  particulars: InvoiceLineConcessionInput[],
  contract: InvoiceChargeContractShape | null | undefined,
  extended: boolean,
): { amount: number; labelPercent: number } {
  const bhsLines = particulars.filter(
    (line) => isBhsFlightLine(line) && lineExclAmount(line) > 0,
  );
  const rows =
    bhsLines.length > 0
      ? bhsLines
      : particulars.filter((line) => lineExclAmount(line) > 0);
  if (rows.length === 0) return { amount: 0, labelPercent: 0 };
  const singlePercent = singleSavedPositivePercent(
    rows,
    (line) => adsLineFeePercent(line, contract),
  );
  if (singlePercent != null) {
    const base = rows.reduce((sum, line) => sum + lineExclAmount(line), 0);
    return {
      amount: roundBillingMoney(base * exclusiveRoyaltyRate(extended, singlePercent)),
      labelPercent: singlePercent,
    };
  }

  let base = 0;
  let amount = 0;
  let weightedPercent = 0;
  const labels = new Set<number>();
  for (const line of rows) {
    const percent = adsLineFeePercent(line, contract);
    const lineAmount = lineExclAmount(line);
    base += lineAmount;
    weightedPercent += lineAmount * percent;
    amount += lineAmount * exclusiveRoyaltyRate(extended, percent);
    labels.add(roundBillingMoney(percent));
  }
  const labelPercent =
    labels.size === 1
      ? [...labels][0]
      : base > 0
        ? roundBillingMoney(weightedPercent / base)
        : 0;
  return { amount: roundBillingMoney(amount), labelPercent };
}

/**
 * Concession computed on the AERA ceiling instead of the billed amount:
 * Σ (ceiling per flight × flights × percent). Returns null when any flight
 * line has no stamped ceiling, so the caller keeps the normal calculation.
 *
 * The percent is applied flat (24% of the ceiling is ₹51,978, as the SGHA
 * states); the Royalty-on-Gross gross-up p/(100−p) is not applied here because
 * the ceiling already is the gross figure the airport operator benchmarks.
 */
export function aeraCeilingBasedConcession(
  particulars: InvoiceLineConcessionInput[],
  contract: InvoiceChargeContractShape | null | undefined,
  _extendedRoyalty: boolean,
): { amount: number; labelPercent: number; ceilingBase: number } | null {
  const flightLines = particulars.filter((line) => isBhsFlightLine(line) && lineExclAmount(line) > 0);
  if (flightLines.length === 0) return null;
  let amount = 0;
  let ceilingBase = 0;
  const percents = new Set<number>();
  for (const line of flightLines) {
    const ref = (line.sourceRef ?? {}) as Record<string, unknown>;
    const ceiling = Number(ref.aeraCeiling);
    if (!Number.isFinite(ceiling) || ceiling <= 0) return null;
    const flights = lineFlightCount(line);
    if (flights <= 0) return null;
    const stored = pickStoredConcessionPercent(ref);
    const pct = stored != null ? stored : resolveLineFeeConcessionPercent(line, contract);
    if (pct > 0) percents.add(roundBillingMoney(pct));
    const base = ceiling * flights;
    ceilingBase += base;
    amount += base * (pct / 100);
  }
  return {
    amount: roundBillingMoney(amount),
    labelPercent: percents.size === 1 ? [...percents][0] : 0,
    ceilingBase: roundBillingMoney(ceilingBase),
  };
}

function exclusiveWithMagFloor(
  percentAmount: number,
  labelPercent: number,
  magFloor: number,
): { concessionFeePercent: number; concessionFeeAmount: number } {
  const concessionFeeAmount = roundBillingMoney(Math.max(percentAmount, magFloor));
  if (concessionFeeAmount <= 0) {
    return { concessionFeePercent: 0, concessionFeeAmount: 0 };
  }
  if (magFloor > percentAmount + 0.004) {
    return { concessionFeePercent: 0, concessionFeeAmount };
  }
  return { concessionFeePercent: labelPercent, concessionFeeAmount: percentAmount };
}

function exclusiveBhsInvoiceConcession(opts: {
  particulars: InvoiceLineConcessionInput[];
  subtotal: number;
  contract?:
    | (InvoiceChargeContractShape & {
        ceilingRatePerFlightINR?: number | null;
        ceilingRatePerFlightUSD?: number | null;
      })
    | null;
  currencyCode: string;
  flightCount: number;
  ceilingFromLines: number;
  currencyFactor?: number | null;
  extendedRoyalty?: boolean;
}): { concessionFeePercent: number; concessionFeeAmount: number } {
  const fromSaved = exclusivePercentConcession(
    opts.particulars,
    opts.contract,
    Boolean(opts.extendedRoyalty),
  );
  const percentAmount = fromSaved.amount;
  const fromContract = scaledContractCeilingAmount(
    opts.contract,
    opts.currencyCode,
    opts.flightCount,
    opts.currencyFactor,
    opts.particulars,
  );
  const ceilingTotal = fromContract > 0 ? fromContract : opts.ceilingFromLines;
  const concessionFeeAmount = roundBillingMoney(Math.max(percentAmount, ceilingTotal));
  if (concessionFeeAmount <= 0) {
    return { concessionFeePercent: 0, concessionFeeAmount: 0 };
  }
  if (ceilingTotal > percentAmount + 0.004) {
    return { concessionFeePercent: 0, concessionFeeAmount };
  }
  // Label stays the percent saved on this station's contract. Extended royalty
  // only changes the amount (base × p/(100−p)).
  return {
    concessionFeePercent: fromSaved.labelPercent,
    concessionFeeAmount: percentAmount,
  };
}

/** Line-weighted concession % applied to the full invoice billing subtotal. */
export function calculateInvoiceConcessionFromLines(
  subtotalExclTax: number,
  lines: InvoiceLineConcessionInput[],
  contract?: InvoiceChargeContractShape & {
    ceilingRatePerFlightINR?: number | null;
    ceilingRatePerFlightUSD?: number | null;
  } | null,
  options?: InvoiceCurrencyTaxOptions,
): InvoiceConcessionTotals {
  const particulars = lines.filter((line) => !isCeilingParticularLine(line));
  const ceilingFromLines = roundBillingMoney(
    lines.reduce(
      (sum, line) => sum + (isCeilingParticularLine(line) ? lineExclAmount(line) : 0),
      0,
    ),
  );
  const lineSubtotal = particulars.reduce((sum, line) => sum + lineExclAmount(line), 0);

  let subtotal = roundBillingMoney(subtotalExclTax > 0 ? subtotalExclTax : lineSubtotal);
  if (ceilingFromLines > 0 && subtotal > lineSubtotal + 0.001) {
    subtotal = roundBillingMoney(lineSubtotal);
  }
  // Airline-specific override rates can carry more than 2 decimals (e.g. 36.92275%),
  // so keep full precision for them; the PDF label still prints 2 decimals.
  const precisePercent = contract?.concessionRatesOverrideStation === true;
  const concessionAmountFromLines = roundBillingMoney(
    particulars.reduce((sum, line) => {
      const amt = lineExclAmount(line);
      if (amt <= 0) return sum;
      const storedPercent = pickStoredConcessionPercent(
        line.sourceRef as Record<string, unknown> | undefined,
      );
      const pct =
        storedPercent != null
          ? storedPercent
          : resolveLineFeeConcessionPercent(line, contract);
      if (pct <= 0) return sum;
      const lineFee = amt * (pct / 100);
      return sum + (precisePercent ? lineFee : roundBillingMoney(lineFee));
    }, 0),
  );
  const rawConcessionFeePercent =
    lineSubtotal > 0 ? (concessionAmountFromLines * 100) / lineSubtotal : 0;
  const singlePercent = singleSavedPositivePercent(
    particulars.filter((line) => lineExclAmount(line) > 0),
    (line) => {
      const storedPercent = pickStoredConcessionPercent(
        line.sourceRef as Record<string, unknown> | undefined,
      );
      return storedPercent != null
        ? storedPercent
        : resolveLineFeeConcessionPercent(line, contract);
    },
  );
  const concessionFeePercent =
    singlePercent != null
      ? precisePercent
        ? singlePercent
        : roundBillingMoney(singlePercent)
      : precisePercent
        ? rawConcessionFeePercent
        : roundBillingMoney(rawConcessionFeePercent);
  const percentConcession =
    concessionFeePercent > 0 && subtotal > 0
      ? roundBillingMoney(subtotal * (concessionFeePercent / 100))
      : 0;
  const currency = String(options?.currencyCode ?? 'INR').trim().toUpperCase();
  const flightCount =
    options?.scheduledFlightCount != null && options.scheduledFlightCount >= 0
      ? options.scheduledFlightCount
      : invoiceScheduledFlightCount(particulars);
  const latestCeiling = scaledContractCeilingAmount(
    contract,
    currency,
    flightCount,
    options?.currencyFactor,
    particulars,
  );
  const ceilingConcession = latestCeiling > 0 ? latestCeiling : ceilingFromLines;
  let concessionFeeAmount: number;
  let concessionFeePercentFinal: number;
  const typedConcession = Number(options?.concessionPercentOverride);
  const nonBhs = isNonBhsInvoiceConcession(options);
  const magFloorRaw = Number(options?.magFloorAmount);
  const magFloor = Number.isFinite(magFloorRaw) && magFloorRaw >= 0 ? magFloorRaw : null;
  // Airline contract worded "x% of the AERA ceiling rate" (per airline, not per station).
  const aeraBased =
    contract?.concessionBase === 'aera_ceiling' && !nonBhs
      ? aeraCeilingBasedConcession(particulars, contract, usesExtendedRoyalty(contract))
      : null;
  if (options?.concessionPercentOverride != null && Number.isFinite(typedConcession)) {
    const pct = Math.min(100, Math.max(0, typedConcession));
    concessionFeePercentFinal = pct;
    concessionFeeAmount = roundBillingMoney(
      subtotal * exclusiveRoyaltyRate(usesExtendedRoyalty(contract), pct),
    );
  } else if (aeraBased) {
    // Contract says the royalty is a percent of the AERA ceiling, not of the discounted rate.
    // The fee is not a percent of the invoice amount, so no percent is shown on the invoice.
    concessionFeeAmount =
      magFloor != null ? roundBillingMoney(Math.max(aeraBased.amount, magFloor)) : aeraBased.amount;
    concessionFeePercentFinal = 0;
  } else if (isInclusiveBhsConcessionContract(contract)) {
    concessionFeeAmount = 0;
    concessionFeePercentFinal = 0;
  } else if (isExclusiveBhsConcessionContract(contract) && nonBhs) {
    const exclusiveNonBhs = exclusiveNonBhsInvoiceConcession(
      particulars,
      contract,
      usesExtendedRoyalty(contract),
    );
    if (magFloor != null) {
      const floored = exclusiveWithMagFloor(
        exclusiveNonBhs.amount,
        exclusiveNonBhs.labelPercent,
        magFloor,
      );
      concessionFeeAmount = floored.concessionFeeAmount;
      concessionFeePercentFinal = floored.concessionFeePercent;
    } else {
      concessionFeeAmount = exclusiveNonBhs.amount;
      concessionFeePercentFinal = exclusiveNonBhs.labelPercent;
    }
  } else if (isExclusiveBhsConcessionContract(contract) && magFloor != null) {
    const fromSaved = exclusivePercentConcession(
      particulars,
      contract,
      usesExtendedRoyalty(contract),
    );
    const floored = exclusiveWithMagFloor(fromSaved.amount, fromSaved.labelPercent, magFloor);
    concessionFeeAmount = floored.concessionFeeAmount;
    concessionFeePercentFinal = floored.concessionFeePercent;
  } else if (isExclusiveBhsConcessionContract(contract)) {
    const exclusive = exclusiveBhsInvoiceConcession({
      particulars,
      subtotal,
      contract,
      currencyCode: currency,
      flightCount,
      ceilingFromLines,
      currencyFactor: options?.currencyFactor,
      extendedRoyalty: usesExtendedRoyalty(contract),
    });
    concessionFeeAmount = exclusive.concessionFeeAmount;
    concessionFeePercentFinal = exclusive.concessionFeePercent;
  } else if (nonBhs) {
    concessionFeeAmount = percentConcession;
    concessionFeePercentFinal = concessionFeePercent;
  } else {
    concessionFeeAmount = roundBillingMoney(percentConcession + ceilingConcession);
    concessionFeePercentFinal = concessionFeePercent;
  }
  const grossAmount = roundBillingMoney(subtotal + concessionFeeAmount);
  const usdReceivable =
    currency === 'USD' && Boolean(options?.totalReceivableInUsd);
  const grossAmountInr = usdReceivable
    ? 0
    : resolveGrossAmountInr(grossAmount, options);
  const taxTotals = usdReceivable
    ? taxTotalsFromUsdGross(grossAmount)
    : taxTotalsFromInrGross(grossAmountInr);

  return {
    subtotalExclTax: subtotal,
    concessionFeePercent: concessionFeePercentFinal,
    concessionFeeAmount,
    grossAmount,
    grossAmountInr,
    ...taxTotals,
  };
}

/** @deprecated Use calculateInvoiceConcessionFromLines */
export function concessionPercentFromContract(
  contract?: { royaltyAtGross?: number | null } | null,
): number {
  return legacyConcessionPercentFromContract(contract);
}

/**
 * PDF totals follow the amounts already saved on the invoice header.
 * Recalculating from the contract here was adding the BHS ceiling onto ADS bills,
 * so View PDF disagreed with the invoice page.
 */
export function concessionTotalsFromSavedHeader(header: {
  currencyCode?: string | null;
  currencyFactor?: number | null;
  totalReceivableInUsd?: boolean | null;
  subtotalExclTax?: number | null;
  concessionFeePercent?: number | null;
  concessionFeeAmount?: number | null;
  taxTotal?: number | null;
  totalInclTax?: number | null;
}): InvoiceConcessionTotals {
  const subtotalExclTax = roundBillingMoney(Number(header.subtotalExclTax ?? 0));
  const concessionFeeAmount = roundBillingMoney(Number(header.concessionFeeAmount ?? 0));
  const concessionFeePercent = Number(header.concessionFeePercent ?? 0);
  const grossAmount = roundBillingMoney(subtotalExclTax + concessionFeeAmount);
  const usd = String(header.currencyCode ?? 'INR').trim().toUpperCase() === 'USD';
  const usdReceivable = usd && Boolean(header.totalReceivableInUsd);
  const roe = Number(header.currencyFactor);
  const grossAmountInr = usdReceivable
    ? 0
    : usd && Number.isFinite(roe) && roe > 0
      ? roundBillingMoney(grossAmount * roe)
      : grossAmount;
  const taxTotal = roundBillingMoney(Number(header.taxTotal ?? 0));
  const cgstAmount = roundBillingMoney(taxTotal / 2);
  const sgstAmount = roundBillingMoney(taxTotal - cgstAmount);
  const totalInclTax = roundBillingMoney(Number(header.totalInclTax ?? 0));
  const taxPercent = taxTotal > 0 ? INVOICE_CGST_PERCENT : 0;
  return {
    subtotalExclTax,
    concessionFeePercent: Number.isFinite(concessionFeePercent) ? concessionFeePercent : 0,
    concessionFeeAmount,
    grossAmount,
    grossAmountInr,
    cgstPercent: taxPercent,
    cgstAmount,
    sgstPercent: taxPercent,
    sgstAmount,
    taxTotal,
    totalInclTax,
  };
}

export function applyConcessionTotalsToHeader(
  header: {
    subtotalExclTax: number;
    taxTotal: number;
    totalInclTax: number;
    remainingAmount?: number;
    concessionFeePercent?: number;
    concessionFeeAmount?: number;
    currencyCode?: string | null;
    currencyFactor?: number | null;
    totalReceivableInUsd?: boolean | null;
  },
  lines: InvoiceLineConcessionInput[],
  contract?: InvoiceChargeContractShape & {
    ceilingRatePerFlightINR?: number | null;
    ceilingRatePerFlightUSD?: number | null;
  } | null,
  options?: InvoiceCurrencyTaxOptions,
): InvoiceConcessionTotals {
  const totals = calculateInvoiceConcessionFromLines(
    header.subtotalExclTax,
    lines,
    contract,
    {
      currencyCode: header.currencyCode,
      currencyFactor: header.currencyFactor,
      totalReceivableInUsd: header.totalReceivableInUsd,
      scheduledFlightCount: options?.scheduledFlightCount,
      adsConcession: options?.adsConcession,
      invoiceCategory: options?.invoiceCategory,
      concessionPercentOverride: options?.concessionPercentOverride,
    },
  );
  header.subtotalExclTax = totals.subtotalExclTax;
  header.concessionFeePercent = totals.concessionFeePercent;
  header.concessionFeeAmount = totals.concessionFeeAmount;
  header.taxTotal = totals.taxTotal;
  header.totalInclTax = totals.totalInclTax;
  if (header.remainingAmount != null) {
    header.remainingAmount = totals.totalInclTax;
  }
  return totals;
}
