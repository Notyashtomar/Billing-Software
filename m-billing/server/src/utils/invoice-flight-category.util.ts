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

export function flightCategoryLabel(raw: string): 'Domestic' | 'International' | '' {
  const normalized = normalizeFlightCategory(raw);
  if (normalized === 'Dom') return 'Domestic';
  if (normalized === 'Int') return 'International';
  return '';
}

/** Mixed-category invoices (Dom + Int flights in one period) show both. */
export function resolveInvoiceFlightCategory(
  candidates: Array<string | undefined | null>,
): string {
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
