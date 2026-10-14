import { existsSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';

/**
 * Resolve Excel `Equipment No` short codes → full display names for NS GSE seed.
 * Sources (later wins only when prior is empty, except explicit corrections):
 *   1. `Equipment Master.xlsx` (`No.` → `Description`)
 *   2. `EQUIPMENT DETAILS MAA MARCH.xlsx` (`Equipment Name` → `Description`)
 *   3. Hard-coded fallbacks / corrections for remaining / wrong station rows
 */

/** Station/workbook quirks + gaps not covered by the two Excel masters. */
const NS_EQUIPMENT_NAME_FALLBACKS: Record<string, string> = {
  // Billing-trackable full forms for codes the Excel masters miss or mislabel.
  'ASU-NB': 'Air Start Unit - Narrow Body',
  'ASU-WB': 'Air Start Unit - Wide Body',
  'ACU-NB': 'Air Conditioner Unit - Narrow Body',
  'GPU-NB': 'Ground Power Unit - Narrow Body',
  'GPU-WB': 'Ground Power Unit - Wide Body',
  'GPU-140KV': 'Ground Power Unit - Narrow Body',
  WW: 'Wing Walking',
  'Sr. CSA': 'Senior Customer Service Agent',
  MPSL: 'Motorized Passenger Step Ladder',
  UDL: 'Upper Deck Loader',
  PD: 'Pallet Dollies',
  // c1 / URB stay as codes — billing cannot track those NS-only names.
};

function normKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function dataPath(...parts: string[]): string {
  // dist/ns-fhr-collection/services → server/data
  return join(__dirname, '..', '..', '..', 'data', ...parts);
}

function loadSheetMap(
  absolutePath: string,
  codeHeader: string,
  nameHeader: string,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(absolutePath)) return out;
  const wb = XLSX.readFile(absolutePath, { cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return out;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  for (const row of rows) {
    const code = String(row[codeHeader] ?? '').trim();
    const name = String(row[nameHeader] ?? '').trim();
    if (!code || !name) continue;
    out.set(normKey(code), name);
  }
  return out;
}

let cachedLookup: Map<string, string> | null = null;

/** Build abbr → full-name lookup (lazy, process-lifetime cache). */
export function loadNsEquipmentFullNameLookup(
  opts: {
    equipmentMasterPath?: string;
    maaMarchPath?: string;
  } = {},
): Map<string, string> {
  if (cachedLookup) return cachedLookup;

  const masterPath =
    opts.equipmentMasterPath ?? dataPath('Equipment Master.xlsx');
  const marchPath =
    opts.maaMarchPath ?? dataPath('EQUIPMENT DETAILS MAA MARCH.xlsx');

  const map = new Map<string, string>();

  // 1) Global master
  for (const [k, v] of loadSheetMap(masterPath, 'No.', 'Description')) {
    map.set(k, v);
  }

  // 2) MAA station list — fill gaps / prefer station wording when present
  for (const [k, v] of loadSheetMap(
    marchPath,
    'Equipment Name',
    'Description',
  )) {
    if (!v) continue;
    map.set(k, v);
  }

  // 3) Explicit corrections / remaining gaps (always win)
  for (const [code, name] of Object.entries(NS_EQUIPMENT_NAME_FALLBACKS)) {
    map.set(normKey(code), name);
  }

  cachedLookup = map;
  return map;
}

/** Resolve Excel equipment short code to a stored full name (falls back to the raw code). */
export function resolveNsEquipmentFullName(
  equipmentNo: string,
  lookup: Map<string, string> = loadNsEquipmentFullNameLookup(),
): string {
  const raw = String(equipmentNo ?? '').trim();
  if (!raw) return '';
  return lookup.get(normKey(raw)) ?? raw;
}

/** Clear cache (tests / CLI reload). */
export function clearNsEquipmentFullNameLookupCache(): void {
  cachedLookup = null;
}
