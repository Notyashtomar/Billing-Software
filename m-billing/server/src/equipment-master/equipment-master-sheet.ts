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
