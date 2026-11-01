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

function dayBefore(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - 1);
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
      percent,
      amount: Number(clause.amount) > 0 ? Number(clause.amount) : 0,
      validFrom,
      ...(validTo ? { validTo } : {}),
    };
  }
  return null;
}

/** How many yearly steps were already written into a saved price (CYI tag). */
export function bakedAnnualSteps(remarks: string | undefined, percent: number, validFrom: string): number {
  const match = String(remarks ?? '').match(/CYI:[^:\s]+:(\d{4}-\d{2}-\d{2}):([\d.]+)%x(\d+)/);
  if (!match) return 0;
  if (match[1] !== validFrom) return 0;
  if (Number(match[2]) !== percent) return 0;
  const steps = Number(match[3]);
  return Number.isFinite(steps) && steps > 0 ? steps : 0;
}

export function priceWithAnnualIncrease(
  storedPrice: number,
  clauses: AnnualClause[] | undefined,
  billingDate: Date | string,
  scope: AnnualPriceScope,
  opts?: { basePrice?: number | null; bakedSteps?: number },
): number {
  if (!(storedPrice > 0)) return storedPrice;
  const metric = pickAnnualIncrease(clauses, scope);
  if (!metric) return storedPrice;
  const billing = ymd(billingDate);
  const steps = annualSteps(metric.validFrom, metric.validTo, billing);
  const baked = opts?.bakedSteps ?? 0;
  let price = storedPrice;
  if (opts?.basePrice != null && opts.basePrice > 0 && steps >= 1) {
    price = roundRupee(opts.basePrice * (1 + metric.percent / 100) ** steps);
  } else if (baked > 0 && steps !== baked) {
    price = roundRupee(storedPrice * (1 + metric.percent / 100) ** (steps - baked));
  } else if (baked === 0 && steps >= 1) {
    price = roundRupee(storedPrice * (1 + metric.percent / 100) ** steps);
  }
  if (steps >= 1 && metric.amount > 0) price = roundRupee(price + metric.amount);
  return price;
}

export type BasePriceRow = {
  aircraftType?: string;
  category?: string;
  price?: number | null;
  validFrom?: Date | string;
  validTo?: Date | string;
  remarks?: string | null;
};

/** Annex price: the card still in force the day before the increase starts. */
export function basePriceBeforeIncrease(
  rows: BasePriceRow[],
  selected: { aircraftType?: string; category?: string } | null,
  validFrom: string,
): number | null {
  if (!selected || !validFrom) return null;
  const on = dayBefore(validFrom);
  const aircraft = String(selected.aircraftType ?? '').trim().toUpperCase();
  const category = String(selected.category ?? '').trim().toUpperCase();
  const hits = rows.filter((row) => {
    if (!(Number(row.price) > 0)) return false;
    if (aircraft && String(row.aircraftType ?? '').trim().toUpperCase() !== aircraft) return false;
    if (category && String(row.category ?? '').trim().toUpperCase() !== category) return false;
    const from = ymd(row.validFrom);
    const to = ymd(row.validTo);
    return Boolean(from && to && from <= on && to >= on);
  });
  if (hits.length === 0) return null;
  hits.sort((a, b) => ymd(b.validFrom).localeCompare(ymd(a.validFrom)));
  return Number(hits[0].price);
}
