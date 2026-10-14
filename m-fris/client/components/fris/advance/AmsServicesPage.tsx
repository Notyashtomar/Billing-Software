'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, Search, Eraser, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  advanceList,
  advanceCreate,
  advanceUpdate,
  advanceDelete,
  advanceDocId,
  ADVANCE_PATHS,
} from '@/lib/api';
import { AdvanceGatewayExportButton } from '@/components/fris/advance/AdvanceGatewayExportButton';
import { advanceBoolLabel } from '@/components/fris/advance/exportAdvanceGatewayExcel';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  maxLength,
  minLength,
  normalizeText,
  required,
  runValidators,
  validateFormValues,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  GATEWAY_PAGE_ROOT,
  GATEWAY_FORM_SECTION,
  GATEWAY_FORM_INNER,
  GATEWAY_FORM_GRID,
  GATEWAY_FORM_FIELD,
  GATEWAY_FORM_ACTIONS,
  GATEWAY_LABEL,
  GATEWAY_LABEL_SPACER,
  GATEWAY_CHECKBOX_CONTROL,
  GATEWAY_CHECKBOX_INPUT,
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_GET_BTN,
  GATEWAY_SAVE_BTN,
  GATEWAY_SECONDARY_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

export type AmsServiceRow = {
  id: string;
  serviceName: string;
  active: boolean;
};

const PATH = ADVANCE_PATHS.amsServices;
const FIELD_ORDER = ['serviceName'] as const;
type AmsServiceField = (typeof FIELD_ORDER)[number];

function toRow(doc: Record<string, unknown>): AmsServiceRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    serviceName: String(d.serviceName ?? ''),
    active: Boolean(d.active),
  };
}

export default function AmsServicesPage() {
  const [form, setForm] = useState({
    serviceName: '',
    active: false,
  });
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<AmsServiceRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<AmsServiceField>(FIELD_ORDER);

  const fetchList = useCallback(async (filterTerm?: string) => {
    setListLoading(true);
    try {
      const list = (await advanceList(
        PATH,
        filterTerm?.trim() ? { filter: filterTerm } : undefined
      )) as Record<string, unknown>[];
      setRows(list.map(toRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load list');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSave = async () => {
    const serviceName = normalizeText(form.serviceName);
    const next = validateFormValues(
      { serviceName },
      { serviceName: { label: 'Service name', required: true, minLength: 2, maxLength: 100 } },
    );
    if (applyAndFocus(next)) return;

    setLoading(true);
    try {
      const body = { serviceName, active: form.active };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Created successfully');
      }
      setForm({ serviceName: '', active: false });
      setEditingId(null);
      clearAll();
      await fetchList(filter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('serviceName', msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setForm({ serviceName: '', active: false });
    setEditingId(null);
    clearAll();
  };

  const handleEdit = (row: AmsServiceRow) => {
    setForm({ serviceName: row.serviceName, active: row.active });
    setEditingId(row.id);
    clearAll();
  };

  const handleDelete = async (id: string) => {
    try {
      await advanceDelete(PATH, id);
      toast.success('Deleted');
      if (editingId === id) handleClear();
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleGet = () => fetchList(filter);

  const q = filter.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter((r) => r.serviceName.toLowerCase().includes(q))
    : rows;

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-serviceName">Service Name</label>
              <input
                id="field-serviceName"
                name="serviceName"
                type="text"
                value={form.serviceName}
                aria-invalid={!!errors.serviceName}
                aria-describedby={errors.serviceName ? 'field-serviceName-error' : undefined}
                onChange={(e) => {
                  setForm((f) => ({ ...f, serviceName: e.target.value }));
                  clearField('serviceName');
                }}
                onBlur={(e) => {
                  const serviceName = normalizeText(e.target.value);
                  setForm((f) => ({ ...f, serviceName }));
                  setFieldError(
                    'serviceName',
                    runValidators(
                      required(serviceName, 'Service name'),
                      minLength(serviceName, 2, 'Service name'),
                      maxLength(serviceName, 100, 'Service name'),
                    ),
                  );
                }}
                className={gatewayControlClass(!!errors.serviceName)}
                placeholder="Service Name"
                maxLength={100}
                disabled={loading}
              />
              <FormFieldError id="field-serviceName-error" message={errors.serviceName} />
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
                  disabled={loading}
                  className={GATEWAY_CHECKBOX_INPUT}
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
              <FormFieldError />
            </div>
            <div className={GATEWAY_FORM_ACTIONS}>
              <motion.button
                type="button"
                onClick={handleSave}
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={GATEWAY_SAVE_BTN}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" />}
                {loading ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </motion.button>
              <motion.button
                type="button"
                onClick={handleClear}
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={GATEWAY_SECONDARY_BTN}
              >
                <Eraser className="w-4 h-4" />
                Clear
              </motion.button>
            </div>
          </div>
        </div>
      </section>

      <section className={GATEWAY_TABLE_SECTION}>
        <div className={GATEWAY_FILTER_BAR}>
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by service name..."
              className={GATEWAY_FILTER_INPUT}
            />
          </div>
          <motion.button
            type="button"
            onClick={handleGet}
            disabled={listLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={GATEWAY_GET_BTN}
          >
            {listLoading ? 'Loading...' : 'Get'}
          </motion.button>
          <AdvanceGatewayExportButton
            disabled={listLoading}
            emptyMessage="No AMS services to export."
            exportParams={{
              sheetName: 'AMS Services',
              fileName: 'advance-ams-services.xlsx',
              headers: ['Service Name', 'Active'],
              rows: filteredRows.map((row) => [
                row.serviceName,
                advanceBoolLabel(row.active),
              ]),
            }}
          />
        </div>
        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Service Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Active</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right w-24">Edit</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right w-24">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No data. Add a record, use Get to refresh, or adjust filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900">{row.serviceName}</td>
                    <td className="px-4 py-3">
                      <span className={row.active ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                        {row.active ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <motion.button
                        type="button"
                        onClick={() => handleEdit(row)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </motion.button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <motion.button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
