import type { ScheduledAirlineEquipmentTemplateRow } from '@/lib/api';

type EquipmentApiRow = {
  gsename?: string;
  gsecode?: string;
  equipmentname?: string;
  equipmentcode?: string;
};

/**
 * GSE name / serial options for Equipment & Manpower Add modal.
 * Always merges Schedule Equipment rule names; when `includeAllInventory` is true
 * (ad-hoc add), also lists full Advance / operational equipment inventory.
 */
export function buildScheduleAirlineGseDropdownOptions(
  rules: ScheduledAirlineEquipmentTemplateRow[],
  equipmentListFromApi: EquipmentApiRow[],
  includeAllInventory = false,
): { names: string[]; serialsByName: Map<string, string[]> } {
  const serialsByName = new Map<string, string[]>();
  const names = new Set<string>();

  for (const rule of rules) {
    const name = String(rule.equipmentName ?? '').trim();
    const code = String(rule.equipmentCode ?? '').trim().toUpperCase();
    if (!name) continue;
    names.add(name);

    const serials: string[] = [];
    for (const row of equipmentListFromApi) {
      const apiName = String(
        row.gsename ?? row.equipmentname ?? '',
      ).trim();
      const apiCode = String(
        row.gsecode ?? row.equipmentcode ?? '',
      ).trim();
      const apiNameNorm = apiName.toLowerCase();
      const nameNorm = name.toLowerCase();
      const codeNorm = apiCode.toUpperCase();
      if (
        apiNameNorm === nameNorm ||
        codeNorm === code ||
        (code && apiCode.toUpperCase().includes(code)) ||
        (code && codeNorm.includes(code))
      ) {
        if (apiCode) serials.push(apiCode);
      }
    }
    if (serials.length === 0 && code) {
      serials.push(code);
    }
    const existing = serialsByName.get(name) ?? [];
    serialsByName.set(
      name,
      [...new Set([...existing, ...serials])].sort((a, b) => a.localeCompare(b)),
    );
  }

  if (includeAllInventory) {
    for (const row of equipmentListFromApi) {
      const name = String(row.gsename ?? row.equipmentname ?? '').trim();
      const code = String(row.gsecode ?? row.equipmentcode ?? '').trim();
      if (!name) continue;
      names.add(name);
      const existing = serialsByName.get(name) ?? [];
      serialsByName.set(
        name,
        [...new Set([...existing, code].filter(Boolean))].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
    }
  }

  return {
    names: Array.from(names).sort((a, b) => a.localeCompare(b)),
    serialsByName,
  };
}
