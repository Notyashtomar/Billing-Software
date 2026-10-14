'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, Search, Save, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ADVANCE_PATHS,
  advanceCreate,
  advanceDelete,
  advanceDocId,
  advanceList,
  advanceUpdate,
  upsertEquipmentManpowerAdminCatalog,
} from '@/lib/api';
import { GatewayStationMark } from '@/components/fris/advance/GatewayStationMark';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  airlineCode,
  normalizeText,
  required,
  runValidators,
  validateFormValues,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  formatEquipmentCategoryLabel,
  normalizeEquipmentCategory,
  type EquipmentCategoryCode,
} from '@/components/fris/advance/equipmentManpowerCategory';
import {
  GATEWAY_PAGE_ROOT,
  GATEWAY_FORM_SECTION,
  GATEWAY_FORM_INNER,
  GATEWAY_FORM_GRID_4,
  GATEWAY_FORM_FIELD,
  GATEWAY_FORM_ACTIONS,
  GATEWAY_LABEL,
  GATEWAY_LABEL_SPACER,
  GATEWAY_CHECKBOX_CONTROL,
  GATEWAY_CHECKBOX_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_GET_BTN,
  GATEWAY_SAVE_BTN,
  GATEWAY_SECONDARY_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

const PATH = ADVANCE_PATHS.equipment;

const CATEGORY_DROPDOWN_OPTIONS = [
  { value: '', label: '— Select category —' },
  { value: 'M', label: `M — ${formatEquipmentCategoryLabel('M')}` },
  { value: 'NM', label: `NM — ${formatEquipmentCategoryLabel('NM')}` },
  { value: 'T', label: `T — ${formatEquipmentCategoryLabel('T')}` },
];

type EquipmentRow = {
  id: string;
  stationCode: string;
  name: string;
  code: string;
  category: EquipmentCategoryCode | '';
  active: boolean;
};

type EquipmentForm = {
  name: string;
  code: string;
  category: EquipmentCategoryCode | '';
  active: boolean;
};

const EMPTY_FORM: EquipmentForm = {
  name: '',
  code: '',
  category: '',
  active: true,
};
const FIELD_ORDER = ['name', 'code', 'category'] as const;
type EquipmentField = (typeof FIELD_ORDER)[number];

function toRow(doc: Record<string, unknown>): EquipmentRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    stationCode: String(d.stationCode ?? '').trim().toUpperCase(),
    name: String(d.equipmentName ?? '').trim(),
    code: String(d.equipmentCode ?? '').trim(),
    category: normalizeEquipmentCategory(d.category),
    active: d.active !== false,
  };
}

async function syncFlightEquipmentCatalog(rows: EquipmentRow[]): Promise<void> {
  await upsertEquipmentManpowerAdminCatalog(
    rows
      .filter((row) => row.active && row.code && row.name)
      .map((row) => ({
        abbr: row.code,
        description: row.name,
        unit_type: '',
        category: normalizeEquipmentCategory(row.category),
      })),
  );
}

export default function EquipmentManpowerPage() {
  const [form, setForm] = useState<EquipmentForm>(EMPTY_FORM);
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<EquipmentField>(FIELD_ORDER);

  const fetchList = useCallback(async (filterTerm?: string) => {
    setListLoading(true);
    try {
      const list = (await advanceList(
        PATH,
        filterTerm?.trim() ? { filter: filterTerm } : undefined,
      )) as Record<string, unknown>[];
      const nextRows = list.map(toRow);
      setRows(nextRows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load equipment');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const catLabel = formatEquipmentCategoryLabel(row.category);
      return [row.name, row.code, row.category, catLabel, row.active ? 'active' : 'inactive']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filter]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    clearAll();
  };

  const validateLive = (field: Exclude<EquipmentField, 'category'>, value: string) => {
    setFieldError(
      field,
      field === 'name'
        ? required(value, 'Name')
        : runValidators(required(value, 'Code or abbreviation'), airlineCode(value, 'Code or abbreviation')),
    );
  };

  const handleSave = async () => {
    const name = normalizeText(form.name);
    const code = form.code.trim().toUpperCase();
    const next = validateFormValues(
      { name, code, category: form.category },
      {
        name: { label: 'Name', required: true },
        code: { label: 'Code or abbreviation', required: true, airlineCode: true },
        category: { label: 'category', select: true },
      },
    );
    if (applyAndFocus(next)) return;

    const body = {
      equipmentName: name,
      equipmentCode: code,
      category: form.category,
      active: form.active,
    };

    setLoading(true);
    try {
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Saved successfully');
      }
      resetForm();
      await fetchList(filter);
      try {
        const list = (await advanceList(PATH)) as Record<string, unknown>[];
        await syncFlightEquipmentCatalog(list.map(toRow));
      } catch {
        // Best-effort sync for flight equipment dropdowns.
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('name', msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row: EquipmentRow) => {
    setForm({
      name: row.name,
      code: row.code,
      category: row.category,
      active: row.active,
    });
    setEditingId(row.id);
    clearAll();
  };

  const handleDelete = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    const label = row?.name || row?.code || 'this item';
    if (!window.confirm(`Delete "${label}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await advanceDelete(PATH, id);
      toast.success('Deleted');
      if (editingId === id) resetForm();
      await fetchList(filter);
      try {
        const list = (await advanceList(PATH)) as Record<string, unknown>[];
        await syncFlightEquipmentCatalog(list.map(toRow));
      } catch {
        // Best-effort sync for flight equipment dropdowns.
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID_4}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-name">Name</label>
              <input
                id="field-name"
                name="name"
                type="text"
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  clearField('name');
                }}
                onBlur={(e) => validateLive('name', e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'field-name-error' : undefined}
                className={gatewayControlClass(!!errors.name)}
                placeholder="e.g. PushBack-Narrow Body"
              />
              <FormFieldError id="field-name-error" message={errors.name} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-code">Code or Abbreviation</label>
              <input
                id="field-code"
                name="code"
                type="text"
                value={form.code}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase().replace(/\s+/g, ''),
                  }));
                  clearField('code');
                }}
                onBlur={(e) => validateLive('code', e.target.value)}
                aria-invalid={!!errors.code}
                aria-describedby={errors.code ? 'field-code-error' : undefined}
                className={`${gatewayControlClass(!!errors.code)} uppercase`}
                placeholder="e.g. PBNB"
              />
              <FormFieldError id="field-code-error" message={errors.code} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-category">Category</label>
              <AdminRadioDropdown
                id="field-category"
                value={form.category}
                onChange={(v) => {
                  setForm((f) => ({ ...f, category: normalizeEquipmentCategory(v) }));
                  clearField('category');
                }}
                options={CATEGORY_DROPDOWN_OPTIONS}
                placeholder="Select category"
                className={gatewayControlClass(!!errors.category)}
              />
              <FormFieldError id="field-category-error" message={errors.category} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <span className={GATEWAY_LABEL_SPACER} aria-hidden="true">
                &nbsp;
              </span>
              <label className={GATEWAY_CHECKBOX_CONTROL}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  className={GATEWAY_CHECKBOX_INPUT}
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
              <FormFieldError />
            </div>
            <div className={GATEWAY_FORM_ACTIONS}>
              {editingId ? (
                <motion.button
                  type="button"
                  onClick={resetForm}
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  className={GATEWAY_SECONDARY_BTN}
                >
                  Cancel
                </motion.button>
              ) : null}
              <motion.button
                type="button"
                onClick={() => void handleSave()}
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={GATEWAY_SAVE_BTN}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" />}
                {loading ? 'Saving…' : editingId ? 'Update' : 'Save'}
              </motion.button>
            </div>
          </div>
        </div>
      </section>

      <section className={GATEWAY_TABLE_SECTION}>
        <div className={GATEWAY_FILTER_BAR}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter name, code, category…"
              className={GATEWAY_FILTER_INPUT}
              aria-label="Filter equipment"
            />
          </div>
          <span className="whitespace-nowrap text-xs text-gray-500">
            {filteredRows.length} row(s)
          </span>
          <motion.button
            type="button"
            disabled={listLoading}
            onClick={() => void fetchList(filter)}
            whileTap={{ scale: 0.98 }}
            className={`${GATEWAY_GET_BTN} inline-flex items-center gap-2`}
          >
            <RefreshCw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>

        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="min-w-[640px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr className="text-gray-700">
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Name
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Code
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Category
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
                  Active
                </th>
                <th className="w-24 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">
                    {listLoading
                      ? 'Loading equipment…'
                      : 'No equipment yet. Use the form above to add one.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isEditing = editingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-100 hover:bg-gray-50/50 ${
                        isEditing ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        <span className="inline-flex items-center gap-2">
                          <GatewayStationMark code={row.stationCode} />
                          {row.name || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-800">{row.code || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-700">
                        {row.category
                          ? `${row.category} — ${formatEquipmentCategoryLabel(row.category)}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">
                        {row.active ? 'Yes' : 'No'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <motion.button
                            type="button"
                            title="Edit"
                            whileTap={{ scale: 0.95 }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                            onClick={() => handleEdit(row)}
                          >
                            <Pencil className="h-4 w-4" />
                          </motion.button>
                          <motion.button
                            type="button"
                            title="Delete"
                            whileTap={{ scale: 0.95 }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                            onClick={() => void handleDelete(row.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </motion.button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
