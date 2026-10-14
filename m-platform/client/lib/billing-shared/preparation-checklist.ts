import type {
  BillingPreparationRecord,
  PreparationCustomCheck,
} from './types';

export function getEffectiveRulePassed(
  record: Pick<BillingPreparationRecord, 'validationResults' | 'manualOverrides'>,
  rule: string,
): boolean {
  const overrides = record.manualOverrides ?? {};
  if (Object.prototype.hasOwnProperty.call(overrides, rule)) {
    return Boolean(overrides[rule]);
  }
  const found = record.validationResults.find((r) => r.rule === rule);
  return Boolean(found?.passed);
}

export function isManualOverride(
  record: Pick<BillingPreparationRecord, 'manualOverrides'>,
  rule: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record.manualOverrides ?? {}, rule);
}

export function getChecklistSummary(
  record: Pick<
    BillingPreparationRecord,
    'validationResults' | 'manualOverrides' | 'customChecks'
  >,
) {
  const systemTotal = record.validationResults.length;
  const customTotal = (record.customChecks ?? []).length;
  const total = systemTotal + customTotal;

  const systemConfirmed = record.validationResults.filter((r) =>
    getEffectiveRulePassed(record, r.rule),
  ).length;
  const customConfirmed = (record.customChecks ?? []).filter((c) => c.passed).length;
  const confirmed = systemConfirmed + customConfirmed;

  return {
    confirmed,
    total,
    allConfirmed: total > 0 && confirmed === total,
  };
}

export function allChecklistConfirmed(
  record: Pick<
    BillingPreparationRecord,
    'validationResults' | 'manualOverrides' | 'customChecks'
  >,
): boolean {
  return getChecklistSummary(record).allConfirmed;
}

export function buildManualOverridesAfterToggle(
  current: Record<string, boolean> | undefined,
  rule: string,
  checked: boolean,
  systemPassed: boolean,
): Record<string, boolean> {
  const next = { ...(current ?? {}) };
  if (checked === systemPassed) {
    delete next[rule];
  } else {
    next[rule] = checked;
  }
  return next;
}

export function newCustomCheckId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `custom_${crypto.randomUUID()}`;
  }
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type { PreparationCustomCheck };
