/**
 * One active contract per station × airline × scope.
 *
 * Scope = the flight sectors the contract covers (Dom / Int / DomCargo /
 * IntCargo) plus whether it is a cargo contract (contract number ends in
 * CARGO). Two active contracts whose validity windows overlap and that share
 * at least one sector would make the invoice engine pick one by "latest wins",
 * so the save is rejected and the user is told which contract to end first.
 */

export type ContractScopeRow = {
  _id?: unknown;
  contractNumber?: string | null;
  customerCode?: string | null;
  stationCode?: string | null;
  status?: string | null;
  category?: string | null;
  categories?: string[] | null;
  priceValidFrom?: Date | string | null;
  priceValidTo?: Date | string | null;
};

const SECTORS = ['Dom', 'Int', 'DomCargo', 'IntCargo'] as const;
type Sector = (typeof SECTORS)[number];

function toTime(value: Date | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function contractSectorsOf(contract: ContractScopeRow): Set<Sector> {
  const allowed = new Set<string>(SECTORS);
  const stored = (contract.categories ?? []).filter((value) => allowed.has(value)) as Sector[];
  if (stored.length > 0) return new Set(stored);
  const legacy = String(contract.category ?? '').trim();
  if (legacy === 'Dom' || legacy === 'Int') return new Set<Sector>([legacy]);
  if (legacy === 'Both' || legacy.toLowerCase() === 'both') return new Set<Sector>(['Dom', 'Int']);
  // Missing sector means the engine treats it as covering everything.
  return new Set<Sector>(SECTORS);
}

export function isCargoContractNumber(contractNumber: string | null | undefined): boolean {
  return /CARGO$/i.test(String(contractNumber ?? '').trim());
}

export function contractValidityOverlaps(a: ContractScopeRow, b: ContractScopeRow): boolean {
  const aFrom = toTime(a.priceValidFrom) ?? Number.NEGATIVE_INFINITY;
  const aTo = toTime(a.priceValidTo) ?? Number.POSITIVE_INFINITY;
  const bFrom = toTime(b.priceValidFrom) ?? Number.NEGATIVE_INFINITY;
  const bTo = toTime(b.priceValidTo) ?? Number.POSITIVE_INFINITY;
  return aFrom <= bTo && bFrom <= aTo;
}

export function contractScopesCollide(a: ContractScopeRow, b: ContractScopeRow): boolean {
  if (isCargoContractNumber(a.contractNumber) !== isCargoContractNumber(b.contractNumber)) {
    return false;
  }
  const sectorsA = contractSectorsOf(a);
  for (const sector of contractSectorsOf(b)) {
    if (sectorsA.has(sector)) return true;
  }
  return false;
}

/**
 * Active contracts (other than the candidate itself) for the same station and
 * airline whose validity and scope overlap the candidate.
 */
export function findOverlappingContracts<T extends ContractScopeRow>(
  candidate: ContractScopeRow,
  others: T[],
): T[] {
  const station = String(candidate.stationCode ?? '').trim().toUpperCase();
  const customer = String(candidate.customerCode ?? '').trim().toUpperCase();
  const selfId = String(candidate._id ?? '');
  return others.filter((other) => {
    if (selfId && String(other._id ?? '') === selfId) return false;
    if (String(other.status ?? '').toLowerCase() !== 'active') return false;
    if (String(other.stationCode ?? '').trim().toUpperCase() !== station) return false;
    if (String(other.customerCode ?? '').trim().toUpperCase() !== customer) return false;
    if (!contractValidityOverlaps(candidate, other)) return false;
    return contractScopesCollide(candidate, other);
  });
}

export function describeContractOverlap(
  candidate: ContractScopeRow,
  overlaps: ContractScopeRow[],
): string {
  const numbers = overlaps
    .map((row) => String(row.contractNumber ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const sectors = [...contractSectorsOf(candidate)].join('/');
  return (
    `${String(candidate.customerCode ?? '').toUpperCase()} already has an active ${sectors} contract ` +
    `for these dates (${numbers}). End that contract first (set its Valid To before this one starts, ` +
    `or mark it expired) so each flight has exactly one contract.`
  );
}
