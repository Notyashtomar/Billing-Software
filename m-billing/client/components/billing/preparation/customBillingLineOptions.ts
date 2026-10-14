import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';
import type { BillingApi } from '@/lib/billing-api';
import { buildAdsUomOptions } from '@/lib/billing-shared/ads-uom-options';
import {
  inferCatalogMeta,
  SERVICE_CATALOG_LABELS,
} from '@/lib/billing-shared/service-catalog-labels';
import type { BillingServiceCatalogItem } from '@/lib/billing-shared/types';

export type CustomBillingEquipmentOption = {
  code: string;
  label: string;
  uom: string;
};

/** Wheelchair particulars used on ADS / FHR (short + Scheduled Flight labels). */
export const CUSTOM_BILLING_WHEELCHAIR_LABELS: readonly string[] = [
  'Scheduled Flight - WCHR',
  'Scheduled Flight - WCHS',
  'Scheduled Flight - WCHC',
  'Non Scheduled Flight - WCHR',
  'Non Scheduled Flight - WCHC',
  'WCHR',
  'WCHS',
  'WCHC',
  'Wheel Chair -WCHR',
  'Wheel Chair -WCHS',
  'Wheel Chair -WCHC',
  'Wheelchair (R)',
  'Wheelchair (S)',
  'Wheelchair (C)',
];

function isBareEquipmentPrefix(code: string): boolean {
  return /^(scheduled|non\s*scheduled|raf)\s*-\s*equipment\s*-\s*$/i.test(code.trim());
}

function isWheelchairParticular(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (/\bwch[rsc]\b/i.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return lower.includes('wheelchair') || lower.includes('wheel chair');
}

/** Scheduled airline GSE / cleaning lines (`Scheduled - Equipment - …`). */
function isScheduledAirlineEquipmentParticular(code: string): boolean {
  return /^scheduled\s*-\s*equipment\s*-\s*.+/i.test(code.trim());
}

function isOtherEquipmentParticular(code: string): boolean {
  return /^(non\s*scheduled|raf)\s*-\s*equipment\s*-\s*.+/i.test(code.trim());
}

/** Particulars allowed in custom billing equipment dropdown. */
function isCustomBillingParticular(code: string, category?: string): boolean {
  if (isBareEquipmentPrefix(code)) return false;
  if (isWheelchairParticular(code)) return true;
  if (isScheduledAirlineEquipmentParticular(code)) return true;
  if (isOtherEquipmentParticular(code)) return true;
  if (String(category ?? '').toLowerCase() === 'equipment') return true;
  const lower = code.toLowerCase();
  if (!lower.includes('equipment')) return false;
  return inferCatalogMeta(code).category === 'equipment';
}

function defaultUomForParticular(code: string): string {
  if (isWheelchairParticular(code)) return 'Per Service';
  const meta = inferCatalogMeta(code);
  return meta.uom || 'Per Service';
}

/** Equipment + wheelchair particulars for custom billing dropdowns. */
export function buildCustomBillingEquipmentOptions(
  catalogItems: BillingServiceCatalogItem[],
  extraCodes: string[] = [],
): CustomBillingEquipmentOption[] {
  const byCode = new Map<string, CustomBillingEquipmentOption>();

  const upsert = (code: string, label: string, uom: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (isBareEquipmentPrefix(trimmed)) return;
    const key = trimmed.toLowerCase();
    if (byCode.has(key)) return;
    byCode.set(key, {
      code: trimmed,
      label: label.trim() || trimmed,
      uom: uom.trim() || defaultUomForParticular(trimmed),
    });
  };

  for (const item of catalogItems) {
    const code = String(item.serviceCode ?? '').trim();
    if (!code || item.active === false) continue;
    if (!isCustomBillingParticular(code, item.category)) continue;
    upsert(code, String(item.description ?? code).trim() || code, String(item.uom ?? '').trim());
  }

  for (const label of SERVICE_CATALOG_LABELS) {
    if (!isCustomBillingParticular(label)) continue;
    const meta = inferCatalogMeta(label);
    upsert(label, label, meta.uom);
  }

  for (const label of CUSTOM_BILLING_WHEELCHAIR_LABELS) {
    upsert(label, label, 'Per Service');
  }

  for (const code of extraCodes) {
    const trimmed = code.trim();
    if (!trimmed) continue;
    upsert(trimmed, trimmed, defaultUomForParticular(trimmed));
  }

  return [...byCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { sensitivity: 'base' }),
  );
}

export function buildCustomBillingUnitOptions(
  ...extraSources: Array<Iterable<string | null | undefined>>
): string[] {
  return buildAdsUomOptions(...extraSources);
}

/** Searchable combobox options for equipment/particulars (catalog + typed values). */
export function buildEquipmentComboOptions(
  equipmentOptions: CustomBillingEquipmentOption[],
  extraParticulars: string[] = [],
): SearchableComboOption[] {
  const byKey = new Map<string, SearchableComboOption>();
  const upsert = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (byKey.has(key)) return;
    byKey.set(key, { id: trimmed, label: trimmed });
  };
  for (const opt of equipmentOptions) upsert(opt.code);
  for (const code of extraParticulars) upsert(code);
  return [...byKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
}

/** Searchable combobox options for unit/UOM (catalog + typed values). */
export function buildUnitComboOptions(
  unitOptions: string[],
  extraUnits: string[] = [],
): SearchableComboOption[] {
  const byKey = new Map<string, SearchableComboOption>();
  const upsert = (unit: string) => {
    const trimmed = unit.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (byKey.has(key)) return;
    byKey.set(key, { id: trimmed, label: trimmed });
  };
  for (const unit of unitOptions) upsert(unit);
  for (const unit of extraUnits) upsert(unit);
  return [...byKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
}

export const CUSTOM_BILLING_TABLE_COMBO_CLASS =
  'min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm shadow-none';

export async function loadCustomBillingLineLookups(api: BillingApi): Promise<{
  equipmentOptions: CustomBillingEquipmentOption[];
  unitOptions: string[];
}> {
  const catalogRes = await api
    .listServiceCatalog()
    .catch(() => ({ data: { items: [] as BillingServiceCatalogItem[] } }));
  const items =
    ((catalogRes as { data?: { items?: BillingServiceCatalogItem[] } }).data?.items ??
      []) as BillingServiceCatalogItem[];
  const equipmentOptions = buildCustomBillingEquipmentOptions(items);
  const unitOptions = buildCustomBillingUnitOptions(
    equipmentOptions.map((e) => e.uom),
    items.map((i) => i.uom),
  );
  return { equipmentOptions, unitOptions };
}
