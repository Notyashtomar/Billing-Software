/**
 * CPI / annual-increase clauses store a percent and a start date.
 * The engine compounds that percent on the annex (pre-increase) price.
 * Ferry, delay, and ground-time percents stay on conditional charges.
 */

export type AnnualClause = {
  clauseType?: string;
  label?: string;
  appliesTo?: string[];
  percent?: number;
  amount?: number;
  validFrom?: string;
  validTo?: string;
};

export type AnnualPriceScope = 'BHS' | 'ADS';

type Metric = {
  label: string;
  percent: number;
  amount: number;
  validFrom: string;
  validTo?: string;
};

function ymd(value: Date | string | undefined): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? '';
}

function addYears(iso: string, years: number): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function roundRupee(amount: number): number {
  return Math.round(amount);
}

export function annualSteps(validFrom: string, validTo: string | undefined, billingYmd: string): number {
  if (!validFrom || !billingYmd || billingYmd < validFrom) return 0;
  if (validTo && billingYmd > validTo) return 0;
  let steps = 0;
  let cursor = validFrom;
  while (cursor <= billingYmd && (!validTo || cursor <= validTo)) {
    steps += 1;
    cursor = addYears(cursor, 1);
    if (steps > 30) break;
  }
  return steps;
}

function appliesToScope(clause: AnnualClause, scope: AnnualPriceScope): boolean {
  const targets = (clause.appliesTo ?? []).map((value) => value.trim());
  if (targets.length === 0 || targets.includes('all')) return true;
  if (scope === 'BHS') return targets.includes('BHS') || targets.includes('scheduled');
  return targets.includes('ADS') || targets.includes('equipment');
}

function isAnnualClause(clause: AnnualClause): boolean {
  const type = String(clause.clauseType ?? '').trim().toLowerCase();
  const label = String(clause.label ?? '').trim().toLowerCase();
  return type === 'cpi' || label === 'current-year rates';
}

export function pickAnnualIncrease(clauses: AnnualClause[] | undefined, scope: AnnualPriceScope): Metric | null {
  for (const clause of clauses ?? []) {
    if (!isAnnualClause(clause) || !appliesToScope(clause, scope)) continue;
    const percent = Number(clause.percent);
    const validFrom = ymd(clause.validFrom);
    if (!(percent > 0) || !validFrom) continue;
    const validTo = ymd(clause.validTo);
    return {
      label: String(clause.label ?? '').trim() || 'Current-year rates',
      percent,
      amount: Number(clause.amount) > 0 ? Number(clause.amount) : 0,
      validFrom,
      ...(validTo ? { validTo } : {}),
    };
  }
  return null;
}

/**
 * Yearly increase already written into a saved price.
 * Stored as a real field on the card / rule; the `CYI:` remark tag is the
 * legacy encoding and is only read when the field is missing.
 */
export type AppliedAnnualIncrease = {
  contractNumber?: string | null;
  /** First day of the increase window the saved price belongs to. */
  validFrom: string;
  percent: number;
  steps: number;
};

export const ANNUAL_INCREASE_REMARK_TAG = /CYI:([^:\s]*):(\d{4}-\d{2}-\d{2}):([\d.]+)%x(\d+)/;

/** Parse the legacy `CYI:<contract>:<ymd>:<pct>%x<steps>` tag from a remark. */
export function parseAnnualIncreaseRemark(remarks: string | null | undefined): AppliedAnnualIncrease | null {
  const match = String(remarks ?? '').match(ANNUAL_INCREASE_REMARK_TAG);
  if (!match) return null;
  const steps = Number(match[4]);
  const percent = Number(match[3]);
  if (!Number.isFinite(steps) || steps <= 0 || !Number.isFinite(percent)) return null;
  return {
    contractNumber: match[1] || null,
    validFrom: match[2],
    percent,
    steps,
  };
}

function normalizeAppliedIncrease(value: unknown): AppliedAnnualIncrease | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const validFrom = ymd(row.validFrom as string | Date | undefined);
  const percent = Number(row.percent);
  const steps = Number(row.steps);
  if (!validFrom || !Number.isFinite(percent) || !Number.isFinite(steps) || steps <= 0) return null;
  return {
    contractNumber: row.contractNumber == null ? null : String(row.contractNumber),
    validFrom,
    percent,
    steps,
  };
}

/** Applied increase from the structured field first, then the legacy remark tag. */
export function readAppliedAnnualIncrease(
  row: { annualIncreaseApplied?: unknown; remarks?: string | null } | null | undefined,
): AppliedAnnualIncrease | null {
  if (!row) return null;
  return normalizeAppliedIncrease(row.annualIncreaseApplied) ?? parseAnnualIncreaseRemark(row.remarks);
}

/** How many yearly steps were already written into a saved price (field or CYI tag). */
export function bakedAnnualSteps(
  source: string | { annualIncreaseApplied?: unknown; remarks?: string | null } | null | undefined,
  percent: number,
  validFrom: string,
): number {
  const applied =
    typeof source === 'string' || source == null
      ? parseAnnualIncreaseRemark(source ?? undefined)
      : readAppliedAnnualIncrease(source);
  if (!applied) return 0;
  if (applied.validFrom !== validFrom) return 0;
  if (applied.percent !== percent) return 0;
  return applied.steps > 0 ? applied.steps : 0;
}

/**
 * A rate card's from-date is the first day of the price shown on that card.
 * The yearly increase starts on the card's next anniversary, and not before
 * the clause date. A card from 1 Jan 2026 therefore bills its listed price
 * through 2026 and increases from 1 Jan 2027.
 */
export function increaseStartForRateCard(
  clauseValidFrom: string,
  cardValidFrom?: Date | string | null,
): string {
  const card = ymd(cardValidFrom ?? undefined);
  if (!card || !clauseValidFrom) return clauseValidFrom;
  const anniversary = addYears(card, 1);
  return anniversary > clauseValidFrom ? anniversary : clauseValidFrom;
}

export function priceWithAnnualIncrease(
  storedPrice: number,
  clauses: AnnualClause[] | undefined,
  billingDate: Date | string,
  scope: AnnualPriceScope,
  opts?: { basePrice?: number | null; bakedSteps?: number; cardValidFrom?: Date | string | null },
): number {
  if (!(storedPrice > 0)) return storedPrice;
  const metric = pickAnnualIncrease(clauses, scope);
  if (!metric) return storedPrice;
  const billing = ymd(billingDate);
  const start = increaseStartForRateCard(metric.validFrom, opts?.cardValidFrom);
  const steps = annualSteps(start, metric.validTo, billing);
  if (steps <= 0) return storedPrice;
  const delayedByCard = start !== metric.validFrom;
  const baked = delayedByCard ? 0 : (opts?.bakedSteps ?? 0);
  const basePrice = delayedByCard ? null : opts?.basePrice;
  let price = storedPrice;
  if (basePrice != null && basePrice > 0 && steps >= 1) {
    price = roundRupee(basePrice * (1 + metric.percent / 100) ** steps);
  } else if (baked > 0 && steps !== baked) {
    price = roundRupee(storedPrice * (1 + metric.percent / 100) ** (steps - baked));
  } else if (baked === 0 && steps >= 1) {
    price = roundRupee(storedPrice * (1 + metric.percent / 100) ** steps);
  }
  if (steps >= 1 && metric.amount > 0) price = roundRupee(price + metric.amount);
  return price;
}

/** Clause and arithmetic behind `priceWithAnnualIncrease`, for the invoice rate path. */
export type AnnualIncreaseExplanation = {
  label: string;
  percent: number;
  validFrom: string;
  /** First date this card actually increases. May be later than the clause date. */
  increaseStarts: string;
  steps: number;
  listedPrice: number;
  priceAfter: number;
};

export function explainAnnualIncrease(
  storedPrice: number,
  clauses: AnnualClause[] | undefined,
  billingDate: Date | string,
  scope: AnnualPriceScope,
  opts?: { bakedSteps?: number; cardValidFrom?: Date | string | null },
): AnnualIncreaseExplanation | null {
  if (!(storedPrice > 0)) return null;
  const metric = pickAnnualIncrease(clauses, scope);
  if (!metric) return null;
  const billing = ymd(billingDate);
  const increaseStarts = increaseStartForRateCard(metric.validFrom, opts?.cardValidFrom);
  return {
    label: metric.label,
    percent: metric.percent,
    validFrom: metric.validFrom,
    increaseStarts,
    steps: annualSteps(increaseStarts, metric.validTo, billing),
    listedPrice: storedPrice,
    priceAfter: priceWithAnnualIncrease(storedPrice, clauses, billingDate, scope, opts),
  };
}

