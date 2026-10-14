/**
 * RAF equipment palette — chip labels = Equipment No from MAA Chennai RAF Excel seed.
 * Keep in sync with `MAA_RAF_EQUIPMENT_CATALOG` in
 * `BWMS/modules/m-fris/server/excel-import/maa-raf-excel.util.ts`.
 */
import type { ActiveFlightStatTheme } from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';
import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import {
  adsRowChargedQuantity,
  adsRowUsedUnits,
  billingAdsFlightKey,
} from './billingAdsBriefStats';

export type RafEquipmentPaletteCategory = 'motorised' | 'nonMotorised' | 'manpower';

export type RafSeededEquipmentCode =
  | 'GPU-140KV'
  | 'GPU-NB'
  | 'PBNB'
  | 'ISTNB'
  | 'RC'
  | 'WC'
  | 'EBT'
  | 'UH';

type RafPaletteItem = {
  code: RafSeededEquipmentCode;
  /** Exact Equipment No from Excel / DB `equipmentCode`. */
  label: string;
  fullName: string;
  kind: 'equipment' | 'manpower' | 'service';
  category: RafEquipmentPaletteCategory;
  theme: ActiveFlightStatTheme;
};

const THEMES: ActiveFlightStatTheme[] = [
  {
    accent: '#0f766e',
    border: '#99f6e4',
    bgTop: '#f0fdfa',
    bgBottom: '#ccfbf1',
    shadow: 'rgba(15,118,110,0.18)',
    hoverShadow: 'rgba(15,118,110,0.28)',
    swatch: '#14b8a6',
  },
  {
    accent: '#1d4ed8',
    border: '#bfdbfe',
    bgTop: '#eff6ff',
    bgBottom: '#dbeafe',
    shadow: 'rgba(29,78,216,0.16)',
    hoverShadow: 'rgba(29,78,216,0.26)',
    swatch: '#3b82f6',
  },
  {
    accent: '#a16207',
    border: '#fde68a',
    bgTop: '#fffbeb',
    bgBottom: '#fef3c7',
    shadow: 'rgba(161,98,7,0.16)',
    hoverShadow: 'rgba(161,98,7,0.26)',
    swatch: '#eab308',
  },
  {
    accent: '#be185d',
    border: '#fbcfe8',
    bgTop: '#fdf2f8',
    bgBottom: '#fce7f3',
    shadow: 'rgba(190,24,93,0.16)',
    hoverShadow: 'rgba(190,24,93,0.26)',
    swatch: '#ec4899',
  },
  {
    accent: '#6d28d9',
    border: '#ddd6fe',
    bgTop: '#f5f3ff',
    bgBottom: '#ede9fe',
    shadow: 'rgba(109,40,217,0.16)',
    hoverShadow: 'rgba(109,40,217,0.26)',
    swatch: '#8b5cf6',
  },
  {
    accent: '#c2410c',
    border: '#fed7aa',
    bgTop: '#fff7ed',
    bgBottom: '#ffedd5',
    shadow: 'rgba(194,65,12,0.16)',
    hoverShadow: 'rgba(194,65,12,0.26)',
    swatch: '#f97316',
  },
  {
    accent: '#047857',
    border: '#a7f3d0',
    bgTop: '#ecfdf5',
    bgBottom: '#d1fae5',
    shadow: 'rgba(4,120,87,0.16)',
    hoverShadow: 'rgba(4,120,87,0.26)',
    swatch: '#10b981',
  },
  {
    accent: '#334155',
    border: '#cbd5e1',
    bgTop: '#f8fafc',
    bgBottom: '#e2e8f0',
    shadow: 'rgba(51,65,85,0.14)',
    hoverShadow: 'rgba(51,65,85,0.24)',
    swatch: '#64748b',
  },
];

/**
 * Seeded Chennai RAF Equipment No values (Excel column) — chip label = this code.
 */
export const RAF_SEEDED_EQUIPMENT_PALETTE: readonly RafPaletteItem[] = [
  {
    code: 'GPU-140KV',
    label: 'GPU-140KV',
    fullName: 'Ground Power Unit (GPU) 140 KV',
    kind: 'equipment',
    category: 'motorised',
    theme: THEMES[0],
  },
  {
    code: 'GPU-NB',
    label: 'GPU-NB',
    fullName: 'Ground Power Unit (GPU) 90 KV',
    kind: 'equipment',
    category: 'motorised',
    theme: THEMES[1],
  },
  {
    code: 'PBNB',
    label: 'PBNB',
    fullName: 'Push Back (Tow Bar included) Narrow Body',
    kind: 'equipment',
    category: 'motorised',
    theme: THEMES[2],
  },
  {
    code: 'ISTNB',
    label: 'ISTNB',
    fullName: 'Tow Inter Stand - Narrow Body',
    kind: 'equipment',
    category: 'motorised',
    theme: THEMES[3],
  },
  {
    code: 'RC',
    label: 'RC',
    fullName: 'Ramp to Flight Deck Communication- Narrow Body',
    kind: 'equipment',
    category: 'motorised',
    theme: THEMES[4],
  },
  {
    code: 'EBT',
    label: 'EBT',
    fullName: 'Conveyor belt loader',
    kind: 'equipment',
    category: 'motorised',
    theme: THEMES[5],
  },
  {
    code: 'WC',
    label: 'WC',
    fullName: 'Water service',
    kind: 'equipment',
    category: 'nonMotorised',
    theme: THEMES[6],
  },
  {
    code: 'UH',
    label: 'UH',
    fullName: 'Floor Walkers/Welcome staff',
    kind: 'manpower',
    category: 'manpower',
    theme: THEMES[7],
  },
];

export const RAF_SEEDED_EQUIPMENT_CODES = RAF_SEEDED_EQUIPMENT_PALETTE.map(
  (item) => item.code,
) as readonly RafSeededEquipmentCode[];

export type RafEquipmentPaletteStats = Record<RafSeededEquipmentCode, number>;

export const EMPTY_RAF_EQUIPMENT_PALETTE_STATS: RafEquipmentPaletteStats =
  Object.fromEntries(RAF_SEEDED_EQUIPMENT_CODES.map((code) => [code, 0])) as RafEquipmentPaletteStats;

const CODE_SET = new Set<string>(RAF_SEEDED_EQUIPMENT_CODES);

const SECTION_META: Array<{
  category: RafEquipmentPaletteCategory;
  title: string;
}> = [
  { category: 'motorised', title: 'Motorised' },
  { category: 'nonMotorised', title: 'Non motorised' },
  { category: 'manpower', title: 'Manpower' },
];

/** Normalize Equipment No from FHR / enrichment (matches Excel seed codes). */
export function rafEquipmentCodeFromRow(row: BillingSourceRow): string {
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  const direct = String(op.equipmentCode ?? op.equipment_code ?? '')
    .trim()
    .toUpperCase();
  if (direct) return direct;

  const serviceCode = String(
    op.serviceCode ?? row.rateMatch?.serviceCode ?? '',
  ).trim();
  const fromService = serviceCode.match(
    /RAF\s*-\s*(?:Equipment|Manpower|Service)\s*-\s*(.+)$/i,
  );
  if (fromService?.[1]) return fromService[1].trim().toUpperCase();

  return '';
}

/**
 * One engagement per `rafAdhocDetails.services[]` line (Excel Equipment No row).
 * Do **not** collapse by flight: GPU-140KV three times on one flight → +3.
 * Do **not** use `quantity` / `usageHours` here — those are billing duration, not
 * occurrence count (seed stores hours in `quantity` for hourly UOMs).
 */
export function rafPaletteEngagementQty(_row: BillingSourceRow): number {
  return 1;
}

/**
 * Total chip count = sum of every matching usage line in the loaded rows.
 * No per-flight unique — repeats of the same Equipment No all count.
 */
export function computeRafEquipmentPaletteStats(
  rows: BillingSourceRow[],
): RafEquipmentPaletteStats {
  const stats = { ...EMPTY_RAF_EQUIPMENT_PALETTE_STATS };
  for (const row of rows) {
    if (String(row.sourceType ?? '').trim().toLowerCase() === 'raf') {
      const cleaning = String(
        (row.operationalData as Record<string, unknown> | undefined)?.rafCleaningKind ??
          '',
      ).trim();
      if (cleaning) continue; // cleaning lines are not Equipment No chips
    }
    const code = rafEquipmentCodeFromRow(row);
    if (!CODE_SET.has(code)) continue;
    const key = code as RafSeededEquipmentCode;
    // Each line increments — same code on same flight counts again.
    stats[key] += rafPaletteEngagementQty(row);
  }
  return stats;
}

export function filterBillingRowsByRafEquipmentCodes(
  rows: BillingSourceRow[],
  selected: ReadonlySet<string>,
): BillingSourceRow[] {
  if (selected.size === 0) return rows;
  const normalized = new Set(
    [...selected].map((c) => String(c).trim().toUpperCase()).filter(Boolean),
  );
  if (normalized.size === 0) return rows;
  return rows.filter((row) => normalized.has(rafEquipmentCodeFromRow(row)));
}

export function countUniqueRafFlights(rows: BillingSourceRow[]): number {
  const keys = new Set<string>();
  for (const row of rows) {
    const key =
      billingAdsFlightKey(row) ||
      `line:${String(row.sourceRef.usageRowId ?? '')}:${String(row.sourceRef.serialNo ?? '')}`;
    if (key) keys.add(key);
  }
  return keys.size;
}

export type RafEquipmentSelectionTotals = {
  label: string;
  engagements: number;
  uom: string;
  usedUnits: number;
  chargedUnits: number;
};

export function formatSelectedRafEquipmentLabels(
  selected: ReadonlySet<string>,
): string {
  const labels = RAF_SEEDED_EQUIPMENT_PALETTE.filter((item) =>
    selected.has(item.code),
  ).map((item) => item.label);
  if (labels.length === 0) {
    return [...selected].filter(Boolean).join(', ') || 'Selected equipment';
  }
  return labels.join(', ');
}

export function computeRafEquipmentSelectionTotals(
  rows: BillingSourceRow[],
  selected: ReadonlySet<string>,
): RafEquipmentSelectionTotals | null {
  if (selected.size === 0) return null;
  const filtered = filterBillingRowsByRafEquipmentCodes(rows, selected);
  if (filtered.length === 0) {
    return {
      label: formatSelectedRafEquipmentLabels(selected),
      engagements: 0,
      uom: '—',
      usedUnits: 0,
      chargedUnits: 0,
      };
  }

  let engagements = 0;
  let usedUnits = 0;
  let chargedUnits = 0;
  const uomCounts = new Map<string, number>();

  for (const row of filtered) {
    engagements += rafPaletteEngagementQty(row);
    usedUnits += adsRowUsedUnits(row);
    chargedUnits += adsRowChargedQuantity(row);
    const op = (row.operationalData ?? {}) as Record<string, unknown>;
    const rate = (row.rateMatch ?? {}) as Record<string, unknown>;
    const uom =
      String(rate.uom ?? op.uom ?? op.unit ?? '').trim() || 'Per Service';
    uomCounts.set(uom, (uomCounts.get(uom) ?? 0) + 1);
  }

  let uom = 'Per Service';
  let best = 0;
  for (const [value, count] of uomCounts) {
    if (count > best) {
      best = count;
      uom = value;
    }
  }

  return {
    label: formatSelectedRafEquipmentLabels(selected),
    engagements,
    uom,
    usedUnits: Math.round(usedUnits * 10000) / 10000,
    chargedUnits: Math.round(chargedUnits * 10000) / 10000,
  };
}

export function buildRafEquipmentPaletteSections(): Array<{
  category: RafEquipmentPaletteCategory;
  title: string;
  items: readonly RafPaletteItem[];
}> {
  return SECTION_META.map(({ category, title }) => ({
    category,
    title,
    items: RAF_SEEDED_EQUIPMENT_PALETTE.filter((item) => item.category === category),
  })).filter((section) => section.items.length > 0);
}

export function rafEquipmentHoverTitle(
  item: RafPaletteItem,
  count: number,
): string {
  return `${item.label} — ${item.fullName} · ${count.toLocaleString()} engagement${
    count === 1 ? '' : 's'
  }`;
}
