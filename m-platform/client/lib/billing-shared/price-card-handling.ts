import type { BillingCustomer, BillingPriceCardAirline, BillingRateCard, BillingServiceCatalogItem } from './types';
import type { PriceCardHandlingType } from './enums';
import { PRICE_CARD_HANDLING_TYPES } from './enums';
import { normalizeBillingScope } from './rate-card-billing-scope';
import { isAdsHourlyUom } from './ads-hourly-uom';

export const PRICE_CARD_HANDLING_LABELS: Record<PriceCardHandlingType, string> = {
  BHS: 'Basic Handling Services',
  ADS: 'ADS — Equipment & Manpower',
  RAF: 'RAF — Ramp Assistance',
};

export const PRICE_CARD_HANDLING_DESCRIPTIONS: Record<PriceCardHandlingType, string> = {
  BHS: 'Turnaround, transit, delay, XXLD, cleaning, and scheduled flight rates',
  ADS: 'Equipment and manpower usage billed through ADS',
  RAF: 'Ramp assistance equipment and manpower rates',
};

const BHS_CATEGORIES = new Set([
  'scheduled',
  'non_scheduled',
  'xxld',
  'delay',
  'cleaning',
  'maas',
]);

export function serviceMatchesHandlingType(
  serviceCode: string,
  catalogCategory: string | undefined,
  handling: PriceCardHandlingType,
): boolean {
  const code = serviceCode.trim().toUpperCase();
  const category = catalogCategory?.trim().toLowerCase();

  if (handling === 'RAF') {
    return category === 'raf' || code.startsWith('RAF');
  }
  if (handling === 'ADS') {
    if (category === 'equipment' || category === 'manpower') {
      return !code.startsWith('RAF');
    }
    return false;
  }
  if (BHS_CATEGORIES.has(category ?? '')) return true;
  if (code.startsWith('SCHEDULED FLIGHT')) return true;
  if (code.startsWith('SCHEDULED -')) return true;
  return code === 'BHS' || code === 'TRND' || code === 'TRNS';
}

export function buildServiceCategoryMap(
  services: BillingServiceCatalogItem[],
): Map<string, string> {
  return new Map(services.map((s) => [s.serviceCode, s.category]));
}

export function customerAssignedToHandling(
  customer: BillingCustomer,
  handling: PriceCardHandlingType,
): boolean {
  return (customer.priceCardHandlingTypes ?? []).includes(handling);
}

export function customerHasHandlingRateCards(
  customerCode: string,
  handling: PriceCardHandlingType,
  rateCards: BillingRateCard[],
  serviceCategoryByCode: Map<string, string>,
): boolean {
  return rateCards.some(
    (row) =>
      row.customerCode === customerCode &&
      serviceMatchesHandlingType(
        row.serviceCode,
        serviceCategoryByCode.get(row.serviceCode),
        handling,
      ),
  );
}

export function listCustomersForHandling(
  handling: PriceCardHandlingType,
  customers: BillingCustomer[],
  rateCards: BillingRateCard[],
  serviceCategoryByCode: Map<string, string>,
  entries: BillingPriceCardAirline[] = [],
): BillingCustomer[] {
  const entryCodes = new Set(
    entries
      .filter((entry) => entry.handlingType === handling)
      .map((entry) => entry.customerCode),
  );

  return customers
    .filter(
      (customer) =>
        entryCodes.has(customer.customerCode) ||
        customerAssignedToHandling(customer, handling) ||
        customerHasHandlingRateCards(
          customer.customerCode,
          handling,
          rateCards,
          serviceCategoryByCode,
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function countCustomersForHandling(
  handling: PriceCardHandlingType,
  customers: BillingCustomer[],
  rateCards: BillingRateCard[],
  serviceCategoryByCode: Map<string, string>,
  entries: BillingPriceCardAirline[] = [],
): number {
  return listCustomersForHandling(
    handling,
    customers,
    rateCards,
    serviceCategoryByCode,
    entries,
  ).length;
}

export function filterRateCardsForHandling(
  rows: BillingRateCard[],
  handling: PriceCardHandlingType,
  customerCode: string | undefined,
  serviceCategoryByCode: Map<string, string>,
): BillingRateCard[] {
  return rows.filter((row) => {
    if (customerCode && row.customerCode !== customerCode) return false;
    return serviceMatchesHandlingType(
      row.serviceCode,
      serviceCategoryByCode.get(row.serviceCode),
      handling,
    );
  });
}

/** Calendar date (YYYY-MM-DD) without timezone drift on ISO strings. */
export function calendarYmd(value: string | Date): string {
  const raw = typeof value === 'string' ? value.trim() : value.toISOString();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (match) return match[1];
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function normalizeFlightCategory(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (upper === 'DOM' || upper === 'DOMESTIC') return 'Dom';
  if (upper === 'INT' || upper === 'INTERNATIONAL') return 'Int';
  return trimmed;
}

/** Scope rate cards to one price-card airline row (aircraft + flight category + validity). */
export function rateCardMatchesPriceCardAirlineRow(
  row: BillingRateCard,
  entry: Pick<
    BillingPriceCardAirline,
    'customerCode' | 'aircraftType' | 'category' | 'validFrom' | 'validTo'
  >,
): boolean {
  if (row.customerCode !== entry.customerCode) return false;

  const entryFrom = calendarYmd(entry.validFrom);
  const entryTo = calendarYmd(entry.validTo);
  if (calendarYmd(row.validFrom) !== entryFrom || calendarYmd(row.validTo) !== entryTo) {
    return false;
  }

  const entryAircraft = entry.aircraftType.trim().toUpperCase();
  const entryFlightCategory = normalizeFlightCategory(entry.category);

  if (row.aircraftType?.trim()) {
    const aircraftMatch = row.aircraftType.trim().toUpperCase() === entryAircraft;
    if (!aircraftMatch) return false;

    const rowFlightCategory = normalizeFlightCategory(row.category);
    if (!rowFlightCategory) return true;
    return rowFlightCategory === entryFlightCategory;
  }

  // Legacy BHS rows stored aircraft type in category without flight category split.
  const legacyAircraft = (row.category ?? '').trim().toUpperCase();
  return legacyAircraft === entryAircraft;
}

export function filterRateCardsForPriceCardAirlineRow(
  rows: BillingRateCard[],
  handling: PriceCardHandlingType,
  entry: BillingPriceCardAirline,
  serviceCategoryByCode: Map<string, string>,
): BillingRateCard[] {
  const scoped = rows.filter(
    (row) =>
      row.customerCode === entry.customerCode &&
      rateCardMatchesPriceCardAirlineRow(row, entry),
  );
  // BHS and ADS both show the full airline×aircraft×category service list.
  // ADS dual-count UI pairs inclusive/exclusive; counts must match BHS.
  if (handling === 'BHS' || handling === 'ADS') return scoped;
  return filterRateCardsForHandling(
    scoped,
    handling,
    entry.customerCode,
    serviceCategoryByCode,
  );
}

/**
 * ADS dual-count view: same rate cards BHS shows for this airline×aircraft×category,
 * so user can adjust BHS-included vs ADS-extra counts for billing.
 */
export function listRateCardsForAdsDualCount(
  rows: BillingRateCard[],
  entry: BillingPriceCardAirline,
  _serviceCategoryByCode: Map<string, string>,
): BillingRateCard[] {
  return filterRateCardsForPriceCardAirlineRow(rows, 'BHS', entry, _serviceCategoryByCode);
}

export type AdsDualCountServiceRow = {
  serviceCode: string;
  inclusive: BillingRateCard | null;
  exclusive: BillingRateCard | null;
};

/** True when user still needs to set ADS billing counts/rates for this service. */
export function adsServiceNeedsCountAdjustment(row: AdsDualCountServiceRow): boolean {
  const uom = row.exclusive?.uom ?? row.inclusive?.uom ?? '';
  const alwaysChargeable = Boolean(
    row.exclusive?.alwaysChargeable || row.inclusive?.alwaysChargeable || isAdsHourlyUom(uom),
  );
  if (alwaysChargeable) {
    const hasPrice =
      (row.exclusive?.unitPriceINR != null && row.exclusive.unitPriceINR > 0) ||
      (row.exclusive?.unitPriceUSD != null && row.exclusive.unitPriceUSD > 0);
    return !hasPrice;
  }

  const hasBhsCount =
    row.inclusive != null &&
    row.inclusive.serviceCount != null &&
    Number.isFinite(row.inclusive.serviceCount);
  const hasAdsRate =
    row.exclusive != null &&
    ((row.exclusive.unitPriceINR != null && row.exclusive.unitPriceINR > 0) ||
      (row.exclusive.unitPriceUSD != null && row.exclusive.unitPriceUSD > 0) ||
      row.exclusive.serviceCount != null);
  return !hasBhsCount && !hasAdsRate;
}

export function buildAdsDualCountServiceRows(
  rows: BillingRateCard[],
  entry: BillingPriceCardAirline,
  serviceCategoryByCode: Map<string, string>,
): AdsDualCountServiceRow[] {
  const scoped = listRateCardsForAdsDualCount(rows, entry, serviceCategoryByCode);
  const byService = new Map<string, AdsDualCountServiceRow>();

  for (const row of scoped) {
    const key = row.serviceCode.trim();
    if (!key) continue;
    const existing = byService.get(key) ?? {
      serviceCode: key,
      inclusive: null,
      exclusive: null,
    };
    if (normalizeBillingScope(row.billingScope) === 'exclusive') {
      existing.exclusive = row;
    } else {
      existing.inclusive = row;
    }
    byService.set(key, existing);
  }

  return [...byService.values()].sort((a, b) =>
    a.serviceCode.localeCompare(b.serviceCode),
  );
}

/** Same airline row scope except flight category (Dom/Int). */
export function listPriceCardEntriesInAircraftPeriod(
  entries: BillingPriceCardAirline[],
  handling: PriceCardHandlingType,
  anchor: Pick<
    BillingPriceCardAirline,
    'customerCode' | 'aircraftType' | 'validFrom' | 'validTo'
  >,
): BillingPriceCardAirline[] {
  const aircraft = anchor.aircraftType.trim().toUpperCase();
  const from = calendarYmd(anchor.validFrom);
  const to = calendarYmd(anchor.validTo);
  return entries
    .filter(
      (entry) =>
        entry.handlingType === handling &&
        entry.customerCode === anchor.customerCode &&
        entry.aircraftType.trim().toUpperCase() === aircraft &&
        calendarYmd(entry.validFrom) === from &&
        calendarYmd(entry.validTo) === to,
    )
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** All price-card rows for one customer + handling (scope navigation). */
export function listPriceCardEntriesForCustomer(
  entries: BillingPriceCardAirline[],
  handling: PriceCardHandlingType,
  customerCode: string,
): BillingPriceCardAirline[] {
  return entries
    .filter((entry) => entry.handlingType === handling && entry.customerCode === customerCode)
    .sort((a, b) => {
      const byAircraft = a.aircraftType.localeCompare(b.aircraftType);
      if (byAircraft !== 0) return byAircraft;
      const byFrom = calendarYmd(a.validFrom).localeCompare(calendarYmd(b.validFrom));
      if (byFrom !== 0) return byFrom;
      return a.category.localeCompare(b.category);
    });
}

export function findPriceCardEntry(
  entries: BillingPriceCardAirline[],
  handling: PriceCardHandlingType,
  customerCode: string,
  aircraftType: string,
  category: string,
  validFrom: string,
  validTo: string,
): BillingPriceCardAirline | undefined {
  const aircraft = aircraftType.trim().toUpperCase();
  const from = calendarYmd(validFrom);
  const to = calendarYmd(validTo);
  const flightCategory = normalizeFlightCategory(category);
  return entries.find(
    (entry) =>
      entry.handlingType === handling &&
      entry.customerCode === customerCode &&
      entry.aircraftType.trim().toUpperCase() === aircraft &&
      normalizeFlightCategory(entry.category) === flightCategory &&
      calendarYmd(entry.validFrom) === from &&
      calendarYmd(entry.validTo) === to,
  );
}

export function countRateCardsForPriceCardEntry(
  rows: BillingRateCard[],
  handling: PriceCardHandlingType,
  entry: BillingPriceCardAirline,
  serviceCategoryByCode: Map<string, string>,
): number {
  return filterRateCardsForPriceCardAirlineRow(
    rows,
    handling,
    entry,
    serviceCategoryByCode,
  ).length;
}

export function mergeHandlingTypes(
  existing: PriceCardHandlingType[] | undefined,
  next: PriceCardHandlingType,
): PriceCardHandlingType[] {
  const merged = new Set<PriceCardHandlingType>(existing ?? []);
  merged.add(next);
  return PRICE_CARD_HANDLING_TYPES.filter((type) => merged.has(type));
}

export type BhsAirlineAircraftGroup = {
  aircraftType: string;
  rows: BillingPriceCardAirline[];
};

export type BhsAirlineCardGroup = {
  customerCode: string;
  airlineName: string;
  remarks: string;
  validFrom: string;
  validTo: string;
  aircraftCount: number;
  priceRowCount: number;
  aircraftGroups: BhsAirlineAircraftGroup[];
};

/** One card per unique airline — aircraft types and BHS package prices nested inside. */
export function groupBhsPriceCardAirlines(
  entries: BillingPriceCardAirline[],
): BhsAirlineCardGroup[] {
  const byCode = new Map<string, BillingPriceCardAirline[]>();
  for (const entry of entries) {
    const code = entry.customerCode.trim().toUpperCase();
    const bucket = byCode.get(code);
    if (bucket) bucket.push(entry);
    else byCode.set(code, [entry]);
  }

  const groups: BhsAirlineCardGroup[] = [];
  for (const [customerCode, rows] of byCode) {
    const sortedRows = [...rows].sort((a, b) => {
      const byAircraft = a.aircraftType.localeCompare(b.aircraftType);
      if (byAircraft !== 0) return byAircraft;
      return a.category.localeCompare(b.category);
    });

    const aircraftMap = new Map<string, BillingPriceCardAirline[]>();
    for (const row of sortedRows) {
      const aircraftType = row.aircraftType.trim().toUpperCase();
      const bucket = aircraftMap.get(aircraftType);
      if (bucket) bucket.push(row);
      else aircraftMap.set(aircraftType, [row]);
    }

    const first = sortedRows[0];
    groups.push({
      customerCode,
      airlineName: first.airlineName,
      remarks: first.remarks?.trim() ?? '',
      validFrom: sortedRows.reduce(
        (min, row) => (calendarYmd(row.validFrom) < calendarYmd(min) ? row.validFrom : min),
        first.validFrom,
      ),
      validTo: sortedRows.reduce(
        (max, row) => (calendarYmd(row.validTo) > calendarYmd(max) ? row.validTo : max),
        first.validTo,
      ),
      aircraftCount: aircraftMap.size,
      priceRowCount: sortedRows.length,
      aircraftGroups: [...aircraftMap.entries()].map(([aircraftType, aircraftRows]) => ({
        aircraftType,
        rows: aircraftRows,
      })),
    });
  }

  return groups.sort((a, b) => a.airlineName.localeCompare(b.airlineName));
}
