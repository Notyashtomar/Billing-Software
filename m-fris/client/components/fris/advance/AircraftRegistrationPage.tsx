'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, Search, X, Upload, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  advanceList,
  advanceCreate,
  advanceUpdate,
  advanceDelete,
  advanceBulkCreate,
  advanceDocId,
  ADVANCE_PATHS,
  fetchAircraftRegistrationReferenceAirlines,
  fetchAircraftRegistrationReferenceAircraft,
} from '@/lib/api';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { AdvanceGatewayExportButton } from '@/components/fris/advance/AdvanceGatewayExportButton';
import { advanceBoolLabel } from '@/components/fris/advance/exportAdvanceGatewayExcel';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { required, validateFormValues } from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  GATEWAY_PAGE_ROOT,
  GATEWAY_FORM_SECTION,
  GATEWAY_FORM_INNER,
  GATEWAY_FORM_GRID_5,
  GATEWAY_FORM_FIELD,
  GATEWAY_FORM_ACTIONS,
  GATEWAY_LABEL,
  GATEWAY_LABEL_SPACER,
  GATEWAY_CHECKBOX_CONTROL,
  GATEWAY_CHECKBOX_INPUT,
  GATEWAY_CONTROL,
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_GET_BTN,
  GATEWAY_SAVE_BTN,
  GATEWAY_SECONDARY_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

export type AircraftRegistrationRow = {
  id: string;
  airline: string;
  regnNo: string;
  aircraft: string;
  mtow: string;
  active: boolean;
};

const PATH = ADVANCE_PATHS.aircraftRegistration;
const CSV_TEMPLATE = 'Airline,REGN No.,Aircraft,MTOW,Active\nAERO NOMAD,VT-ABC,B737-800,79016,true\n';
const FIELD_ORDER = ['airline', 'aircraft', 'regnNo'] as const;
type AircraftRegistrationField = (typeof FIELD_ORDER)[number];

type AdvanceAirlineOption = {
  id: string;
  name: string;
  code: string;
};

type AdvanceAircraftOption = {
  type: string;
  mtow: string;
};

function toAirlineOption(doc: Record<string, unknown>): AdvanceAirlineOption {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    name: String(d.name ?? '').trim(),
    code: String(d.code ?? '').trim(),
  };
}

function buildAircraftOptions(list: Record<string, unknown>[]): AdvanceAircraftOption[] {
  const byType = new Map<string, AdvanceAircraftOption>();
  for (const doc of list) {
    const d = advanceDocId(doc);
    const type = String(d.aircraft ?? '').trim();
    if (!type) continue;
    const key = type.toLowerCase();
    if (!byType.has(key)) {
      byType.set(key, { type, mtow: String(d.mtow ?? '').trim() });
    }
  }
  return [...byType.values()].sort((a, b) => a.type.localeCompare(b.type));
}

function toRow(doc: Record<string, unknown>): AircraftRegistrationRow {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    airline: String(d.airline ?? ''),
    regnNo: String(d.regnNo ?? ''),
    aircraft: String(d.aircraft ?? ''),
    mtow: String(d.mtow ?? ''),
    active: Boolean(d.active),
  };
}

export default function AircraftRegistrationPage() {
  const [form, setForm] = useState({
    airline: '',
    regnNo: '',
    aircraft: '',
    mtow: '',
    active: true,
  });
  const [rows, setRows] = useState<AircraftRegistrationRow[]>([]);
  const [airlineOptions, setAirlineOptions] = useState<AdvanceAirlineOption[]>([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);
  const [aircraftOptions, setAircraftOptions] = useState<AdvanceAircraftOption[]>([]);
  const [aircraftLoading, setAircraftLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<AircraftRegistrationField>(FIELD_ORDER);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const airlineDropdownOptions = useMemo(
    () =>
      airlineOptions.map((a) => ({
        value: a.name,
        label: a.name || a.code,
      })),
    [airlineOptions],
  );
  const aircraftDropdownOptions = useMemo(
    () => aircraftOptions.map((a) => ({ value: a.type, label: a.type })),
    [aircraftOptions],
  );

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

  React.useEffect(() => {
    let mounted = true;
    async function loadMasters() {
      setAirlinesLoading(true);
      setAircraftLoading(true);
      try {
        const [airlines, aircraft] = await Promise.all([
          fetchAircraftRegistrationReferenceAirlines(),
          fetchAircraftRegistrationReferenceAircraft(),
        ]);
        if (!mounted) return;
        const airlineOpts = (airlines as Record<string, unknown>[])
          .map(toAirlineOption)
          .filter((a) => a.id && (a.name || a.code))
          .sort((a, b) => a.name.localeCompare(b.name));
        setAirlineOptions(airlineOpts);
        setAircraftOptions(buildAircraftOptions(aircraft as Record<string, unknown>[]));
      } catch (e) {
        if (!mounted) return;
        setAirlineOptions([]);
        setAircraftOptions([]);
        toast.error(e instanceof Error ? e.message : 'Failed to load airline/aircraft options');
      } finally {
        if (!mounted) return;
        setAirlinesLoading(false);
        setAircraftLoading(false);
      }
    }
    loadMasters();
    return () => {
      mounted = false;
    };
  }, []);

  const normalizeKey = (v: string) => v.trim().toUpperCase();
  const isDuplicateByAirlineAircraftRegn = (
    airline: string,
    aircraft: string,
    regnNo: string,
    excludeId?: string | null
  ) => {
    const a = normalizeKey(airline);
    const ac = normalizeKey(aircraft);
    const r = normalizeKey(regnNo);
    if (!a || !ac || !r) return false;
    return rows.some(
      (row) =>
        row.id !== excludeId &&
        normalizeKey(row.airline) === a &&
        normalizeKey(row.aircraft) === ac &&
        normalizeKey(row.regnNo) === r
    );
  };

  const handleSave = async () => {
    const trimmed = form.regnNo.trim();
    const next = validateFormValues(
      { airline: form.airline, aircraft: form.aircraft, regnNo: trimmed },
      {
        airline: { label: 'airline', select: true },
        aircraft: { label: 'aircraft', select: true },
        regnNo: { label: 'REGN No.', required: true },
      },
    );
    if (isDuplicateByAirlineAircraftRegn(form.airline, form.aircraft, trimmed, editingId)) {
      next.regnNo = 'REGN No. must be unique for the selected Airline + Aircraft.';
    }
    if (applyAndFocus(next)) return;
    setLoading(true);
    try {
      const body = {
        airline: form.airline,
        regnNo: trimmed.toUpperCase(),
        aircraft: form.aircraft,
        mtow: form.mtow,
        active: form.active,
      };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Created successfully');
      }
      setForm({ airline: '', regnNo: '', aircraft: '', mtow: '', active: true });
      setEditingId(null);
      clearAll();
      await fetchList(filter);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed';
      setFieldError('regnNo', message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setForm({ airline: '', regnNo: '', aircraft: '', mtow: '', active: true });
    setEditingId(null);
    clearAll();
  };

  const handleEdit = (row: AircraftRegistrationRow) => {
    setForm({
      airline: row.airline,
      regnNo: row.regnNo,
      aircraft: row.aircraft,
      mtow: row.mtow,
      active: row.active,
    });
    setEditingId(row.id);
    clearAll();
  };

  const handleDelete = async (id: string) => {
    try {
      await advanceDelete(PATH, id);
      toast.success('Deleted');
      if (editingId === id) handleCancel();
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCsvFile(file || null);
  };

  const handleCsvSubmit = async () => {
    if (!csvFile) return;
    const text = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string) ?? '');
      reader.onerror = () => rej(new Error('Failed to read file'));
      reader.readAsText(csvFile);
    });
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const toCreate: Record<string, unknown>[] = [];
    const seenCombo = new Set(
      rows.map(
        (r) =>
          `${normalizeKey(r.airline)}|${normalizeKey(r.aircraft)}|${normalizeKey(r.regnNo)}`
      )
    );
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      if (parts.length < 2) continue;
      const [airline, regnNo, aircraft, mtow, activeStr] = parts;
      const regnUpper = (regnNo || '').toUpperCase();
      const comboKey = `${normalizeKey(airline || '')}|${normalizeKey(aircraft || '')}|${regnUpper}`;
      if (!airline?.trim() || !aircraft?.trim() || !regnUpper || seenCombo.has(comboKey)) continue;
      seenCombo.add(comboKey);
      toCreate.push({
        airline: airline || '',
        regnNo: regnUpper,
        aircraft: aircraft || '',
        mtow: mtow || '',
        active: activeStr !== 'false' && activeStr !== '0',
      });
    }
    if (toCreate.length === 0) {
      toast.info('No new rows to add from CSV (empty or all duplicates).');
      setCsvFile(null);
      fileInputRef.current?.value && (fileInputRef.current.value = '');
      return;
    }
    setBulkLoading(true);
    try {
      await advanceBulkCreate(PATH, { rows: toCreate });
      toast.success(`Added ${toCreate.length} registration(s).`);
      setCsvFile(null);
      fileInputRef.current?.value && (fileInputRef.current.value = '');
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk upload failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDownloadCsvFormat = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aircraft-registration-format.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGet = () => fetchList(filter);

  const q = filter.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter(
        (r) =>
          r.airline.toLowerCase().includes(q) ||
          r.regnNo.toLowerCase().includes(q) ||
          r.aircraft.toLowerCase().includes(q) ||
          r.mtow.toLowerCase().includes(q)
      )
    : rows;

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className={GATEWAY_FORM_GRID_5}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-airline">Airline</label>
              <AdminRadioDropdown
                id="field-airline"
                value={form.airline}
                onChange={(v) => {
                  setForm((f) => ({ ...f, airline: v }));
                  clearField('airline');
                }}
                options={[
                  ...(form.airline &&
                  !airlineOptions.some((a) => a.name === form.airline)
                    ? [{ value: form.airline, label: form.airline }]
                    : []),
                  ...airlineDropdownOptions,
                ]}
                placeholder={airlinesLoading ? 'Loading airlines...' : 'Select'}
                disabled={airlinesLoading}
                className={gatewayControlClass(!!errors.airline)}
              />
              <FormFieldError id="field-airline-error" message={errors.airline} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-regnNo">REGN No.</label>
              <input
                id="field-regnNo"
                name="regnNo"
                type="text"
                value={form.regnNo}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    regnNo: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10),
                  }));
                  clearField('regnNo');
                }}
                onBlur={(e) => setFieldError('regnNo', required(e.target.value, 'REGN No.'))}
                maxLength={10}
                aria-invalid={!!errors.regnNo}
                aria-describedby={errors.regnNo ? 'field-regnNo-error' : undefined}
                className={`${gatewayControlClass(!!errors.regnNo)} uppercase`}
                placeholder="e.g. VT-ABC"
              />
              <FormFieldError id="field-regnNo-error" message={errors.regnNo} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-aircraft">Aircraft</label>
              <AdminRadioDropdown
                id="field-aircraft"
                value={form.aircraft}
                onChange={(nextType) => {
                  const selected = aircraftOptions.find((a) => a.type === nextType);
                  setForm((f) => ({
                    ...f,
                    aircraft: nextType,
                    mtow: selected?.mtow || f.mtow,
                  }));
                  clearField('aircraft');
                }}
                options={[
                  ...(form.aircraft &&
                  !aircraftOptions.some((a) => a.type === form.aircraft)
                    ? [{ value: form.aircraft, label: form.aircraft }]
                    : []),
                  ...aircraftDropdownOptions,
                ]}
                placeholder={aircraftLoading ? 'Loading aircraft...' : 'Select'}
                disabled={aircraftLoading}
                className={gatewayControlClass(!!errors.aircraft)}
              />
              <FormFieldError id="field-aircraft-error" message={errors.aircraft} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL}>MTOW</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.mtow}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mtow: e.target.value.replace(/[^0-9]/g, '') }))
                }
                className={GATEWAY_CONTROL}
                placeholder="MTOW (kg)"
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" />}
                {loading ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </motion.button>
              <motion.button
                type="button"
                onClick={handleCancel}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={GATEWAY_SECONDARY_BTN}
              >
                <X className="w-4 h-4" />
                Cancel
              </motion.button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex shrink-0 items-center gap-4">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-sm font-semibold uppercase text-gray-500">Or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvChange}
              className="hidden"
              id="aircraft-reg-csv"
            />
            <label
              htmlFor="aircraft-reg-csv"
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 text-sm text-gray-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50"
            >
              <Upload className="h-4 w-4" />
              Choose file
            </label>
            <span className="text-sm text-gray-500">{csvFile ? csvFile.name : 'No file chosen'}</span>
            <motion.button
              type="button"
              onClick={handleCsvSubmit}
              disabled={!csvFile || bulkLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`${GATEWAY_SAVE_BTN} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {bulkLoading ? 'Uploading...' : 'Submit Now'}
            </motion.button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Format of CSV download here{' '}
            <button
              type="button"
              onClick={handleDownloadCsvFormat}
              className="font-medium text-emerald-600 underline hover:text-emerald-700"
            >
              Download Now
            </button>
          </p>
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
              placeholder="Filter by airline, REGN, aircraft, MTOW..."
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
            emptyMessage="No aircraft registrations to export."
            exportParams={{
              sheetName: 'Aircraft Registration',
              fileName: 'advance-aircraft-registration.xlsx',
              headers: ['Airline', 'REGN No.', 'Aircraft', 'MTOW', 'Active'],
              rows: filteredRows.map((row) => [
                row.airline,
                row.regnNo,
                row.aircraft,
                row.mtow,
                advanceBoolLabel(row.active),
              ]),
            }}
          />
        </div>
        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Airline</th>
                <th className="px-4 py-3 font-semibold text-gray-700">REGN No.</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Aircraft</th>
                <th className="px-4 py-3 font-semibold text-gray-700">MTOW</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Active</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right w-24">Edit</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right w-24">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No data. Add a record, upload a CSV, use Get to refresh, or adjust filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900">{row.airline}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.regnNo}</td>
                    <td className="px-4 py-3 text-gray-700">{row.aircraft}</td>
                    <td className="px-4 py-3 text-gray-700">{row.mtow}</td>
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
