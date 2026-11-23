/**
 * Invoice "Flight Category" (Domestic / International / … Cargo) shown on the tax invoice.
 *
 * Source of truth is the flight: FHR `Cate_of_Flight` → preparation
 * `operationalSnapshot.categoryOfFlight` → invoice line `sourceRef`.
 * Contract category and service-catalog category are fallbacks for legacy lines
 * composed before the category was persisted on the line.
 */

import { normalizeFlightCategory } from './aircraft-type-match.util';

const CATEGORY_OF_FLIGHT_KEYS = [
  'categoryOfFlight',
  'Cate_of_Flight',
  'CateofFlight',
  'cateOfFlight',
  'CategoryOfFlight',
  'flightCategory',
  'domInt',
  'DomInt',
] as const;

export function pickCategoryOfFlight(
  ...blobs: Array<Record<string, unknown> | undefined | null>
): string {
  for (const blob of blobs) {
    if (!blob || typeof blob !== 'object') continue;
    for (const key of CATEGORY_OF_FLIGHT_KEYS) {
      const value = blob[key];
      if (value != null && String(value).trim()) return String(value).trim();
    }
  }
  return '';
}

/**
 * Contract covers international flights only. Domestic and International-Domestic
 * sectors on those flights still belong on the international invoice.
 */
export function isInternationalOnlyAirline(contract?: {
  category?: string | null;
  categories?: Array<string | null | undefined> | null;
} | null): boolean {
  if (!contract) return false;
  const listed = (contract.categories ?? [])
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (listed.length > 0) {
    const hasDom = listed.some((value) => value === 'dom' || value === 'domestic' || value === 'domcargo');
    const hasInt = listed.some(
      (value) => value === 'int' || value === 'international' || value === 'intcargo',
    );
    return hasInt && !hasDom;
  }
  const category = String(contract.category ?? '').trim().toLowerCase();
  return category === 'int' || category === 'international';
}

export type InvoiceFlightCategoryLabel =
  | 'Domestic'
  | 'International'
  | 'Domestic Cargo'
  | 'International Cargo';

/** FHR writes freighter sectors as "International-Cargo" / "Domestic-Cargo". */
function isCargoFlightCategory(raw: string): boolean {
  return /cargo/i.test(raw);
}

/** Cargo sectors keep their own label so a freighter invoice does not print as passenger. */
export function flightCategoryLabel(raw: string): InvoiceFlightCategoryLabel | '' {
  const cargo = isCargoFlightCategory(raw);
  // "International-Cargo" must not be read as an arrival-departure pair.
  const sector = cargo ? raw.replace(/[\s/_-]*cargo/gi, '') : raw;
  const normalized = normalizeFlightCategory(sector);
  if (normalized === 'Dom') return cargo ? 'Domestic Cargo' : 'Domestic';
  if (normalized === 'Int') return cargo ? 'International Cargo' : 'International';
  return '';
}

const INVOICE_FLIGHT_CATEGORY_ORDER: InvoiceFlightCategoryLabel[] = [
  'Domestic',
  'International',
  'Domestic Cargo',
  'International Cargo',
];

/**
 * Mixed-category invoices show every sector billed (Dom + Int, passenger + cargo).
 * An international-only airline never prints Domestic, but its cargo flights
 * still print International Cargo.
 */
export function resolveInvoiceFlightCategory(
  candidates: Array<string | undefined | null>,
  contract?: {
    category?: string | null;
    categories?: Array<string | null | undefined> | null;
  } | null,
): string {
  const internationalAirline = isInternationalOnlyAirline(contract);
  const seen = new Set<InvoiceFlightCategoryLabel>();

  for (const candidate of candidates) {
    let label = flightCategoryLabel(String(candidate ?? ''));
    if (!label) continue;
    if (internationalAirline) {
      if (label === 'Domestic') label = 'International';
      else if (label === 'Domestic Cargo') label = 'International Cargo';
    }
    seen.add(label);
  }

  if (seen.size === 0) return internationalAirline ? 'International' : '';
  return INVOICE_FLIGHT_CATEGORY_ORDER.filter((label) => seen.has(label)).join(' & ');
}

/** Distinct raw categories across preparation records backing one invoice line. */
export function categoriesOfFlightFromSnapshots(
  snapshots: Array<Record<string, unknown> | undefined | null>,
): string[] {
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    const value = pickCategoryOfFlight(snapshot);
    if (value) seen.add(value);
  }
  return [...seen];
}
