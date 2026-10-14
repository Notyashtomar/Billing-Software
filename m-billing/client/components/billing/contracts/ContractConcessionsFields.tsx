'use client';

import { FieldGroup } from '../settings/SettingsFormFields';
import {
  CONTRACT_FEE_CONCESSION_SCENARIOS,
  CONTRACT_CONCESSION_SCENARIO_HINTS,
  CONTRACT_CONCESSION_SCENARIO_LABELS,
  type ContractConcessionScenario,
} from '@/lib/billing-shared/enums';
import type { ContractConcessionRatesForm } from '@/lib/billing-shared/contract-concessions';

type Props = {
  values: ContractConcessionRatesForm;
  onChange: (values: ContractConcessionRatesForm) => void;
  disabled?: boolean;
  validityLabel?: string;
  /** Defaults to fee scenarios (Concessions page). */
  scenarios?: readonly ContractConcessionScenario[];
};

export function ContractConcessionsFields({
  values,
  onChange,
  disabled = false,
  validityLabel,
  scenarios = CONTRACT_FEE_CONCESSION_SCENARIOS,
}: Props) {
  const setScenario = (scenario: ContractConcessionScenario, value: string) => {
    onChange({ ...values, [scenario]: value });
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-gray-600">
        Enter concession as a <span className="font-medium">percentage (%)</span> of the total
        billing amount on the final invoice (after Total Amount). Fill only scenarios that apply
        {validityLabel ? (
          <>
            {' '}
            for <span className="font-medium">{validityLabel}</span>
          </>
        ) : (
          <> for the contract validity period</>
        )}
        . Conditional charges (diverted / RTR package %) are set on the Contracts page separately.
        CGST and SGST are each 9% of (total billing amount + concession).
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((scenario) => (
          <FieldGroup
            key={scenario}
            label={`${CONTRACT_CONCESSION_SCENARIO_LABELS[scenario]} (%)`}
            htmlFor={`concession-${scenario}`}
          >
            <div className="relative">
              <input
                id={`concession-${scenario}`}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={values[scenario]}
                onChange={(e) => setScenario(scenario, e.target.value)}
                disabled={disabled}
                placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm text-gray-900 shadow-sm focus:border-[color:var(--billing-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--billing-accent)] disabled:opacity-50"
              />
              <span
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500"
                aria-hidden
              >
                %
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {CONTRACT_CONCESSION_SCENARIO_HINTS[scenario]}
            </p>
          </FieldGroup>
        ))}
      </div>
    </div>
  );
}
