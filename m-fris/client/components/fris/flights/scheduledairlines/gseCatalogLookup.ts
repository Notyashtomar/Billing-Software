import { toBillingTrackableFullName } from '@/lib/billing-shared/billing-trackable-equipment-name';

/** Resolve FHR `equipment_name` via equipmentManpower master `catalogItems` (`abbr` → `description`). */

export interface GseCatalogRow {
  abbr?: string;
  description?: string;
  unit_type?: string;
}

/** Keys: trimmed lowercase `abbr`. Values: catalog `description`. */
export function buildAbbrDescriptionLookup(
  items: GseCatalogRow[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of items) {
    const abbr = String(it.abbr ?? '').trim();
    const desc = String(it.description ?? '').trim();
    if (!abbr || !desc) continue;
    m.set(abbr.toLowerCase(), desc);
  }
  return m;
}

/**
 * When FHR `equipment_name` equals a catalog `abbr`, show that row's `description`;
 * billing-trackable full forms always win so GSE reports match ADS naming.
 */
export function resolveGseDisplayNameFromCatalog(
  equipmentNameFromFhr: string,
  lookup: Map<string, string>,
): string {
  const raw = String(equipmentNameFromFhr ?? '').trim();
  if (!raw) return raw;
  const billed = toBillingTrackableFullName(raw);
  if (billed && billed !== raw) return billed;
  if (lookup.size === 0) return billed || raw;
  const hit = lookup.get(raw.toLowerCase());
  if (!hit) return billed || raw;
  return toBillingTrackableFullName(hit) || hit;
}

/** Resolve abbreviated GSE/equipment labels to billing full forms, then catalog descriptions. */
export function resolveEquipmentNamesFromCatalog<T extends { equipmentName: string }>(
  entries: T[],
  lookup: Map<string, string>,
): T[] {
  return entries.map((entry) => {
    const equipmentName = resolveGseDisplayNameFromCatalog(entry.equipmentName, lookup);
    return equipmentName === entry.equipmentName ? entry : { ...entry, equipmentName };
  });
}

/**
 * Keys: trimmed lowercase `abbr` AND trimmed lowercase `description`. Values: `unit_type`.
 * Both keys are populated so callers can look up either the raw FHR `equipment_name`
 * (typically the abbr) or an already-resolved display name (description).
 */
export function buildAbbrUnitTypeLookup(
  items: GseCatalogRow[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of items) {
    const unit = String(it.unit_type ?? '').trim();
    if (!unit) continue;
    const abbr = String(it.abbr ?? '').trim().toLowerCase();
    const desc = String(it.description ?? '').trim().toLowerCase();
    if (abbr) m.set(abbr, unit);
    if (desc && !m.has(desc)) m.set(desc, unit);
  }
  return m;
}

/**
 * True when the catalog `unit_type` indicates a manpower resource rather than equipment.
 *
 * Conservative match: trims/case-folds the value and treats it as manpower when it contains
 * any of these keywords: `manpower`, `man-power`, `man power`, `personnel`. Admins can set
 * `unit_type = 'Manpower'` on the EquipmentManpowerPage to flag rows.
 */
export function isManpowerUnitType(unitType: string | null | undefined): boolean {
  const s = String(unitType ?? '').trim().toLowerCase();
  if (!s) return false;
  return (
    s.includes('manpower') ||
    s.includes('man-power') ||
    s.includes('man power') ||
    s.includes('personnel')
  );
}

/**
 * Resolve the catalog `unit_type` for an FHR `equipment_name`, trying the abbr key first
 * and falling back to the description key. Returns `''` when no row matches.
 */
export function resolveUnitTypeFromCatalog(
  equipmentNameFromFhr: string,
  unitTypeLookup: Map<string, string>,
): string {
  const raw = String(equipmentNameFromFhr ?? '').trim().toLowerCase();
  if (!raw || unitTypeLookup.size === 0) return '';
  return unitTypeLookup.get(raw) ?? '';
}
