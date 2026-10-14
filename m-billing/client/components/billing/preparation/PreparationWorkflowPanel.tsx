'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileStack, Loader2 } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import type { ValidationGuidanceContext } from '@/lib/billing-shared/preparation-validation-guidance';
import { preparationDisplayFlightNo } from '@/lib/billing-shared/preparation-flight-display';
import type { BillingPreparationRecord } from '@/lib/billing-shared/types';
import type { PreparationStatus } from '@/lib/billing-shared/enums';
import { PreparationChecklist } from './PreparationChecklist';
import { PreparationWorkflowRemarks } from './PreparationWorkflowRemarks';

const SEND_BACK_OPTIONS: Array<{
  value: 'eligible' | 'pending' | 'validation_error';
  label: string;
}> = [
  { value: 'eligible', label: 'Eligible — re-review from start' },
  { value: 'pending', label: 'Pending — contract / rate gap' },
  { value: 'validation_error', label: 'Validation errors — fix data' },
];

type Props = {
  record: BillingPreparationRecord;
  api: BillingApi;
  context: ValidationGuidanceContext;
  onUpdated?: (record: BillingPreparationRecord) => void;
  onActionComplete?: () => void;
  /** When viewing from an invoice draft, route remarks through the draft endpoint. */
  draftId?: string;
};

export function PreparationWorkflowPanel({
  record,
  api,
  context,
  onUpdated,
  onActionComplete,
  draftId,
}: Props) {
  const router = useRouter();
  const [sendBackTarget, setSendBackTarget] = useState<
    'eligible' | 'pending' | 'validation_error'
  >('validation_error');
  const [sendBackReason, setSendBackReason] = useState('');
  const [busy, setBusy] = useState<'back' | 'draft' | null>(null);
  const [error, setError] = useState('');

  const isReady = record.status === 'ready_for_invoice';

  const handleUpdated = (updated: BillingPreparationRecord) => {
    onUpdated?.(updated);
  };

  const sendBack = async () => {
    setBusy('back');
    setError('');
    try {
      const res = await api.sendBackPreparation(String(record._id), {
        targetStatus: sendBackTarget,
        reason: sendBackReason.trim() || undefined,
      });
      const updated = (res as { data?: BillingPreparationRecord }).data;
      if (updated) handleUpdated(updated);
      onActionComplete?.();
      router.replace(`/billing/preparation?tab=${sendBackTarget}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send back failed');
    } finally {
      setBusy(null);
    }
  };

  const createDraft = async () => {
    setBusy('draft');
    setError('');
    try {
      await api.createDraftsFromPreparation({
        billingPeriodStart: String(record.billingPeriodStart).slice(0, 10),
        billingPeriodEnd: String(record.billingPeriodEnd).slice(0, 10),
        customerCode: record.customerCode,
        groupByCustomer: true,
        mergeOpenDraft: false,
      });
      onActionComplete?.();
      router.push('/billing/invoice-drafts');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create draft failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isReady ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Maker controls
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Send this flight back to an earlier checkpoint or forward it into draft invoicing.
          </p>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2">
              <label
                htmlFor={`send-back-${record._id}`}
                className="block text-xs font-medium text-gray-700"
              >
                Send back to checkpoint
              </label>
              <select
                id={`send-back-${record._id}`}
                value={sendBackTarget}
                onChange={(e) =>
                  setSendBackTarget(e.target.value as typeof sendBackTarget)
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                disabled={busy !== null}
              >
                {SEND_BACK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                placeholder="Reason for send-back (optional)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                disabled={busy !== null}
              />
              <button
                type="button"
                onClick={() => void sendBack()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-600 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              >
                {busy === 'back' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                )}
                Send back
              </button>
            </div>
            <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <button
                type="button"
                onClick={() => void createDraft()}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
              >
                {busy === 'draft' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <FileStack className="h-4 w-4" aria-hidden />
                )}
                Create draft &amp; open invoicing
              </button>
              {record.invoiceDraftId ? (
                <Link
                  href={`/billing/invoices/${record.invoiceDraftId}`}
                  className="text-center text-xs font-medium text-[color:var(--billing-accent-strong)] underline"
                >
                  Open linked draft
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <PreparationChecklist
        record={record}
        api={api}
        context={context}
        onUpdated={handleUpdated}
      />

      <PreparationWorkflowRemarks
        record={record}
        api={api}
        draftId={draftId}
        onUpdated={handleUpdated}
        readOnly={record.status === 'rejected'}
      />
    </div>
  );
}

function pickSnapshotField(
  snap: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  if (!snap) return '';
  for (const key of keys) {
    const value = String(snap[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

export function buildPreparationContext(
  row: BillingPreparationRecord,
): ValidationGuidanceContext {
  const snap = row.operationalSnapshot;
  return {
    sourceType: row.sourceType,
    customerCode: row.customerCode,
    customerName: row.customerName,
    serviceCode: row.rateMatch?.serviceCode,
    serialNo: row.sourceRef.serialNo,
    flightNo: preparationDisplayFlightNo(row),
    billingPeriodStart: row.billingPeriodStart,
    billingPeriodEnd: row.billingPeriodEnd,
    stationCode: row.stationCode,
    atdDate:
      (snap?.atdDate as string | Date | null | undefined) ??
      (snap?.ATDDate as string | Date | null | undefined) ??
      (snap?.atd as string | Date | null | undefined),
    staDate: pickSnapshotField(snap, 'staDate', 'STADate', 'STA Date') || null,
    stdDate: pickSnapshotField(snap, 'stdDate', 'STDDate', 'STD Date') || null,
    ataDate: pickSnapshotField(snap, 'ataDate', 'ATADate', 'ATA Date') || null,
    aircraftType:
      pickSnapshotField(snap, 'aircraftType', 'TypeCraft', 'typeCraft', 'aircraft', 'ACType') ||
      null,
    operationalAirlineName:
      pickSnapshotField(snap, 'customerName', 'Airline', 'airline') ||
      row.customerName?.trim() ||
      null,
  };
}

export function preparationTabForStatus(status: PreparationStatus): PreparationStatus {
  if (status === 'invoiced') return 'ready_for_invoice';
  return status;
}
