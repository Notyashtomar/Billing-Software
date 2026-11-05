/**
 * Invoice "Flight Category" (Domestic / International) shown on the tax invoice.
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

export function flightCategoryLabel(raw: string): 'Domestic' | 'International' | '' {
  const normalized = normalizeFlightCategory(raw);
  if (normalized === 'Dom') return 'Domestic';
  if (normalized === 'Int') return 'International';
  return '';
}

/** Mixed-category invoices (Dom + Int flights in one period) show both. */
export function resolveInvoiceFlightCategory(
  candidates: Array<string | undefined | null>,
  contract?: {
    category?: string | null;
    categories?: Array<string | null | undefined> | null;
  } | null,
): string {
  if (isInternationalOnlyAirline(contract)) return 'International';
  let domestic = false;
  let international = false;

  for (const candidate of candidates) {
    const label = flightCategoryLabel(String(candidate ?? ''));
    if (label === 'Domestic') domestic = true;
    else if (label === 'International') international = true;
  }

  if (domestic && international) return 'Domestic & International';
  if (international) return 'International';
  if (domestic) return 'Domestic';
  return '';
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
