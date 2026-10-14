'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutList, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FlightData } from '@/utils/dataProcessor';
import { fetchShippedBagsByFlightSerial, upsertShippedBagsForFlight } from '@/lib/api';
import { noOfBagsForInput, normalizeNoOfBagsForSave } from '@/lib/paxShiftFieldCoercion';
import { PaxShiftIntegerInput } from '@/components/fris/reports/PaxShiftIntegerInput';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { flightSnapshotFromFlightData } from '@/components/fris/reports/paxShiftFlightSnapshot';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  maxLength,
  selectRequired,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

const SSB_FIELD_ORDER = ['optionSection', 'remarks'] as const;
type SsbField = (typeof SSB_FIELD_ORDER)[number];

export const SHORT_SHIPPED_BAG_OPTION_SECTIONS = [
  'Local',
  'I TO D',
  'I TO I',
  'D TO D',
  'D TO I',
  'Level 4',
] as const;

type Row = {
  id: string;
  optionSection: string;
  remarks: string;
};

function newRowId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `ssb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}


function mapApiRows(
  rows: { id: string; optionSection?: string; remarks?: string }[],
): Row[] {
  return rows.map((r) => ({
    id: String(r.id),
    optionSection: String(r.optionSection ?? '').trim(),
    remarks: String(r.remarks ?? '').trim(),
  }));
}

export type PaxShiftShortShippedBagSidebarFormProps = {
  storageKey: string;
  flight: FlightData;
  /** Schedule flight instance serial (`FlightData.slNo`); `reports-pax-shift-report`. */
  flightSerial: string;
};

export default function PaxShiftShortShippedBagSidebarForm({
  storageKey,
  flight,
  flightSerial,
}: PaxShiftShortShippedBagSidebarFormProps) {
  const [noOfBags, setNoOfBags] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [optionSection, setOptionSection] = useState<string>('');
  const [remarks, setRemarks] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { errors, clearField, clearAll, applyAndFocus } = useFieldErrors<SsbField>(SSB_FIELD_ORDER);

  const fs = String(flightSerial ?? '').trim();
  const dbReady = Boolean(fs);
  const flightSnapshot = useMemo(() => flightSnapshotFromFlightData(flight), [flight]);

  const saveRowsToBackend = useCallback(
    async (nextNo: string, nextRows: Row[]) => {
      if (!dbReady) return;
      setSaving(true);
      try {
        const bagCount = normalizeNoOfBagsForSave(nextNo);
        const saved = await upsertShippedBagsForFlight(fs, {
          ...(bagCount !== undefined && bagCount > 0 ? { noOfBags: bagCount } : {}),
          rows: nextRows,
          flightSnapshot,
        });
        setNoOfBags(noOfBagsForInput(saved.noOfBags));
        setRows(mapApiRows(saved.rows ?? []));
      } finally {
        setSaving(false);
      }
    },
    [dbReady, fs, flightSnapshot],
  );

  useEffect(() => {
    setNoOfBags('');
    setRows([]);
    setOptionSection('');
    setRemarks('');
    setEditingId(null);

    if (!dbReady) return;

    let cancelled = false;
    setLoading(true);
    void fetchShippedBagsByFlightSerial(fs)
      .then((data) => {
        if (cancelled) return;
        setNoOfBags(noOfBagsForInput(data.noOfBags));
        setRows(mapApiRows(data.rows ?? []));
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(
          e instanceof Error ? e.message : 'Could not load short shipped bags for this flight.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dbReady, fs, storageKey]);

  const handleSave = async () => {
    const opt = optionSection.trim();
    const rem = remarks.trim();
    const nextErrors: Partial<Record<SsbField, string>> = {};
    const optErr = selectRequired(opt, 'option section');
    if (optErr) nextErrors.optionSection = optErr;
    const remErr = maxLength(rem, 500, 'Remarks');
    if (remErr) nextErrors.remarks = remErr;
    if (applyAndFocus(nextErrors)) return;

    let nextRows: Row[];
    if (editingId) {
      nextRows = rows.map((r) =>
        r.id === editingId ? { ...r, optionSection: opt, remarks: rem } : r,
      );
      setEditingId(null);
    } else {
      nextRows = [...rows, { id: newRowId(), optionSection: opt, remarks: rem }];
    }

    setOptionSection('');
    setRemarks('');
    clearAll();

    if (!dbReady) {
      setRows(nextRows);
      toast.success(editingId ? 'Row updated.' : 'Saved.');
      return;
    }

    try {
      await saveRowsToBackend(noOfBags, nextRows);
      toast.success(editingId ? 'Row updated.' : 'Saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  const handleEdit = (r: Row) => {
    setEditingId(r.id);
    setOptionSection(r.optionSection);
    setRemarks(r.remarks);
  };

  const handleDelete = async (id: string) => {
    const nextRows = rows.filter((r) => r.id !== id);
    if (editingId === id) {
      setEditingId(null);
      setOptionSection('');
      setRemarks('');
    }

    if (!dbReady) {
      setRows(nextRows);
      toast.success('Removed.');
      return;
    }

    try {
      await saveRowsToBackend(noOfBags, nextRows);
      toast.success('Removed.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  const onNoOfBagsChange = async (v: string) => {
    if (v !== '' && !/^\d+$/.test(v)) return;
    setNoOfBags(v);
    if (!dbReady) return;
    try {
      await saveRowsToBackend(v, rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save no. of bags.');
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';
  const selectClass = `${inputClass} cursor-pointer`;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-4 flex items-start gap-2">
        <LayoutList className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Short shipped bag</h2>
          <p className="mt-1 text-sm text-gray-500">
            Data for flight serial <span className="font-medium text-gray-700">{fs || '—'}</span>.
            {loading ? ' Loading…' : null}
          </p>
        </div>
      </div>

      <div className="mb-6 overflow-visible rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
            <div className="w-full shrink-0 sm:w-[7.5rem]">
              <label htmlFor="ssb-no-of-bags" className="mb-1.5 block text-sm font-medium text-gray-700">
                No. of bags
              </label>
              <PaxShiftIntegerInput
                id="ssb-no-of-bags"
                autoComplete="off"
                value={noOfBags}
                onChange={(e) => void onNoOfBagsChange(e.target.value)}
                disabled={loading || saving}
                className={inputClass}
                placeholder="e.g. 3"
              />
              <FormFieldError />
            </div>
            <div className="min-w-0 flex-1 sm:min-w-[140px]">
              <label htmlFor="field-optionSection" className="mb-1.5 block text-sm font-medium text-gray-700">
                Option section
              </label>
              <AdminRadioDropdown
                id="field-optionSection"
                value={optionSection}
                onChange={(v) => {
                  setOptionSection(v);
                  clearField('optionSection');
                }}
                className={cn(selectClass, errors.optionSection && FRIS_INVALID_CONTROL)}
                options={[{ value: '', label: '— Select —' }, ...SHORT_SHIPPED_BAG_OPTION_SECTIONS]}
              />
              <FormFieldError id="field-optionSection-error" message={errors.optionSection} />
            </div>
            <div className="min-w-0 flex-[1.35]">
              <label htmlFor="field-remarks" className="mb-1.5 block text-sm font-medium text-gray-700">
                Remarks
              </label>
              <input
                id="field-remarks"
                name="remarks"
                type="text"
                autoComplete="off"
                value={remarks}
                onChange={(e) => {
                  setRemarks(e.target.value);
                  clearField('remarks');
                }}
                className={cn(inputClass, errors.remarks && FRIS_INVALID_CONTROL)}
                placeholder="Optional"
                maxLength={500}
                spellCheck
                aria-invalid={!!errors.remarks}
              />
              <FormFieldError id="field-remarks-error" message={errors.remarks} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || saving}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setOptionSection('');
                  setRemarks('');
                }}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 bg-gray-50/90 px-4 py-2.5 sm:px-5"
          aria-live="polite"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">No. of bags</span>
          <span className="text-base font-semibold tabular-nums text-gray-900">
            {noOfBags !== '' ? noOfBags : '—'}
          </span>
        </div>
        <ReportsResponsiveTable>
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Serial no.
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Option section
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Remarks
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                    Loading short shipped bags…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                    No rows yet — set no. of bags, choose option section, add remarks if needed, then Save.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-4 py-3 text-gray-900">{idx + 1}</td>
                    <td className="px-4 py-3 text-gray-900">{r.optionSection || '—'}</td>
                    <td className="max-w-[min(280px,40vw)] whitespace-pre-wrap break-words px-4 py-3 text-gray-700">
                      {r.remarks || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(r)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(r.id)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ReportsResponsiveTable>
      </div>
    </div>
  );
}
