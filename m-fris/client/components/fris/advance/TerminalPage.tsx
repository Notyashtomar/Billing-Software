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
import { AdvanceGatewayExportButton } from '@/components/fris/advance/AdvanceGatewayExportButton';
import { GatewayStationMark } from '@/components/fris/advance/GatewayStationMark';
import { advanceBoolLabel } from '@/components/fris/advance/exportAdvanceGatewayExcel';
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
  GATEWAY_FORM_GRID_4,
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
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

export type TerminalRow = {
  id: string;
  stationCode: string;
  name: string;
  terminalCode: string;
  location: string;
  block: boolean;
};

const PATH = ADVANCE_PATHS.terminal;
const FIELD_ORDER = ['name', 'terminalCode', 'location'] as const;
type TerminalField = (typeof FIELD_ORDER)[number];

function toRow(doc: Record<string, unknown>): TerminalRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    stationCode: String(d.stationCode ?? '').trim().toUpperCase(),
    name: String(d.name ?? ''),
    terminalCode: String(d.terminalCode ?? ''),
    location: String(d.location ?? ''),
    block: Boolean(d.block),
  };
}

export default function TerminalPage() {
  const [form, setForm] = useState({
    name: '',
    terminalCode: '',
    location: '',
    block: false,
  });
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<TerminalRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<TerminalField>(FIELD_ORDER);

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
    const name = normalizeText(form.name);
    const terminalCode = form.terminalCode.trim().toUpperCase();
    const location = normalizeText(form.location);
    const next = validateFormValues(
      { name, terminalCode, location },
      {
        name: { label: 'Name', required: true, minLength: 2, maxLength: 100 },
        terminalCode: { label: 'Terminal code', required: true, maxLength: 10 },
        location: { label: 'Location', maxLength: 100, personName: true },
      },
    );
    if (terminalCode && !/^[A-Z0-9]{1,10}$/.test(terminalCode)) {
      next.terminalCode = 'Terminal code must be 1 to 10 letters or numbers.';
    }
    if (applyAndFocus(next)) return;

    setLoading(true);
    try {
      const body = {
        name,
        terminalCode,
        location,
        block: form.block,
      };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Created successfully');
      }
      setForm({ name: '', terminalCode: '', location: '', block: false });
      setEditingId(null);
      clearAll();
      await fetchList(filter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('name', msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row: TerminalRow) => {
    setForm({
      name: row.name,
      terminalCode: row.terminalCode,
      location: row.location,
      block: row.block,
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

  const handleGet = () => fetchList(filter);

  const q = filter.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.terminalCode.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q)
      )
    : rows;

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
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'field-name-error' : undefined}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  clearField('name');
                }}
                onBlur={(e) => {
                  const name = normalizeText(e.target.value);
                  setForm((f) => ({ ...f, name }));
                  setFieldError('name', runValidators(required(name, 'Name'), minLength(name, 2, 'Name'), maxLength(name, 100, 'Name')));
                }}
                className={gatewayControlClass(!!errors.name)}
                placeholder="Name"
                maxLength={100}
                disabled={loading}
              />
              <FormFieldError id="field-name-error" message={errors.name} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-terminalCode">Terminal Code</label>
              <input
                id="field-terminalCode"
                name="terminalCode"
                type="text"
                value={form.terminalCode}
                aria-invalid={!!errors.terminalCode}
                aria-describedby={errors.terminalCode ? 'field-terminalCode-error' : undefined}
                onChange={(e) => {
                  const terminalCode = e.target.value.toUpperCase();
                  setForm((f) => ({ ...f, terminalCode }));
                  clearField('terminalCode');
                }}
                onBlur={(e) => {
                  const terminalCode = e.target.value.trim().toUpperCase();
                  setForm((f) => ({ ...f, terminalCode }));
                  setFieldError(
                    'terminalCode',
                    runValidators(
                      required(terminalCode, 'Terminal code'),
                      maxLength(terminalCode, 10, 'Terminal code'),
                      terminalCode && !/^[A-Z0-9]{1,10}$/.test(terminalCode)
                        ? 'Terminal code must be 1 to 10 letters or numbers.'
                        : null,
                    ),
                  );
                }}
                className={`${gatewayControlClass(!!errors.terminalCode)} uppercase`}
                placeholder="Terminal Code"
                maxLength={10}
                disabled={loading}
              />
              <FormFieldError id="field-terminalCode-error" message={errors.terminalCode} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-location">Location</label>
              <input
                id="field-location"
                name="location"
                type="text"
                value={form.location}
                aria-invalid={!!errors.location}
                aria-describedby={errors.location ? 'field-location-error' : undefined}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => ({ ...f, location: value }));
                  setFieldError('location', value ? personName(value, 'Location') : null);
                }}
                onBlur={(e) => {
                  const location = normalizeText(e.target.value);
                  setForm((f) => ({ ...f, location }));
                  setFieldError(
                    'location',
                    runValidators(
                      personName(location, 'Location'),
                      maxLength(location, 100, 'Location'),
                    ),
                  );
                }}
                className={gatewayControlClass(!!errors.location)}
                placeholder="Location"
                maxLength={100}
                disabled={loading}
              />
              <FormFieldError id="field-location-error" message={errors.location} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <span className={GATEWAY_LABEL_SPACER} aria-hidden="true">
                &nbsp;
              </span>
              <label className={GATEWAY_CHECKBOX_CONTROL}>
                <input
                  type="checkbox"
                  checked={form.block}
                  onChange={(e) => setForm((f) => ({ ...f, block: e.target.checked }))}
                  disabled={loading}
                  className={GATEWAY_CHECKBOX_INPUT}
                />
                <span className="text-sm font-medium text-gray-700">Block</span>
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
              placeholder="Filter by name, terminal code, location..."
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
            emptyMessage="No terminals to export."
            exportParams={{
              sheetName: 'Terminal',
              fileName: 'advance-terminal.xlsx',
              headers: ['Name', 'Terminal Code', 'Location', 'Block'],
              rows: filteredRows.map((row) => [
                row.name,
                row.terminalCode,
                row.location,
                advanceBoolLabel(row.block),
              ]),
            }}
          />
        </div>
        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Terminal Code</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Location</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Block</th>
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
                    <td className="px-4 py-3 text-gray-900">
                      <span className="inline-flex items-center gap-2">
                        <GatewayStationMark code={row.stationCode} />
                        {row.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.terminalCode}</td>
                    <td className="px-4 py-3 text-gray-700">{row.location}</td>
                    <td className="px-4 py-3">
                      <span className={row.block ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                        {row.block ? 'true' : 'false'}
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
