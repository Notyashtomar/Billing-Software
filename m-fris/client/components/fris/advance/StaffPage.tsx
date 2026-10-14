'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileSpreadsheet, Loader2, Plus, RefreshCw, Search, Save, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  ADVANCE_PATHS,
  advanceCreate,
  advanceDelete,
  advanceDocId,
  advanceList,
  advanceUpdate,
} from '@/lib/api';
import { AdvanceGatewayExportButton } from '@/components/fris/advance/AdvanceGatewayExportButton';
import { GatewayStationMark } from '@/components/fris/advance/GatewayStationMark';
import { StaffImportDialog } from '@/components/fris/advance/StaffImportDialog';
import { CARGO_HIDDEN_SCROLL } from '@/components/fris/advance/cargo/cargoFormStyles';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  employeeId,
  minLength,
  personName,
  required,
  runValidators,
  selectRequired,
  validateFormValues,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  SearchableCombobox,
  type SearchableComboOption,
} from '@/components/ui/SearchableCombobox';
import {
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_GET_BTN,
  GATEWAY_PAGE_ROOT,
  GATEWAY_FORM_SECTION,
  GATEWAY_FORM_INNER,
  GATEWAY_FORM_GRID,
  GATEWAY_FORM_FIELD,
  GATEWAY_FORM_ACTIONS,
  GATEWAY_LABEL,
  GATEWAY_SAVE_BTN,
  GATEWAY_SECONDARY_BTN,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_TABLE_SECTION,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

const PATH = ADVANCE_PATHS.staff;

type GseAssignment = {
  code: string;
  name: string;
};

export type StaffRow = {
  id: string;
  stationCode: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  manpower: string;
  manpowerCode: string;
  gseAssigned: GseAssignment[];
};

type StaffFormValues = {
  employeeId: string;
  employeeName: string;
  designation: string;
  manpower: string;
  manpowerCode: string;
  gseAssigned: GseAssignment[];
};

const EMPTY_STAFF_FORM: StaffFormValues = {
  employeeId: '',
  employeeName: '',
  designation: '',
  manpower: '',
  manpowerCode: '',
  gseAssigned: [],
};
const FIELD_ORDER = ['employeeId', 'employeeName', 'designation', 'manpower'] as const;
type StaffField = (typeof FIELD_ORDER)[number];

const STAFF_TABLE_HEAD =
  'sticky top-0 z-10 bg-gray-50 px-3 py-2.5 font-semibold text-gray-700 shadow-[inset_0_-1px_0_0_rgb(229_231_235)]';

function gseDisplayLabel(item: GseAssignment): string {
  const code = item.code.trim();
  const name = item.name.trim();
  if (name && code) return `${name} (${code})`;
  return name || code || '—';
}

function formatGseCell(items: GseAssignment[]): string {
  if (!items.length) return '';
  return items.map(gseDisplayLabel).join(', ');
}

function displayPersonName(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || s === '[object Object]' || /^\[object\s+/i.test(s)) return '';
    return s;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const nested =
      o.fullName ??
      o.employeeName ??
      o.displayName ??
      o.name ??
      [o.firstName ?? o.first, o.lastName ?? o.last]
        .filter((p) => p != null && typeof p !== 'object')
        .join(' ');
    return displayPersonName(nested);
  }
  return String(value).trim();
}

function toRow(doc: Record<string, unknown>): StaffRow {
  const d = advanceDocId(doc);
  const rawGse = Array.isArray(d.gseAssigned) ? d.gseAssigned : [];
  const gseAssigned = rawGse
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? '').trim();
      const name = String(row.name ?? '').trim();
      if (!code && !name) return null;
      return { code, name };
    })
    .filter((item): item is GseAssignment => item !== null);

  return {
    id: d.id,
    stationCode: String(d.stationCode ?? '').trim().toUpperCase(),
    employeeId: String(d.employeeCode ?? '').trim(),
    employeeName: displayPersonName(d.employeeName) || displayPersonName(d.name),
    designation: String(d.designation ?? '').trim(),
    manpower: String(d.manpower ?? '').trim(),
    manpowerCode: String(d.manpowerCode ?? '').trim(),
    gseAssigned,
  };
}

function manpowerOptionLabel(name: string, code: string): string {
  if (name && code) return `${name} (${code})`;
  return name || code;
}

export default function StaffPage() {
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [form, setForm] = useState<StaffFormValues>(EMPTY_STAFF_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<StaffField>(FIELD_ORDER);

  const [manpowerOptions, setManpowerOptions] = useState<SearchableComboOption[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<SearchableComboOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [gsePick, setGsePick] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const loadReferenceOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const [manpowerList, equipmentList] = await Promise.all([
        advanceList(ADVANCE_PATHS.manpower) as Promise<Record<string, unknown>[]>,
        advanceList(ADVANCE_PATHS.equipment) as Promise<Record<string, unknown>[]>,
      ]);

      setManpowerOptions(
        manpowerList
          .map((doc): SearchableComboOption | null => {
            const d = advanceDocId(doc);
            const name = String(d.manpower ?? '').trim();
            const code = String(d.code ?? '').trim();
            if (!name && !code) return null;
            if (d.active === false) return null;
            return {
              id: code || name,
              label: manpowerOptionLabel(name, code),
              description: code || undefined,
              searchIndex: `${name} ${code}`.toLowerCase(),
            };
          })
          .filter((o): o is SearchableComboOption => o !== null),
      );

      setEquipmentOptions(
        equipmentList
          .map((doc): SearchableComboOption | null => {
            const d = advanceDocId(doc);
            const name = String(d.equipmentName ?? '').trim();
            const code = String(d.equipmentCode ?? '').trim();
            if (!name && !code) return null;
            if (d.active === false) return null;
            return {
              id: code || name,
              label: gseDisplayLabel({ name, code }),
              description: code || undefined,
              searchIndex: `${name} ${code}`.toLowerCase(),
            };
          })
          .filter((o): o is SearchableComboOption => o !== null),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load manpower/equipment options');
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const fetchList = useCallback(async (filterTerm?: string) => {
    setListLoading(true);
    try {
      const list = (await advanceList(
        PATH,
        filterTerm?.trim() ? { filter: filterTerm } : undefined,
      )) as Record<string, unknown>[];
      setRows(list.map(toRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load staff');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void loadReferenceOptions();
  }, [loadReferenceOptions]);

  const resetForm = () => {
    setForm(EMPTY_STAFF_FORM);
    setGsePick('');
    setEditingId(null);
    clearAll();
  };

  const handleManpowerPick = (option: SearchableComboOption) => {
    const code = String(option.description ?? option.id ?? '').trim();
    setForm((prev) => ({
      ...prev,
      manpower: option.label.trim(),
      manpowerCode: code,
    }));
    clearField('manpower');
  };

  const handleAddGse = () => {
    const trimmed = gsePick.trim();
    if (!trimmed) {
      toast.error('Select a GSE from the list before adding.');
      return;
    }

    const matched =
      equipmentOptions.find((o) => o.label.trim().toLowerCase() === trimmed.toLowerCase()) ??
      equipmentOptions.find((o) =>
        (o.description ?? '').trim().toLowerCase() === trimmed.toLowerCase(),
      );

    const code = String(matched?.description ?? matched?.id ?? '').trim().toUpperCase();
    const name = matched
      ? matched.label.replace(/\s*\([^)]*\)\s*$/, '').trim()
      : trimmed;

    if (!code && !name) {
      toast.error('Could not resolve the selected GSE.');
      return;
    }

    const key = (code || name).toLowerCase();
    if (form.gseAssigned.some((g) => (g.code || g.name).toLowerCase() === key)) {
      toast.message('This GSE is already assigned.');
      return;
    }

    setForm((prev) => ({
      ...prev,
      gseAssigned: [...prev.gseAssigned, { code, name }],
    }));
    setGsePick('');
  };

  const handleRemoveGse = (index: number) => {
    setForm((prev) => ({
      ...prev,
      gseAssigned: prev.gseAssigned.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    const next = validateFormValues(
      {
        employeeId: form.employeeId,
        employeeName: form.employeeName,
        designation: form.designation,
        manpower: form.manpower,
      },
      {
        employeeId: { label: 'Employee ID', required: true, employeeId: true },
        employeeName: { label: 'Employee name', required: true, minLength: 2, personName: true },
        designation: { label: 'Designation', maxLength: 80, personName: true },
        manpower: { label: 'manpower', select: true },
      },
    );
    if (applyAndFocus(next)) return;

    const body = {
      employeeCode: form.employeeId.trim().toUpperCase(),
      employeeName: form.employeeName.trim().replace(/\s+/g, ' '),
      designation: form.designation.trim().replace(/\s+/g, ' '),
      manpower: form.manpower.trim(),
      manpowerCode: form.manpowerCode.trim().toUpperCase(),
      gseAssigned: form.gseAssigned,
    };

    setSaving(true);
    try {
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Staff record updated.');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Staff record saved.');
      }
      resetForm();
      await fetchList(filter);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed';
      setFieldError('employeeId', message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row: StaffRow) => {
    setForm({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      designation: row.designation,
      manpower: row.manpower,
      manpowerCode: row.manpowerCode,
      gseAssigned: [...row.gseAssigned],
    });
    setGsePick('');
    setEditingId(row.id);
    clearAll();
  };

  const handleDelete = async (row: StaffRow) => {
    const label = row.employeeName || row.employeeId || 'this staff record';
    if (!window.confirm(`Delete "${label}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(row.id);
    try {
      await advanceDelete(PATH, row.id);
      toast.success('Staff record deleted.');
      if (editingId === row.id) resetForm();
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const displayRows = useMemo(() => rows, [rows]);

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return displayRows;
    return displayRows.filter((r) =>
      [
        r.employeeId,
        r.employeeName,
        r.designation,
        r.manpower,
        r.manpowerCode,
        formatGseCell(r.gseAssigned),
      ].some((v) => v.toLowerCase().includes(q)),
    );
  }, [filter, displayRows]);

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-employeeId">Employee ID</label>
              <input
                id="field-employeeId"
                name="employeeId"
                type="text"
                value={form.employeeId}
                onChange={(e) => {
                  const employeeId = e.target.value.toUpperCase().replace(/\s+/g, '');
                  setForm((prev) => ({ ...prev, employeeId }));
                  clearField('employeeId');
                }}
                onBlur={(e) =>
                  setFieldError(
                    'employeeId',
                    runValidators(required(e.target.value, 'Employee ID'), employeeId(e.target.value)),
                  )
                }
                aria-invalid={!!errors.employeeId}
                aria-describedby={errors.employeeId ? 'field-employeeId-error' : undefined}
                className={`${gatewayControlClass(!!errors.employeeId)} uppercase`}
                placeholder="Employee ID"
              />
              <FormFieldError id="field-employeeId-error" message={errors.employeeId} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-employeeName">Employee Name</label>
              <input
                id="field-employeeName"
                name="employeeName"
                type="text"
                value={form.employeeName}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((prev) => ({ ...prev, employeeName: value }));
                  setFieldError(
                    'employeeName',
                    value && personName(value, 'Employee name')
                      ? 'Employee name may only contain letters and spaces.'
                      : null,
                  );
                }}
                onBlur={(e) =>
                  setFieldError(
                    'employeeName',
                    runValidators(
                      required(e.target.value, 'Employee name'),
                      minLength(e.target.value, 2, 'Employee name'),
                      personName(e.target.value, 'Employee name'),
                    ),
                  )
                }
                aria-invalid={!!errors.employeeName}
                aria-describedby={errors.employeeName ? 'field-employeeName-error' : undefined}
                className={gatewayControlClass(!!errors.employeeName)}
                placeholder="Full name"
              />
              <FormFieldError id="field-employeeName-error" message={errors.employeeName} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-designation">
                Designation
              </label>
              <input
                id="field-designation"
                name="designation"
                type="text"
                value={form.designation}
                maxLength={80}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((prev) => ({ ...prev, designation: value }));
                  setFieldError(
                    'designation',
                    value && personName(value, 'Designation')
                      ? 'Designation may only contain letters and spaces.'
                      : null,
                  );
                }}
                onBlur={(e) =>
                  setFieldError('designation', personName(e.target.value, 'Designation'))
                }
                aria-invalid={!!errors.designation}
                aria-describedby={errors.designation ? 'field-designation-error' : undefined}
                className={gatewayControlClass(!!errors.designation)}
                placeholder="Job designation"
              />
              <FormFieldError id="field-designation-error" message={errors.designation} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <SearchableCombobox
                fieldLabel="Manpower"
                value={form.manpower}
                onChange={(v) => {
                  setForm((prev) => ({
                    ...prev,
                    manpower: v,
                    manpowerCode: '',
                  }));
                  clearField('manpower');
                }}
                options={manpowerOptions}
                loading={optionsLoading}
                placeholder="Search manpower…"
                onRequestOptions={loadReferenceOptions}
                onPickOption={handleManpowerPick}
                className="w-full"
                invalid={!!errors.manpower}
                inputProps={{
                  id: 'field-manpower',
                  'aria-describedby': errors.manpower ? 'field-manpower-error' : undefined,
                  onBlur: (e) => setFieldError('manpower', selectRequired(e.target.value, 'manpower')),
                }}
              />
              <FormFieldError id="field-manpower-error" message={errors.manpower} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL}>GSE Assigned</label>
              <div className="flex items-end gap-1.5">
                <div className="min-w-0 w-full max-w-[10.5rem] [&_label]:sr-only">
                  <SearchableCombobox
                    fieldLabel="GSE Assigned"
                    value={gsePick}
                    onChange={setGsePick}
                    options={equipmentOptions.filter(
                      (o) =>
                        !form.gseAssigned.some(
                          (g) =>
                            g.code === (o.description ?? o.id) ||
                            gseDisplayLabel(g).toLowerCase() === o.label.toLowerCase(),
                        ),
                    )}
                    loading={optionsLoading}
                    placeholder="Search GSE…"
                    onRequestOptions={loadReferenceOptions}
                    className="w-full"
                  />
                </div>
                <motion.button
                  type="button"
                  onClick={handleAddGse}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`${GATEWAY_SECONDARY_BTN} shrink-0 px-3`}
                  title="Add GSE"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </motion.button>
              </div>
              <FormFieldError />
            </div>

            <div className={`${GATEWAY_FORM_ACTIONS} justify-end sm:col-span-2 lg:col-span-1`}>
              {editingId ? (
                <motion.button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  whileTap={{ scale: 0.98 }}
                  className={GATEWAY_SECONDARY_BTN}
                >
                  Cancel
                </motion.button>
              ) : null}
              <motion.button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={GATEWAY_SAVE_BTN}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
              </motion.button>
            </div>
          </div>

          {form.gseAssigned.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {form.gseAssigned.map((gse, index) => (
                <li
                  key={`${gse.code}-${gse.name}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900"
                >
                  <span>{gseDisplayLabel(gse)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveGse(index)}
                    className="rounded-full p-0.5 text-emerald-700 hover:bg-emerald-100"
                    aria-label={`Remove ${gseDisplayLabel(gse)}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-gray-500">
              One employee can be assigned multiple GSE. Search and click Add for each.
            </p>
          )}
        </div>
      </section>

      <section className={GATEWAY_TABLE_SECTION}>
        <div className={GATEWAY_FILTER_BAR}>
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={`${GATEWAY_FILTER_INPUT} pl-9`}
              placeholder="Filter employee ID, name, designation, manpower, GSE…"
            />
          </div>
          <span className="whitespace-nowrap text-sm text-gray-500">
            {filteredRows.length} row(s)
          </span>
          <motion.button
            type="button"
            onClick={() => void fetchList(filter)}
            disabled={listLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={GATEWAY_GET_BTN}
          >
            <RefreshCw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setImportOpen(true)}
            disabled={listLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={GATEWAY_SECONDARY_BTN}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Import Excel</span>
          </motion.button>
          <AdvanceGatewayExportButton
            disabled={listLoading}
            emptyMessage="No staff records to export."
            exportParams={{
              sheetName: 'Staff',
              fileName: 'advance-staff.xlsx',
              headers: [
                'Employee ID',
                'Employee Name',
                'Designation',
                'Manpower',
                'GSE Assigned',
              ],
              rows: filteredRows.map((row) => [
                row.employeeId,
                row.employeeName,
                row.designation,
                row.manpower,
                formatGseCell(row.gseAssigned),
              ]),
            }}
          />
        </div>

        <div className={`${GATEWAY_TABLE_SCROLL} ${CARGO_HIDDEN_SCROLL}`}>
          <table className="w-full min-w-[840px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className={STAFF_TABLE_HEAD}>Employee ID</th>
                <th className={STAFF_TABLE_HEAD}>Employee Name</th>
                <th className={STAFF_TABLE_HEAD}>Designation</th>
                <th className={STAFF_TABLE_HEAD}>Manpower</th>
                <th className={STAFF_TABLE_HEAD}>GSE Assigned</th>
                <th className={`${STAFF_TABLE_HEAD} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    Loading staff…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No staff records yet. Use the form above or Import Excel.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{row.employeeId}</td>
                    <td className="px-3 py-2.5 text-gray-800">
                      <span className="inline-flex items-center gap-2">
                        <GatewayStationMark code={row.stationCode} />
                        {row.employeeName || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-800">{row.designation || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-800">{row.manpower || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-800">
                      {row.gseAssigned.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {row.gseAssigned.map((gse, index) => (
                            <span
                              key={`${row.id}-gse-${index}`}
                              className="inline-flex rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700"
                            >
                              {gseDisplayLabel(gse)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <motion.button
                          type="button"
                          title="Edit"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                          onClick={() => handleEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </motion.button>
                        <motion.button
                          type="button"
                          title="Delete"
                          disabled={deletingId === row.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          onClick={() => void handleDelete(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </motion.button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <StaffImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        path={PATH}
        onImported={() => fetchList(filter)}
      />
    </div>
  );
}
