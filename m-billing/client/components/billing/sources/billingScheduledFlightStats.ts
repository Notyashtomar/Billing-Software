import {
  ACTIVE_FLIGHT_STAT_ITEMS,
  computeScheduledAirlinesActiveFlightStats,
  EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS,
  flightMatchesScheduledActiveStatCategory,
  type ActiveFlightStatItem,
  type ScheduledAirlinesActiveFlightStatKey,
  type ScheduledAirlinesActiveFlightStats,
} from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';
import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import { isScheduleCancelledFlightNo, serialSearchMatches, type FlightData } from '@/utils/dataProcessor';

export type BillingScheduledFlightStatKey = ScheduledAirlinesActiveFlightStatKey;
export type BillingScheduledFlightStats = ScheduledAirlinesActiveFlightStats;
export type BillingScheduledFlightStatItem = ActiveFlightStatItem;

export const EMPTY_BILLING_SCHEDULED_FLIGHT_STATS: BillingScheduledFlightStats =
  EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS;

export const BILLING_SCHEDULED_FLIGHT_STAT_ITEMS: BillingScheduledFlightStatItem[] =
  ACTIVE_FLIGHT_STAT_ITEMS;

function isLockedValue(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
}

export function isBillingSourceRowCancelled(row: BillingSourceRow, flightNo?: string): boolean {
  const op = row.operationalData;
  const resolvedFlightNo = String(
    flightNo ?? op.flightNoEquipmentNo ?? row.sourceRef.flightNo ?? '',
  );
  const validationCancelled = row.validationStatus?.errors?.some(
    (error) => error.rule === 'not_cancelled' && !error.passed,
  );

  return (
    op.isCancelled === true ||
    op.flightCancelled === true ||
    String(op.flightStatus ?? '').trim().toLowerCase() === 'cancelled' ||
    validationCancelled === true ||
    isScheduleCancelledFlightNo(resolvedFlightNo)
  );
}

function pickOperationalText(op: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = String(op[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function normalizedText(...values: unknown[]): string {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(...values: unknown[]): string {
  return normalizedText(...values).replace(/\s+/g, '');
}

function flightCategoryText(row: BillingSourceRow): string {
  const op = row.operationalData;
  return pickOperationalText(
    op,
    'categoryOfFlight',
    'Cate_of_Flight',
    'flightCategory',
    'turnaroundStatus',
    'turnaround_status',
    'TurnaroundStatus',
  );
}

function handlingText(row: BillingSourceRow): string {
  const op = row.operationalData;
  return pickOperationalText(
    op,
    'typeOfHandling',
    'TypeofHandling',
    'ops',
    'opsType',
    'typeOfFlight',
    'Typeofflight',
    'turnaroundStatus',
    'turnaround_status',
    'TurnaroundStatus',
  );
}

function allOperationalText(row: BillingSourceRow): string {
  const op = row.operationalData;
  return normalizedText(
    flightCategoryText(row),
    handlingText(row),
    op.flightNoEquipmentNo,
    op.flightNo,
    row.sourceRef.flightNo,
    op.remarks,
    op.Remarks,
    op.flightStatus,
  );
}

function categoryCompact(row: BillingSourceRow): string {
  return compactText(flightCategoryText(row));
}

function rowHasDomestic(row: BillingSourceRow): boolean {
  const cat = categoryCompact(row);
  return /\bdomestic\b/.test(normalizedText(flightCategoryText(row))) || cat.includes('dom');
}

function rowHasInternational(row: BillingSourceRow): boolean {
  const catText = normalizedText(flightCategoryText(row));
  const cat = categoryCompact(row);
  return /\binternational\b/.test(catText) || /\bintl?\b/.test(catText) || cat.includes('int');
}

function rowHasDomesticInternational(row: BillingSourceRow): boolean {
  const cat = categoryCompact(row);
  return cat.includes('domesticinternational') || cat.includes('domint') || cat.includes('d-i');
}

function rowHasInternationalDomestic(row: BillingSourceRow): boolean {
  const cat = categoryCompact(row);
  return cat.includes('internationaldomestic') || cat.includes('intdom') || cat.includes('i-d');
}

function rowHasToken(row: BillingSourceRow, token: string): boolean {
  const text = normalizedText(
    allOperationalText(row),
    ...Object.values(row.operationalData),
  );
  return new RegExp(`\\b${token}\\b`, 'i').test(text);
}

function rowHasReturnToRamp(row: BillingSourceRow): boolean {
  const text = normalizedText(
    allOperationalText(row),
    ...Object.values(row.operationalData),
  );
  return /\brtr\b/.test(text) || text.includes('return to ramp');
}

/** Map billing source operational payload into the shape used by FRIS active-flight stats. */
export function billingSourceRowToFlightData(row: BillingSourceRow): FlightData {
  const op = row.operationalData;
  const flightNo = String(op.flightNoEquipmentNo ?? row.sourceRef.flightNo ?? '');

  return {
    destination: null,
    slNo: String(op.serialNumber ?? row.sourceRef.serialNo ?? ''),
    flightNo,
    airline: String(op.customerName ?? op.customerCode ?? ''),
    aircraft: String(op.aircraftType ?? ''),
    staDate: String(op.staDate ?? ''),
    staTime: String(op.staTime ?? ''),
    stdDate: String(op.stdDate ?? ''),
    stdTime: String(op.stdTime ?? ''),
    exportedNAV: String(op.exportedNav ?? op.exportedNAV ?? ''),
    rampLocked: String(op.rampLocked ?? ''),
    paxLocked: String(op.paxLocked ?? ''),
    gsdLocked: String(op.gsdLocked ?? ''),
    flightType: String(op.typeOfFlight ?? ''),
    cateOfFlight: String(op.categoryOfFlight ?? ''),
    typeOfHandling: String(op.typeOfHandling ?? ''),
    hClose: '',
    fBag: '',
    lBag: '',
    flightStatus: String(op.flightStatus ?? ''),
    hasMainDetails: Boolean(op.hasMainDetails),
    hasTerminalDetails: Boolean(op.hasTerminalDetails),
    hasRampDetails: Boolean(op.hasRampDetails),
    hasLoadControlDetails: Boolean(op.hasLoadControlDetails),
    hasEquipmentManpowerDetails: Boolean(op.hasEquipmentManpowerDetails),
    baseFlight: String(op.baseFlight ?? ''),
    isCancelled: isBillingSourceRowCancelled(row, flightNo),
  };
}

export function computeBillingScheduledFlightStats(
  rows: BillingSourceRow[],
): BillingScheduledFlightStats {
  if (rows.length === 0) {
    return EMPTY_BILLING_SCHEDULED_FLIGHT_STATS;
  }

  const legacyStats = computeScheduledAirlinesActiveFlightStats(
    rows.map(billingSourceRowToFlightData),
    isLockedValue,
  );

  const stats: BillingScheduledFlightStats = { ...legacyStats };

  // Prefer richer billing operational text for ops / route categories.
  for (const key of [
    'domestic',
    'international',
    'domesticInternational',
    'internationalDomestic',
    'diverted',
    'turnaround',
    'fifo',
    'filo',
    'lifo',
    'rtr',
  ] as const) {
    stats[key] = 0;
  }

  for (const row of rows) {
    for (const key of [
      'domestic',
      'international',
      'domesticInternational',
      'internationalDomestic',
      'diverted',
      'turnaround',
      'fifo',
      'filo',
      'lifo',
      'rtr',
    ] as const) {
      if (billingRowMatchesStatCategory(row, key)) {
        stats[key] += 1;
      }
    }
  }
  return stats;
}

export function billingRowMatchesStatCategory(
  row: BillingSourceRow,
  statKey: BillingScheduledFlightStatKey,
): boolean {
  switch (statKey) {
    case 'domestic':
      return rowHasDomestic(row) && !rowHasInternational(row);
    case 'international':
      return rowHasInternational(row) && !rowHasDomestic(row);
    case 'domesticInternational':
      return rowHasDomesticInternational(row);
    case 'internationalDomestic':
      return rowHasInternationalDomestic(row);
    case 'diverted':
      return rowHasToken(row, 'diverted') || rowHasToken(row, 'diversion');
    case 'turnaround':
      return rowHasToken(row, 'turnaround');
    case 'fifo':
      return rowHasToken(row, 'fifo');
    case 'filo':
      return rowHasToken(row, 'filo');
    case 'lifo':
      return rowHasToken(row, 'lifo');
    case 'rtr':
      return rowHasReturnToRamp(row);
    default:
      return flightMatchesScheduledActiveStatCategory(
        billingSourceRowToFlightData(row),
        statKey,
        isLockedValue,
      );
  }
}

/** Stable React key / selection id — serial number only. */
export function billingScheduledFlightRowKey(row: BillingSourceRow): string {
  return String(
    row.sourceRef.serialNo ?? row.operationalData.serialNumber ?? '',
  ).trim();
}

/** One row per serial — first occurrence wins. */
export function dedupeBillingRowsBySerial(rows: BillingSourceRow[]): BillingSourceRow[] {
  const seen = new Set<string>();
  const unique: BillingSourceRow[] = [];
  for (const row of rows) {
    const serial = billingScheduledFlightRowKey(row);
    if (!serial || seen.has(serial)) continue;
    seen.add(serial);
    unique.push(row);
  }
  return unique;
}

export function filterBillingRowsByStatCategories(
  rows: BillingSourceRow[],
  selected: ReadonlySet<BillingScheduledFlightStatKey>,
): BillingSourceRow[] {
  if (selected.size === 0) return rows;
  return rows.filter((row) =>
    [...selected].some((key) => billingRowMatchesStatCategory(row, key)),
  );
}

/** Keep unsent flights first; preserve relative order within each group. */
export function sortBillingRowsUnsentFirst(rows: BillingSourceRow[]): BillingSourceRow[] {
  return [...rows].sort((a, b) => {
    const aSent = a.sentToPreparation ? 1 : 0;
    const bSent = b.sentToPreparation ? 1 : 0;
    if (aSent !== bSent) return aSent - bSent;
    return 0;
  });
}

function normalizeFlightSearchToken(value: string): string {
  return value.toLowerCase().replace(/[\s\-_/.,]+/g, '');
}

function billingRowMatchesSingleFlightSearch(
  row: BillingSourceRow,
  term: string,
): boolean {
  const q = term.trim();
  if (!q) return true;

  const flight = billingSourceRowToFlightData(row);
  const qLower = q.toLowerCase();
  const qNorm = normalizeFlightSearchToken(q);

  const flightHaystacks = [
    String(row.operationalData.flightNoEquipmentNo ?? ''),
    String(row.sourceRef.flightNo ?? ''),
    String(row.operationalData.Arline_Code ?? ''),
    String(row.operationalData.serialNumber ?? ''),
    String(row.sourceRef.serialNo ?? ''),
    flight.flightNo,
  ];

  for (const raw of flightHaystacks) {
    const hay = String(raw ?? '').trim();
    if (!hay) continue;
    if (hay.toLowerCase().includes(qLower)) return true;
    if (qNorm && normalizeFlightSearchToken(hay).includes(qNorm)) return true;
    for (const leg of hay.split('/')) {
      const part = leg.trim();
      if (!part) continue;
      if (part.toLowerCase().includes(qLower)) return true;
      if (qNorm && normalizeFlightSearchToken(part).includes(qNorm)) return true;
    }
  }

  return serialSearchMatches(flight, q);
}

/** Match flight number, leg, or operational serial (Sl. No.) — same rules as Scheduled Airlines. */
export function billingRowMatchesFlightSearch(
  row: BillingSourceRow,
  queryRaw: string,
): boolean {
  const raw = queryRaw.trim();
  if (!raw) return true;

  const terms = raw.split(/[/,\s]+/).map((t) => t.trim()).filter(Boolean);
  if (terms.length === 0) return true;

  return terms.some((term) => billingRowMatchesSingleFlightSearch(row, term));
}
