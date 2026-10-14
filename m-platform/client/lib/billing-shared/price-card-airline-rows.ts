import type { BillingContract, BillingCustomer, BillingPriceCardAirline } from './types';
import { isOpenEndedBillingDate, type PriceCardAirlineCategory } from './enums';
import {
  displayAircraftTypesForPriceCardEntry,
  priceCardAirlineRowKeys,
} from './bhs-grouped-aircraft';

function contractRowCategory(contract?: BillingContract): PriceCardAirlineCategory {
  const category = contract?.category;
  if (category === 'Dom' || category === 'Int') return category;
  return 'Int';
}

export type AddPriceCardAirlineRow = {
  key: string;
  /** Existing price-card row — set when editing an airline. */
  entryId?: string;
  airlineName: string;
  validFrom: string;
  validTo: string;
  remarks: string;
  aircraftType: string;
  category: PriceCardAirlineCategory;
  /** BHS rows — unit price (string in form, parsed on save). */
  price: string;
  /** BHS rows. Scheduled unless the user picks additional. */
  flightOperation: 'scheduled' | 'additional';
};

function splitAircraftTokens(raw: string): string[] {
  return raw
    .split(/[,;/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function deriveCustomerAircraftTypes(
  customer: BillingCustomer,
  contracts: BillingContract[],
): string[] {
  const types = new Set<string>();

  for (const line of customer.scheduleLines ?? []) {
    if (line.aircraftType?.trim()) types.add(line.aircraftType.trim().toUpperCase());
  }

  if (customer.aircraftType?.trim()) {
    for (const token of splitAircraftTokens(customer.aircraftType)) {
      types.add(token.toUpperCase());
    }
  }

  const customerContracts = contracts.filter(
    (contract) => contract.customerCode === customer.customerCode,
  );
  for (const contract of customerContracts) {
    for (const aircraftType of contract.aircraftTypes ?? []) {
      if (aircraftType.trim()) types.add(aircraftType.trim().toUpperCase());
    }
  }

  return [...types].sort((a, b) => a.localeCompare(b));
}

function validityOverlaps(
  leftFrom: string | undefined,
  leftTo: string | undefined,
  rightFrom: string | undefined,
  rightTo: string | undefined,
): boolean {
  const start = new Date(leftFrom ?? '').getTime();
  const end = new Date(leftTo ?? '').getTime();
  const otherStart = new Date(rightFrom ?? '').getTime();
  const otherEnd = new Date(rightTo ?? '').getTime();
  if (![start, end, otherStart, otherEnd].every(Number.isFinite)) return false;
  return start <= otherEnd && otherStart <= end;
}

/** Contract whose Inclusive/Exclusive mode applies to this price-card row. */
export function contractForPriceCardEntry(
  entry: Pick<BillingPriceCardAirline, 'customerCode' | 'stationCode' | 'validFrom' | 'validTo'>,
  contracts: BillingContract[],
): BillingContract | undefined {
  const customerCode = entry.customerCode?.trim().toUpperCase();
  if (!customerCode) return undefined;
  const forCustomer = contracts.filter(
    (contract) => contract.customerCode?.trim().toUpperCase() === customerCode,
  );
  const stationCode = entry.stationCode?.trim().toUpperCase();
  const forStation = stationCode
    ? forCustomer.filter((contract) => contract.stationCode?.trim().toUpperCase() === stationCode)
    : forCustomer;
  const pool = forStation.length > 0 ? forStation : forCustomer;
  const overlapping = pool.filter((contract) =>
    validityOverlaps(
      entry.validFrom,
      entry.validTo,
      contract.priceValidFrom,
      contract.priceValidTo,
    ),
  );
  const ranked = (overlapping.length > 0 ? overlapping : pool).slice().sort((a, b) => {
    const statusRank = (status: string) => (status === 'active' ? 0 : status === 'draft' ? 1 : 2);
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    return new Date(b.priceValidFrom).getTime() - new Date(a.priceValidFrom).getTime();
  });
  return ranked[0];
}

/** Contract end date in the past. Open-ended contracts stay active. */
export function isBillingContractExpired(
  contract: Pick<BillingContract, 'priceValidTo'> | undefined,
): boolean {
  const raw = contract?.priceValidTo?.slice(0, 10) ?? '';
  if (!raw || isOpenEndedBillingDate(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return false;
  const endDay = new Date(year, month - 1, day);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return endDay.getTime() < startOfToday.getTime();
}

/** Rate card follows its airline contract: expired contract → expired rate card. */
export function isPriceCardEntryExpired(
  entry: Pick<BillingPriceCardAirline, 'customerCode' | 'stationCode' | 'validFrom' | 'validTo'>,
  contracts: BillingContract[],
): boolean {
  return isBillingContractExpired(contractForPriceCardEntry(entry, contracts));
}

export function defaultContractForCustomer(
  customerCode: string,
  contracts: BillingContract[],
): BillingContract | undefined {
  const matches = contracts.filter((contract) => contract.customerCode === customerCode);
  const active = matches
    .filter((contract) => contract.status === 'active')
    .sort(
      (a, b) =>
        new Date(b.priceValidFrom).getTime() - new Date(a.priceValidFrom).getTime(),
    );
  if (active.length > 0) return active[0];
  return matches.sort(
    (a, b) => new Date(b.priceValidFrom).getTime() - new Date(a.priceValidFrom).getTime(),
  )[0];
}

export function buildAddAirlineRows(
  customer: BillingCustomer,
  contracts: BillingContract[],
): AddPriceCardAirlineRow[] {
  const contract = defaultContractForCustomer(customer.customerCode, contracts);
  const aircraftTypes = deriveCustomerAircraftTypes(customer, contracts);
  const types = aircraftTypes.length > 0 ? aircraftTypes : [''];

  return types.map((aircraftType, index) => ({
    key: `${customer.customerCode}-${aircraftType || index}`,
    airlineName: customer.name,
    validFrom: contract ? contract.priceValidFrom.slice(0, 10) : '',
    validTo: contract ? contract.priceValidTo.slice(0, 10) : '',
    remarks: '',
    aircraftType,
    category: contractRowCategory(contract),
    price: '',
    flightOperation: 'scheduled',
  }));
}

/** BHS price card: one Dom + one Int row per aircraft (columns D and E). */
export function buildBhsAddAirlineRows(
  customer: BillingCustomer,
  contracts: BillingContract[],
): AddPriceCardAirlineRow[] {
  const base = buildAddAirlineRows(customer, contracts).filter((row) => row.aircraftType.trim());
  const categories: PriceCardAirlineCategory[] = ['Dom', 'Int'];

  if (base.length === 0) {
    return categories.map((category, index) => ({
      key: `${customer.customerCode}-bhs-${category}-${index}`,
      airlineName: customer.name,
      validFrom: '',
      validTo: '',
      remarks: '',
      aircraftType: '',
      category,
      price: '',
      flightOperation: 'scheduled',
    }));
  }

  const expanded: AddPriceCardAirlineRow[] = [];
  for (const row of base) {
    for (const category of categories) {
      expanded.push({
        ...row,
        key: `${row.key}-${category}`,
        category,
        price: '',
      flightOperation: 'scheduled',
      });
    }
  }
  return expanded;
}

function existingAirlineRowKey(aircraftType: string, category: string): string {
  return `${aircraftType.trim().toUpperCase()}|${category}`;
}

/** Drop generated rows that already exist for this customer (aircraft × category). */
export function filterNewAirlineRows(
  rows: AddPriceCardAirlineRow[],
  existing: BillingPriceCardAirline[],
): AddPriceCardAirlineRow[] {
  const existingKeys = new Set<string>();
  for (const entry of existing) {
    for (const key of priceCardAirlineRowKeys(entry)) {
      existingKeys.add(key);
    }
  }
  return rows.filter((row) => {
    const aircraftType = row.aircraftType.trim();
    if (!aircraftType) return true;
    return !existingKeys.has(existingAirlineRowKey(aircraftType, row.category));
  });
}

export function bhsEntriesToAddRows(entries: BillingPriceCardAirline[]): AddPriceCardAirlineRow[] {
  const sorted = [...entries].sort((a, b) => {
    const byAircraft = a.aircraftType.localeCompare(b.aircraftType);
    if (byAircraft !== 0) return byAircraft;
    return a.category.localeCompare(b.category);
  });

  const out: AddPriceCardAirlineRow[] = [];
  for (const entry of sorted) {
    const aircraftTypes = displayAircraftTypesForPriceCardEntry(entry);
    for (const aircraftType of aircraftTypes) {
      out.push({
        key: `${entry._id}|${aircraftType}|${entry.category}`,
        entryId: entry._id,
        airlineName: entry.airlineName,
        validFrom: entry.validFrom.slice(0, 10),
        validTo: entry.validTo.slice(0, 10),
        remarks: entry.remarks ?? '',
        aircraftType,
        category: entry.category,
        price: entry.price != null ? String(entry.price) : '',
        flightOperation: entry.flightOperation === 'additional' ? 'additional' : 'scheduled',
      });
    }
  }
  return out;
}
