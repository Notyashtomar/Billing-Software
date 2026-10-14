/** Delhi airlines whose contract is International-only. */

export function isDelhiStation(stationCode: string | undefined | null): boolean {
  const station = String(stationCode ?? '').trim().toUpperCase();
  return station === 'DEL' || station === 'DELHI';
}

export type PriceCardCategoryRow = {
  id: string;
  handlingType: string;
  customerCode: string;
  aircraftType: string;
  category: string;
};

/**
 * International-only airlines keep one International row per aircraft.
 * A Domestic/Turnaround row becomes International unless that aircraft
 * already has an International row, in which case the extra row is retired.
 */
export function planDelhiInternationalCategoryUpdates(
  rows: PriceCardCategoryRow[],
): { updateIds: string[]; retireIds: string[] } {
  const updateIds: string[] = [];
  const retireIds: string[] = [];
  const internationalKeys = new Set<string>();

  for (const row of rows) {
    if (row.category === 'Int') {
      internationalKeys.add(rowKey(row));
    }
  }

  for (const row of rows) {
    if (row.category === 'Int') continue;
    const key = rowKey(row);
    if (internationalKeys.has(key)) {
      retireIds.push(row.id);
      continue;
    }
    updateIds.push(row.id);
    internationalKeys.add(key);
  }

  return { updateIds, retireIds };
}

function rowKey(row: PriceCardCategoryRow): string {
  return [
    row.handlingType.trim().toUpperCase(),
    row.customerCode.trim().toUpperCase(),
    row.aircraftType.trim().toUpperCase(),
  ].join('|');
}
