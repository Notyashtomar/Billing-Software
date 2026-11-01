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
  /** Yearly percent. CPI clauses compound this on the annex price. */
  percent?: number;
  /** Flat amount added after the percent, in the annex currency. */
  amount?: number;
  /** First day the metric applies (yyyy-mm-dd). */
  validFrom?: string;
  /** Last day the metric applies. Empty means it continues. */
  validTo?: string;
};

export function normalizeContractClauses(
  clauses: BillingContractClause[] | undefined,
  legacy?: { xxlnClause?: string; delayClause?: string },
): BillingContractClause[] {
  const rows = (clauses ?? [])
    .map((c) => {
      const percent = finiteMetric(c.percent);
      const amount = finiteMetric(c.amount);
      const validFrom = metricDate(c.validFrom);
      const validTo = metricDate(c.validTo);
      return {
        clauseType: c.clauseType?.trim() || 'custom',
        label: c.label?.trim() || undefined,
        body: c.body?.trim() || '',
        appliesTo: Array.isArray(c.appliesTo)
          ? [...new Set(c.appliesTo.map((a) => a.trim()).filter(Boolean))]
          : [],
        ...(percent != null ? { percent } : {}),
        ...(amount != null ? { amount } : {}),
        ...(validFrom ? { validFrom } : {}),
        ...(validTo ? { validTo } : {}),
      };
    })
    .filter((c) => c.body.length > 0 || c.percent != null || c.amount != null);

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

function finiteMetric(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function metricDate(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : undefined;
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
