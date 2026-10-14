/** Stored on each `equipmentManpower.catalogItems[]` row (`equipmentManpower` collection). */
export const EQUIPMENT_CATEGORY_CODES = ['M', 'NM', 'T'] as const;
export type EquipmentCategoryCode = (typeof EQUIPMENT_CATEGORY_CODES)[number];

/** Normalizes UI/API input to `M` | `NM` | `T` or empty when unset / invalid. */
export function normalizeEquipmentCategory(raw: unknown): '' | EquipmentCategoryCode {
  const s = String(raw ?? '').trim().toUpperCase();
  if (s === 'M') return 'M';
  if (s === 'NM') return 'NM';
  if (s === 'T') return 'T';
  return '';
}

/** Human-readable labels for exports and tables (DB keeps codes M / NM / T). */
export function formatEquipmentCategoryLabel(raw: unknown): string {
  const c = normalizeEquipmentCategory(raw);
  if (c === 'M') return 'Motorised';
  if (c === 'NM') return 'Non motorised';
  if (c === 'T') return 'Towable';
  return '';
}
