import { Model } from 'mongoose';
import type { StationScopeContext } from '../common/station-scope';
import { fixedStationScope, StationScope } from '../common/station-scope';
import type {
  BillingContract,
  BillingContractDocument,
} from '../schemas/billing.schemas';
import { normalizeFlightCategory } from './aircraft-type-match.util';
import {
  flightConcessionSectorFromText,
  stationPercentForSector,
} from './station-flight-concession.util';

export const INVOICE_CGST_PERCENT = 9;
export const INVOICE_SGST_PERCENT = 9;

/**
 * Historical Chennai exclusive rate. Invoices do not use this number.
 * Exclusive concession is the percent saved on that station's contract.
 */
export const EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT = 18;

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

export type ContractConcessionRatesShape = {
  int?: number | null;
  dom?: number | null;
  divertedDom?: number | null;
  divertedInt?: number | null;
  returnToRamp?: number | null;
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
  domesticCargo?: number | null;
  internationalCargo?: number | null;
};

/** Contracts-page conditional chargeable % of BHS package. */
export type ContractConditionalChargesShape = {
  divertedDom?: number | null;
  divertedInt?: number | null;
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
  /** Contracts-page conditional charges (BHS Charged / Amount). */
  conditionalCharges?: ContractConditionalChargesShape | null;
  bhsConcessionCoverage?: 'comprehensive' | 'non_comprehensive' | 'mixed' | null;
  extendedRoyaltyEnabled?: boolean | null;
  /**
   * Station Royalty Setup fees. When set, a plain scheduled or general-aviation
   * flight uses this percent instead of the contract fee for that category.
   */
  stationFlightConcession?: {
    dom?: number;
    int?: number;
    ga?: number;
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
  } | null;
};

export type InvoiceLineConcessionInput = {
  lineAmountExclTax?: number;
  quantity?: number;
  unitPrice?: number;
  serviceCode?: string;
  description?: string;
  sourceType?: string;
  preparationRecordIds?: unknown[];
  sourceRef?: Record<string, unknown>;
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

function calendarYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!dmy) return '';
  return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
}

function clockHm(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  const iso = text.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (iso && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return `${iso[1].padStart(2, '0')}:${iso[2]}:${iso[3] ?? '00'}`;
  }
  const hm = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!hm) return '';
  const hours = Number(hm[1]);
  const minutes = Number(hm[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${hm[2]}:${hm[3] ?? '00'}`;
}

function parseLocalDateTime(dateYmd: string, timeText: string): Date | null {
  const ymd = calendarYmd(dateYmd);
  const time = clockHm(timeText);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !time) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  const match = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match || [year, month, day].some((n) => !Number.isFinite(n))) return null;
  return new Date(year, month - 1, day, Number(match[1]), Number(match[2]), Number(match[3]));
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

function pickFlightText(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const fromSnap = snap[key];
    if (fromSnap != null && String(fromSnap).trim()) return String(fromSnap).trim();
    const fromRef = ref[key];
    if (fromRef != null && String(fromRef).trim()) return String(fromRef).trim();
  }
  return '';
}

function flightSnapshotBlob(line: InvoiceLineConcessionInput): {
  ref: Record<string, unknown>;
  snap: Record<string, unknown>;
  handlingRaw: string;
  categoryRaw: string;
  allText: string;
  handlingCorpus: string;
} {
  const ref = line.sourceRef ?? {};
  const snap = (ref.operationalSnapshot as Record<string, unknown> | undefined) ?? ref;
  const handlingParts = [
    'typeOfHandling',
    'TypeofHandling',
    'typeofHandling',
    'flightType',
    'ops',
    'opsType',
    'typeOfFlight',
    'Typeofflight',
  ].map((key) => pickFlightText(snap, ref, [key]));
  const handlingCorpus = collectFhrHandlingText(snap, ref).toLowerCase();
  // Prefer primary Type of Handling for non-divert labels, but keep all parts for scenario detection.
  const handlingRaw = (handlingParts.find(Boolean) || handlingCorpus || '').toLowerCase();
  const categoryRaw = pickFlightText(snap, ref, [
    'categoryOfFlight',
    'Cate_of_Flight',
    'flightCategory',
    'turnaroundStatus',
  ]);
  const remarks = pickFlightText(snap, ref, ['remarks', 'Remarks']);
  // FHR often stores "Diverted Flight" on ops/typeOfFlight while typeOfHandling stays Additional/Turnaround.
  const allText = [
    ...handlingParts,
    handlingCorpus,
    categoryRaw,
    remarks,
    String(snap.sourceType ?? ref.sourceType ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return { ref, snap, handlingRaw, categoryRaw, allText, handlingCorpus };
}

function isDivertedFlightSnapshot(line: InvoiceLineConcessionInput): boolean {
  const { allText } = flightSnapshotBlob(line);
  return /\bdivert/.test(allText) || /\bdiversion\b/.test(allText);
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

const FHR_REMARK_KEY = /remark/i;
const FHR_SKIP_KEY =
  /^(sta|std|ata|atd|date|time|serial|regn|route|flightno|customer|airline|mtow|terminal|entry)/i;

/** Handling phrases anywhere in the FHR snapshot. Remarks stay out so a note cannot reprice the flight. */
function collectFhrHandlingText(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
): string {
  const parts: string[] = [];
  const visit = (value: unknown, key: string | null, depth: number) => {
    if (depth > 5 || parts.length > 60) return;
    if (key && (FHR_REMARK_KEY.test(key) || FHR_SKIP_KEY.test(key))) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (text && text.length <= 180) parts.push(text);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 30)) visit(item, key, depth + 1);
      return;
    }
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      visit(child, childKey, depth + 1);
    }
  };
  visit(snap, null, 0);
  visit(ref, null, 0);
  return parts.join(' ');
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

function clockMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function pickFlightRaw(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    const fromSnap = snap[key];
    if (fromSnap != null && String(fromSnap).trim() !== '') return fromSnap;
    const fromRef = ref[key];
    if (fromRef != null && String(fromRef).trim() !== '') return fromRef;
  }
  return null;
}

const ATA_DATE_KEYS = ['ataDate', 'ATADate', 'ATA Date', 'actualArrivalDate'];
const ATA_TIME_KEYS = [
  'ataTime',
  'ATATime',
  'ATA Time',
  'actualArrivalTime',
  'actualTimeOfArrival',
];
const ATD_DATE_KEYS = ['atdDate', 'ATDDate', 'ATD Date', 'actualDepartureDate'];
const ATD_TIME_KEYS = [
  'atdTime',
  'ATDTime',
  'ATD Time',
  'actualDepartureTime',
  'actualTimeOfDeparture',
];
const FLIGHT_DATE_KEYS = [
  'staDate',
  'STADate',
  'STA Date',
  'stdDate',
  'STDDate',
  'STD Date',
  'flightDate',
  'billingDateYmd',
];

function movementInstant(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
  dateKeys: string[],
  timeKeys: string[],
  fallbackDateKeys: string[] = [],
): Date | null {
  const dateRaw = pickFlightRaw(snap, ref, dateKeys);
  const timeRaw = pickFlightRaw(snap, ref, timeKeys);
  let ymd = calendarYmd(dateRaw);
  let hm = clockHm(timeRaw);
  if (!ymd && timeRaw != null) ymd = calendarYmd(timeRaw);
  if (!hm && dateRaw != null) hm = clockHm(dateRaw);
  if (!ymd && fallbackDateKeys.length > 0) {
    ymd = calendarYmd(pickFlightRaw(snap, ref, fallbackDateKeys));
  }
  if (!ymd || !hm) return null;
  return parseLocalDateTime(ymd, hm);
}

function snapshotDateTime(
  snap: Record<string, unknown>,
  ref: Record<string, unknown>,
  dateKeys: string[],
  timeKeys: string[],
): Date | null {
  return movementInstant(snap, ref, dateKeys, timeKeys);
}

/**
 * Ground time is actual departure minus actual arrival.
 * Overnight turns (departure clock before arrival) roll into the next day.
 */
export function actualGroundMinutes(line: InvoiceLineConcessionInput): number | null {
  const { snap, ref } = flightSnapshotBlob(line);
  const ata = movementInstant(snap, ref, ATA_DATE_KEYS, ATA_TIME_KEYS, FLIGHT_DATE_KEYS);
  const atd = movementInstant(snap, ref, ATD_DATE_KEYS, ATD_TIME_KEYS, [
    'stdDate',
    'STDDate',
    'STD Date',
    ...FLIGHT_DATE_KEYS,
  ]);
  if (!ata || !atd) return null;
  let end = atd.getTime();
  if (end < ata.getTime()) end += 24 * 60 * 60 * 1000;
  const minutes = (end - ata.getTime()) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function groundMinutesOf(line: InvoiceLineConcessionInput): number | null {
  return actualGroundMinutes(line);
}

function durationMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length >= 2 && parts.every((part) => /^\d+(\.\d+)?$/.test(part))) {
    const [hours, minutes, seconds] = parts.map(Number);
    return hours * 60 + minutes + (seconds ?? 0) / 60;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function lateArrivalMinutes(line: InvoiceLineConcessionInput): number | null {
  const { snap, ref } = flightSnapshotBlob(line);
  const sta = snapshotDateTime(
    snap,
    ref,
    ['staDate', 'STADate'],
    ['staTime', 'STATime'],
  );
  const ata = snapshotDateTime(
    snap,
    ref,
    ['ataDate', 'ATADate'],
    ['ataTime', 'ATATime'],
  );
  if (sta && ata) {
    let end = ata.getTime();
    if (end < sta.getTime()) end += 24 * 60 * 60 * 1000;
    const minutes = (end - sta.getTime()) / 60000;
    if (Number.isFinite(minutes) && minutes >= 0) return minutes;
  }
  return durationMinutes(snap.delayOnSta ?? snap.arrivalDelay ?? snap.ActualDelay);
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

function hasActualClock(
  line: InvoiceLineConcessionInput,
  timeKeys: string[],
): boolean {
  const { snap, ref } = flightSnapshotBlob(line);
  return timeKeys.some((key) => {
    const raw = snap[key] ?? ref[key];
    if (raw == null) return false;
    const text = String(raw).trim().toLowerCase();
    return Boolean(text) && text !== '-' && text !== 'null' && text !== 'n/a';
  });
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
  const { snap, allText } = flightSnapshotBlob(line);
  return (
    Boolean(snap.returnToRamp) ||
    Boolean(snap.return_to_ramp) ||
    /\breturn to ramp\b/.test(allText) ||
    /\brtr\b/.test(allText)
  );
}

function isNonZeroDelayValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  const text = String(value).trim().toLowerCase();
  if (!text || text === 'false' || text === 'no' || text === 'n' || text === 'nil') {
    return false;
  }
  if (text === 'true' || text === 'yes' || text === 'y') return true;
  const parts = text.split(':');
  if (parts.length >= 2 && parts.every((part) => /^\d+(\.\d+)?$/.test(part))) {
    return parts.some((part) => Number(part) > 0);
  }
  const n = Number(text);
  return Number.isFinite(n) && n > 0;
}

function isDelayedFlightSnapshot(line: InvoiceLineConcessionInput): boolean {
  const { snap, handlingRaw, categoryRaw } = flightSnapshotBlob(line);
  if (Boolean(snap.isDelayed) || Boolean(snap.delayed)) return true;
  const delayFields = [
    snap.delayOnSta,
    snap.delayOnStd,
    snap.arrivalDelay,
    snap.departureDelay,
    snap.ActualDelay,
    snap.actualDelay,
    snap.delay,
  ];
  if (delayFields.some(isNonZeroDelayValue)) return true;
  const categoryLower = categoryRaw.toLowerCase();
  return /\bdelay/.test(handlingRaw) || /\bdelay/.test(categoryLower);
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
  ]);

function hasExplicitConcessionRate(value: unknown): boolean {
  return value != null && String(value).trim() !== '' && Number.isFinite(Number(value));
}

function resolveConditionalCharges(
  contract?: InvoiceChargeContractShape | null,
): ContractConditionalChargesShape {
  const charges = contract?.conditionalCharges;
  if (charges && Object.keys(charges).length > 0) return charges;
  // Legacy: RTR / cancel / tech / standby lived on concessionRates before the split.
  // Never fall back diverted* from concessionRates (those are Concessions-page fees).
  const rates = contract?.concessionRates ?? {};
  return {
    returnToRamp: rates.returnToRamp,
    cancellationWithinHoursPercent: rates.cancellationWithinHoursPercent,
    technicalHandlingChargesPercent: rates.technicalHandlingChargesPercent,
    standbyChargesPercent: rates.standbyChargesPercent,
    filoLifoChargesPercent: rates.filoLifoChargesPercent,
    filoChargesPercent: rates.filoChargesPercent,
    lifoChargesPercent: rates.lifoChargesPercent,
    ronAdditionalPercent: rates.ronAdditionalPercent,
    lateArrivalAdditionalPercent: rates.lateArrivalAdditionalPercent,
    extraGroundTimeAdditionalPercent: rates.extraGroundTimeAdditionalPercent,
    delayChargesPercent: rates.delayChargesPercent,
  };
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
 * Return to ramp 42% means 142% of the comprehensive rate.
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
  const returnToRamp = positiveRate(charges.returnToRamp);
  const rampExtra =
    returnToRamp > 0 && isReturnToRampFlightSnapshot(line) ? returnToRamp : 0;
  if (ron <= 0 && late <= 0 && ground <= 0 && rampExtra <= 0) return 0;

  const split = isSplitSectorFlight(line);
  if (!split && ron > 0 && matchesRemainOvernight(line)) return ron + rampExtra;

  let extra = rampExtra;
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

  const { handlingCorpus, categoryRaw } = flightSnapshotBlob(line);
  const categoryLower = categoryRaw.toLowerCase();
  const ferryPercent = ferryReplacementPercent(line, contract);
  if (ferryPercent != null) return ferryPercent;

  const isDiverted = isDivertedFlightSnapshot(line);
  const isTechnicalHandling =
    /technical/.test(handlingCorpus) ||
    /\btech\b/.test(handlingCorpus) ||
    /technical/.test(categoryLower);
  const isStandby =
    /stand[\s-]?by/.test(handlingCorpus) || /stand[\s-]?by/.test(categoryLower);
  const normalized = normalizeFlightCategory(categoryRaw);
  const isDom =
    normalized === 'Dom' ||
    (/domestic/.test(categoryLower) && !/international/.test(categoryLower));

  if (isDiverted && isDom) return rates.DivDom;
  if (isDiverted) return rates.DivInt;
  if (isTechnicalHandling) return rates.TechnicalHandlingChargesPercent;
  if (isStandby) return rates.StandbyChargesPercent;
  if (isDelayedFlightSnapshot(line) && rates.DelayChargesPercent > 0) {
    return rates.DelayChargesPercent;
  }
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
  const isDom =
    normalized === 'Dom' ||
    (/domestic/.test(categoryLower) && !/international/.test(categoryLower));
  const isCargo = /cargo/.test(categoryLower);

  const sector = flightConcessionSectorFromText(categoryRaw, handlingRaw);
  const fromContract = (() => {
    if (isDiverted && isDom) return resolveRateOrDefault(rates.DivDom, contract?.royaltyAtGross);
    if (isDiverted) return resolveRateOrDefault(rates.DivInt, contract?.royaltyAtGross);
    if (!isDiverted && !isCargo) {
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
): Record<ContractConcessionScenarioKey, number> {
  const legacy = legacyConcessionPercentFromContract(contract);
  const rates = contract?.concessionRates ?? {};
  return {
    Int: positiveRate(rates.int) || legacy,
    Dom: positiveRate(rates.dom) || legacy,
    DivDom: positiveRate(rates.divertedDom) || legacy,
    DivInt: positiveRate(rates.divertedInt) || legacy,
    ReturnToRamp: positiveRate(rates.returnToRamp) || legacy,
    OriginateTerminatePercent: 0,
    CancellationWithinHoursPercent:
      positiveRate(rates.cancellationWithinHoursPercent) || legacy,
    TechnicalHandlingChargesPercent:
      positiveRate(rates.technicalHandlingChargesPercent) || legacy,
    StandbyChargesPercent: positiveRate(rates.standbyChargesPercent) || legacy,
    FiloLifoChargesPercent: positiveRate(rates.filoLifoChargesPercent) || legacy,
    FiloChargesPercent: positiveRate(rates.filoChargesPercent) || legacy,
    LifoChargesPercent: positiveRate(rates.lifoChargesPercent) || legacy,
    DelayChargesPercent: positiveRate(rates.delayChargesPercent) || legacy,
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

  const { handlingCorpus, categoryRaw } = flightSnapshotBlob(line);
  const categoryLower = categoryRaw.toLowerCase();
  const ferryKind = ferryHandlingKind(line);
  if (ferryKind === 'filo' && ferryReplacementPercent(line, contract) != null) {
    return 'FiloChargesPercent';
  }
  if (ferryKind === 'lifo' && ferryReplacementPercent(line, contract) != null) {
    return 'LifoChargesPercent';
  }
  const isDiverted = isDivertedFlightSnapshot(line);
  const isTechnicalHandling =
    /technical/.test(handlingCorpus) ||
    /\btech\b/.test(handlingCorpus) ||
    /technical/.test(categoryLower);
  const isStandby =
    /stand[\s-]?by/.test(handlingCorpus) || /stand[\s-]?by/.test(categoryLower);

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
    isDelayedFlightSnapshot(line) &&
    positiveRate(resolveConditionalCharges(contract).delayChargesPercent) > 0
  ) {
    return 'DelayChargesPercent';
  }
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

function finiteSavedPercent(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Percent stored on this station's contract. Never a rate from another station. */
function savedExclusiveConcessionPercent(
  line: InvoiceLineConcessionInput,
  contract?: InvoiceChargeContractShape | null,
): number {
  const rates = contract?.concessionRates ?? {};
  const { categoryRaw } = flightSnapshotBlob(line);
  const categoryLower = categoryRaw.toLowerCase();
  const isDiverted = isDivertedFlightSnapshot(line);
  const normalized = normalizeFlightCategory(categoryRaw);
  const isDom =
    normalized === 'Dom' ||
    (/domestic/.test(categoryLower) && !/international/.test(categoryLower));
  const isCargo = /cargo/.test(categoryLower);
  const specific =
    isDiverted && isDom
      ? rates.divertedDom
      : isDiverted
        ? rates.divertedInt
        : isCargo && isDom
          ? rates.domesticCargo
          : isCargo
            ? rates.internationalCargo
            : isDom
              ? rates.dom
              : rates.int;
  const saved = finiteSavedPercent(specific);
  if (saved != null) return saved;
  return finiteSavedPercent(contract?.royaltyAtGross) ?? 0;
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

  let base = 0;
  let amount = 0;
  let weightedPercent = 0;
  const labels = new Set<number>();
  for (const line of rows) {
    const percent = savedExclusiveConcessionPercent(line, contract);
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
      return sum + roundBillingMoney(amt * (pct / 100));
    }, 0),
  );
  const concessionFeePercent =
    lineSubtotal > 0
      ? roundBillingMoney((concessionAmountFromLines * 100) / lineSubtotal)
      : 0;
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
  if (options?.concessionPercentOverride != null && Number.isFinite(typedConcession)) {
    const pct = Math.min(100, Math.max(0, typedConcession));
    concessionFeePercentFinal = pct;
    concessionFeeAmount = roundBillingMoney(
      subtotal * exclusiveRoyaltyRate(usesExtendedRoyalty(contract), pct),
    );
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

type InvoiceContractLookup = {
  contractId?: unknown;
  customerCode: string;
  documentDate: Date | string;
  /** Invoice / prep station. Wins over an unscoped admin session. */
  stationCode?: string | null;
};

function billingStationCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

/** Station the invoice must bill against. Never "any station". */
function stationForInvoiceContract(
  ctx: StationScopeContext,
  header: InvoiceContractLookup,
): string {
  const fromHeader = billingStationCode(header.stationCode);
  const fromCtx = billingStationCode(ctx.stationCode);
  if (!ctx.crossStation) return fromCtx || fromHeader;
  return fromHeader || fromCtx;
}

const contractLookupCache = new Map<
  string,
  { at: number; value: (BillingContract & { _id?: unknown }) | null }
>();

/** Drop cached contracts so the next invoice rebuild reads the concession page. */
export function invalidateInvoiceContractCache(): void {
  contractLookupCache.clear();
}

export async function resolveActiveContractForInvoice(
  contractModel: Model<BillingContractDocument>,
  ctx: StationScopeContext,
  header: InvoiceContractLookup,
): Promise<(BillingContract & { _id?: unknown }) | null> {
  const stationCode = stationForInvoiceContract(ctx, header);
  const cacheKey = `${stationCode}|${String(header.contractId ?? '')}|${header.customerCode}|${String(header.documentDate ?? '').slice(0, 10)}`;
  const cached = contractLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30_000) return cached.value;

  const store = (value: (BillingContract & { _id?: unknown }) | null) => {
    contractLookupCache.set(cacheKey, { at: Date.now(), value });
    return value;
  };

  if (!stationCode) return store(null);

  const stationCtx = fixedStationScope(stationCode);

  if (header.contractId) {
    const byId = await contractModel.findById(header.contractId).lean();
    if (byId && billingStationCode(byId.stationCode) === stationCode) {
      StationScope.assertOwnership(byId, stationCtx);
      return store(byId);
    }
  }

  const billingDate =
    header.documentDate instanceof Date
      ? header.documentDate
      : new Date(header.documentDate);
  if (Number.isNaN(billingDate.getTime())) return null;

  return store(
    await contractModel
      .findOne(
        StationScope.filter(
          {
            $or: [
              { customerCode: header.customerCode.toUpperCase() },
              { additionalCustomerCodes: header.customerCode.toUpperCase() },
            ],
            priceValidFrom: { $lte: billingDate },
            priceValidTo: { $gte: billingDate },
          },
          stationCtx,
        ),
      )
      .sort({ priceValidFrom: -1 })
      .lean(),
  );
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
