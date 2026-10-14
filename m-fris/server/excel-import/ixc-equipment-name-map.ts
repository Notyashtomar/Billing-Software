import { IXC_EQUIPMENT_SEED } from '../advance-equipment/data/ixc-equipment.seed';
import { toBillingTrackableFullName } from 'src/common/billing-trackable-equipment-name';

/**
 * Resolve Excel `Equipment No` short codes → full display names for IXC GSE seed.
 * Source of truth: `IXC_EQUIPMENT_SEED` (advance equipment master for Chandigarh).
 */

/** Gaps / aliases not covered by the IXC master list. */
const IXC_EQUIPMENT_NAME_FALLBACKS: Record<string, string> = {
  'Cabin Cleaning': 'Cabin Cleaning',
  // Common alternate spellings seen in exports
  TOW: 'Tow Bar',
  Towbar: 'Tow Bar',
  'Tow Bar': 'Tow Bar',
};

function normKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

let cachedLookup: Map<string, string> | null = null;

/** Build abbr → full-name lookup (lazy, process-lifetime cache). */
export function loadIxcEquipmentFullNameLookup(): Map<string, string> {
  if (cachedLookup) return cachedLookup;

  const map = new Map<string, string>();

  for (const row of IXC_EQUIPMENT_SEED) {
    const code = String(row.equipmentCode ?? '').trim();
    const name = String(row.equipmentName ?? '').trim();
    if (!code || !name) continue;
    map.set(normKey(code), name);
  }

  for (const [code, name] of Object.entries(IXC_EQUIPMENT_NAME_FALLBACKS)) {
    map.set(normKey(code), name);
  }

  cachedLookup = map;
  return map;
}

/** Resolve Excel equipment short code to a stored full name (falls back to the raw value). */
export function resolveIxcEquipmentFullName(
  equipmentNo: string,
  lookup: Map<string, string> = loadIxcEquipmentFullNameLookup(),
): string {
  const raw = String(equipmentNo ?? '').trim();
  if (!raw) return '';
  const billed = toBillingTrackableFullName(raw);
  if (billed && billed !== raw) return billed;
  return lookup.get(normKey(raw)) ?? raw;
}

/** Clear cache (tests / CLI reload). */
export function clearIxcEquipmentFullNameLookupCache(): void {
  cachedLookup = null;
}
