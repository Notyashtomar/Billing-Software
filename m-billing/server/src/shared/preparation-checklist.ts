import type { ValidationResult } from './types';

type ChecklistRecord = {
  validationResults: ValidationResult[];
  manualOverrides?: Record<string, boolean>;
  customChecks?: Array<{ id: string; passed: boolean }>;
};

export function getEffectiveRulePassed(record: ChecklistRecord, rule: string): boolean {
  const overrides = record.manualOverrides ?? {};
  if (Object.prototype.hasOwnProperty.call(overrides, rule)) {
    return Boolean(overrides[rule]);
  }
  const found = record.validationResults.find((r) => r.rule === rule);
  return Boolean(found?.passed);
}

export function allChecklistConfirmed(record: ChecklistRecord): boolean {
  const systemOk = record.validationResults.every((r) =>
    getEffectiveRulePassed(record, r.rule),
  );
  const custom = record.customChecks ?? [];
  const customOk = custom.every((c) => c.passed);
  const total = record.validationResults.length + custom.length;
  return total > 0 && systemOk && customOk;
}
