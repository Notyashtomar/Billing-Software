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
import { advanceBoolLabel } from '@/components/fris/advance/exportAdvanceGatewayExcel';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
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
  GATEWAY_FORM_GRID_4,
  GATEWAY_FORM_FIELD,
  GATEWAY_FORM_ACTIONS,
  GATEWAY_LABEL,
  GATEWAY_LABEL_SPACER,
  GATEWAY_CHECKBOX_CONTROL,
  GATEWAY_CHECKBOX_INPUT,
  GATEWAY_DROPDOWN,
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_GET_BTN,
  GATEWAY_SAVE_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

const UNIT_OPTIONS = [
  { value: 'liter', label: 'Liter' },
  { value: 'weight', label: 'Weight' },
  { value: 'time', label: 'Time' },
  { value: 'trip/flight', label: 'Trip/Flight' },
];

export type OtherServiceRow = {
  id: string;
  service: string;
  code: string;
  unit: string;
  active: boolean;
};

const PATH = ADVANCE_PATHS.otherServices;
const FIELD_ORDER = ['service', 'code'] as const;
type OtherServiceField = (typeof FIELD_ORDER)[number];

function toRow(doc: Record<string, unknown>): OtherServiceRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    service: String(d.service ?? ''),
    code: String(d.code ?? ''),
    unit: String(d.unit ?? ''),
    active: Boolean(d.active),
  };
}

export default function OtherServicesPage() {
  const [form, setForm] = useState({
    service: '',
    code: '',
    unit: '',
    active: false,
  });
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<OtherServiceRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<OtherServiceField>(FIELD_ORDER);

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
    const service = normalizeText(form.service);
    const code = normalizeText(form.code);
    const next = validateFormValues(
      { service, code },
      {
        service: { label: 'Service', required: true, minLength: 2, personName: true },
        code: { label: 'Code', required: true },
      },
    );
    if (applyAndFocus(next)) return;

    setLoading(true);
    try {
      const body = {
        service,
        code,
        unit: form.unit,
        active: form.active,
      };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Created successfully');
      }
      setForm({ service: '', code: '', unit: '', active: false });
      setEditingId(null);
      clearAll();
      await fetchList(filter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('service', msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row: OtherServiceRow) => {
    setForm({
      service: row.service,
      code: row.code,
      unit: row.unit,
      active: row.active,
    });
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

  const unitLabel = (value: string) => UNIT_OPTIONS.find((o) => o.value === value)?.label ?? value;

  const handleGet = () => fetchList(filter);

  const q = filter.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter((r) => {
        const ul = unitLabel(r.unit).toLowerCase();
        return (
          r.service.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.unit.toLowerCase().includes(q) ||
          ul.includes(q)
        );
      })
    : rows;

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID_4}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-service">Service</label>
              <input
                id="field-service"
                name="service"
                type="text"
                value={form.service}
                aria-invalid={!!errors.service}
                aria-describedby={errors.service ? 'field-service-error' : undefined}
                onChange={(e) => {
                  const raw = e.target.value;
                  const letters = raw.replace(/[^A-Za-z ]/g, '');
                  setForm((f) => ({ ...f, service: letters }));
                  setFieldError(
                    'service',
                    letters !== raw ? 'Service may only contain letters and spaces.' : null,
                  );
                }}
                onBlur={(e) => {
                  const service = normalizeText(e.target.value);
                  setForm((f) => ({ ...f, service }));
                  setFieldError(
                    'service',
                    runValidators(required(service, 'Service'), personName(service, 'Service')),
                  );
                }}
                className={gatewayControlClass(!!errors.service)}
                placeholder="Service"
                disabled={loading}
              />
              <FormFieldError id="field-service-error" message={errors.service} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-code">Code</label>
              <input
                id="field-code"
                name="code"
                type="text"
                value={form.code}
                aria-invalid={!!errors.code}
                aria-describedby={errors.code ? 'field-code-error' : undefined}
                onChange={(e) => {
                  setForm((f) => ({ ...f, code: e.target.value }));
                  clearField('code');
                }}
                onBlur={(e) => {
                  const code = normalizeText(e.target.value);
                  setForm((f) => ({ ...f, code }));
                  setFieldError('code', runValidators(required(code, 'Code')));
                }}
                className={gatewayControlClass(!!errors.code)}
                placeholder="Code"
                disabled={loading}
              />
              <FormFieldError id="field-code-error" message={errors.code} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-unit">Unit</label>
              <AdminRadioDropdown
                id="field-unit"
                value={form.unit}
                onChange={(v) => setForm((f) => ({ ...f, unit: v }))}
                options={[{ value: '', label: 'Select' }, ...UNIT_OPTIONS]}
                className={GATEWAY_DROPDOWN}
                disabled={loading}
              />
              <FormFieldError />
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
              placeholder="Filter by service, code, unit..."
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
            emptyMessage="No other services to export."
            exportParams={{
              sheetName: 'Other Services',
              fileName: 'advance-other-services.xlsx',
              headers: ['Service', 'Code', 'Unit', 'Active'],
              rows: filteredRows.map((row) => [
                row.service,
                row.code,
                row.unit,
                advanceBoolLabel(row.active),
              ]),
            }}
          />
        </div>
        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Service</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Code</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Unit</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Active</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right w-24">Edit</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right w-24">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No data. Add a record, use Get to refresh, or adjust filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900">{row.service}</td>
                    <td className="px-4 py-3 text-gray-700">{row.code}</td>
                    <td className="px-4 py-3 text-gray-700">{row.unit ? unitLabel(row.unit) : '—'}</td>
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
