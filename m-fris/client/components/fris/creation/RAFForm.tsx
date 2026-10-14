'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Save, FileUp, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  advanceDocId,
  fetchCreationRafByDateRange,
  fetchCreationRafReferenceAirlines,
  saveCreationRaf,
  type CreationRafRecord,
} from '@/lib/api';
import { getErrorMessage } from '@/lib/error-utils';
import { CreationFlightsTableDateRange } from '@/components/fris/creation/CreationFlightsTableDateRange';
import { defaultTableDateRange } from '@/components/fris/creation/creationTableDateRange';
import { ScrollToError } from '@/components/ui/form-error-alert';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  airlineCode as validateAirlineCode,
  creationFlightNumber,
  displayDate,
  flightRouting,
  normalizeText,
  required,
  runValidators,
  sanitizeFlightNoInput,
  time24,
  aircraftBody,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  CREATION_INVALID_CONTROL,
  CREATION_INVALID_PICKER_WRAP,
  mapCreationApiErrorToField,
  RAF_FIELD_ORDER,
  validateRafForm,
  type RafField,
} from '@/lib/form-validation/creation';
import { cn } from '@/lib/utils';

const OPS_TYPE_OPTIONS = [
  'Turnaround',
  'Transit',
  'Technical',
  'Originate',
  'Terminate',
  'Ferry In/Ferry Out',
  'Load In/Ferry Out',
  'Ramp Handling Only',
];

const RAF_SKD_NON_SKD_FIXED = 'Non-Scheduled';

type NsAirlineOption = {
  id: string;
  name: string;
  code: string;
};

function toNsAirlineOption(doc: Record<string, unknown>): NsAirlineOption | null {
  const d = advanceDocId(doc);
  const name = String(d.airline ?? d.airlines ?? d.name ?? '').trim();
  const code = String(d.airlineCode ?? d.code ?? '')
    .trim()
    .toUpperCase();
  if (!name) return null;
  return { id: d.id, name, code };
}

const CATEGORY_OPTIONS = [
  'International',
  'Domestic',
  'International BME',
  'Domestic BME',
  'International-Cargo',
  'Domestic-Cargo',
  'International-Domestic',
  'Domestic-International',
];

export interface RAFFlightRow {
  id: string;
  serialNo: string;
  airline: string;
  flightNo: string;
  staDate: string;
  stdDate: string;
  cateOfFlight: string;
}

function formatDisplayDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function rafRecordToTableRow(record: CreationRafRecord): RAFFlightRow {
  const id = String(record._id ?? `row-${record.serialNo ?? ''}-${record.flightNo ?? ''}`);
  return {
    id,
    serialNo: String(record.serialNo ?? '').trim() || '—',
    airline: String(record.airlines ?? '').trim(),
    flightNo: String(record.flightNo ?? '').trim(),
    staDate: String(record.date ?? '').trim() || '—',
    stdDate: String(record.date2 ?? '').trim() || '—',
    cateOfFlight: String(record.categoryOfFlight ?? '').trim() || '—',
  };
}

function mergeRafRecords(records: CreationRafRecord[]): CreationRafRecord[] {
  const seen = new Set<string>();
  const merged: CreationRafRecord[] = [];
  for (const record of records) {
    const key = String(record._id ?? `${record.serialNo ?? ''}|${record.flightNo ?? ''}|${record.date ?? ''}`);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  return merged;
}

export default function RAFForm() {
  const today = new Date();
  const [airlineOptions, setAirlineOptions] = useState<NsAirlineOption[]>([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableLoadError, setTableLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    airlines: '',
    flightNo: '',
    routing: '',
    aBody: 'NB',
    opsType: 'Turnaround',
    airlineCode: '',
    acType: '',
    staTime: '00:00',
    stdTime: '00:00',
    skdNonSkd: RAF_SKD_NON_SKD_FIXED,
    date: formatDisplayDate(today),
    date2: formatDisplayDate(today),
    categoryOfFlight: 'International',
  });
  const [tableRows, setTableRows] = useState<RAFFlightRow[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [tableFromDate, setTableFromDate] = useState(() => defaultTableDateRange(today).fromDate);
  const [tableToDate, setTableToDate] = useState(() => defaultTableDateRange(today).toDate);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<RafField>(RAF_FIELD_ORDER);
  const airlineDropdownOptions = useMemo(
    () => airlineOptions.map((a) => ({ value: a.name, label: a.name || a.code })),
    [airlineOptions],
  );

  const loadAirlines = useCallback(async () => {
    setAirlinesLoading(true);
    try {
      const list = (await fetchCreationRafReferenceAirlines()) as Record<string, unknown>[];
      const opts = list
        .map(toNsAirlineOption)
        .filter((row): row is NsAirlineOption => row !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      setAirlineOptions(opts);
    } catch (err) {
      setAirlineOptions([]);
      toast.error(getErrorMessage(err, 'Failed to load non-scheduled airlines.'));
    } finally {
      setAirlinesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAirlines();
  }, [loadAirlines]);

  const loadTableForRange = useCallback(async (fromDate: string, toDate: string) => {
    if (!fromDate.trim() || !toDate.trim()) {
      setTableRows([]);
      setTableLoadError(null);
      return;
    }
    setTableLoading(true);
    setTableLoadError(null);
    try {
      const res = await fetchCreationRafByDateRange(fromDate, toDate);
      const merged = mergeRafRecords(res.rows ?? []);
      setTableRows(merged.map(rafRecordToTableRow));
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load RAF flights.');
      setTableLoadError(message);
      setTableRows([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTableForRange(tableFromDate, tableToDate);
  }, [tableFromDate, tableToDate, loadTableForRange]);

  const handleInputChange = useCallback(
    (field: RafField | string, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setSaveError(null);
      if ((RAF_FIELD_ORDER as readonly string[]).includes(field)) {
        clearField(field as RafField);
      }
    },
    [clearField],
  );

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const next = validateRafForm(formData);
    if (applyAndFocus(next)) {
      setSaveError('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const airlines = normalizeText(formData.airlines);
      const flightNo = normalizeText(formData.flightNo).toUpperCase().replace(/\s/g, '');
      const airlineCode = formData.airlineCode.trim().toUpperCase();
      const res = await saveCreationRaf({
        airlines,
        flightNo,
        acType: formData.acType.trim(),
        aBody: formData.aBody.trim().toUpperCase(),
        airlineCode,
        routing: normalizeText(formData.routing),
        staTime: formData.staTime,
        stdTime: formData.stdTime,
        date: formData.date.trim(),
        date2: formData.date2.trim(),
        opsType: formData.opsType,
        skdNonSkd: RAF_SKD_NON_SKD_FIXED,
        categoryOfFlight: formData.categoryOfFlight,
      });
      const savedSerial = String(res.serialNo ?? res.record?.serialNo ?? '').trim();
      toast.success(
        savedSerial
          ? `RAF flight saved (serial ${savedSerial}).`
          : 'RAF flight saved to database.',
      );
      if (res.record) {
        const savedRow = rafRecordToTableRow(res.record);
        setTableRows((prev) => {
          if (prev.some((row) => row.id === savedRow.id)) return prev;
          return [savedRow, ...prev];
        });
      }
      clearAll();
      setFormData({
        airlines: '',
        flightNo: '',
        routing: '',
        aBody: 'NB',
        opsType: 'Turnaround',
        airlineCode: '',
        acType: '',
        staTime: '00:00',
        stdTime: '00:00',
        skdNonSkd: RAF_SKD_NON_SKD_FIXED,
        date: formatDisplayDate(new Date()),
        date2: formatDisplayDate(new Date()),
        categoryOfFlight: 'International',
      });
      await loadTableForRange(tableFromDate, tableToDate);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save RAF flight.');
      const mapped = mapCreationApiErrorToField(msg);
      if (mapped && (RAF_FIELD_ORDER as readonly string[]).includes(mapped.field)) {
        setFieldError(mapped.field as RafField, mapped.message);
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [
    applyAndFocus,
    clearAll,
    formData,
    loadTableForRange,
    setFieldError,
    tableFromDate,
    tableToDate,
  ]);

  const inputClass =
    'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none';
  const selectClass =
    'min-h-11 w-full rounded-xl border border-slate-200 !bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus-visible:outline-none cursor-pointer';
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const fieldWrapClass = 'min-w-0';
  const control = (invalid?: boolean) => cn(inputClass, invalid && CREATION_INVALID_CONTROL);
  const selectControl = (invalid?: boolean) => cn(selectClass, invalid && CREATION_INVALID_CONTROL);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-amber-300 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-airlines-label" htmlFor="field-airlines">
              Airlines <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              id="field-airlines"
              value={formData.airlines}
              onChange={(v) => {
                const selected = airlineOptions.find((a) => a.name === v);
                const code = selected?.code ?? '';
                setFormData((prev) => ({
                  ...prev,
                  airlines: v,
                  airlineCode: code,
                }));
                setSaveError(null);
                clearField('airlines');
                clearField('airlineCode');
              }}
              options={[
                ...(formData.airlines &&
                !airlineOptions.some((a) => a.name === formData.airlines)
                  ? [{ value: formData.airlines, label: formData.airlines }]
                  : []),
                ...airlineDropdownOptions,
              ]}
              placeholder={
                airlinesLoading
                  ? 'Loading airlines…'
                  : airlineDropdownOptions.length === 0
                    ? 'No airlines for this station'
                    : 'Select airline'
              }
              disabled={airlinesLoading || saving}
              className={selectControl(!!errors.airlines)}
              aria-invalid={!!errors.airlines}
              aria-labelledby="field-airlines-label"
              aria-describedby={errors.airlines ? 'field-airlines-error' : undefined}
            />
            {!airlinesLoading && airlineDropdownOptions.length === 0 ? (
              <p className="mt-1.5 text-xs text-slate-500">
                No non-scheduled airlines for this station. Add them under Advance → Non Scheduled
                Airline.
              </p>
            ) : null}
            <FormFieldError id="field-airlines-error" message={errors.airlines} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-flightNo">
              Flight No <span className="text-red-500">*</span>
            </label>
            <input
              id="field-flightNo"
              name="flightNo"
              type="text"
              value={formData.flightNo}
              aria-invalid={!!errors.flightNo}
              aria-describedby={errors.flightNo ? 'field-flightNo-error' : undefined}
              onChange={(e) =>
                handleInputChange('flightNo', sanitizeFlightNoInput(e.target.value))
              }
              onBlur={(e) => {
                const flightNo = normalizeText(e.target.value).toUpperCase().replace(/\s/g, '');
                setFormData((prev) => ({ ...prev, flightNo }));
                setFieldError(
                  'flightNo',
                  runValidators(required(flightNo, 'Flight number'), creationFlightNumber(flightNo)),
                );
              }}
              className={cn(control(!!errors.flightNo), 'uppercase')}
              placeholder="Flight No"
              maxLength={16}
              disabled={saving}
            />
            <FormFieldError id="field-flightNo-error" message={errors.flightNo} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-airlineCode">
              Airline Code <span className="text-red-500">*</span>
            </label>
            <input
              id="field-airlineCode"
              name="airlineCode"
              type="text"
              value={formData.airlineCode}
              aria-invalid={!!errors.airlineCode}
              aria-describedby={errors.airlineCode ? 'field-airlineCode-error' : undefined}
              onChange={(e) =>
                handleInputChange(
                  'airlineCode',
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5),
                )
              }
              onBlur={(e) => {
                const airlineCode = e.target.value.trim().toUpperCase();
                setFormData((prev) => ({ ...prev, airlineCode }));
                setFieldError(
                  'airlineCode',
                  runValidators(required(airlineCode, 'Airline code'), validateAirlineCode(airlineCode)),
                );
              }}
              className={cn(control(!!errors.airlineCode), 'uppercase')}
              placeholder="e.g. 6E"
              maxLength={5}
              disabled={saving}
            />
            <FormFieldError id="field-airlineCode-error" message={errors.airlineCode} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-acType">
              AC Type <span className="text-red-500">*</span>
            </label>
            <input
              id="field-acType"
              name="acType"
              type="text"
              value={formData.acType}
              aria-invalid={!!errors.acType}
              aria-describedby={errors.acType ? 'field-acType-error' : undefined}
              onChange={(e) => handleInputChange('acType', e.target.value)}
              onBlur={(e) => {
                const acType = normalizeText(e.target.value);
                setFormData((prev) => ({ ...prev, acType }));
                setFieldError('acType', required(acType, 'Aircraft type'));
              }}
              className={control(!!errors.acType)}
              placeholder="Aircraft type"
              maxLength={40}
              disabled={saving}
            />
            <FormFieldError id="field-acType-error" message={errors.acType} />
          </div>
          <div className={cn(fieldWrapClass, errors.date && CREATION_INVALID_PICKER_WRAP)}>
            <label className={labelClass} htmlFor="field-date">
              STA Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              id="field-date"
              value={formData.date}
              onChange={(v) => handleInputChange('date', v)}
              ariaLabel="STA date"
            />
            <FormFieldError id="field-date-error" message={errors.date} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-routing">
              Routing
            </label>
            <input
              id="field-routing"
              name="routing"
              type="text"
              value={formData.routing}
              aria-invalid={!!errors.routing}
              aria-describedby={errors.routing ? 'field-routing-error' : undefined}
              onChange={(e) => handleInputChange('routing', e.target.value)}
              onBlur={(e) => {
                const routing = normalizeText(e.target.value);
                setFormData((prev) => ({ ...prev, routing }));
                setFieldError('routing', flightRouting(routing));
              }}
              className={control(!!errors.routing)}
              placeholder="Routing"
              maxLength={80}
              disabled={saving}
            />
            <FormFieldError id="field-routing-error" message={errors.routing} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass}>
              STA (24h) <span className="text-red-500">*</span>
            </label>
            <TimeSelect24
              value={formData.staTime}
              onChange={(v) => {
                handleInputChange('staTime', v);
                setFieldError('staTime', time24(v, 'STA time'));
              }}
              className={cn('w-full max-w-full', errors.staTime && CREATION_INVALID_CONTROL)}
              disabled={saving}
            />
            <FormFieldError id="field-staTime-error" message={errors.staTime} />
          </div>
          <div className={cn(fieldWrapClass, errors.date2 && CREATION_INVALID_PICKER_WRAP)}>
            <label className={labelClass} htmlFor="field-date2">
              STD Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              id="field-date2"
              value={formData.date2}
              onChange={(v) => {
                handleInputChange('date2', v);
                setFieldError('date2', displayDate(v, 'STD date'));
              }}
              ariaLabel="STD date"
            />
            <FormFieldError id="field-date2-error" message={errors.date2} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-aBody">
              Aircraft Body <span className="text-red-500">*</span>
            </label>
            <input
              id="field-aBody"
              name="aBody"
              type="text"
              value={formData.aBody}
              aria-invalid={!!errors.aBody}
              aria-describedby={errors.aBody ? 'field-aBody-error' : undefined}
              onChange={(e) =>
                handleInputChange('aBody', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))
              }
              onBlur={(e) => {
                const aBody = e.target.value.trim().toUpperCase();
                setFormData((prev) => ({ ...prev, aBody }));
                setFieldError('aBody', runValidators(required(aBody, 'Aircraft body'), aircraftBody(aBody)));
              }}
              className={cn(control(!!errors.aBody), 'uppercase')}
              placeholder="NB / WB"
              maxLength={2}
              disabled={saving}
            />
            <FormFieldError id="field-aBody-error" message={errors.aBody} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass}>
              STD (24h) <span className="text-red-500">*</span>
            </label>
            <TimeSelect24
              value={formData.stdTime}
              onChange={(v) => {
                handleInputChange('stdTime', v);
                setFieldError('stdTime', time24(v, 'STD time'));
              }}
              className={cn('w-full max-w-full', errors.stdTime && CREATION_INVALID_CONTROL)}
              disabled={saving}
            />
            <FormFieldError id="field-stdTime-error" message={errors.stdTime} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-opsType-label">
              Ops Type <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.opsType}
              onChange={(v) => handleInputChange('opsType', v)}
              options={OPS_TYPE_OPTIONS}
              className={selectControl(!!errors.opsType)}
              aria-invalid={!!errors.opsType}
              aria-labelledby="field-opsType-label"
              disabled={saving}
            />
            <FormFieldError id="field-opsType-error" message={errors.opsType} />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-skdNonSkd">
              Skd/Non Skd
            </label>
            <input
              id="field-skdNonSkd"
              name="skdNonSkd"
              type="text"
              value={RAF_SKD_NON_SKD_FIXED}
              readOnly
              aria-readonly
              className={cn(
                inputClass,
                'cursor-not-allowed bg-slate-100 text-slate-600 shadow-none focus:border-slate-200 focus:ring-0',
              )}
            />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-categoryOfFlight-label">
              Category Of Flight <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.categoryOfFlight}
              onChange={(v) => handleInputChange('categoryOfFlight', v)}
              options={CATEGORY_OPTIONS}
              className={selectControl(!!errors.categoryOfFlight)}
              aria-invalid={!!errors.categoryOfFlight}
              aria-labelledby="field-categoryOfFlight-label"
              disabled={saving}
            />
            <FormFieldError id="field-categoryOfFlight-error" message={errors.categoryOfFlight} />
          </div>
        </div>

        <ScrollToError
          error={saveError}
          className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </ScrollToError>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-medium text-white shadow transition hover:bg-amber-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* CSV Import */}
      <div className="rounded-2xl border border-amber-300 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Import flight data from CSV</h3>
        <p className="mb-3 text-sm text-slate-500">Data will be imported into RAF.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition hover:bg-slate-50">
            <FileUp className="h-4 w-4 text-slate-500" />
            <span>Import CSV File</span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <span className="text-sm text-slate-500">{csvFile ? csvFile.name : 'No file chosen'}</span>
          <button
            type="button"
            className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-amber-700"
          >
            CSV Import Creation
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-sm">
        <CreationFlightsTableDateRange
          title="Flight created for the selected date"
          fromDate={tableFromDate}
          toDate={tableToDate}
          onFromDateChange={setTableFromDate}
          onToDateChange={setTableToDate}
        />
        {tableLoadError ? (
          <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {tableLoadError}
          </div>
        ) : null}
        {tableLoading ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading saved flights…</p>
        ) : tableRows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            No RAF flights saved between {tableFromDate} and {tableToDate}. Fill the form above and
            click Save to add one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Serial No</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Airline</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Flight No</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">STA date</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">STD date</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Category</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 transition hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-900">{row.serialNo}</td>
                    <td className="px-5 py-3 text-slate-900">{row.airline}</td>
                    <td className="px-5 py-3 text-slate-900">{row.flightNo}</td>
                    <td className="px-5 py-3 text-slate-900">{row.staDate}</td>
                    <td className="px-5 py-3 text-slate-900">{row.stdDate}</td>
                    <td className="px-5 py-3 text-slate-900">{row.cateOfFlight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
