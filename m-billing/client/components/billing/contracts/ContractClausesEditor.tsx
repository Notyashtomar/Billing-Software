'use client';

import { Plus, Trash2 } from 'lucide-react';
import { TextArea } from '../settings/SettingsFormFields';
import { billingUi } from '../billingUi';
import type { BillingContractClause } from '@/lib/billing-shared/types';
import {
  CONTRACT_CLAUSE_APPLIES_TO_OPTIONS,
  CONTRACT_CLAUSE_TYPE_OPTIONS,
  clauseTypeLabel,
} from '@/lib/billing-shared/contract-clauses';
import { cn } from '@/lib/utils';

const selectClass = billingUi.select;

type Props = {
  clauses: BillingContractClause[];
  onChange: (clauses: BillingContractClause[]) => void;
  disabled?: boolean;
};

function newClause(): BillingContractClause {
  return {
    clauseType: 'custom',
    label: '',
    body: '',
    appliesTo: ['all'],
  };
}

function toggleAppliesTo(current: string[], value: string): string[] {
  if (value === 'all') return ['all'];
  const withoutAll = current.filter((v) => v !== 'all');
  if (withoutAll.includes(value)) {
    const next = withoutAll.filter((v) => v !== value);
    return next.length > 0 ? next : ['all'];
  }
  return [...withoutAll, value];
}

export function ContractClausesEditor({ clauses, onChange, disabled }: Props) {
  const rows = clauses;

  const updateRow = (index: number, patch: Partial<BillingContractClause>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const onTypeChange = (index: number, clauseType: string) => {
    const option = CONTRACT_CLAUSE_TYPE_OPTIONS.find((o) => o.value === clauseType);
    updateRow(index, {
      clauseType,
      label: clauseType === 'custom' ? rows[index]?.label ?? '' : option?.label,
    });
  };

  const addClause = () => {
    onChange([...rows, newClause()]);
  };

  const removeClause = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--billing-heading)]">
            Conditions &amp; clauses
          </p>
          <p className="text-xs text-[color:var(--billing-text-muted)]">
            Contract terms scoped to equipment, CAP, scheduled flights, and other billing
            categories.
          </p>
        </div>
        <button
          type="button"
          onClick={addClause}
          disabled={disabled}
          aria-label="Add clause"
          className={billingUi.btnOutline}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] px-3 py-5 text-sm text-[color:var(--billing-text-muted)]">
            No clauses yet. Use Add to include contract conditions.
          </p>
        ) : null}
        {rows.map((clause, index) => {
          const rowId = `clause-${index}`;
          const typeLabel =
            clause.clauseType === 'custom'
              ? clause.label?.trim() || 'Custom clause'
              : clauseTypeLabel(clause.clauseType);

          return (
            <div
              key={rowId}
              className="rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-3 shadow-[var(--billing-shadow-sm)] sm:p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[color:var(--billing-heading)]">
                  Clause {index + 1}
                  <span className="font-normal text-[color:var(--billing-text-muted)]">
                    {' '}
                    — {typeLabel}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => removeClause(index)}
                  disabled={disabled}
                  aria-label={`Remove clause ${index + 1}`}
                  className={billingUi.iconDanger}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${rowId}-type`} className={billingUi.label}>
                    Clause type
                  </label>
                  <select
                    id={`${rowId}-type`}
                    value={clause.clauseType}
                    onChange={(e) => onTypeChange(index, e.target.value)}
                    disabled={disabled}
                    className={selectClass}
                  >
                    {CONTRACT_CLAUSE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {clause.clauseType === 'custom' ? (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${rowId}-label`} className={billingUi.label}>
                      Custom label
                    </label>
                    <input
                      id={`${rowId}-label`}
                      type="text"
                      value={clause.label ?? ''}
                      onChange={(e) => updateRow(index, { label: e.target.value })}
                      disabled={disabled}
                      placeholder="e.g. Night parking waiver"
                      className={selectClass}
                    />
                  </div>
                ) : null}
              </div>

              <fieldset className="mt-3">
                <legend className={cn(billingUi.label, 'mb-2')}>Applies to</legend>
                <div className="flex flex-wrap gap-2">
                  {CONTRACT_CLAUSE_APPLIES_TO_OPTIONS.map((opt) => {
                    const checked =
                      clause.appliesTo.includes('all') || clause.appliesTo.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                          checked
                            ? 'border-[color:var(--billing-primary)] bg-[color:var(--billing-primary-soft)] text-[color:var(--billing-primary)]'
                            : 'border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] text-[color:var(--billing-text-muted)] hover:border-[color:var(--billing-secondary)]',
                          disabled && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          disabled={disabled}
                          onChange={() =>
                            updateRow(index, {
                              appliesTo: toggleAppliesTo(clause.appliesTo, opt.value),
                            })
                          }
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${rowId}-percent`} className={billingUi.label}>
                    Percent
                  </label>
                  <input
                    id={`${rowId}-percent`}
                    type="number"
                    min={0}
                    step="0.1"
                    value={clause.percent ?? ''}
                    onChange={(event) => {
                      const text = event.target.value;
                      updateRow(index, {
                        percent: text === '' ? undefined : Number(text),
                      });
                    }}
                    disabled={disabled}
                    placeholder="e.g. 4.5"
                    className={selectClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${rowId}-amount`} className={billingUi.label}>
                    Amount
                  </label>
                  <input
                    id={`${rowId}-amount`}
                    type="number"
                    min={0}
                    step="1"
                    value={clause.amount ?? ''}
                    onChange={(event) => {
                      const text = event.target.value;
                      updateRow(index, {
                        amount: text === '' ? undefined : Number(text),
                      });
                    }}
                    disabled={disabled}
                    placeholder="Optional"
                    className={selectClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${rowId}-from`} className={billingUi.label}>
                    Valid from
                  </label>
                  <input
                    id={`${rowId}-from`}
                    type="date"
                    value={clause.validFrom ?? ''}
                    onChange={(event) => updateRow(index, { validFrom: event.target.value || undefined })}
                    disabled={disabled}
                    className={selectClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${rowId}-to`} className={billingUi.label}>
                    Valid to
                  </label>
                  <input
                    id={`${rowId}-to`}
                    type="date"
                    value={clause.validTo ?? ''}
                    onChange={(event) => updateRow(index, { validTo: event.target.value || undefined })}
                    disabled={disabled}
                    className={selectClass}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-[color:var(--billing-text-muted)]">
                {clause.clauseType === 'cpi'
                  ? 'Annual rate increase: from Valid from, the annex price compounds by this percent once a year until Valid to. Leave Valid to empty to keep going. Amount, if set, is added to each unit after the percent.'
                  : 'Percent, amount, and dates are saved with this clause. Ferry, delay, and ground-time charges still come from the concessions on this contract.'}
              </p>

              <div className="mt-3 flex flex-col gap-1">
                <label htmlFor={`${rowId}-body`} className={billingUi.label}>
                  Clause text
                </label>
                <TextArea
                  id={`${rowId}-body`}
                  value={clause.body}
                  onChange={(v) => updateRow(index, { body: v })}
                  rows={3}
                  placeholder="Enter the contractual wording for this condition…"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
