'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import {
  buildManualOverridesAfterToggle,
  getEffectiveRulePassed,
  isManualOverride,
  newCustomCheckId,
} from '@/lib/billing-shared/preparation-checklist';
import type { ValidationGuidanceContext } from '@/lib/billing-shared/preparation-validation-guidance';
import type {
  BillingPreparationRecord,
  PreparationCustomCheck,
} from '@/lib/billing-shared/types';
import { PreparationValidationBreakdown } from './PreparationValidationBreakdown';
import { Checkbox } from '@/components/ui/checkbox';

type Props = {
  record: BillingPreparationRecord;
  api: BillingApi;
  context?: ValidationGuidanceContext;
  onUpdated?: (record: BillingPreparationRecord) => void;
};

function isCancelledPreparationRecord(record: BillingPreparationRecord): boolean {
  const snap = (record.operationalSnapshot ?? {}) as Record<string, unknown>;
  const byFlags =
    snap.isCancelled === true ||
    snap.cancelled === true ||
    snap.flightCancelled === true;
  const byValidation = record.validationResults.some(
    (result) => result.rule === 'not_cancelled' && !result.passed,
  );
  return byFlags || byValidation;
}

export function PreparationChecklist({
  record,
  api,
  context = {},
  onUpdated,
}: Props) {
  const readOnly = ['invoiced', 'rejected'].includes(record.status);

  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>(
    record.manualOverrides ?? {},
  );
  const [customChecks, setCustomChecks] = useState<PreparationCustomCheck[]>(
    record.customChecks ?? [],
  );
  const [cancellationBillable, setCancellationBillable] = useState(
    Boolean(record.cancellationBilling?.enabled),
  );
  const [cancellationPercent, setCancellationPercent] = useState(
    Number(record.cancellationBilling?.bhsChargeablePercent ?? 0),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customNote, setCustomNote] = useState('');

  useEffect(() => {
    setManualOverrides(record.manualOverrides ?? {});
    setCustomChecks(record.customChecks ?? []);
    setCancellationBillable(Boolean(record.cancellationBilling?.enabled));
    setCancellationPercent(Number(record.cancellationBilling?.bhsChargeablePercent ?? 0));
  }, [record._id, record.manualOverrides, record.customChecks, record.cancellationBilling]);

  const workingRecord: BillingPreparationRecord = {
    ...record,
    manualOverrides,
    customChecks,
  };

  const persist = useCallback(
    async (
      nextOverrides: Record<string, boolean>,
      nextCustom: PreparationCustomCheck[],
      cancellation?: { enabled: boolean; bhsChargeablePercent?: number },
    ) => {
      setSaving(true);
      setError('');
      try {
        const res = await api.updatePreparationChecklist(String(record._id), {
          manualOverrides: nextOverrides,
          customChecks: nextCustom,
          cancellationBilling: cancellation,
        });
        const updated = (res as { data?: BillingPreparationRecord }).data;
        if (updated) {
          setManualOverrides(updated.manualOverrides ?? nextOverrides);
          setCustomChecks(updated.customChecks ?? nextCustom);
          setCancellationBillable(Boolean(updated.cancellationBilling?.enabled));
          setCancellationPercent(Number(updated.cancellationBilling?.bhsChargeablePercent ?? 0));
          onUpdated?.(updated);
        } else {
          setManualOverrides(nextOverrides);
          setCustomChecks(nextCustom);
          if (cancellation) {
            setCancellationBillable(cancellation.enabled);
            setCancellationPercent(Number(cancellation.bhsChargeablePercent ?? 0));
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save checklist');
      } finally {
        setSaving(false);
      }
    },
    [api, onUpdated, record._id],
  );

  const toggleSystem = async (rule: string, checked: boolean) => {
    if (readOnly || saving) return;
    const systemResult = record.validationResults.find((r) => r.rule === rule);
    const systemPassed = Boolean(systemResult?.passed);
    const nextOverrides = buildManualOverridesAfterToggle(
      manualOverrides,
      rule,
      checked,
      systemPassed,
    );
    setManualOverrides(nextOverrides);
    await persist(nextOverrides, customChecks, {
      enabled: cancellationBillable,
      bhsChargeablePercent: cancellationPercent,
    });
  };

  const toggleCustom = async (id: string, checked: boolean) => {
    if (readOnly || saving) return;
    const nextCustom = customChecks.map((c) =>
      c.id === id ? { ...c, passed: checked } : c,
    );
    setCustomChecks(nextCustom);
    await persist(manualOverrides, nextCustom, {
      enabled: cancellationBillable,
      bhsChargeablePercent: cancellationPercent,
    });
  };

  const addCustom = async () => {
    const label = customLabel.trim();
    if (!label || readOnly || saving) return;
    const nextCustom: PreparationCustomCheck[] = [
      ...customChecks,
      {
        id: newCustomCheckId(),
        label,
        message: customNote.trim() || undefined,
        passed: false,
      },
    ];
    setCustomChecks(nextCustom);
    setCustomLabel('');
    setCustomNote('');
    await persist(manualOverrides, nextCustom, {
      enabled: cancellationBillable,
      bhsChargeablePercent: cancellationPercent,
    });
  };

  const removeCustom = async (id: string) => {
    if (readOnly || saving) return;
    const nextCustom = customChecks.filter((c) => c.id !== id);
    setCustomChecks(nextCustom);
    await persist(manualOverrides, nextCustom, {
      enabled: cancellationBillable,
      bhsChargeablePercent: cancellationPercent,
    });
  };

  const saveCancellationBilling = async (enabled: boolean, percent: number) => {
    if (readOnly || saving) return;
    const bounded = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    if (enabled && bounded <= 0) {
      setError('Enter BHS chargeable % greater than 0 to bill a cancelled flight.');
      return;
    }
    setCancellationBillable(enabled);
    setCancellationPercent(bounded);
    const notCancelledSystemPassed = Boolean(
      record.validationResults.find((result) => result.rule === 'not_cancelled')?.passed,
    );
    const nextOverrides = buildManualOverridesAfterToggle(
      manualOverrides,
      'not_cancelled',
      enabled,
      notCancelledSystemPassed,
    );
    setManualOverrides(nextOverrides);
    await persist(nextOverrides, customChecks, {
      enabled,
      bhsChargeablePercent: enabled ? bounded : 0,
    });
  };

  const isCancelledFlight = isCancelledPreparationRecord(record);

  return (
    <div className="space-y-4">
      {saving ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Saving…
        </span>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {record.validationResults.length === 0 && customChecks.length === 0 ? (
        <p className="text-sm text-gray-500">No validation checks to display.</p>
      ) : (
        <>
          {isCancelledFlight ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Cancelled flight billing
              </p>
              <p className="mt-1 text-xs text-amber-900">
                Enable to bill this cancelled movement and apply chargeable BHS package percent.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                  <Checkbox
                    id={`cancelled-billable-${record._id}`}
                    checked={cancellationBillable}
                    disabled={readOnly || saving}
                    onCheckedChange={(value) =>
                      void saveCancellationBilling(value === true, cancellationPercent)
                    }
                  />
                  Billable
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
                  BHS chargeable %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    disabled={readOnly || saving || !cancellationBillable}
                    value={cancellationPercent}
                    onChange={(e) => setCancellationPercent(Number(e.target.value))}
                    onBlur={() =>
                      void saveCancellationBilling(cancellationBillable, cancellationPercent)
                    }
                    className="w-36 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            </div>
          ) : null}

          <PreparationValidationBreakdown
            results={record.validationResults}
            context={context}
            recordId={String(record._id)}
            readOnly={readOnly}
            saving={saving}
            getConfirmed={(rule) => getEffectiveRulePassed(workingRecord, rule)}
            isOverridden={(rule) => isManualOverride(workingRecord, rule)}
            onToggle={(rule, checked) => void toggleSystem(rule, checked)}
          />

          {customChecks.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {customChecks.map((check) => (
                <li
                  key={check.id}
                  className={`flex gap-3 rounded-lg border px-3 py-2 ${
                    check.passed
                      ? 'border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)]'
                      : 'border-[color:var(--billing-border-strong)] bg-[color:var(--billing-secondary-soft)]'
                  }`}
                >
                  <Checkbox
                    id={`custom-${check.id}`}
                    checked={check.passed}
                    disabled={readOnly || saving}
                    onCheckedChange={(value) => void toggleCustom(check.id, value === true)}
                    className="mt-0.5"
                    aria-label={`Confirm ${check.label}`}
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`custom-${check.id}`}
                      className="cursor-pointer font-medium text-gray-900"
                    >
                      {check.label}
                    </label>
                    <span className="ml-2 rounded bg-[color:var(--billing-secondary-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--billing-secondary-hover)]">
                      Custom
                    </span>
                    {check.message ? (
                      <p className="mt-0.5 text-gray-600">{check.message}</p>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => void removeCustom(check.id)}
                      disabled={saving}
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label={`Remove custom check ${check.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {!readOnly ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Add custom condition
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor={`custom-label-${record._id}`} className="sr-only">
                Condition label
              </label>
              <input
                id={`custom-label-${record._id}`}
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. Delay clause verified with ops"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[color:var(--billing-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--billing-accent)]"
                disabled={saving}
              />
            </div>
            <div className="flex-1">
              <label htmlFor={`custom-note-${record._id}`} className="sr-only">
                Optional note
              </label>
              <input
                id={`custom-note-${record._id}`}
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Optional note"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[color:var(--billing-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--billing-accent)]"
                disabled={saving}
              />
            </div>
            <button
              type="button"
              onClick={() => void addCustom()}
              disabled={!customLabel.trim() || saving}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[color:var(--billing-accent)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--billing-accent-strong)] hover:bg-[color:var(--billing-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
