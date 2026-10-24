import {
  adsEquipmentFamilyKey,
  adsEquipmentLabelsMatch,
} from '../shared/ads-equipment-inclusion.util';
import {
  isAdsFifteenMinuteUom,
  isAdsHalfHourUom,
  isAdsHourlyUom,
} from '../shared/rate-card-billing-scope';

export type EquipmentMasterSyncItem = {
  itemNo?: string;
  description?: string;
  unitType?: string;
  uoms?: Array<{ uom?: string; abbreviation?: string }>;
};

export type AdsRuleSyncRow = {
  serviceCode?: string;
  uom?: string;
  unitPriceINR?: number;
  unitPriceUSD?: number;
  [key: string]: unknown;
};

export type AdsRuleSyncResult<T extends AdsRuleSyncRow> = {
  rules: T[];
  matched: number;
  renamed: number;
  uomCanonicalized: number;
  expanded: number;
  unmatched: string[];
  ambiguous: string[];
};

function cell(value: unknown): string {
  return String(value ?? '').trim();
}

function plainRule<T extends AdsRuleSyncRow>(rule: T): T {
  const candidate = rule as T & { toObject?: () => AdsRuleSyncRow };
  const raw =
    candidate && typeof candidate.toObject === 'function'
      ? candidate.toObject()
      : { ...rule };
  const copy = { ...raw } as T & { _id?: unknown };
  delete copy._id;
  return copy;
}

function compactKey(value: unknown): string {
  return cell(value)
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/[^A-Z0-9]/g, '');
}

function compactVariants(value: unknown): string[] {
  const full = compactKey(value);
  if (!full) return [];
  const stripped = full.replace(/^(ADS|SCHEDULED|NONSCHEDULED|RAF|EQUIPMENT|MANPOWER)+/, '');
  return stripped && stripped !== full ? [full, stripped] : [full];
}

function masterName(item: EquipmentMasterSyncItem): string {
  return cell(item.description) || cell(item.itemNo);
}

function masterUoms(item: EquipmentMasterSyncItem): string[] {
  const seen = new Set<string>();
  const uoms: string[] = [];
  for (const pair of item.uoms ?? []) {
    const uom = cell(pair.uom);
    if (!uom) continue;
    const key = uom.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uoms.push(uom);
  }
  return uoms;
}

function uomClass(uom: string): '15min' | '30min' | 'hour' | 'other' {
  if (isAdsFifteenMinuteUom(uom)) return '15min';
  if (isAdsHalfHourUom(uom)) return '30min';
  if (isAdsHourlyUom(uom)) return 'hour';
  return 'other';
}

function sameUom(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const classA = uomClass(a);
  const classB = uomClass(b);
  if (classA !== 'other' && classA === classB) return true;
  return false;
}

function labelsMatchMaster(ruleCode: string, item: EquipmentMasterSyncItem): boolean {
  const description = cell(item.description);
  const itemNo = cell(item.itemNo);
  if (description && adsEquipmentLabelsMatch(ruleCode, description)) return true;
  if (itemNo && adsEquipmentLabelsMatch(ruleCode, itemNo)) return true;
  return false;
}

export type EquipmentMasterPick = EquipmentMasterSyncItem | 'ambiguous' | null;

export function pickEquipmentMasterForAdsRule(
  ruleCode: string,
  catalog: EquipmentMasterSyncItem[],
  cache?: Map<string, EquipmentMasterPick>,
): EquipmentMasterPick {
  const code = cell(ruleCode);
  if (!code || catalog.length === 0) return null;
  if (cache?.has(code)) return cache.get(code)!;
  const variants = compactVariants(code);

  const remember = (value: EquipmentMasterPick) => {
    cache?.set(code, value);
    return value;
  };

  const exact = catalog.filter((item) => {
    const desc = compactKey(item.description);
    const itemNo = compactKey(item.itemNo);
    return variants.some((compact) => (desc && desc === compact) || (itemNo && itemNo === compact));
  });
  if (exact.length === 1) return remember(exact[0]!);
  if (exact.length > 1) {
    const byDescription = exact.filter((item) =>
      variants.some((compact) => compactKey(item.description) === compact),
    );
    if (byDescription.length === 1) return remember(byDescription[0]!);
    return remember('ambiguous');
  }

  const hits = catalog.filter((item) => labelsMatchMaster(code, item));
  if (hits.length === 0) return remember(null);
  if (hits.length === 1) return remember(hits[0]!);

  const family = adsEquipmentFamilyKey(code);
  if (family) {
    const sameFamily = hits.filter((item) => {
      const itemFamily =
        adsEquipmentFamilyKey(item.description) || adsEquipmentFamilyKey(item.itemNo);
      return itemFamily === family;
    });
    if (sameFamily.length === 1) return remember(sameFamily[0]!);
    if (sameFamily.length > 1) return remember('ambiguous');
  }

  return remember('ambiguous');
}

function splitMasterUoms(currentUom: string, catalogUoms: string[]): {
  primary: string | null;
  extras: string[];
} {
  if (catalogUoms.length === 0) {
    return { primary: currentUom || null, extras: [] };
  }
  const current = cell(currentUom);
  const matched = current
    ? catalogUoms.find((uom) => sameUom(current, uom))
    : undefined;
  const primary = matched ?? catalogUoms[0]!;
  return {
    primary,
    extras: catalogUoms.filter((uom) => uom.toLowerCase() !== primary.toLowerCase()),
  };
}

function ruleKey(rule: AdsRuleSyncRow): string {
  const identity = cell(rule.serviceCode)
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const uom = cell(rule.uom).toUpperCase() || 'EA';
  const aircraft = Array.isArray(rule.aircraftTypes)
    ? [...rule.aircraftTypes]
        .map((value) => cell(value).toUpperCase())
        .filter(Boolean)
        .sort()
        .join(',')
    : cell(rule.aircraftType).toUpperCase();
  return `${identity}::${uom}::${aircraft}`;
}

/**
 * Replace each ADS equipment rule with the Equipment Master listing it matches.
 * Extra catalog UOMs become additional visible rows without a price so invoicing
 * keeps using the original billed unit.
 */
export function syncAdsRulesToEquipmentMaster<T extends AdsRuleSyncRow>(
  rules: T[],
  catalog: EquipmentMasterSyncItem[],
  pickCache?: Map<string, EquipmentMasterPick>,
): AdsRuleSyncResult<T> {
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const next: T[] = [];
  const seen = new Set<string>();
  let matched = 0;
  let renamed = 0;
  let uomCanonicalized = 0;
  let expanded = 0;

  for (const rule of rules) {
    const code = cell(rule.serviceCode);
    if (!code) {
      next.push(plainRule(rule));
      continue;
    }

    const pick = pickEquipmentMasterForAdsRule(code, catalog, pickCache);
    if (pick === 'ambiguous') {
      ambiguous.push(code);
      next.push(plainRule(rule));
      continue;
    }
    if (!pick) {
      unmatched.push(code);
      next.push(plainRule(rule));
      continue;
    }

    matched += 1;
    const name = masterName(pick);
    const { primary, extras } = splitMasterUoms(cell(rule.uom), masterUoms(pick));
    if (name && name !== code) renamed += 1;
    if (primary && primary !== cell(rule.uom)) uomCanonicalized += 1;

    const primaryRow = {
      ...plainRule(rule),
      serviceCode: name || code,
      uom: primary || cell(rule.uom),
    } as T;
    const primaryKey = ruleKey(primaryRow);
    if (!seen.has(primaryKey)) {
      seen.add(primaryKey);
      next.push(primaryRow);
    }

    for (const uom of extras) {
      const extraRow = {
        ...plainRule(rule),
        serviceCode: name || code,
        uom,
        unitPriceINR: undefined,
        unitPriceUSD: undefined,
      } as T;
      const extraKey = ruleKey(extraRow);
      if (seen.has(extraKey)) continue;
      seen.add(extraKey);
      next.push(extraRow);
      expanded += 1;
    }
  }

  return {
    rules: next,
    matched,
    renamed,
    uomCanonicalized,
    expanded,
    unmatched: [...new Set(unmatched)],
    ambiguous: [...new Set(ambiguous)],
  };
}
