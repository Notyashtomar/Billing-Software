'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Save, FileUp, AlertCircle, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/lib/error-utils';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import {
  advanceDocId,
  bulkSaveCreationAdditionalFlights,
  downloadCreationAdditionalFlightsExcelTemplate,
  fetchCreationAdditionalFlightsByDateRange,
  importCreationAdditionalFlightsExcel,
  saveCreationAdditionalFlight,
  fetchAdditionalFlightsReferenceAirlines,
  fetchAdditionalFlightsReferenceAircraft,
  type CreationAdditionalFlightRecord,
  type FlightExcelImportResult,
} from '@/lib/api';
import { toast } from 'sonner';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  ADDITIONAL_FLIGHTS_CSV_TEMPLATE,
  parseAdditionalFlightsCsv,
} from '@/components/fris/creation/importAdditionalFlightsCsv';
import {
  FlightImportResultDialog,
  type FlightImportDialogError,
} from '@/components/fris/creation/FlightImportResultDialog';
import { CreationFlightsTableDateRange } from '@/components/fris/creation/CreationFlightsTableDateRange';
import { defaultTableDateRange } from '@/components/fris/creation/creationTableDateRange';
import { ScrollToError } from '@/components/ui/form-error-alert';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  creationFlightNumber,
  flightRouting,
  normalizeText,
  required,
  runValidators,
  sanitizeFlightNoInput,
  time24,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  ADDITIONAL_FLIGHTS_FIELD_ORDER,
  CREATION_INVALID_CONTROL,
  CREATION_INVALID_PICKER_WRAP,
  mapCreationApiErrorToField,
  validateAdditionalFlightsForm,
  validateAdditionalFlightsImportFile,
  type AdditionalFlightsField,
} from '@/lib/form-validation/creation';
import { cn } from '@/lib/utils';

type AdvanceAirlineOption = {
  id: string;
  name: string;
  code: string;
};

type AdvanceAircraftOption = {
  type: string;
  body: 'NB' | 'WB';
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
  const seen = new Set<string>();
  const out: AdvanceAircraftOption[] = [];
  for (const doc of list) {
    const d = advanceDocId(doc);
    const type = String(d.aircraft ?? '').trim();
    if (!type) continue;
    const key = type.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, body: d.aircraftBody === 'WB' ? 'WB' : 'NB' });
  }
  out.sort((a, b) => a.type.localeCompare(b.type));
  return out;
}

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

const SKD_NON_SKD_OPTIONS = ['Scheduled', 'Additional', 'Non-Scheduled'];

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

export interface AdditionalFlightRow {
  id: string;
  serialNo: string;
  airline: string;
  flightNo: string;
  staDate: string;
  stdDate: string;
  cateOfFlight: string;
  flightType: string;
  createdBy: string;
  createdOn: string;
  lastModified: string;
  status: string;
}

function additionalFlightRecordToTableRow(
  record: CreationAdditionalFlightRecord,
): AdditionalFlightRow {
  const id = String(record._id ?? `row-${Date.now()}`);
  const createdOn = record.createdAt
    ? new Date(record.createdAt).toLocaleString()
    : '—';
  const lastModified = record.updatedAt
    ? new Date(record.updatedAt).toLocaleString()
    : createdOn;
  return {
    id,
    serialNo: String(record.serialNo ?? '').trim() || '—',
    airline: String(record.airlines ?? '').trim(),
    flightNo: String(record.flightNo ?? '').trim(),
    staDate: String(record.operationDate ?? record.date ?? '').trim() || '—',
    stdDate: String(record.date2 ?? '').trim() || '—',
    cateOfFlight: String(record.categoryOfFlight ?? '').trim() || '—',
    flightType:
      String(record.flightType ?? record.skdNonSkd ?? 'Additional').trim() ||
      'Additional',
    createdBy: String(record.createdBy ?? '').trim() || '—',
    createdOn,
    lastModified,
    status: 'Open',
  };
}

function formatDisplayDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function startOfCalendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDisplayDate(ddMmYyyy: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddMmYyyy ?? '').trim());
  if (!m) return null;
  const parsed = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareDisplayDates(a: string, b: string): number {
  const da = parseDisplayDate(a);
  const db = parseDisplayDate(b);
  if (!da || !db) return 0;
  return startOfCalendarDay(da).getTime() - startOfCalendarDay(db).getTime();
}

/** Prefix flight number with airline code + hyphen (e.g. GF → GF-). */
function applyAirlineCodeToFlightNo(code: string, flightNo: string): string {
  const airlineCode = code.trim().toUpperCase();
  if (!airlineCode) return flightNo;
  const prefix = `${airlineCode}-`;
  const current = flightNo.trim();
  if (!current) return prefix;
  const suffix = current.replace(/^[A-Za-z0-9]{2,4}-/, '');
  if (current.toUpperCase().startsWith(prefix)) return current;
  return `${prefix}${suffix}`;
}

export default function AdditionalFlightsForm() {
  const today = useMemo(() => startOfCalendarDay(new Date()), []);
  const todayDisplay = useMemo(() => formatDisplayDate(today), [today]);
  const [airlineOptions, setAirlineOptions] = useState<AdvanceAirlineOption[]>([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);
  const [aircraftOptions, setAircraftOptions] = useState<AdvanceAircraftOption[]>([]);
  const [aircraftLoading, setAircraftLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    fileName?: string;
    totalRows?: number;
    importedRows?: number;
    failedRows?: number;
    message?: string;
    errors: FlightImportDialogError[];
    missingHeaders?: string[];
    duplicateHeaders?: string[];
    errorFileUrl?: string;
  } | null>(null);

  const showImportValidationDialog = useCallback(
    (payload: {
      fileName?: string;
      totalRows?: number;
      importedRows?: number;
      failedRows?: number;
      message?: string;
      errors?: FlightImportDialogError[];
      missingHeaders?: string[];
      duplicateHeaders?: string[];
      errorFileUrl?: string;
    }) => {
      setImportResult({
        fileName: payload.fileName,
        totalRows: payload.totalRows,
        importedRows: payload.importedRows ?? 0,
        failedRows: payload.failedRows ?? payload.errors?.length ?? 0,
        message: payload.message,
        errors: payload.errors ?? [],
        missingHeaders: payload.missingHeaders,
        duplicateHeaders: payload.duplicateHeaders,
        errorFileUrl: payload.errorFileUrl,
      });
      setImportResultOpen(true);
    },
    [],
  );

  const showExcelImportResult = useCallback(
    (res: FlightExcelImportResult, fileName: string) => {
      const imported = res.importedRows ?? 0;
      const failed = res.failedRows ?? res.errors?.length ?? 0;

      if (imported > 0 && failed === 0) {
        toast.success(
          `Successfully imported ${imported} row${imported === 1 ? '' : 's'}.`,
        );
        return;
      }

      showImportValidationDialog({
        fileName: res.fileName ?? fileName,
        totalRows: res.totalRows,
        importedRows: imported,
        failedRows: failed,
        message: res.message,
        errors: res.errors,
        missingHeaders: res.missingHeaders,
        duplicateHeaders: res.duplicateHeaders,
        errorFileUrl: res.errorFileUrl,
      });
    },
    [showImportValidationDialog],
  );
  const [formData, setFormData] = useState({
    airlines: '',
    flightNo: '',
    airlinesText: '',
    routing: '',
    aBody: 'NB',
    opsType: 'Turnaround',
    airlineCode: '',
    acType: '',
    staTime: '00:00',
    stdTime: '00:00',
    skdNonSkd: 'Additional',
    freighter: '',
    staDate: todayDisplay,
    stdDate: todayDisplay,
    categoryOfFlight: 'International',
  });
  const [tableRows, setTableRows] = useState<AdditionalFlightRow[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [tableFromDate, setTableFromDate] = useState(() => defaultTableDateRange(today).fromDate);
  const [tableToDate, setTableToDate] = useState(() => defaultTableDateRange(today).toDate);
  const [tableAirlineFilter, setTableAirlineFilter] = useState('');
  const [tableFlightFilter, setTableFlightFilter] = useState('');
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<AdditionalFlightsField>(ADDITIONAL_FLIGHTS_FIELD_ORDER);
  const airlineDropdownOptions = useMemo(
    () => airlineOptions.map((a) => ({ value: a.name, label: a.name || a.code })),
    [airlineOptions],
  );
  const aircraftDropdownOptions = useMemo(
    () => aircraftOptions.map((a) => ({ value: a.type, label: a.type })),
    [aircraftOptions],
  );

  const stdMinDate = useMemo(() => {
    const sta = parseDisplayDate(formData.staDate);
    if (sta) return startOfCalendarDay(sta);
    return today;
  }, [formData.staDate, today]);

  const loadAirlines = useCallback(async () => {
    setAirlinesLoading(true);
    try {
      const list = (await fetchAdditionalFlightsReferenceAirlines()) as Record<string, unknown>[];
      const opts = list
        .map(toAirlineOption)
        .filter((x) => x.id && (x.name || x.code))
        .sort((a, b) => a.name.localeCompare(b.name));
      setAirlineOptions(opts);
    } catch {
      setAirlineOptions([]);
    } finally {
      setAirlinesLoading(false);
    }
  }, []);

  const loadAircraft = useCallback(async () => {
    setAircraftLoading(true);
    try {
      const list = (await fetchAdditionalFlightsReferenceAircraft()) as Record<string, unknown>[];
      setAircraftOptions(buildAircraftOptions(list));
    } catch {
      setAircraftOptions([]);
    } finally {
      setAircraftLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAirlines();
    loadAircraft();
  }, [loadAirlines, loadAircraft]);

  const loadTableForRange = useCallback(async (fromDate: string, toDate: string) => {
    if (!fromDate.trim() || !toDate.trim()) {
      setTableRows([]);
      return;
    }
    setTableLoading(true);
    try {
      const res = await fetchCreationAdditionalFlightsByDateRange(fromDate, toDate);
      const rows = (res.rows ?? []).map(additionalFlightRecordToTableRow);
      setTableRows(rows);
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Failed to load additional flights.'));
      setTableRows([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTableForRange(tableFromDate, tableToDate);
  }, [tableFromDate, tableToDate, loadTableForRange]);

  const handleInputChange = useCallback(
    (field: string, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setSaveError(null);
      if ((ADDITIONAL_FLIGHTS_FIELD_ORDER as readonly string[]).includes(field)) {
        clearField(field as AdditionalFlightsField);
      }
    },
    [clearField],
  );

  useEffect(() => {
    if (!formData.airlines.trim()) return;
    const selected = airlineOptions.find((a) => a.name === formData.airlines);
    if (!selected) return;
    if (
      formData.airlineCode === selected.code &&
      formData.airlinesText === selected.name
    ) {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      airlines: selected.name,
      airlinesText: selected.name,
      airlineCode: selected.code,
      flightNo: applyAirlineCodeToFlightNo(selected.code, prev.flightNo),
    }));
  }, [airlineOptions, formData.airlines, formData.airlineCode, formData.airlinesText]);

  const handleStaDateChange = useCallback(
    (value: string) => {
      setFormData((prev) => {
        let stdDate = prev.stdDate;
        if (value.trim() && compareDisplayDates(value, stdDate) > 0) {
          stdDate = value;
        }
        return { ...prev, staDate: value, stdDate };
      });
      setSaveError(null);
      clearField('staDate');
      clearField('stdDate');
    },
    [clearField],
  );

  const handleStdDateChange = useCallback(
    (value: string) => {
      setFormData((prev) => ({ ...prev, stdDate: value }));
      setSaveError(null);
      clearField('stdDate');
    },
    [clearField],
  );

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const airlineName = (formData.airlinesText || formData.airlines || '').trim();
    const next = validateAdditionalFlightsForm(
      {
        airlines: airlineName,
        flightNo: formData.flightNo,
        acType: formData.acType,
        routing: formData.routing,
        staTime: formData.staTime,
        aBody: formData.aBody,
        stdTime: formData.stdTime,
        opsType: formData.opsType,
        skdNonSkd: formData.skdNonSkd,
        airlineCode: formData.airlineCode,
        freighter: formData.freighter,
        staDate: formData.staDate,
        stdDate: formData.stdDate,
        categoryOfFlight: formData.categoryOfFlight,
      },
      todayDisplay,
    );
    if (applyAndFocus(next)) {
      setSaveError('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const res = await saveCreationAdditionalFlight({
        airlines: airlineName,
        flightNo: normalizeText(formData.flightNo).toUpperCase().replace(/\s/g, ''),
        acType: formData.acType,
        routing: normalizeText(formData.routing),
        staTime: formData.staTime,
        stdTime: formData.stdTime,
        date: formData.staDate,
        date2: formData.stdDate,
        aBody: formData.aBody.trim().toUpperCase(),
        opsType: formData.opsType,
        skdNonSkd: formData.skdNonSkd,
        categoryOfFlight: formData.categoryOfFlight,
        airlineCode: formData.airlineCode.trim().toUpperCase(),
        freighter: formData.freighter,
      });

      const savedSerial = String(res.serialNo ?? res.record?.serialNo ?? '').trim();
      toast.success(
        savedSerial
          ? `Additional flight saved (serial ${savedSerial}). Now available in Schedule Airlines.`
          : 'Additional flight saved. Now available in Schedule Airlines.',
      );
      clearAll();
      await loadTableForRange(tableFromDate, tableToDate);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save additional flight.');
      const mapped = mapCreationApiErrorToField(msg);
      if (mapped && (ADDITIONAL_FLIGHTS_FIELD_ORDER as readonly string[]).includes(mapped.field)) {
        setFieldError(mapped.field as AdditionalFlightsField, mapped.message);
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [
    applyAndFocus,
    clearAll,
    formData,
    todayDisplay,
    loadTableForRange,
    setFieldError,
    tableFromDate,
    tableToDate,
  ]);

  const isExcelFile = useCallback((file: File) => {
    const name = file.name.toLowerCase();
    return name.endsWith('.xlsx') || name.endsWith('.xls');
  }, []);

  const handleCsvImport = useCallback(async () => {
    const fileErr = validateAdditionalFlightsImportFile(csvFile);
    if (fileErr) {
      setFieldError('csvFile', fileErr);
      toast.error(fileErr);
      return;
    }
    if (!csvFile) return;
    setCsvImporting(true);
    setSaveError(null);
    clearField('csvFile');
    try {
      if (isExcelFile(csvFile)) {
        const res = await importCreationAdditionalFlightsExcel(csvFile);
        showExcelImportResult(res, csvFile.name);
        if ((res.importedRows ?? 0) > 0) {
          await loadTableForRange(tableFromDate, tableToDate);
        }
        return;
      }

      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Failed to read CSV file'));
        reader.readAsText(csvFile);
      });

      const { rows, skipped } = parseAdditionalFlightsCsv(text);
      if (rows.length === 0) {
        showImportValidationDialog({
          fileName: csvFile.name,
          totalRows: skipped.length,
          importedRows: 0,
          failedRows: skipped.length || 1,
          message: 'No valid rows found in CSV. Please fix the file and try again.',
          errors: skipped.map((s) => ({
            row: s.rowNumber,
            column: '—',
            message: s.reason,
          })),
        });
        return;
      }

      const res = await bulkSaveCreationAdditionalFlights(rows.map((r) => r.payload));
      const savedCount = res.savedCount ?? 0;
      const errorCount = res.errorCount ?? 0;

      if (savedCount > 0 && errorCount === 0 && skipped.length === 0) {
        toast.success(`Imported ${savedCount} additional flight${savedCount === 1 ? '' : 's'}.`);
        await loadTableForRange(tableFromDate, tableToDate);
        return;
      }

      const csvErrors: FlightImportDialogError[] = [
        ...skipped.map((s) => ({
          row: s.rowNumber,
          column: '—',
          message: s.reason,
        })),
        ...(res.errors ?? []).map((e) => ({
          row: e.index + 1,
          column: '—',
          message: e.message,
        })),
      ];

      if (savedCount > 0) {
        await loadTableForRange(tableFromDate, tableToDate);
      }

      showImportValidationDialog({
        fileName: csvFile.name,
        totalRows: rows.length + skipped.length,
        importedRows: savedCount,
        failedRows: skipped.length + errorCount,
        message:
          savedCount > 0
            ? `${savedCount} row${savedCount === 1 ? '' : 's'} imported. Some rows need correction.`
            : 'CSV import could not be completed. Please correct the issues below.',
        errors: csvErrors,
      });
    } catch (err) {
      const msg = getErrorMessage(err, 'Import failed.');
      setSaveError(msg);
      showImportValidationDialog({
        fileName: csvFile?.name,
        importedRows: 0,
        failedRows: 1,
        message: msg,
        errors: [{ row: 0, column: '—', message: msg }],
      });
    } finally {
      setCsvImporting(false);
    }
  }, [
    clearField,
    csvFile,
    isExcelFile,
    loadTableForRange,
    setFieldError,
    showExcelImportResult,
    showImportValidationDialog,
    tableFromDate,
    tableToDate,
  ]);

  const handleDownloadTemplate = useCallback(async (format: 'excel' | 'csv') => {
    try {
      if (format === 'excel') {
        const blob = await downloadCreationAdditionalFlightsExcelTemplate();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'additional-flights-import-template.xlsx';
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      const blob = new Blob([ADDITIONAL_FLIGHTS_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'additional-flights-template.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download template.'));
    }
  }, []);

  const filteredTableRows = useMemo(() => {
    const airlineQ = tableAirlineFilter.trim().toLowerCase();
    const flightQ = tableFlightFilter.trim().toLowerCase().replace(/[\s\-/]/g, '');
    return tableRows.filter((row) => {
      if (airlineQ && !row.airline.toLowerCase().includes(airlineQ)) return false;
      if (
        flightQ &&
        !row.flightNo.toLowerCase().replace(/[\s\-/]/g, '').includes(flightQ)
      ) {
        return false;
      }
      return true;
    });
  }, [tableAirlineFilter, tableFlightFilter, tableRows]);

  const inputClass =
    'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none';
  const inputReadOnlyClass =
    `${inputClass} cursor-default bg-slate-50 text-slate-700 shadow-none focus:border-slate-200 focus:ring-0`;
  const selectClass =
    'min-h-11 w-full rounded-xl border border-slate-200 !bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus-visible:outline-none cursor-pointer';
  const selectLockedClass = `${selectClass} cursor-not-allowed`;
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const fieldWrapClass = 'min-w-0';
  const control = (invalid?: boolean) => cn(inputClass, invalid && CREATION_INVALID_CONTROL);
  const selectControl = (invalid?: boolean) => cn(selectClass, invalid && CREATION_INVALID_CONTROL);

  return (
    <div className="space-y-8">
      <div
        className="rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-4 shadow-sm"
        role="status"
      >
        <p className="text-sm font-semibold text-amber-950">Additional Flight</p>
        <p className="mt-1 text-sm text-amber-900/80">
          Create a one-time operational flight for a specific date when no master
          schedule exists. Does not change Advance → Schedule Setup. After save,
          the flight appears in Creation → Schedule Airlines for normal handling.
        </p>
      </div>

      {/* Top row */}
      <div className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2">
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-airlines-label">
              Airlines <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.airlines}
              onChange={(v) => {
                const selected = airlineOptions.find((a) => a.name === v);
                const code = selected?.code ?? '';
                setFormData((prev) => ({
                  ...prev,
                  airlines: v,
                  airlinesText: v,
                  airlineCode: code,
                  flightNo: code ? applyAirlineCodeToFlightNo(code, prev.flightNo) : prev.flightNo,
                }));
                setSaveError(null);
                clearField('airlines');
                clearField('flightNo');
              }}
              options={airlineDropdownOptions}
              placeholder={airlinesLoading ? 'Loading airlines...' : 'Select'}
              disabled={airlinesLoading || saving}
              className={selectControl(!!errors.airlines)}
              aria-invalid={!!errors.airlines}
              aria-labelledby="field-airlines-label"
            />
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
        </div>
        <ScrollToError
          error={saveError}
          className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </ScrollToError>
      </div>

      {/* Main form — 4-column grid */}
      <div className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className={fieldWrapClass}>
            <label className={labelClass}>Airlines</label>
            <AdminRadioDropdown
              value={formData.airlines}
              onChange={() => {}}
              options={[
                ...(formData.airlines &&
                !airlineOptions.some((a) => a.name === formData.airlines)
                  ? [{ value: formData.airlines, label: formData.airlines }]
                  : []),
                ...airlineDropdownOptions,
              ]}
              placeholder={airlinesLoading ? 'Loading airlines...' : 'Select airline above'}
              disabled
              className={selectLockedClass}
            />
            <FormFieldError />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-acType-label">
              AC Type <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.acType}
              onChange={(nextType) => {
                const selected = aircraftOptions.find((a) => a.type === nextType);
                setFormData((prev) => ({
                  ...prev,
                  acType: nextType,
                  aBody: selected?.body ?? prev.aBody,
                }));
                setSaveError(null);
                clearField('acType');
              }}
              options={[
                ...(formData.acType &&
                !aircraftOptions.some((a) => a.type === formData.acType)
                  ? [{ value: formData.acType, label: formData.acType }]
                  : []),
                ...aircraftDropdownOptions,
              ]}
              placeholder={aircraftLoading ? 'Loading aircraft...' : 'Select aircraft'}
              disabled={aircraftLoading || saving}
              className={selectControl(!!errors.acType)}
              aria-invalid={!!errors.acType}
              aria-labelledby="field-acType-label"
            />
            <FormFieldError id="field-acType-error" message={errors.acType} />
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
          <div className={fieldWrapClass}>
            <label className={labelClass}>Aircraft Body</label>
            <input
              type="text"
              readOnly
              value={formData.aBody}
              className={inputReadOnlyClass}
              placeholder="NB"
              title="Set by AC Type"
              aria-invalid={!!errors.aBody}
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
            <label className={labelClass}>Skd/Non Skd</label>
            <AdminRadioDropdown
              value={formData.skdNonSkd}
              onChange={() => {}}
              options={SKD_NON_SKD_OPTIONS}
              disabled
              className={selectLockedClass}
            />
            <FormFieldError />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass}>Airline Code</label>
            <input
              type="text"
              readOnly
              value={formData.airlineCode}
              className={inputReadOnlyClass}
              placeholder="—"
              title="Set when you select an airline above"
            />
            <FormFieldError />
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass}>Freighter</label>
            <AdminRadioDropdown
              value={formData.freighter}
              onChange={(v) => {
                handleInputChange('freighter', v);
                clearField('freighter');
              }}
              options={[
                { value: '', label: 'Select' },
                { value: 'Yes', label: 'Yes' },
                { value: 'No', label: 'No' },
              ]}
              className={selectControl(!!errors.freighter)}
              aria-invalid={!!errors.freighter}
            />
            <FormFieldError id="field-freighter-error" message={errors.freighter} />
          </div>
          <div className={cn(fieldWrapClass, errors.staDate && CREATION_INVALID_PICKER_WRAP)}>
            <label className={labelClass} htmlFor="field-staDate">
              STA Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              id="field-staDate"
              value={formData.staDate}
              onChange={handleStaDateChange}
              minDate={today}
              ariaLabel="STA date"
            />
            <FormFieldError id="field-staDate-error" message={errors.staDate} />
          </div>
          <div className={cn(fieldWrapClass, errors.stdDate && CREATION_INVALID_PICKER_WRAP)}>
            <label className={labelClass} htmlFor="field-stdDate">
              STD Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              id="field-stdDate"
              value={formData.stdDate}
              onChange={handleStdDateChange}
              minDate={stdMinDate}
              ariaLabel="STD date"
            />
            <FormFieldError id="field-stdDate-error" message={errors.stdDate} />
          </div>
          <div className={`${fieldWrapClass} sm:col-span-2 lg:col-span-4`}>
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
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* CSV Import */}
      <div className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Import flight data from CSV</h3>
        <p className="mb-3 text-sm text-slate-500">
          Import CSV or Excel (.xlsx/.xls) into Additional Flights. Excel imports use server-side
          validation with detailed error reporting.
        </p>
        <div className="mb-3 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => void handleDownloadTemplate('excel')}
            className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline"
          >
            Download Excel template
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadTemplate('csv')}
            className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
          >
            Download CSV template
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition hover:bg-slate-50">
            <FileUp className="h-4 w-4 text-slate-500" />
            <span>Import CSV File</span>
            <input
              id="field-csvFile"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                setCsvFile(e.target.files?.[0] ?? null);
                clearField('csvFile');
              }}
            />
          </label>
          <span className="text-sm text-slate-500">{csvFile ? csvFile.name : 'No file chosen'}</span>
          <FormFieldError id="field-csvFile-error" message={errors.csvFile} />
          <button
            type="button"
            onClick={() => void handleCsvImport()}
            disabled={csvImporting || !csvFile}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {csvImporting ? 'Importing…' : 'CSV Import Creation'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-sm">
        <CreationFlightsTableDateRange
          title="Additional flights for the selected date range"
          fromDate={tableFromDate}
          toDate={tableToDate}
          onFromDateChange={setTableFromDate}
          onToDateChange={setTableToDate}
        />
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="af-filter-airline">
              Filter airline
            </label>
            <input
              id="af-filter-airline"
              value={tableAirlineFilter}
              onChange={(e) => setTableAirlineFilter(e.target.value)}
              className={inputClass}
              placeholder="Search airline"
              aria-label="Filter by airline"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="af-filter-flight">
              Filter flight number
            </label>
            <input
              id="af-filter-flight"
              value={tableFlightFilter}
              onChange={(e) => setTableFlightFilter(e.target.value)}
              className={inputClass}
              placeholder="Search flight no"
              aria-label="Filter by flight number"
            />
          </div>
        </div>
        {tableLoading ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading flights…</p>
        ) : filteredTableRows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            No additional flights saved between {tableFromDate} and {tableToDate}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Serial No</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Airline</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Flight No</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Flight Date</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Flight Type</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Created By</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Created On</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Last Modified</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTableRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 transition hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-900">{row.serialNo}</td>
                    <td className="px-5 py-3 text-slate-900">{row.airline}</td>
                    <td className="px-5 py-3 text-slate-900">{row.flightNo}</td>
                    <td className="px-5 py-3 text-slate-900">{row.staDate}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
                        {row.flightType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-900">{row.createdBy}</td>
                    <td className="px-5 py-3 text-slate-900">{row.createdOn}</td>
                    <td className="px-5 py-3 text-slate-900">{row.lastModified}</td>
                    <td className="px-5 py-3 text-slate-900">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FlightImportResultDialog
        open={importResultOpen}
        onOpenChange={setImportResultOpen}
        fileName={importResult?.fileName}
        totalRows={importResult?.totalRows}
        importedRows={importResult?.importedRows}
        failedRows={importResult?.failedRows}
        message={importResult?.message}
        errors={importResult?.errors}
        missingHeaders={importResult?.missingHeaders}
        duplicateHeaders={importResult?.duplicateHeaders}
        errorFileUrl={importResult?.errorFileUrl}
      />
    </div>
  );
}
