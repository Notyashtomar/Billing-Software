'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutList, Pencil, Trash2 } from 'lucide-react';
import {
  fetchAdvanceStaffData,
  fetchPsrEmployeeSectionByFlightSerial,
  upsertPsrEmployeeSectionForFlight,
  type AdvanceStaffDataRow,
} from '@/lib/api';
import { DatePicker } from '@/components/ui/DatePicker';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';
import { toast } from 'sonner';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { FRIS_INVALID_CONTROL, required } from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import { retainPaxShiftSessionForSerial } from '@/components/fris/reports/paxShiftReportStorageKeys';

const EMPLOYEE_FIELD_ORDER = ['employeeCode', 'employeeName'] as const;
type EmployeeField = (typeof EMPLOYEE_FIELD_ORDER)[number];

type SavedRow = {
  id: string;
  employeeCode: string;
  employeeName: string;
  trainingName?: string;
  trainingDate?: string;
};

function parseSavedRow(item: unknown): SavedRow | null {
  if (!item || typeof item !== 'object' || !('id' in item)) return null;
  const o = item as Record<string, unknown>;
  return {
    id: String(o.id),
    employeeCode: String(o.employeeCode ?? '').trim(),
    employeeName: String(o.employeeName ?? '').trim(),
    trainingName: String(o.trainingName ?? '').trim(),
    trainingDate: String(o.trainingDate ?? '').trim(),
  };
}

function rowToPayload(r: SavedRow): SavedRow {
  return {
    id: String(r.id ?? '').trim(),
    employeeCode: String(r.employeeCode ?? '').trim(),
    employeeName: String(r.employeeName ?? '').trim(),
    trainingName: String(r.trainingName ?? '').trim(),
    trainingDate: String(r.trainingDate ?? '').trim(),
  };
}

function newRowId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type PaxShiftEmployeeSectionFormProps = {
  title: string;
  hint?: string;
  /** When set, rows are restored from sessionStorage and saved on each change. */
  storageKey?: string;
  /** When set with flightSerial, rows are persisted to DB using this section key. */
  sectionKey?: string;
  flightSerial?: string;
  /** Staff on duty (SUP/TL): show training name and training date columns. */
  showTrainingFields?: boolean;
};

export default function PaxShiftEmployeeSectionForm({
  title,
  hint,
  storageKey,
  sectionKey,
  flightSerial,
  showTrainingFields = false,
}: PaxShiftEmployeeSectionFormProps) {
  const [employeeOptions, setEmployeeOptions] = useState<AdvanceStaffDataRow[]>([]);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const employeesInFlight = useRef(false);

  const [rows, setRows] = useState<SavedRow[]>([]);
  const [employeeCode, setEmployeeCode] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingRows, setSavingRows] = useState(false);
  const { errors, clearField, clearAll, applyAndFocus } =
    useFieldErrors<EmployeeField>(EMPLOYEE_FIELD_ORDER);

  const dbReady =
    Boolean(sectionKey?.trim()) && Boolean(String(flightSerial ?? '').trim());

  const loadEmployeesIfNeeded = useCallback(async () => {
    if (employeesLoaded || employeesInFlight.current) return;
    employeesInFlight.current = true;
    setEmployeesLoading(true);
    try {
      const list = await fetchAdvanceStaffData();
      setEmployeeOptions(list);
      setEmployeesLoaded(true);
    } catch {
      toast.error('Failed to load staff data.');
    } finally {
      employeesInFlight.current = false;
      setEmployeesLoading(false);
    }
  }, [employeesLoaded]);

  const byCode = useMemo(() => {
    const m = new Map<string, AdvanceStaffDataRow>();
    employeeOptions.forEach((e) => {
      const c = (e.employeeCode ?? '').trim();
      if (c) m.set(c, e);
    });
    return m;
  }, [employeeOptions]);

  const byNameNorm = useMemo(() => {
    const m = new Map<string, AdvanceStaffDataRow>();
    employeeOptions.forEach((e) => {
      const n = (e.name ?? '').trim().toLowerCase();
      if (n) m.set(n, e);
    });
    return m;
  }, [employeeOptions]);

  const codeComboOptions = useMemo((): SearchableComboOption[] => {
    return employeeOptions.map((e) => {
      const code = (e.employeeCode ?? '').trim();
      const name = (e.name ?? '').trim();
      return {
        id: e.id || `${code}|${name}`,
        label: code,
        description: name || e.designation || undefined,
        searchIndex: `${code} ${name} ${e.designation ?? ''}`.toLowerCase(),
        employeeCode: code,
        employeeName: name,
      };
    });
  }, [employeeOptions]);

  const nameComboOptions = useMemo((): SearchableComboOption[] => {
    return employeeOptions.map((e) => {
      const code = (e.employeeCode ?? '').trim();
      const name = (e.name ?? '').trim();
      return {
        id: e.id ? `name|${e.id}` : `name|${code}|${name}`,
        label: name || code,
        description: name && code ? code : e.designation || undefined,
        searchIndex: `${name} ${code} ${e.designation ?? ''}`.toLowerCase(),
        employeeCode: code,
        employeeName: name,
      };
    });
  }, [employeeOptions]);

  useEffect(() => {
    if (dbReady) return;
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const next: SavedRow[] = [];
      for (const item of parsed) {
        const row = parseSavedRow(item);
        if (row) next.push(row);
      }
      setRows(next);
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey, dbReady]);

  useEffect(() => {
    if (!dbReady) return;
    let cancelled = false;
    const fs = String(flightSerial ?? '').trim();
    const sec = String(sectionKey ?? '').trim();
    void fetchPsrEmployeeSectionByFlightSerial(fs, sec)
      .then((data) => {
        if (cancelled) return;
        const next: SavedRow[] = (data.rows ?? []).map((r) => rowToPayload(r));
        setRows(next);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : 'Failed to load saved rows.');
      });
    return () => {
      cancelled = true;
    };
  }, [dbReady, flightSerial, sectionKey]);

  const persist = useCallback(
    (next: SavedRow[]) => {
      setRows(next);
      if (dbReady) return;
      if (storageKey && typeof window !== 'undefined') {
        try {
          retainPaxShiftSessionForSerial(String(flightSerial ?? ''));
          sessionStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore quota
        }
      }
    },
    [storageKey, dbReady],
  );

  const saveRowsToBackend = useCallback(
    async (next: SavedRow[]) => {
      if (!dbReady) return;
      const fs = String(flightSerial ?? '').trim();
      setSavingRows(true);
      try {
        const payloadRows = next.map((r) => rowToPayload(r));
        const saved = await upsertPsrEmployeeSectionForFlight(
          fs,
          String(sectionKey ?? '').trim(),
          payloadRows,
        );
        setRows((saved.rows ?? []).map((r) => rowToPayload(r)));
      } finally {
        setSavingRows(false);
      }
    },
    [dbReady, flightSerial, sectionKey],
  );

  const syncNameFromCode = useCallback(
    (code: string) => {
      const rec = byCode.get(code.trim());
      if (rec) setEmployeeName((rec.name ?? '').trim());
    },
    [byCode],
  );

  const syncCodeFromName = useCallback(
    (name: string) => {
      const rec = byNameNorm.get(name.trim().toLowerCase());
      if (rec) setEmployeeCode((rec.employeeCode ?? '').trim());
    },
    [byNameNorm],
  );

  const handleEmployeePick = useCallback((o: SearchableComboOption) => {
    setEmployeeCode((o.employeeCode ?? '').trim());
    setEmployeeName((o.employeeName ?? '').trim());
  }, []);

  const handleSave = async () => {
    const code = employeeCode.trim();
    const name = employeeName.trim();
    const nextErrors: Partial<Record<EmployeeField, string>> = {};
    const codeErr = required(code, 'Employee code');
    const nameErr = required(name, 'Employee name');
    if (codeErr) nextErrors.employeeCode = codeErr;
    if (nameErr) nextErrors.employeeName = nameErr;
    if (applyAndFocus(nextErrors)) return;

    if (editingId) {
      const next = rows.map((r) =>
        r.id === editingId ? { ...r, employeeCode: code, employeeName: name } : r,
      );
      persist(next);
      try {
        await saveRowsToBackend(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Update failed.');
        return;
      }
      setEditingId(null);
      setEmployeeCode('');
      setEmployeeName('');
      clearAll();
      toast.success('Row updated.');
      return;
    }

    const dup = rows.some(
      (r) =>
        r.id !== editingId &&
        r.employeeCode.toLowerCase() === code.toLowerCase() &&
        r.employeeName.toLowerCase() === name.toLowerCase(),
    );
    if (dup) {
      toast.warning('This employee is already in the table.');
      return;
    }

    const next = [
      ...rows,
      {
        id: newRowId(),
        employeeCode: code,
        employeeName: name,
        ...(showTrainingFields ? { trainingName: '', trainingDate: '' } : {}),
      },
    ];
    persist(next);
    try {
      await saveRowsToBackend(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
      return;
    }
    setEmployeeCode('');
    setEmployeeName('');
    clearAll();
    toast.success('Saved.');
  };

  const handleEdit = (r: SavedRow) => {
    setEditingId(r.id);
    setEmployeeCode(r.employeeCode);
    setEmployeeName(r.employeeName);
  };

  const patchRowField = async (
    id: string,
    field: 'trainingName' | 'trainingDate',
    value: string,
  ) => {
    let nextValue = value.trim();
    if (field === 'trainingName') {
      const letters = nextValue.replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim();
      if (nextValue && letters !== nextValue.replace(/\s+/g, ' ')) {
        toast.error('Training name may only contain letters.');
      }
      nextValue = letters;
    }
    const next = rows.map((r) => (r.id === id ? { ...r, [field]: nextValue } : r));
    const changed = next.find((r) => r.id === id);
    const prev = rows.find((r) => r.id === id);
    if (!changed || !prev || String(prev[field] ?? '').trim() === String(changed[field] ?? '').trim()) {
      return;
    }
    persist(next);
    try {
      await saveRowsToBackend(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save training details.');
    }
  };

  const handleDelete = async (id: string) => {
    const next = rows.filter((r) => r.id !== id);
    persist(next);
    try {
      await saveRowsToBackend(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed.');
      return;
    }
    if (editingId === id) {
      setEditingId(null);
      setEmployeeCode('');
      setEmployeeName('');
    }
    toast.success('Removed.');
  };

  const tableInputClass =
    'w-full min-w-[8rem] rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm transition-all hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

  return (
    <div className="p-6 md:p-8">
      <div className="mb-4 flex items-start gap-2">
        <LayoutList className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {hint ? <p className="mt-1 text-sm text-gray-500">{hint}</p> : null}
        </div>
      </div>

      <div className="mb-6 overflow-visible rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
          <div>
            <SearchableCombobox
              fieldLabel="Employee code"
              value={employeeCode}
              onChange={(v) => {
                setEmployeeCode(v);
                clearField('employeeCode');
                syncNameFromCode(v);
              }}
              onPickOption={handleEmployeePick}
              options={codeComboOptions}
              loading={employeesLoading}
              placeholder="Search by employee code or name…"
              onRequestOptions={loadEmployeesIfNeeded}
              matchFromStart
              invalid={!!errors.employeeCode}
              inputProps={{ id: 'field-employeeCode' }}
              inputClassName={cn(errors.employeeCode && FRIS_INVALID_CONTROL)}
            />
            <FormFieldError id="field-employeeCode-error" message={errors.employeeCode} />
          </div>
          <div>
            <SearchableCombobox
              fieldLabel="Employee name"
              value={employeeName}
              onChange={(v) => {
                setEmployeeName(v);
                clearField('employeeName');
                syncCodeFromName(v);
              }}
              onPickOption={handleEmployeePick}
              options={nameComboOptions}
              loading={employeesLoading}
              placeholder="Search by employee name or code…"
              onRequestOptions={loadEmployeesIfNeeded}
              matchFromStart
              invalid={!!errors.employeeName}
              inputProps={{ id: 'field-employeeName' }}
              inputClassName={cn(errors.employeeName && FRIS_INVALID_CONTROL)}
            />
            <FormFieldError id="field-employeeName-error" message={errors.employeeName} />
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3 md:self-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={savingRows}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingRows ? 'Saving...' : editingId ? 'Update' : 'Save'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setEmployeeCode('');
                  setEmployeeName('');
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
        <ReportsResponsiveTable>
          <table className={`w-full text-sm ${showTrainingFields ? 'min-w-[720px]' : 'min-w-[480px]'}`}>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Sr. no.
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Employee code
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Employee name
                </th>
                {showTrainingFields ? (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Training name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Training date
                    </th>
                  </>
                ) : null}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={showTrainingFields ? 6 : 4} className="px-4 py-10 text-center text-sm text-gray-500">
                    No rows yet — add employee code and name, then click Save.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-4 py-3 text-gray-900">{idx + 1}</td>
                    <td className="px-4 py-3 text-gray-900">{r.employeeCode || '—'}</td>
                    <td className="px-4 py-3 text-gray-900">{r.employeeName || '—'}</td>
                    {showTrainingFields ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            autoComplete="off"
                            defaultValue={r.trainingName ?? ''}
                            key={`${r.id}-training-name-${r.trainingName ?? ''}`}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^A-Za-z ]/g, '');
                              if (cleaned !== e.target.value) e.target.value = cleaned;
                            }}
                            onBlur={(e) => void patchRowField(r.id, 'trainingName', e.target.value)}
                            className={tableInputClass}
                            placeholder="—"
                            aria-label="Training name"
                            disabled={savingRows}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <DatePicker
                            value={r.trainingDate ?? ''}
                            onChange={(value) => void patchRowField(r.id, 'trainingDate', value ?? '')}
                            valueFormat="yyyy-MM-dd"
                            className="min-w-[9rem]"
                            disabled={savingRows}
                          />
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                          aria-label={`Edit row ${idx + 1}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(r.id)}
                          disabled={savingRows}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                          aria-label={`Delete row ${idx + 1}`}
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
