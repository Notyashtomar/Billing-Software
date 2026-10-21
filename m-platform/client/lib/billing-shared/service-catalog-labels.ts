/**
 * Service codes used by billing catalog / invoicing labels.
 * BC audit: docs/invoicing/audit/BC_SCREEN_INVENTORY.md §A2
 */
import { toBillingTrackableFullName } from './billing-trackable-equipment-name';

export const SERVICE_CATALOG_LABELS: readonly string[] = [
  'Cancel Scheduled - Equipment - Cabin Cleaning',
  'Cancel Scheduled Flight',
  'Manpower',
  'Non Scheduled - Equipment -',
  'Non Scheduled - Equipment - ACU',
  'Non Scheduled - Equipment - ACU-NB',
  'Non Scheduled - Equipment - AMB',
  'Non Scheduled - Equipment - ASU-NB',
  'Non Scheduled - Equipment - ASU-WB',
  'Non Scheduled - Equipment - BFL-Towable',
  'Non Scheduled - Equipment - BMW',
  'Non Scheduled - Equipment - BT',
  'Non Scheduled - Equipment - C',
  'Non Scheduled - Equipment - c1',
  'Non Scheduled - Equipment - CBM',
  'Non Scheduled - Equipment - CD',
  'Non Scheduled - Equipment - CK',
  'Non Scheduled - Equipment - Crew Coach',
  'Non Scheduled - Equipment - DT',  'Non Scheduled - Equipment - EBT',
  'Non Scheduled - Equipment - EC - NB',
  'Non Scheduled - Equipment - GPU-140KV',
  'Non Scheduled - Equipment - GPU-180KV',
  'Non Scheduled - Equipment - GPU-90KV',
  'Non Scheduled - Equipment - GPU-WB',
  'Non Scheduled - Equipment - HS',
  'Non Scheduled - Equipment - ISTNB',
  'Non Scheduled - Equipment - ISTWB',
  'Non Scheduled - Equipment - LDL',
  'Non Scheduled - Equipment - Long Towbar',
  'Non Scheduled - Equipment - MDL',
  'Non Scheduled - Equipment - MG',
  'Non Scheduled - Equipment - MPSL',
  'Non Scheduled - Equipment - PAX Coach',
  'Non Scheduled - Equipment - PBNB',
  'Non Scheduled - Equipment - PBWB',
  'Non Scheduled - Equipment - PD',
  'Non Scheduled - Equipment - PSL-Towable',
  'Non Scheduled - Equipment - RC',
  'Non Scheduled - Equipment - Short Towbar',
  'Non Scheduled - Equipment - TEMPO',
  'Non Scheduled - Equipment - Tow',
  'Non Scheduled - Equipment - TRE',
  'Non Scheduled - Equipment - TS',
  'Non Scheduled - Equipment - UDL',
  'Non Scheduled - Equipment - URB',
  'Non Scheduled - Equipment - WC',
  'Non Scheduled - Equipment - WW',
  'Non Scheduled - Manpower - BC',
  'Non Scheduled - Manpower - CSA',
  'Non Scheduled - Manpower - CSH',
  'Non Scheduled - Manpower - DO',
  'Non Scheduled - Manpower - M',
  'Non Scheduled - Manpower - Sr. CSA',
  'Non Scheduled - Manpower - Sup',
  'Non Scheduled - Manpower - UH',
  'Non Scheduled - Manpower - WC',
  'Non Scheduled Flight',
  'Non Scheduled Flight - C',
  'Non Scheduled Flight - CK',
  'Non Scheduled Flight - MDL',
  'Non Scheduled Flight - Tow',
  'Non Scheduled Flight - WCHC',
  'Non Scheduled Flight - WCHR',
  'RAF - Equipment - ACU',
  'RAF - Equipment - AMB',
  'RAF - Equipment - BMW',
  'RAF - Equipment - BT',
  'RAF - Equipment - c1',
  'RAF - Equipment - Crew Coach',
  'RAF - Equipment - DC-NB',  'RAF - Equipment - DT',
  'RAF - Equipment - EBT',
  'RAF - Equipment - EC - NB',
  'RAF - Equipment - FORK',
  'RAF - Equipment - GPU-140KV',
  'RAF - Equipment - GPU-180KV',
  'RAF - Equipment - GPU-90KV',
  'RAF - Equipment - GPU-NB',
  'RAF - Equipment - ISTNB',
  'RAF - Equipment - LDL',
  'RAF - Equipment - Long Towbar',
  'RAF - Equipment - MDL',
  'RAF - Equipment - MG',
  'RAF - Equipment - NHC - NB',
  'RAF - Equipment - PAX Coach',
  'RAF - Equipment - PBNB',
  'RAF - Equipment - PBWB',
  'RAF - Equipment - PD',
  'RAF - Equipment - PSL-Towable',
  'RAF - Equipment - RC',
  'RAF - Equipment - Short Towbar',
  'RAF - Equipment - Tow',
  'RAF - Equipment - TS',
  'RAF - Equipment - WC',
  'RAF - Manpower - BC',
  'RAF - Manpower - UH',
  'Scheduled - Equipment -',
  'Scheduled - Equipment - ACU',
  'Scheduled - Equipment - AMB',
  'Scheduled - Equipment - ASU-NB',
  'Scheduled - Equipment - ASU-WB',
  'Scheduled - Equipment - BFL-Towable',
  'Scheduled - Equipment - BMW',
  'Scheduled - Equipment - BT',
  'Scheduled - Equipment - C',
  'Scheduled - Equipment - c1',
  'Scheduled - Equipment - Cabin Cleaning',
  'Scheduled - Equipment - CBM',
  'Scheduled - Equipment - CD',
  'Scheduled - Equipment - CK',
  'Scheduled - Equipment - Crew Coach',
  'Scheduled - Equipment - Deep Cleaning',
  'Scheduled - Equipment - DT',  'Scheduled - Equipment - EBT',
  'Scheduled - Equipment - FE',
  'Scheduled - Equipment - GPU-140KV',
  'Scheduled - Equipment - GPU-180KV',
  'Scheduled - Equipment - GPU-280KV',
  'Scheduled - Equipment - GPU-90KV',
  'Scheduled - Equipment - HS',
  'Scheduled - Equipment - ISTNB',
  'Scheduled - Equipment - ISTWB',
  'Scheduled - Equipment - LDL',
  'Scheduled - Equipment - Long Towbar',
  'Scheduled - Equipment - MDL',
  'Scheduled - Equipment - MG',
  'Scheduled - Equipment - MPSL',
  'Scheduled - Equipment - Night Halt Cleaning',
  'Scheduled - Equipment - PAX Coach',
  'Scheduled - Equipment - PBNB',
  'Scheduled - Equipment - PBWB',
  'Scheduled - Equipment - PD',
  'Scheduled - Equipment - PSL-Towable',
  'Scheduled - Equipment - RC',
  'Scheduled - Equipment - Short Towbar',
  'Scheduled - Equipment - Tow',
  'Scheduled - Equipment - TRE',
  'Scheduled - Equipment - TS',
  'Scheduled - Equipment - URB',
  'Scheduled - Equipment - WC',
  'Scheduled - Equipment - WW',
  'Scheduled - Manpower - AMS',
  'Scheduled - Manpower - BC',
  'Scheduled - Manpower - CSA',
  'Scheduled - Manpower - CSH',
  'Scheduled - Manpower - DO',
  'Scheduled - Manpower - M',
  'Scheduled - Manpower - Sr. CSA',
  'Scheduled - Manpower - Sup',
  'Scheduled - Manpower - UH',
  'Scheduled - Manpower - WC',
  'Scheduled Flight',
  'Scheduled Flight - WCHC',
  'Scheduled Flight - WCHR',
  'Scheduled Flight - WCHS',
] as const;

/** Infer catalog category + default UOM from export log label prefix and equipment code. */
export function inferCatalogMeta(label: string): {
  category:
    | 'scheduled'
    | 'non_scheduled'
    | 'raf'
    | 'xxld'
    | 'cleaning'
    | 'manpower'
    | 'equipment';
  uom: string;
} {
  const raw = String(label ?? '').trim();
  const lower = raw.toLowerCase();
  const stripped = stripCatalogServicePrefix(raw);
  const strippedUpper = stripped.toUpperCase();

  // 1. Cancelled items
  if (lower.startsWith('cancel scheduled')) {
    if (lower.includes('cabin cleaning') || lower.includes('cleaning')) {
      return { category: 'cleaning', uom: 'FLIGHT' };
    }
    return { category: 'xxld', uom: 'FLIGHT' };
  }

  // 2. Wheelchair items
  if (
    /^(pu-)?wch[rcs](-s)?$/i.test(stripped) ||
    lower.includes('wheelchair') ||
    lower.includes('wheel chair') ||
    lower.endsWith('- wchc') ||
    lower.endsWith('- wchr') ||
    lower.endsWith('- wchs')
  ) {
    const category = lower.startsWith('non scheduled') ? 'non_scheduled' : 'scheduled';
    return { category, uom: 'EA' };
  }

  // 3. Cleaning items
  if (
    lower.includes('cabin cleaning') ||
    lower.includes('deep cleaning') ||
    lower.includes('night halt cleaning') ||
    strippedUpper === 'DC-NB' ||
    strippedUpper === 'EC - NB' ||
    strippedUpper === 'EC-NB' ||
    strippedUpper === 'NHC - NB' ||
    strippedUpper === 'NHC-NB'
  ) {
    return { category: 'cleaning', uom: 'FLIGHT' };
  }

  // 4. Manpower items
  if (
    lower.startsWith('raf - manpower') ||
    lower.startsWith('scheduled - manpower') ||
    lower.startsWith('non scheduled - manpower') ||
    lower === 'manpower' ||
    lower.startsWith('manpower -')
  ) {
    const isBlueCollar =
      strippedUpper === 'BC' ||
      strippedUpper === 'BLUE COLLAR' ||
      /\bblue collar\b/i.test(raw);
    return { category: 'manpower', uom: isBlueCollar ? 'Per Hour' : 'HR' };
  }

  // 5. Scheduled flights / basic handling
  if (
    lower.startsWith('scheduled flight') ||
    lower === 'trnd' ||
    lower === 'trns' ||
    lower === 'ptd'
  ) {
    return { category: 'scheduled', uom: 'FLIGHT' };
  }
  if (lower === 'pu' || lower === 'pus') {
    return { category: 'scheduled', uom: 'EA' };
  }

  // 6. Non-scheduled flights (unless carrying equipment name suffix like Non Scheduled Flight - MDL)
  if (lower.startsWith('non scheduled flight')) {
    if (
      strippedUpper === 'MDL' ||
      strippedUpper === 'C' ||
      strippedUpper === 'CK' ||
      strippedUpper === 'TOW'
    ) {
      // Treat as non-scheduled equipment below
    } else {
      return { category: 'non_scheduled', uom: 'FLIGHT' };
    }
  }

  // 7. Base Category
  let category:
    | 'scheduled'
    | 'non_scheduled'
    | 'raf'
    | 'xxld'
    | 'cleaning'
    | 'manpower'
    | 'equipment' = 'equipment';
  if (lower.startsWith('raf -')) {
    category = 'raf';
  } else if (lower.startsWith('non scheduled')) {
    category = 'non_scheduled';
  } else if (lower.startsWith('scheduled - equipment') || lower.startsWith('equipment -')) {
    category = 'equipment';
  }

  // 8. Specific Equipment UOM Resolution:
  // Ambulift / Ambulance
  if (/^AMB\b|^AMBULIFT|^PS-AMB/i.test(strippedUpper)) {
    return { category, uom: 'Per Usage' };
  }

  // Air Start Unit
  if (/^ASU|^PST-ASU/i.test(strippedUpper)) {
    return { category, uom: 'Per start' };
  }

  // Step ladders, Headset, Wing Walkers
  if (/^BFL|^PSL|^PU-PSL/i.test(strippedUpper)) {
    return { category, uom: 'Per Turnaround' };
  }
  if (strippedUpper === 'HS' || /^HEAD\s*SET/i.test(strippedUpper)) {
    return { category, uom: 'Per Turnaround' };
  }
  if (strippedUpper === 'WW' || /^WING\s*WALKER/i.test(strippedUpper)) {
    return { category, uom: 'Per turnaround' };
  }

  // Coaches, Buses, Tempo
  if (/^PAX\s*COACH|^PASSENGER|^CREW\s*COACH|^TEMPO|^PTRIP/i.test(strippedUpper)) {
    return { category, uom: 'Per Trip' };
  }

  // Tow Inter Stand (NB / WB)
  if (/^ISTNB|^ISTWB|^TOW-NB|^TOW-WB|^TOW\s*INTER/i.test(strippedUpper)) {
    return { category, uom: 'Per Tow' };
  }

  // Towbars, Aircraft Towing
  if (/^TOWBAR|^LONG\s*TOWBAR|^SHORT\s*TOWBAR|^TOW$|^PTOW/i.test(strippedUpper)) {
    return { category, uom: 'Per push/tow' };
  }

  // Pushback
  if (/^PBNB|^PBWB|^PUSH\s*BACK|^PP-PUSHBACK/i.test(strippedUpper)) {
    return { category, uom: 'Per service' };
  }

  // Toilet & Water services
  if (strippedUpper === 'TS' || /^TOILET|^PS-TS/i.test(strippedUpper)) {
    return { category, uom: 'Per service' };
  }
  if (strippedUpper === 'WC' || /^WATER|^PS-WS/i.test(strippedUpper)) {
    return { category, uom: 'Per service' };
  }

  // Fire Extinguisher, Chocks, Cargo kit
  if (strippedUpper === 'FE' || /^FIRE/i.test(strippedUpper) || strippedUpper === 'CK') {
    return { category, uom: 'EA' };
  }

  // Loaders, Tractors, GPU, ACU, Dollies, Vehicles, Belts, Trestles (Time-based equipment)
  if (
    /^GPU|^ACU|^LDL|^MDL|^UDL|^EBT|^DT|^BT|^PH-BC|^PH-GPU|^PH-ACU|^C$|^C1$|^CBM|^CD|^PD|^BMW|^MG|^RC|^TRE|^URB|^FORK|^MPSL/i.test(
      strippedUpper,
    )
  ) {
    return { category, uom: 'Per Hour' };
  }

  return { category, uom: 'Per Hour' };
}

/** ADS contract dropdown: hide these stripped equipment / service codes. */
const ADS_CATALOG_DROPPED_CODES = new Set(['c1', 'urb']);

/** Full catalog labels excluded from the ADS contract equipment dropdown. */
const ADS_CATALOG_DROPPED_LABELS = new Set([
  'cancel scheduled flight',
  'cancel scheduled - equipment - cabin cleaning',
]);

/**
 * ADS contract dropdown display names (after prefix strip).
 * Stored `serviceCode` values stay unchanged — only UI label changes.
 * Uses billing-trackable full forms; WC is Water Cart for equipment and
 * White Collar for manpower. BC is Baggage Cart for equipment and Blue Collar
 * for manpower.
 */
function adsCatalogDisplayName(rawLabel: string, stripped: string): string {
  const lower = String(rawLabel ?? '').trim().toLowerCase();
  const kind = lower.includes('manpower')
    ? 'manpower'
    : lower.includes('equipment')
      ? 'equipment'
      : 'auto';
  return toBillingTrackableFullName(stripped, kind) || stripped;
}

const CATALOG_PREFIX_RE =
  /^(cancel\s+)?((ads|raf)(\s*-\s*(equipment|manpower))?|non[\s-]*scheduled(\s*-\s*(equipment|manpower|flight)|\s+flight)?|scheduled(\s*-\s*(equipment|manpower)|\s+flight)?)\s*-\s*/i;

/** Strip Scheduled / RAF / Non-Scheduled / ADS wrappers. `RAF - Equipment - MDL` → `MDL`. */
export function stripCatalogServicePrefix(label: string): string {
  let value = String(label ?? '').trim();
  if (!value) return '';
  value = value.replace(
    /\s*\((ads|raf|equipment|manpower|scheduled|non[-\s]*scheduled)\)\s*$/i,
    '',
  );
  for (let i = 0; i < 3; i += 1) {
    const next = value.replace(CATALOG_PREFIX_RE, '').trim().replace(/^-\s*/, '');
    if (next === value) break;
    value = next;
  }
  return value.trim();
}

/**
 * Service catalog table display: drop Cancel/Scheduled/Non-Scheduled/RAF/ADS
 * wrappers, keep Equipment / Manpower / Flight + service name.
 * Stored `serviceCode` values stay unchanged — display only.
 *
 * `Non Scheduled - Equipment - ACU` → `Equipment - Air Conditioner Unit`
 * `Cancel Scheduled Flight` → `Flight`
 * `Manpower` → `Manpower`
 */
export function formatServiceCatalogDisplayCode(label: string): string {
  const raw = String(label ?? '').trim();
  if (!raw) return '';

  let value = raw;

  // "Cancel Scheduled Flight…" / "Non Scheduled Flight…" / "Scheduled Flight…"
  value = value.replace(
    /^(cancel\s+)?(non[\s-]*)?scheduled\s+flight\b/i,
    'Flight',
  );

  // "Cancel Scheduled - Equipment - …" / "RAF - Manpower - …" / "ADS - Equipment - …"
  value = value.replace(
    /^(cancel\s+)?(ads|raf|non[\s-]*scheduled|scheduled)\s*-\s*/i,
    '',
  );

  value = value.trim().replace(/^-\s*/, '');
  const typed = /^(equipment|manpower|flight)\s*-\s*(.+)$/i.exec(value);
  if (typed) {
    const prefix = typed[1];
    const rest = typed[2].trim();
    const kind =
      /^manpower$/i.test(prefix)
        ? 'manpower'
        : /^equipment$/i.test(prefix)
          ? 'equipment'
          : 'auto';
    const full = toBillingTrackableFullName(rest, kind) || rest;
    const prefixLabel =
      prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
    return `${prefixLabel} - ${full}`;
  }
  return value || raw;
}

/** Stable unique key for catalog UI dedupe (display code, case-insensitive). */
export function serviceCatalogDisplayUniqueKey(label: string): string {
  return formatServiceCatalogDisplayCode(label).trim().toLowerCase();
}

function catalogPrefixRank(serviceCode: string): number {
  const lower = String(serviceCode ?? '').trim().toLowerCase();
  if (lower.startsWith('cancel')) return 50;
  if (lower.startsWith('ads')) return 40;
  if (lower.startsWith('raf')) return 30;
  if (/^non[\s-]*scheduled/.test(lower)) return 20;
  if (lower.startsWith('scheduled')) return 10;
  return 0;
}

/**
 * One row per unique Equipment / Manpower / Flight display name.
 * Prefers active + Scheduled-prefixed codes as the edit/delete representative.
 * Empty leftover labels (`Non Scheduled - Equipment -`) are dropped.
 * Stored codes are not modified — callers still use full `serviceCode` for APIs.
 */
export function dedupeServiceCatalogItems<
  T extends { serviceCode?: string | null; active?: boolean | null },
>(items: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const item of items) {
    const raw = String(item.serviceCode ?? '').trim();
    if (!raw) continue;
    // Drop stub rows with no equipment/manpower/service name.
    if (!stripCatalogServicePrefix(raw)) continue;
    const key = serviceCatalogDisplayUniqueKey(raw);
    if (!key) continue;
    const existing = best.get(key);
    if (!existing) {
      best.set(key, item);
      continue;
    }
    const candidateActive = item.active !== false;
    const existingActive = existing.active !== false;
    if (candidateActive !== existingActive) {
      if (candidateActive) best.set(key, item);
      continue;
    }
    const candidateRank = catalogPrefixRank(raw);
    const existingRank = catalogPrefixRank(String(existing.serviceCode ?? ''));
    if (candidateRank < existingRank) {
      best.set(key, item);
      continue;
    }
    if (
      candidateRank === existingRank &&
      raw.localeCompare(String(existing.serviceCode ?? ''), undefined, {
        sensitivity: 'base',
      }) < 0
    ) {
      best.set(key, item);
    }
  }

  return [...best.values()].sort((a, b) =>
    formatServiceCatalogDisplayCode(String(a.serviceCode ?? '')).localeCompare(
      formatServiceCatalogDisplayCode(String(b.serviceCode ?? '')),
      undefined,
      { sensitivity: 'base' },
    ),
  );
}

/**
 * All stored service codes that share the same catalog display name
 * (Scheduled / RAF / Non-Scheduled twins of one equipment).
 */
export function serviceCatalogCodesForDisplayKey(
  items: ReadonlyArray<{ serviceCode?: string | null }>,
  displayKeyOrCode: string,
): string[] {
  const key = serviceCatalogDisplayUniqueKey(displayKeyOrCode);
  if (!key) return [];
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const raw = String(item.serviceCode ?? '').trim();
    if (!raw || seen.has(raw)) continue;
    if (serviceCatalogDisplayUniqueKey(raw) !== key) continue;
    seen.add(raw);
    codes.push(raw);
  }
  return codes;
}

export function isDroppedAdsCatalogService(label: string): boolean {
  const raw = String(label ?? '').trim();
  if (!raw) return true;
  if (ADS_CATALOG_DROPPED_LABELS.has(raw.toLowerCase())) return true;
  const name = stripCatalogServicePrefix(raw);
  if (!name) return true;
  return ADS_CATALOG_DROPPED_CODES.has(name.trim().toLowerCase());
}

/** Unique dropdown name for ADS contract equipment / manpower / services. */
export function adsCatalogServiceDisplayName(label: string): string {
  if (isDroppedAdsCatalogService(label)) return '';
  const raw = String(label ?? '').trim();
  const stripped = stripCatalogServicePrefix(raw);
  if (!stripped) return '';
  const display = adsCatalogDisplayName(raw, stripped);
  if (/^cancel\s+/i.test(raw) && !/^cancel\s+/i.test(stripped)) {
    return `Cancel ${display}`;
  }
  return display;
}

export type AdsContractCatalogOption = {
  value: string;
  label: string;
  uom: string;
  category: ReturnType<typeof inferCatalogMeta>['category'];
};

type AdsCatalogSource = {
  serviceCode?: string | null;
  uom?: string | null;
  category?: string | null;
};

/**
 * ADS airline-contract dropdown: strip Scheduled/RAF/NS prefixes, drop c1,
 * keep one row per unique equipment / manpower / service name.
 */
export function buildAdsContractCatalogOptions(
  sources: AdsCatalogSource[],
): AdsContractCatalogOption[] {
  const unique = new Map<string, AdsContractCatalogOption>();
  for (const source of sources) {
    const raw = String(source.serviceCode ?? '').trim();
    if (!raw || isDroppedAdsCatalogService(raw)) continue;
    const display = adsCatalogServiceDisplayName(raw);
    if (!display) continue;
    const key = display.toLowerCase();
    const meta = inferCatalogMeta(raw);
    const existing = unique.get(key);
    const incomingUom = String(source.uom ?? '').trim();
    if (existing) {
      const incomingRank = catalogPrefixRank(raw);
      const existingRank = catalogPrefixRank(existing.value);
      if (incomingRank < existingRank) {
        unique.set(key, {
          value: raw,
          label: display,
          uom: String(existing.uom ?? '').trim() || incomingUom || meta.uom,
          category: meta.category,
        });
      } else if (!String(existing.uom ?? '').trim() && incomingUom) {
        existing.uom = incomingUom;
      }
      continue;
    }
    unique.set(key, {
      value: raw,
      label: display,
      uom: String(source.uom ?? '').trim() || meta.uom,
      category: meta.category,
    });
  }

  return [...unique.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
}

/** Map a stored (possibly prefixed) rule code onto a unique dropdown value. */
export function resolveAdsContractCatalogValue(
  ruleServiceCode: string | undefined | null,
  options: AdsContractCatalogOption[],
): string {
  const raw = String(ruleServiceCode ?? '').trim();
  if (!raw) return '';
  const exact = options.find((option) => option.value === raw);
  if (exact) return exact.value;
  const display = adsCatalogServiceDisplayName(raw);
  if (!display) return '';
  const match = options.find(
    (option) => option.label.toLowerCase() === display.toLowerCase(),
  );
  return match?.value ?? '';
}
