export type EquipmentMasterUom = {
  uom: string;
  abbreviation: string;
};

export type EquipmentMasterSeedRow = {
  sortIndex: number;
  itemNo: string;
  description: string;
  unitType: string;
  uoms: EquipmentMasterUom[];
};

function cell(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

/** Read the Equipment Master sheet. Header is skipped. Extra UOM pairs are kept. */
export function equipmentMasterRowsFromSheet(matrix: unknown[][]): EquipmentMasterSeedRow[] {
  const rows: EquipmentMasterSeedRow[] = [];
  for (const raw of matrix) {
    if (!Array.isArray(raw)) continue;
    const itemNo = cell(raw[0]);
    const description = cell(raw[1]);
    const unitType = cell(raw[2]);
    if (/^no\.?$/i.test(itemNo) && /description/i.test(description)) continue;
    if (!itemNo && !description && !unitType) continue;

    const uoms: EquipmentMasterUom[] = [];
    for (let index = 3; index < raw.length; index += 2) {
      const uom = cell(raw[index]);
      const abbreviation = cell(raw[index + 1]);
      if (!uom && !abbreviation) continue;
      uoms.push({ uom, abbreviation });
    }

    rows.push({
      sortIndex: rows.length,
      itemNo,
      description,
      unitType,
      uoms,
    });
  }
  return rows;
}

export function cleanEquipmentMasterUoms(value: unknown): EquipmentMasterUom[] {
  if (!Array.isArray(value)) return [];
  const uoms: EquipmentMasterUom[] = [];
  for (const item of value) {
    const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const uom = cell(source.uom);
    const abbreviation = cell(source.abbreviation);
    if (!uom && !abbreviation) continue;
    uoms.push({ uom, abbreviation });
  }
  return uoms;
}

export const EQUIPMENT_MASTER_REPLACE_COLUMNS = [
  'itemNo',
  'description',
  'unitType',
  'uom',
  'abbreviation',
] as const;

export type EquipmentMasterReplaceColumn = (typeof EQUIPMENT_MASTER_REPLACE_COLUMNS)[number];

export function isEquipmentMasterReplaceColumn(value: unknown): value is EquipmentMasterReplaceColumn {
  return (
    typeof value === 'string' &&
    (EQUIPMENT_MASTER_REPLACE_COLUMNS as readonly string[]).includes(value)
  );
}

/** Rename a UOM on one catalog row and drop a duplicate if the new name already exists. */
export function replaceEquipmentMasterUomValue(
  uoms: EquipmentMasterUom[] | null | undefined,
  fromUom: string,
  toUom: string,
): { uoms: EquipmentMasterUom[]; changed: boolean } {
  const from = cell(fromUom);
  const to = cell(toUom);
  if (!from || !to || from === to) {
    return { uoms: Array.isArray(uoms) ? uoms.map((pair) => ({ ...pair })) : [], changed: false };
  }
  const next: EquipmentMasterUom[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const pair of uoms ?? []) {
    const current = cell(pair.uom);
    const uom = current === from ? to : current;
    if (current === from) changed = true;
    const abbreviation = cell(pair.abbreviation);
    if (!uom && !abbreviation) continue;
    const key = uom.toLowerCase();
    if (uom && seen.has(key)) continue;
    if (uom) seen.add(key);
    next.push({ uom, abbreviation });
  }
  return { uoms: next, changed };
}

/** Rename an abbreviation on one catalog row. Matching UOM pairs stay distinct. */
export function replaceEquipmentMasterAbbreviationValue(
  uoms: EquipmentMasterUom[] | null | undefined,
  fromRaw: string,
  toRaw: string,
): { uoms: EquipmentMasterUom[]; changed: boolean } {
  const from = cell(fromRaw);
  const to = cell(toRaw);
  if (!from || !to || from === to) {
    return { uoms: Array.isArray(uoms) ? uoms.map((pair) => ({ ...pair })) : [], changed: false };
  }
  let changed = false;
  const next: EquipmentMasterUom[] = [];
  for (const pair of uoms ?? []) {
    const uom = cell(pair.uom);
    const current = cell(pair.abbreviation);
    const abbreviation = current === from ? to : current;
    if (current === from) changed = true;
    if (!uom && !abbreviation) continue;
    next.push({ uom, abbreviation });
  }
  return { uoms: next, changed };
}
