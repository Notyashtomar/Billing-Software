'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, Pencil, Search, Trash2 } from 'lucide-react';
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
import {
  GatewayStationMark,
  useTestingFrisStation,
} from '@/components/fris/advance/GatewayStationMark';
import { TESTING_STATION_CODE } from '@/lib/login-station';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  airlineCode as validateAirlineCode,
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
  GATEWAY_FORM_GRID_4,
  GATEWAY_FORM_FIELD,
  GATEWAY_FORM_ACTIONS,
  GATEWAY_LABEL,
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_SAVE_BTN,
  GATEWAY_SECONDARY_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

export type AirlineRow = {
  id: string;
  name: string;
  code: string;
  parentCompanyName: string;
  stationCode: string;
};

const PATH = ADVANCE_PATHS.airline;
const EMPTY_FORM = { name: '', code: '', parentCompanyName: '' };

const FIELD_ORDER = ['name', 'code', 'parentCompanyName'] as const;
type AirlineField = (typeof FIELD_ORDER)[number];

function toProperCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function toRow(doc: Record<string, unknown>): AirlineRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    name: String(d.name ?? ''),
    code: String(d.code ?? ''),
    parentCompanyName: String(d.parentCompanyName ?? ''),
    stationCode: String(d.stationCode ?? '').trim().toUpperCase(),
  };
}

export default function AirlinePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<AirlineRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<AirlineField>(FIELD_ORDER);

  const nameKey = (name: string) => toProperCase(name).toLowerCase();
  const codeKey = (code: string) => code.trim().toUpperCase();

  const testingStation = useTestingFrisStation();
  const countsForDuplicate = (row: AirlineRow) => {
    if (!testingStation) return true;
    return row.stationCode === TESTING_STATION_CODE;
  };
  const rowIsEditable = (row: AirlineRow) => countsForDuplicate(row);

  const isNameDuplicate = (name: string, excludeId?: string | null) => {
    const key = nameKey(name);
    if (!key) return false;
    return rows.some(
      (r) => r.id !== excludeId && countsForDuplicate(r) && nameKey(r.name) === key,
    );
  };

  const isCodeDuplicate = (code: string, excludeId?: string | null) => {
    const key = codeKey(code);
    if (!key) return false;
    return rows.some(
      (r) => r.id !== excludeId && countsForDuplicate(r) && codeKey(r.code) === key,
    );
  };

  const fetchList = useCallback(async (filterTerm?: string) => {
    setListLoading(true);
    try {
      const list = (await advanceList(
        PATH,
        filterTerm?.trim() ? { filter: filterTerm } : undefined,
      )) as Record<string, unknown>[];
      setRows(list.map(toRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load airlines');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const validateLive = (field: AirlineField, value: string) => {
    if (field === 'name') {
      setFieldError(
        'name',
        runValidators(
          required(value, 'Airline name'),
          minLength(value, 2, 'Airline name'),
          maxLength(value, 100, 'Airline name'),
        ),
      );
      return;
    }
    if (field === 'parentCompanyName') {
      setFieldError(
        'parentCompanyName',
        runValidators(maxLength(value, 200, 'Parent company name')),
      );
      return;
    }
    setFieldError(
      'code',
      runValidators(required(value, 'Airline code'), validateAirlineCode(value)),
    );
  };

  const handleSave = async () => {
    const rawName = normalizeText(form.name);
    const rawCode = form.code.trim().toUpperCase();

    const rawParent = form.parentCompanyName.trim();
    const next = validateFormValues(
      { name: rawName, code: rawCode, parentCompanyName: rawParent },
      {
        name: { label: 'Airline name', required: true, minLength: 2, maxLength: 100 },
        code: { label: 'Airline code', required: true, airlineCode: true },
        parentCompanyName: { label: 'Parent company name', maxLength: 200 },
      },
    );

    if (isNameDuplicate(rawName, editingId)) {
      next.name = 'This airline name already exists. Name must be unique.';
    }
    if (isCodeDuplicate(rawCode, editingId)) {
      next.code = 'This airline code already exists. Code must be unique.';
    }

    if (applyAndFocus(next)) return;

    const name = toProperCase(rawName);
    const code = rawCode;
    const parentCompanyName = rawParent;

    setLoading(true);
    try {
      const body = { name, code, parentCompanyName };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Saved successfully');
      }
      setForm(EMPTY_FORM);
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

  const handleCancelEdit = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    clearAll();
  };

  const handleEdit = (row: AirlineRow) => {
    setForm({
      name: row.name,
      code: row.code,
      parentCompanyName: row.parentCompanyName,
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
        setForm(EMPTY_FORM);
        clearAll();
      }
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const filteredRows = filter.trim()
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(filter.toLowerCase()) ||
          r.code.toLowerCase().includes(filter.toLowerCase()) ||
          r.parentCompanyName.toLowerCase().includes(filter.toLowerCase()),
      )
    : rows;

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID_4}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-name">
                Airline Name
              </label>
              <input
                id="field-name"
                name="name"
                type="text"
                value={form.name}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'field-name-error' : undefined}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name }));
                  clearField('name');
                }}
                onBlur={(e) => {
                  const name = toProperCase(e.target.value);
                  setForm((f) => ({ ...f, name }));
                  validateLive('name', name);
                }}
                className={gatewayControlClass(!!errors.name)}
                placeholder="e.g. Indigo Airlines"
                maxLength={100}
                disabled={loading}
              />
              <FormFieldError id="field-name-error" message={errors.name} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-code">
                Airline Code
              </label>
              <input
                id="field-code"
                name="code"
                type="text"
                value={form.code}
                aria-invalid={!!errors.code}
                aria-describedby={errors.code ? 'field-code-error' : undefined}
                onChange={(e) => {
                  const code = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 5);
                  setForm((f) => ({ ...f, code }));
                  clearField('code');
                }}
                onBlur={() => validateLive('code', form.code)}
                className={`${gatewayControlClass(!!errors.code)} uppercase`}
                placeholder="e.g. 6E or A359"
                maxLength={5}
                disabled={loading}
              />
              <FormFieldError id="field-code-error" message={errors.code} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-parentCompanyName">
                Parent Company Name
              </label>
              <input
                id="field-parentCompanyName"
                name="parentCompanyName"
                type="text"
                value={form.parentCompanyName}
                aria-invalid={!!errors.parentCompanyName}
                aria-describedby={
                  errors.parentCompanyName ? 'field-parentCompanyName-error' : undefined
                }
                onChange={(e) => {
                  const parentCompanyName = e.target.value;
                  setForm((f) => ({ ...f, parentCompanyName }));
                  clearField('parentCompanyName');
                }}
                onBlur={(e) => validateLive('parentCompanyName', e.target.value.trim())}
                className={gatewayControlClass(!!errors.parentCompanyName)}
                placeholder="e.g. Interglobe Aviation Limited"
                maxLength={200}
                disabled={loading}
                autoComplete="organization"
              />
              <FormFieldError
                id="field-parentCompanyName-error"
                message={errors.parentCompanyName}
              />
            </div>
            <div className={GATEWAY_FORM_ACTIONS}>
              <motion.button
                type="button"
                onClick={() => void handleSave()}
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={GATEWAY_SAVE_BTN}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {loading ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </motion.button>
              {editingId && (
                <motion.button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={GATEWAY_SECONDARY_BTN}
                >
                  Cancel
                </motion.button>
              )}
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
              placeholder="Filter by name, code, or parent company..."
              className={GATEWAY_FILTER_INPUT}
            />
          </div>
          <AdvanceGatewayExportButton
            disabled={listLoading}
            emptyMessage="No airlines to export."
            exportParams={{
              sheetName: 'Airline',
              fileName: 'advance-airline.xlsx',
              headers: ['Airline Name', 'Airline Code', 'Parent Company Name'],
              rows: filteredRows.map((row) => [row.name, row.code, row.parentCompanyName]),
            }}
          />
        </div>
        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="min-w-[680px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Airline Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Airline Code</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Parent Company Name</th>
                <th className="w-20 px-4 py-3 text-right font-semibold text-gray-700">Edit</th>
                <th className="w-20 px-4 py-3 text-right font-semibold text-gray-700">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No airlines yet. Add one above.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const editable = rowIsEditable(row);
                  return (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900">
                      <span className="inline-flex items-center gap-2">
                        <GatewayStationMark code={row.stationCode} />
                        {row.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.code}</td>
                    <td className="px-4 py-3 text-gray-700">{row.parentCompanyName || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <motion.button
                        type="button"
                        onClick={() => editable && handleEdit(row)}
                        disabled={!editable}
                        whileHover={editable ? { scale: 1.05 } : undefined}
                        whileTap={editable ? { scale: 0.95 } : undefined}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                        title={editable ? 'Edit' : 'View only — belongs to another station'}
                      >
                        <Pencil className="h-4 w-4" />
                      </motion.button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <motion.button
                        type="button"
                        onClick={() => editable && void handleDelete(row.id)}
                        disabled={!editable}
                        whileHover={editable ? { scale: 1.05 } : undefined}
                        whileTap={editable ? { scale: 0.95 } : undefined}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                        title={editable ? 'Delete' : 'View only — belongs to another station'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </motion.button>
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
