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
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  airlineCode as validateAirlineCode,
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
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_GET_BTN,
  GATEWAY_SAVE_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

export type NonScheduledAirlineRow = {
  id: string;
  airline: string;
  airlineCode: string;
};

const PATH = ADVANCE_PATHS.nonScheduledAirline;
const FIELD_ORDER = ['airline', 'airlineCode'] as const;
type NonScheduledAirlineField = (typeof FIELD_ORDER)[number];

function toRow(doc: Record<string, unknown>): NonScheduledAirlineRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    airline: String(d.airline ?? ''),
    airlineCode: String(d.airlineCode ?? ''),
  };
}

export default function NonScheduledAirlinePage() {
  const [form, setForm] = useState({
    airline: '',
    airlineCode: '',
  });
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<NonScheduledAirlineRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<NonScheduledAirlineField>(FIELD_ORDER);

  const fetchList = useCallback(async (filterTerm?: string) => {
    setListLoading(true);
    try {
      const list = (await advanceList(PATH, filterTerm?.trim() ? { filter: filterTerm } : undefined)) as Record<string, unknown>[];
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

  const handleGet = () => fetchList(filter);

  const handleSave = async () => {
    const airline = normalizeText(form.airline);
    const airlineCode = form.airlineCode.trim().toUpperCase();
    const next = validateFormValues(
      { airline, airlineCode },
      {
        airline: { label: 'Airline', required: true, minLength: 2, personName: true },
        airlineCode: { label: 'Airline code', required: true, airlineCode: true },
      },
    );
    if (applyAndFocus(next)) return;

    setLoading(true);
    try {
      const body = {
        airline,
        airlineCode,
      };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Created successfully');
      }
      setForm({ airline: '', airlineCode: '' });
      setEditingId(null);
      clearAll();
      await fetchList(filter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('airline', msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row: NonScheduledAirlineRow) => {
    setForm({ airline: row.airline, airlineCode: row.airlineCode });
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

  const filteredRows = filter.trim()
    ? rows.filter(
        (r) =>
          r.airline.toLowerCase().includes(filter.toLowerCase()) ||
          r.airlineCode.toLowerCase().includes(filter.toLowerCase())
      )
    : rows;

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-airline">Airline</label>
              <input
                id="field-airline"
                name="airline"
                type="text"
                value={form.airline}
                aria-invalid={!!errors.airline}
                aria-describedby={errors.airline ? 'field-airline-error' : undefined}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => ({ ...f, airline: value }));
                  setFieldError('airline', value ? personName(value, 'Airline') : null);
                }}
                onBlur={(e) => {
                  const airline = normalizeText(e.target.value);
                  setForm((f) => ({ ...f, airline }));
                  setFieldError(
                    'airline',
                    runValidators(required(airline, 'Airline'), personName(airline, 'Airline')),
                  );
                }}
                className={gatewayControlClass(!!errors.airline)}
                placeholder="Airline"
                disabled={loading}
              />
              <FormFieldError id="field-airline-error" message={errors.airline} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-airlineCode">Airline Code</label>
              <input
                id="field-airlineCode"
                name="airlineCode"
                type="text"
                value={form.airlineCode}
                aria-invalid={!!errors.airlineCode}
                aria-describedby={errors.airlineCode ? 'field-airlineCode-error' : undefined}
                onChange={(e) => {
                  const airlineCode = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
                  setForm((f) => ({ ...f, airlineCode }));
                  clearField('airlineCode');
                }}
                onBlur={(e) => {
                  const airlineCode = e.target.value.trim().toUpperCase();
                  setForm((f) => ({ ...f, airlineCode }));
                  setFieldError(
                    'airlineCode',
                    runValidators(required(airlineCode, 'Airline code'), validateAirlineCode(airlineCode)),
                  );
                }}
                className={`${gatewayControlClass(!!errors.airlineCode)} uppercase`}
                placeholder="e.g. AEL"
                maxLength={5}
                disabled={loading}
              />
              <FormFieldError id="field-airlineCode-error" message={errors.airlineCode} />
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
              placeholder="Filter by airline or code..."
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
            emptyMessage="No non-scheduled airlines to export."
            exportParams={{
              sheetName: 'Non Scheduled Airline',
              fileName: 'advance-non-scheduled-airline.xlsx',
              headers: ['Airline', 'Airline Code'],
              rows: filteredRows.map((row) => [row.airline, row.airlineCode]),
            }}
          />
        </div>
        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Airline</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Airline Code</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right w-24">Edit</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right w-24">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No data. Add a record or adjust filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900">{row.airline}</td>
                    <td className="px-4 py-3 text-gray-700">{row.airlineCode}</td>
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
