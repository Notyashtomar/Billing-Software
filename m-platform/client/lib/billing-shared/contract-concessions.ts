import type {
  BillingContract,
  BillingContractConcessionRates,
  BillingContractConditionalCharges,
} from './types';
import {
  CONTRACT_CONDITIONAL_CHARGE_SCENARIOS,
  CONTRACT_CONCESSION_SCENARIO_LABELS,
  CONTRACT_FEE_CONCESSION_SCENARIOS,
  emptyContractConcessionRates,
  type ContractConcessionScenario,
} from './enums';

export type ContractConcessionRatesForm = Record<ContractConcessionScenario, string>;

export function emptyConcessionRatesForm(): ContractConcessionRatesForm {
  return emptyContractConcessionRates();
}

export function concessionRatesFromContract(
  record?: BillingContract | null,
): ContractConcessionRatesForm {
  const form = emptyConcessionRatesForm();
  if (!record) return form;

  const legacy =
    record.royaltyAtGross != null && Number.isFinite(record.royaltyAtGross)
      ? String(record.royaltyAtGross)
      : '';
  const rates = record.concessionRates;

  for (const scenario of CONTRACT_FEE_CONCESSION_SCENARIOS) {
    const value = rates?.[scenario];
    if (value != null && Number.isFinite(value)) {
      form[scenario] = String(value);
    } else if (legacy && scenario === 'int') {
      form[scenario] = legacy;
    }
  }

  return form;
}

/** Load Contracts-page conditional charges (legacy fallback for non-diverted terms only). */
export function conditionalChargesFromContract(
  record?: BillingContract | null,
): ContractConcessionRatesForm {
  const form = emptyConcessionRatesForm();
  if (!record) return form;

  const charges = record.conditionalCharges;
  const legacyRates = record.concessionRates;
  for (const scenario of CONTRACT_CONDITIONAL_CHARGE_SCENARIOS) {
    const fromNew = charges?.[scenario as keyof BillingContractConditionalCharges];
    if (fromNew != null && Number.isFinite(fromNew)) {
      form[scenario] = String(fromNew);
      continue;
    }
    // Do not fall back diverted* — those collide with Concessions-page Div Dom/Int fees.
    if (
      scenario === 'returnToRamp' ||
      scenario === 'cancellationWithinHoursPercent' ||
      scenario === 'technicalHandlingChargesPercent' ||
      scenario === 'standbyChargesPercent'
    ) {
      const fromLegacy = legacyRates?.[scenario];
      if (fromLegacy != null && Number.isFinite(fromLegacy)) {
        form[scenario] = String(fromLegacy);
      }
    }
  }
  return form;
}

export function parseConcessionRatesForm(
  form: ContractConcessionRatesForm,
): BillingContractConcessionRates | undefined {
  const out: BillingContractConcessionRates = {};
  for (const scenario of CONTRACT_FEE_CONCESSION_SCENARIOS) {
    const trimmed = form[scenario].trim();
    if (!trimmed) continue;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      out[scenario] = n;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** PATCH body for Concessions page — always sends concessionRates object so clears persist. */
export function buildConcessionPatchBody(params: {
  values: ContractConcessionRatesForm;
  ceilingInr: string;
  ceilingUsd: string;
}): Record<string, unknown> {
  const rates = parseConcessionRatesForm(params.values) ?? {};
  const hasInt = rates.int != null && Number.isFinite(rates.int);
  return {
    concessionRates: rates,
    ...(hasInt ? { royaltyAtGross: rates.int } : { royaltyAtGross: 0 }),
    ceilingRatePerFlightINR: params.ceilingInr.trim() ? Number(params.ceilingInr) : null,
    ceilingRatePerFlightUSD: params.ceilingUsd.trim() ? Number(params.ceilingUsd) : null,
  };
}

/** Remove scenario percents, legacy royalty, and ceiling rates for a contract. */
export function clearAllConcessionsPatchBody(): Record<string, unknown> {
  return {
    concessionRates: {},
    royaltyAtGross: 0,
    ceilingRatePerFlightINR: null,
    ceilingRatePerFlightUSD: null,
  };
}

export function contractHasAnyConcessionData(
  record: Pick<
    BillingContract,
    'concessionRates' | 'royaltyAtGross' | 'ceilingRatePerFlightINR' | 'ceilingRatePerFlightUSD'
  >,
): boolean {
  if (record.royaltyAtGross != null && Number(record.royaltyAtGross) > 0) return true;
  const inr = Number(record.ceilingRatePerFlightINR);
  const usd = Number(record.ceilingRatePerFlightUSD);
  if ((Number.isFinite(inr) && inr > 0) || (Number.isFinite(usd) && usd > 0)) return true;
  for (const scenario of CONTRACT_FEE_CONCESSION_SCENARIOS) {
    const value = record.concessionRates?.[scenario];
    if (value != null && Number.isFinite(value) && value > 0) return true;
  }
  return false;
}

export function parseConditionalChargesForm(
  form: ContractConcessionRatesForm,
): BillingContractConditionalCharges | undefined {
  const out: BillingContractConditionalCharges = {};
  for (const scenario of CONTRACT_CONDITIONAL_CHARGE_SCENARIOS) {
    const trimmed = form[scenario].trim();
    if (!trimmed) continue;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      out[scenario as keyof BillingContractConditionalCharges] = n;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolveConcessionPercent(
  record: BillingContract,
  key: keyof BillingContractConcessionRates,
): number | null {
  const value = record.concessionRates?.[key];
  if (value != null && Number.isFinite(value)) return value;
  if (key === 'int' && record.royaltyAtGross != null && Number.isFinite(record.royaltyAtGross)) {
    return record.royaltyAtGross;
  }
  return null;
}

function resolveConditionalChargePercent(
  record: BillingContract,
  key: keyof BillingContractConditionalCharges,
): number | null {
  const value = record.conditionalCharges?.[key];
  if (value != null && Number.isFinite(value)) return value;
  if (
    key === 'returnToRamp' ||
    key === 'cancellationWithinHoursPercent' ||
    key === 'technicalHandlingChargesPercent' ||
    key === 'standbyChargesPercent'
  ) {
    const legacy = record.concessionRates?.[key];
    if (legacy != null && Number.isFinite(legacy)) return legacy;
  }
  return null;
}

export function formatConcessionRateCell(
  record: BillingContract,
  key: keyof BillingContractConcessionRates,
): string {
  const value = resolveConcessionPercent(record, key);
  return value != null && value > 0 ? `${value}%` : '—';
}

/** Contracts table — conditional charge columns (diverted / RTR / cancel). */
export function formatConditionalChargeCell(
  record: BillingContract,
  key: keyof BillingContractConditionalCharges,
): string {
  const value = resolveConditionalChargePercent(record, key);
  return value != null && value > 0 ? `${value}%` : '—';
}

const CHARGE_FIELD_IDS: Partial<Record<ContractConcessionScenario, string>> = {
  int: 'contract-charge-int',
  dom: 'contract-charge-dom',
  divertedDom: 'divertedDomPercent',
  divertedInt: 'divertedIntPercent',
  returnToRamp: 'returnToRampPercent',
};

/** Input or section id for a charge percent inside the contract dialog. */
export function contractChargeFieldId(key: string): string {
  return CHARGE_FIELD_IDS[key as ContractConcessionScenario] ?? key;
}

export type ContractChargePercent = {
  key: string;
  label: string;
  percent: number;
  fieldId: string;
};

/** Every saved charge percent on a contract, in display order. */
export function listContractChargePercents(
  record: BillingContract | null | undefined,
): ContractChargePercent[] {
  if (!record) return [];
  const cards: ContractChargePercent[] = [];
  for (const key of ['int', 'dom'] as const) {
    const percent = resolveConcessionPercent(record, key);
    if (percent == null || !Number.isFinite(percent)) continue;
    cards.push({
      key,
      label: CONTRACT_CONCESSION_SCENARIO_LABELS[key],
      percent,
      fieldId: contractChargeFieldId(key),
    });
  }
  for (const key of CONTRACT_CONDITIONAL_CHARGE_SCENARIOS) {
    const percent = resolveConditionalChargePercent(record, key);
    if (percent == null || !Number.isFinite(percent)) continue;
    cards.push({
      key,
      label: CONTRACT_CONCESSION_SCENARIO_LABELS[key],
      percent,
      fieldId: contractChargeFieldId(key),
    });
  }
  return cards;
}
