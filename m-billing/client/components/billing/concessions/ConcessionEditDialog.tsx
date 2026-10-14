'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContractConcessionsFields } from '../contracts/ContractConcessionsFields';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingContract } from '@/lib/billing-shared/types';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import {
  buildConcessionPatchBody,
  clearAllConcessionsPatchBody,
  concessionRatesFromContract,
  contractHasAnyConcessionData,
  emptyConcessionRatesForm,
  type ContractConcessionRatesForm,
} from '@/lib/billing-shared/contract-concessions';
import {
  EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT,
  contractHasSavedCeilingRate,
  isExclusiveBhsConcessionContract,
} from '@/lib/billing-shared/exclusive-bhs-concession';

type Props = {
  api: BillingApi;
  contract: BillingContract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (contract?: BillingContract) => void;
  /** Opened after the contract was switched to Exclusive BHS pricing. */
  setupExclusive?: boolean;
};

export function ConcessionEditDialog({
  api,
  contract,
  open,
  onOpenChange,
  onSaved,
  setupExclusive = false,
}: Props) {
  const [values, setValues] = useState<ContractConcessionRatesForm>(emptyConcessionRatesForm());
  const [ceilingInr, setCeilingInr] = useState('');
  const [ceilingUsd, setCeilingUsd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !contract) {
      setValues(emptyConcessionRatesForm());
      setCeilingInr('');
      setCeilingUsd('');
      setError('');
      return;
    }
    setValues(concessionRatesFromContract(contract));
    setCeilingInr(
      contract.ceilingRatePerFlightINR != null && contract.ceilingRatePerFlightINR > 0
        ? String(contract.ceilingRatePerFlightINR)
        : '',
    );
    setCeilingUsd(
      contract.ceilingRatePerFlightUSD != null && contract.ceilingRatePerFlightUSD > 0
        ? String(contract.ceilingRatePerFlightUSD)
        : '',
    );
    setError('');
  }, [contract, open]);

  const validityLabel = contract
    ? formatBillingDateRange(contract.priceValidFrom, contract.priceValidTo)
    : undefined;

  const hasAnyConcession =
    (contract && contractHasAnyConcessionData(contract)) ||
    Object.values(values).some((value) => value.trim() !== '') ||
    Boolean(ceilingInr.trim() || ceilingUsd.trim());

  const ceilingError = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) return 'Enter a valid amount.';
    const amount = Number(trimmed);
    if (!Number.isFinite(amount) || amount < 0) return 'Enter a valid amount.';
    return '';
  };
  const ceilingInrError = ceilingError(ceilingInr);
  const ceilingUsdError = ceilingError(ceilingUsd);
  const exclusiveBhs = isExclusiveBhsConcessionContract(contract);
  const ceilingMissing =
    exclusiveBhs && !contractHasSavedCeilingRate(contract) && !ceilingInr.trim() && !ceilingUsd.trim();
  const hasConcessionPercent = Object.values(values).some((value) => value.trim() !== '');
  const setupIncomplete =
    setupExclusive && (ceilingMissing || !hasConcessionPercent || Boolean(ceilingInrError || ceilingUsdError));

  const save = async () => {
    if (!contract || ceilingInrError || ceilingUsdError || setupIncomplete) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.updateContract(
        contract._id,
        buildConcessionPatchBody({ values, ceilingInr, ceilingUsd }),
      );
      const updated = (res as { data?: BillingContract }).data;
      onOpenChange(false);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save concessions');
    } finally {
      setSaving(false);
    }
  };

  const removeAll = async () => {
    if (!contract || saving) return;
    const confirmed = window.confirm(
      'Remove every concession percent on this contract? Invoices will not add a concession fee until new rates are saved.',
    );
    if (!confirmed) return;
    const previous = values;
    const cleared = emptyConcessionRatesForm();
    setValues(cleared);
    setSaving(true);
    setError('');
    try {
      const res = await api.updateContract(contract._id, clearAllConcessionsPatchBody());
      const updated = (res as { data?: BillingContract }).data;
      onOpenChange(false);
      onSaved(updated);
    } catch (err) {
      setValues(previous);
      setError(err instanceof Error ? err.message : 'Failed to remove concessions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {setupExclusive ? 'Add ceiling rate and concession' : 'Edit concessions'}
          </DialogTitle>
          <DialogDescription>
            {setupExclusive
              ? 'Exclusive pricing needs a concession percent and a ceiling rate per flight before invoices can compare them.'
              : contract
                ? `${contract.stationCode} · ${contract.contractNumber} · ${contract.customerCode}`
                : 'Configure scenario concession rates for this contract.'}
            {setupExclusive && contract
              ? ` ${contract.stationCode} · ${contract.contractNumber} · ${contract.customerCode}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {contract ? (
          <>
            <ContractConcessionsFields
              values={values}
              onChange={setValues}
              disabled={saving}
              validityLabel={validityLabel}
            />
            {exclusiveBhs ? (
              <div
                className={
                  ceilingMissing
                    ? 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950'
                    : 'rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700'
                }
                role={ceilingMissing ? 'alert' : undefined}
              >
                <p className="font-medium text-gray-900">Exclusive BHS pricing</p>
                <p className="mt-1">
                  Invoice concession is the higher of {EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT}% of
                  scheduled-flight charges or this ceiling rate multiplied by the number of flights.
                  Save the ceiling in the matching bill currency.
                </p>
              </div>
            ) : null}
            <fieldset className="grid gap-3 rounded-xl border border-gray-200 p-4" disabled={saving}>
              <legend className="px-1 text-sm font-semibold text-gray-900">Ceiling rate per flight</legend>
              <p className="text-xs text-gray-600">
                {exclusiveBhs
                  ? 'Required for Exclusive BHS airlines so the invoice can pick the higher concession.'
                  : 'Optional fixed charge per scheduled flight. Use the currency that matches the airline bill.'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  INR per flight
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ceilingInr}
                    onChange={(event) => setCeilingInr(event.target.value)}
                    placeholder="Optional"
                    aria-invalid={Boolean(ceilingInrError)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                  {ceilingInrError ? (
                    <span className="text-xs font-normal text-red-700">{ceilingInrError}</span>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  USD per flight
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ceilingUsd}
                    onChange={(event) => setCeilingUsd(event.target.value)}
                    placeholder="Optional"
                    aria-invalid={Boolean(ceilingUsdError)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                  {ceilingUsdError ? (
                    <span className="text-xs font-normal text-red-700">{ceilingUsdError}</span>
                  ) : null}
                </label>
              </div>
            </fieldset>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => void removeAll()}
                disabled={saving || !hasAnyConcession}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Remove all concessions
              </button>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || Boolean(ceilingInrError || ceilingUsdError) || setupIncomplete}
                  onClick={() => void save()}
                  className="rounded-lg bg-[#1C0770] px-4 py-2 text-sm font-medium text-white hover:bg-[#150558] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save concessions'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
