/** Contract clause rows — price-card lower-table rules scoped to billing categories. */

export const CONTRACT_CLAUSE_TYPES = [
  'xxln',
  'delay',
  'ferry',
  'technical_landing',
  'return_to_ramp',
  'equipment_standby',
  'disbursements',
  'cpi',
  'free_inclusions',
  'custom',
  'sgha',
] as const;

export type ContractClauseType = (typeof CONTRACT_CLAUSE_TYPES)[number];

export const CONTRACT_CLAUSE_APPLIES_TO = [
  'all',
  'scheduled',
  'equipment',
  'cap',
  'manpower',
  'cleaning',
  'raf',
  'maas',
  'non_scheduled',
  'delay',
  'xxld',
  'cargo',
  'BHS',
  'ADS',
] as const;

export type ContractClauseAppliesTo = (typeof CONTRACT_CLAUSE_APPLIES_TO)[number];

export type BillingContractClause = {
  clauseType: string;
  label?: string;
  body: string;
  appliesTo: string[];
};

export function normalizeContractClauses(
  clauses: BillingContractClause[] | undefined,
  legacy?: { xxlnClause?: string; delayClause?: string },
): BillingContractClause[] {
  const rows = (clauses ?? [])
    .map((c) => ({
      clauseType: c.clauseType?.trim() || 'custom',
      label: c.label?.trim() || undefined,
      body: c.body?.trim() || '',
      appliesTo: Array.isArray(c.appliesTo)
        ? [...new Set(c.appliesTo.map((a) => a.trim()).filter(Boolean))]
        : [],
    }))
    .filter((c) => c.body.length > 0);

  if (rows.length > 0) return rows;

  const fromLegacy: BillingContractClause[] = [];
  if (legacy?.xxlnClause?.trim()) {
    fromLegacy.push({
      clauseType: 'xxln',
      label: 'XXLD / cancellation',
      body: legacy.xxlnClause.trim(),
      appliesTo: ['xxld', 'scheduled'],
    });
  }
  if (legacy?.delayClause?.trim()) {
    fromLegacy.push({
      clauseType: 'delay',
      label: 'Delay',
      body: legacy.delayClause.trim(),
      appliesTo: ['delay', 'scheduled'],
    });
  }
  return fromLegacy;
}

/** Keep legacy single-field columns in sync for older readers. */
export function legacyClauseFields(clauses: BillingContractClause[]): {
  xxlnClause?: string;
  delayClause?: string;
} {
  const xxln = clauses.find((c) => c.clauseType === 'xxln');
  const delay = clauses.find((c) => c.clauseType === 'delay');
  return {
    xxlnClause: xxln?.body || undefined,
    delayClause: delay?.body || undefined,
  };
}
