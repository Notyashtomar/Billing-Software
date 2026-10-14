import type { BillingContractClause } from './types';

export const CONTRACT_CLAUSE_TYPE_OPTIONS = [
  { value: 'ferry', label: 'Ferry flight' },
  { value: 'technical_landing', label: 'Technical landing' },
  { value: 'return_to_ramp', label: 'Return to ramp' },
  { value: 'equipment_standby', label: 'Stand-by equipment' },
  { value: 'disbursements', label: 'Disbursements' },
  { value: 'cpi', label: 'Annual rate increase (CPI)' },
  { value: 'free_inclusions', label: 'Free inclusions' },
  { value: 'custom', label: 'Other / custom' },
] as const;

export const CONTRACT_CLAUSE_APPLIES_TO_OPTIONS = [
  { value: 'all', label: 'All services' },
  { value: 'scheduled', label: 'Scheduled flights' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'cap', label: 'CAP' },
  { value: 'manpower', label: 'Manpower' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'raf', label: 'RAF' },
  { value: 'maas', label: 'MAAS' },
  { value: 'non_scheduled', label: 'Non-scheduled' },
  { value: 'delay', label: 'Delay charges' },
  { value: 'xxld', label: 'XXLD' },
  { value: 'cargo', label: 'Cargo / passenger' },
] as const;

const EXCLUDED_CONTRACT_CLAUSE_TYPES = new Set(['xxln', 'delay']);

export function defaultContractClauses(): BillingContractClause[] {
  return [];
}

export function clausesFromContract(record: {
  clauses?: BillingContractClause[];
  xxlnClause?: string;
  delayClause?: string;
}): BillingContractClause[] {
  if (record.clauses && record.clauses.length > 0) {
    return record.clauses
      .filter((c) => !EXCLUDED_CONTRACT_CLAUSE_TYPES.has(c.clauseType))
      .map((c) => ({
        clauseType: c.clauseType || 'custom',
        label: c.label,
        body: c.body ?? '',
        appliesTo: c.appliesTo?.length ? [...c.appliesTo] : ['all'],
      }));
  }
  return [];
}

export function clauseTypeLabel(clauseType: string): string {
  return (
    CONTRACT_CLAUSE_TYPE_OPTIONS.find((o) => o.value === clauseType)?.label ?? clauseType
  );
}

export function appliesToSummary(appliesTo: string[]): string {
  if (!appliesTo.length || appliesTo.includes('all')) return 'All services';
  return appliesTo
    .map((v) => CONTRACT_CLAUSE_APPLIES_TO_OPTIONS.find((o) => o.value === v)?.label ?? v)
    .join(', ');
}
