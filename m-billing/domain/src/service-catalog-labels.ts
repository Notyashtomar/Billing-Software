/**
 * Service codes mirrored from FRIS EXPORT_LOG_TYPE_LABELS.
 * Source: client/components/fris/others/exported-data-log-type-options.ts
 * BC audit: docs/invoicing/audit/BC_SCREEN_INVENTORY.md §A2
 */
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
    lower.includes('exterior cleaning') ||
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
    return { category: 'manpower', uom: 'HR' };
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
