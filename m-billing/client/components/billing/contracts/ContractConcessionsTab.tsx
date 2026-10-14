'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingContract } from '@/lib/billing-shared/types';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import {
  concessionRatesFromContract,
  emptyConcessionRatesForm,
  parseConcessionRatesForm,
  type ContractConcessionRatesForm,
} from '@/lib/billing-shared/contract-concessions';
import { ContractConcessionsFields } from './ContractConcessionsFields';

type Props = {
  api: BillingApi;
  contracts: BillingContract[];
  loadingContracts?: boolean;
  onSaved?: () => void;
};

export function ContractConcessionsTab({
  api,
  contracts,
  loadingContracts = false,
  onSaved,
}: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [values, setValues] = useState<ContractConcessionRatesForm>(emptyConcessionRatesForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selected = useMemo(
    () => contracts.find((c) => c._id === selectedId) ?? null,
    [contracts, selectedId],
  );

  const validityLabel = selected
    ? formatBillingDateRange(selected.priceValidFrom, selected.priceValidTo)
    : undefined;

  useEffect(() => {
    if (!selected) {
      setValues(emptyConcessionRatesForm());
      return;
    }
    setValues(concessionRatesFromContract(selected));
    setError('');
    setSuccess('');
  }, [selected]);

  const save = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateContract(selected._id, {
        concessionRates: parseConcessionRatesForm(values),
      });
      setSuccess(`Concessions saved for ${selected.contractNumber}.`);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save concessions');
    } finally {
      setSaving(false);
    }
  }, [api, selected, values, onSaved]);

  if (loadingContracts) {
    return <p className="text-sm text-gray-500">Loading contracts…</p>;
  }

  if (contracts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
        Create a contract first, then configure scenario concessions here.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Contract
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select contract…</option>
            {contracts.map((c) => (
              <option key={c._id} value={c._id}>
                {c.contractNumber} — {c.customerCode} (
                {formatBillingDateRange(c.priceValidFrom, c.priceValidTo)})
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <div className="flex flex-col justify-end text-sm text-gray-600">
            <p>
              <span className="font-medium text-gray-800">Customer:</span> {selected.customerCode}
            </p>
            <p>
              <span className="font-medium text-gray-800">Status:</span> {selected.status}
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-3 py-2 text-sm text-[color:var(--billing-heading)]">
          {success}
        </div>
      ) : null}

      {selected ? (
        <>
          <ContractConcessionsFields
            values={values}
            onChange={setValues}
            disabled={saving}
            validityLabel={validityLabel}
          />
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save concessions'}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500">Select a contract to edit concession rates.</p>
      )}
    </div>
  );
}
