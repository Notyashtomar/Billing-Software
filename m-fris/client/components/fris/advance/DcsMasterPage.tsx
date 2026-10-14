'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  advanceList,
  advanceCreate,
  advanceUpdate,
  advanceDelete,
  advanceDocId,
  ADVANCE_PATHS,
} from '@/lib/api';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { AdvanceGatewayExportButton } from '@/components/fris/advance/AdvanceGatewayExportButton';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  maxLength,
  minLength,
  normalizeText,
  personName,
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
  GATEWAY_DROPDOWN,
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_GET_BTN,
  GATEWAY_SAVE_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export type DcsMasterRow = {
  id: string;
  dcsName: string;
  status: string;
};

const PATH = ADVANCE_PATHS.dcsMaster;
const FIELD_ORDER = ['dcsName'] as const;
type DcsMasterField = (typeof FIELD_ORDER)[number];

function toRow(doc: Record<string, unknown>): DcsMasterRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    dcsName: String(d.dcsName ?? ''),
    status: String(d.status ?? ''),
  };
}

export default function DcsMasterPage() {
  const [form, setForm] = useState({
    dcsName: '',
    status: 'active',
  });
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<DcsMasterRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<DcsMasterField>(FIELD_ORDER);

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
    const dcsName = normalizeText(form.dcsName);
    const next = validateFormValues(
      { dcsName },
      {
        dcsName: {
          label: 'DCS name',
          required: true,
          minLength: 2,
          maxLength: 100,
          personName: true,
        },
      },
    );
    if (applyAndFocus(next)) return;

    setLoading(true);
    try {
      const body = { dcsName, status: form.status };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Created successfully');
      }
      setForm({ dcsName: '', status: 'active' });
      setEditingId(null);
      clearAll();
      await fetchList(filter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('dcsName', msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row: DcsMasterRow) => {
    setForm({ dcsName: row.dcsName, status: row.status });
    setEditingId(row.id);
    clearAll();
  };

  const handleDelete = async (id: string) => {
    try {
      await advanceDelete(PATH, id);
      toast.success('Deleted');
      if (editingId === id) {
        setEditingId(null);
        clearAll();
      }
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const statusLabel = (value: string) => STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;

  const handleGet = () => fetchList(filter);

  const q = filter.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter(
        (r) =>
          r.dcsName.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          statusLabel(r.status).toLowerCase().includes(q)
      )
    : rows;

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-dcsName">DCS Name</label>
              <input
                id="field-dcsName"
                name="dcsName"
                type="text"
                value={form.dcsName}
                aria-invalid={!!errors.dcsName}
                aria-describedby={errors.dcsName ? 'field-dcsName-error' : undefined}
                onChange={(e) => {
                  const raw = e.target.value;
                  const letters = raw.replace(/[^A-Za-z ]/g, '');
                  setForm((f) => ({ ...f, dcsName: letters }));
                  setFieldError(
                    'dcsName',
                    letters !== raw ? 'DCS name may only contain letters and spaces.' : null,
                  );
                }}
                onBlur={(e) => {
                  const dcsName = normalizeText(e.target.value);
                  setForm((f) => ({ ...f, dcsName }));
                  setFieldError(
                    'dcsName',
                    runValidators(
                      required(dcsName, 'DCS name'),
                      minLength(dcsName, 2, 'DCS name'),
                      maxLength(dcsName, 100, 'DCS name'),
                      personName(dcsName, 'DCS name'),
                    ),
                  );
                }}
                className={gatewayControlClass(!!errors.dcsName)}
                placeholder="DCS Name"
                maxLength={100}
                disabled={loading}
              />
              <FormFieldError id="field-dcsName-error" message={errors.dcsName} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-status">Status</label>
              <AdminRadioDropdown
                id="field-status"
                value={form.status}
                onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                options={STATUS_OPTIONS}
                className={GATEWAY_DROPDOWN}
                disabled={loading}
              />
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
              placeholder="Filter by DCS name or status..."
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
            emptyMessage="No DCS master records to export."
            exportParams={{
              sheetName: 'DCS Master',
              fileName: 'advance-dcs-master.xlsx',
              headers: ['DCS Name', 'Status'],
              rows: filteredRows.map((row) => [row.dcsName, row.status]),
            }}
          />
        </div>
        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">DCS Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
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
                    <td className="px-4 py-3 text-gray-900">{row.dcsName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          row.status === 'active'
                            ? 'text-emerald-600 font-medium'
                            : 'text-gray-500'
                        }
                      >
                        {statusLabel(row.status)}
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
