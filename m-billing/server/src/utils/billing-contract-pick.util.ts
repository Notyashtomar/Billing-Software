/** Minimal contract shape for “latest wins” selection when several are active on one date. */
export type ContractPickRow = {
  _id?: unknown;
  priceValidFrom: Date | string;
  updatedAt?: Date | string;
  createdAt?: Date | string;
};

/**
 * When multiple active contracts overlap a billing date for the same airline,
 * prefer the newest: latest validity start, then last updated, then _id.
 */
export function compareContractsLatestFirst(
  a: ContractPickRow,
  b: ContractPickRow,
): number {
  const fromDiff =
    new Date(b.priceValidFrom).getTime() - new Date(a.priceValidFrom).getTime();
  if (fromDiff !== 0) return fromDiff;

  const updatedDiff =
    new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
  if (updatedDiff !== 0) return updatedDiff;

  const createdDiff =
    new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
  if (createdDiff !== 0) return createdDiff;

  return String(b._id ?? '').localeCompare(String(a._id ?? ''));
}

export function pickLatestContract<T extends ContractPickRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0] ?? null;
  return [...rows].sort(compareContractsLatestFirst)[0] ?? null;
}

export function isCargoFlightHint(categoryOfFlight?: string, aircraftType?: string): boolean {
  const cat = String(categoryOfFlight ?? '');
  const ac = String(aircraftType ?? '');
  return /cargo|freight/i.test(cat) || /\bF\b|FREIGHTER/i.test(ac);
}

export function pickPreferredHandlingContract<
  T extends ContractPickRow & { contractNumber?: string },
>(rows: T[], preferCargo: boolean): T | null {
  if (rows.length === 0) return null;
  const cargo = rows.filter((row) => /CARGO$/i.test(String(row.contractNumber ?? '')));
  const sgha = rows.filter((row) => !/CARGO$/i.test(String(row.contractNumber ?? '')));
  const pool = preferCargo ? (cargo.length ? cargo : rows) : sgha.length ? sgha : rows;
  return pickLatestContract(pool);
}
