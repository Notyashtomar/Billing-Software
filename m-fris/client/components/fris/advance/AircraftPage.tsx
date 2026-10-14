'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, FileSpreadsheet, Search, Pencil, Trash2, Upload } from 'lucide-react';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import { toast } from 'sonner';
import {
  advanceList,
  advanceCreate,
  advanceUpdate,
  advanceDelete,
  advanceBulkCreate,
  advanceDocId,
  ADVANCE_PATHS,
} from '@/lib/api';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { required, validateFormValues, type FieldErrors } from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  GATEWAY_PAGE_ROOT,
  GATEWAY_FORM_SECTION,
  GATEWAY_FORM_INNER,
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
import {
  downloadAircraftExcelTemplate,
  parseAdvanceAircraftExcel,
} from '@/components/fris/advance/importAdvanceAircraftExcel';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';

export type AircraftRow = {
  id: string;
  aircraft: string;
  aircraftBody: 'NB' | 'WB';
  mtow: string;
  description: string;
  category: string;
  active: boolean;
  /** Metres. `0` is a valid stored value. */
  wingspan: number | null;
  /** Raw columns from `aircraft_universal.xlsx` seed (Mongo-safe header keys). */
  universalRow?: Record<string, string>;
};

const PATH = ADVANCE_PATHS.aircraft;
/** Passenger capacity must be below this value. 1000 itself is not allowed. */
const PASSENGER_CAPACITY_MAX = 1000;
const FIELD_ORDER = ['aircraft', 'aircraftBody', 'wingspan', 'passengerCapacity', 'category'] as const;
type AircraftField = (typeof FIELD_ORDER)[number];

const CATEGORY_OPTIONS = ['A', 'B', 'C', 'D', 'E'] as const;

const AIRCRAFT_EXPORT_HEADER_FILL = 'FFF97316';

const BASIC_EXPORT_HEADERS = [
  'Aircraft',
  'Aircraft Body',
  'MTOW',
  'Description',
  'Category',
  'Active',
] as const;

function xlsxArrayBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const plainBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([plainBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function columnWidthForExport(header: string, values: string[]): number {
  const longestValue = values.reduce((max, value) => Math.max(max, value.length), 0);
  return Math.min(Math.max(header.length + 3, longestValue + 2, 12), 48);
}

/** Column order aligned with `corrected version` sheet in `aircraft_universal.xlsx`. */
const UNIVERSAL_COLUMN_PRIORITY = [
  'S_No_',
  'Aircraft Type',
  'Manufacturer',
  'Aircraft Body',
  'ICAO Code',
  'Wingspan (m)',
  'MTOW (kg)',
  'Passenger Capacity',
  'Description',
] as const;

function collectUniversalColumnKeys(rows: AircraftRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const ur = r.universalRow;
    if (!ur) continue;
    for (const k of Object.keys(ur)) {
      if (k) set.add(k);
    }
  }
  const known: string[] = [];
  for (const k of UNIVERSAL_COLUMN_PRIORITY) {
    if (set.has(k)) known.push(k);
  }
  const rest = [...set]
    .filter((k) => !UNIVERSAL_COLUMN_PRIORITY.includes(k as (typeof UNIVERSAL_COLUMN_PRIORITY)[number]))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
}

function displayCellValue(row: AircraftRow, colKey: string): string {
  const direct = row.universalRow?.[colKey];
  if (direct != null && String(direct).trim() !== '') return String(direct);
  switch (colKey) {
    case 'Aircraft Type':
      return row.aircraft;
    case 'Aircraft Body':
      return row.aircraftBody;
    case 'MTOW (kg)':
    case 'MTOW':
      return row.mtow;
    case 'Description':
      return row.description;
    default:
      return '';
  }
}

function rowMatchesFilter(row: AircraftRow, term: string): boolean {
  const t = term.toLowerCase();
  const scan = (s: string) => s.toLowerCase().includes(t);
  if (
    scan(row.aircraft) ||
    scan(row.aircraftBody) ||
    scan(row.mtow) ||
    scan(row.description) ||
    scan(row.category)
  ) {
    return true;
  }
  if (row.universalRow) {
    for (const v of Object.values(row.universalRow)) {
      if (v && scan(String(v))) return true;
    }
  }
  return false;
}

/** UPPERCASE; spaces → hyphen; only A–Z, 0–9, hyphen or slash (between segments). */
function normalizeAircraftType(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9/-]/g, '')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/[-/]{2,}/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
}

function wingspanError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '.') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || Math.round(n) <= 0) {
    return 'Wingspan must be greater than 0.';
  }
  if (n > 200) return 'Wingspan must be 200 metres or less.';
  return null;
}

function wingspanToNumber(raw: string): number | undefined {
  if (wingspanError(raw)) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '.') return undefined;
  return Math.round(Number(trimmed));
}

function wingspanFieldValue(
  universalRow: Record<string, string> | undefined,
  stored: number | null,
): string {
  const fromSheet = universalRow?.['Wingspan (m)']?.trim() ?? '';
  if (fromSheet !== '' && fromSheet !== '0') return fromSheet;
  if (stored != null && Number.isFinite(stored) && stored > 0) return String(stored);
  return '';
}

function isValidAircraftType(normalized: string): boolean {
  if (normalized.length < 2) return false;
  return /^[A-Z0-9]+(?:[/-][A-Z0-9]+)*$/.test(normalized);
}

function toRow(doc: Record<string, unknown>): AircraftRow {
  const d = advanceDocId(doc);
  const rawUr = d.universalRow;
  let universalRow: Record<string, string> | undefined;
  if (rawUr && typeof rawUr === 'object' && !Array.isArray(rawUr)) {
    universalRow = {};
    for (const [k, v] of Object.entries(rawUr as Record<string, unknown>)) {
      universalRow[k] = v == null ? '' : String(v);
    }
  }
  return {
    id: d.id,
    aircraft: String(d.aircraft ?? ''),
    aircraftBody: (d.aircraftBody === 'WB' ? 'WB' : 'NB') as 'NB' | 'WB',
    mtow: String(d.mtow ?? ''),
    description: String(d.description ?? ''),
    category: String(d.category ?? ''),
    active: Boolean(d.active),
    wingspan:
      d.wingspan == null || d.wingspan === ''
        ? null
        : Number.isFinite(Number(d.wingspan))
          ? Number(d.wingspan)
          : null,
    universalRow,
  };
}

export default function AircraftPage() {
  const [form, setForm] = useState({
    aircraft: '',
    manufacturer: '',
    icaoCode: '',
    aircraftBody: '' as '' | 'NB' | 'WB',
    wingspan: '0',
    mtow: '',
    passengerCapacity: '',
    description: '',
    category: '',
    active: false,
  });
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<AircraftRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelImporting, setExcelImporting] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<AircraftField>(FIELD_ORDER);

  const fetchList = useCallback(async (searchTerm?: string) => {
    setListLoading(true);
    try {
      const list = (await advanceList(
        PATH,
        searchTerm?.trim() ? { search: searchTerm } : undefined
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

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExcelFile(e.target.files?.[0] ?? null);
  };

  const handleExcelImport = async () => {
    if (!excelFile) return;
    setExcelImporting(true);
    try {
      const { rows: parsedRows, skipped } = await parseAdvanceAircraftExcel(excelFile);
      if (parsedRows.length === 0) {
        const reason = skipped[0]?.reason ?? 'No valid aircraft rows found in the Excel file.';
        toast.error(reason);
        return;
      }

      const result = (await advanceBulkCreate(PATH, {
        rows: parsedRows.map(({ payload }) => payload),
      })) as {
        inserted?: number;
        updated?: number;
        skipped?: number;
        failed?: Array<{ index: number; reason: string }>;
      };

      const inserted = result.inserted ?? 0;
      const updated = result.updated ?? 0;
      const serverSkipped = result.skipped ?? 0;
      const failed = result.failed ?? [];

      await fetchList(filter);

      const parts: string[] = [];
      if (inserted > 0) {
        parts.push(`added ${inserted} new`);
      }
      if (updated > 0) {
        parts.push(`updated ${updated} existing`);
      }
      if (parts.length > 0) {
        toast.success(`Imported aircraft catalog — ${parts.join(', ')}.`);
      }

      const totalSkipped = skipped.length + serverSkipped + failed.length;
      if (totalSkipped > 0) {
        toast.message(
          `Skipped ${totalSkipped} row${totalSkipped === 1 ? '' : 's'} (empty, invalid type, or duplicate issue).`,
        );
      }
      if (inserted === 0 && updated === 0) {
        toast.error('Excel import did not add or update any aircraft types.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel import failed');
    } finally {
      setExcelImporting(false);
      setExcelFile(null);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const aircraftKey = (aircraft: string) => normalizeAircraftType(aircraft).toLowerCase();

  const isDuplicate = (aircraft: string, excludeId?: string | null) => {
    const key = aircraftKey(aircraft);
    if (!key) return false;
    return rows.some(
      (r) => r.id !== excludeId && aircraftKey(r.aircraft) === key
    );
  };

  const handleSave = async () => {
    const aircraft = normalizeAircraftType(form.aircraft);
    const next: FieldErrors<AircraftField> = {
      ...validateFormValues(
      {
        aircraft,
        category: form.category,
        aircraftBody: form.aircraftBody,
      },
      {
        aircraft: { label: 'Aircraft type', required: true },
        category: { label: 'category', select: true },
        aircraftBody: { label: 'aircraft body', select: true },
      },
    ),
    };
    if (!next.aircraft && !isValidAircraftType(aircraft)) {
      next.aircraft =
        'Use UPPERCASE letters and numbers only. Use hyphen (-) or slash (/) between parts (e.g. A320, B737-800, A320/B737). Minimum 2 characters.';
    }
    if (form.category && !(CATEGORY_OPTIONS as readonly string[]).includes(form.category)) {
      next.category = 'Select a category (A–E).';
    }
    if (isDuplicate(aircraft, editingId)) {
      next.aircraft = 'This aircraft type already exists. Each type must be unique.';
    }
    const capacityText = form.passengerCapacity.trim();
    if (capacityText && Number(capacityText) >= PASSENGER_CAPACITY_MAX) {
      next.passengerCapacity = `Passenger capacity must be less than ${PASSENGER_CAPACITY_MAX}.`;
    }
    const wingspanMessage = wingspanError(form.wingspan);
    if (wingspanMessage) next.wingspan = wingspanMessage;
    if (applyAndFocus(next)) return;
    setLoading(true);
    try {
      const aircraftBody = form.aircraftBody || 'NB';
      const mtow = form.mtow.trim();
      const description = form.description.trim();
      const wingspan = wingspanToNumber(form.wingspan);
      const passengerCapacity =
        capacityText === '' ? undefined : Number(capacityText);
      const existingUniversal = editingId
        ? rows.find((r) => r.id === editingId)?.universalRow
        : undefined;
      const universalRow = {
        ...(existingUniversal ?? {}),
        'Aircraft Type': aircraft,
        Manufacturer: form.manufacturer.trim(),
        'Aircraft Body': aircraftBody,
        'ICAO Code': form.icaoCode.trim().toUpperCase(),
        'Wingspan (m)': wingspan != null ? String(wingspan) : '',
        'MTOW (kg)': mtow,
        'Passenger Capacity': capacityText,
        Description: description,
      };
      const body = {
        aircraft,
        aircraftBody,
        mtow,
        description,
        category: form.category,
        active: form.active,
        ...(wingspan != null ? { wingspan } : {}),
        ...(passengerCapacity !== undefined ? { passengerCapacity } : {}),
        universalRow,
      };
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Created successfully');
      }
      setForm({
        aircraft: '',
        manufacturer: '',
        icaoCode: '',
        aircraftBody: '',
        wingspan: '0',
        mtow: '',
        passengerCapacity: '',
        description: '',
        category: '',
        active: false,
      });
      setEditingId(null);
      clearAll();
      await fetchList(filter);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed';
      setFieldError('aircraft', message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (row: AircraftRow) => {
    const label = row.aircraft || 'this aircraft';
    if (!window.confirm(`Delete "${label}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(row.id);
    try {
      await advanceDelete(PATH, row.id);
      toast.success('Deleted successfully');
      if (editingId === row.id) {
        setForm({
          aircraft: '',
          manufacturer: '',
          icaoCode: '',
          aircraftBody: '',
          wingspan: '0',
          mtow: '',
          passengerCapacity: '',
          description: '',
          category: '',
          active: false,
        });
        setEditingId(null);
        clearAll();
      }
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredRows = filter.trim()
    ? rows.filter((r) => rowMatchesFilter(r, filter.trim()))
    : rows;

  const handleExportExcel = useCallback(async () => {
    if (filteredRows.length === 0) {
      toast.error('No aircraft records to export.');
      return;
    }

    setExporting(true);
    try {
      const exportUniversalKeys = collectUniversalColumnKeys(filteredRows);
      const useUniversalExport = exportUniversalKeys.length > 0;
      const headers = useUniversalExport
        ? [...exportUniversalKeys, 'Category', 'Active']
        : [...BASIC_EXPORT_HEADERS];

      const dataRows = filteredRows.map((row) => {
        if (useUniversalExport) {
          return [
            ...exportUniversalKeys.map((key) => displayCellValue(row, key)),
            row.category,
            row.active ? 'Yes' : 'No',
          ];
        }
        return [
          row.aircraft,
          row.aircraftBody,
          row.mtow,
          row.description,
          row.category,
          row.active ? 'Yes' : 'No',
        ];
      });

      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Aircraft', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.addRow(headers);
      dataRows.forEach((row) => {
        worksheet.addRow(row);
      });

      const headerRow = worksheet.getRow(1);
      headerRow.height = 34;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: AIRCRAFT_EXPORT_HEADER_FILL },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFEA580C' } },
          left: { style: 'thin', color: { argb: 'FFEA580C' } },
          bottom: { style: 'thin', color: { argb: 'FFEA580C' } },
          right: { style: 'thin', color: { argb: 'FFEA580C' } },
        };
      });

      headers.forEach((header, index) => {
        const columnValues = dataRows.map((row) => String(row[index] ?? ''));
        worksheet.getColumn(index + 1).width = columnWidthForExport(header, columnValues);
      });

      dataRows.forEach((_, rowIndex) => {
        const dataRow = worksheet.getRow(rowIndex + 2);
        dataRow.eachCell((cell) => {
          cell.alignment = { vertical: 'top', wrapText: true };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const saveAs = await loadFileSaverSaveAs();
      saveAs(
        xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
        'advance-aircraft.xlsx',
      );
      toast.success(`Exported ${filteredRows.length} aircraft record(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  }, [filteredRows]);

  const universalColumnKeys = useMemo(
    () =>
      collectUniversalColumnKeys(rows).filter(
        (key) => !/^s[\s._-]*no/i.test(key.trim()),
      ),
    [rows],
  );
  const useUniversalTable = universalColumnKeys.length > 0;
  const tableMinWidth = useUniversalTable
    ? Math.max(640, 60 + universalColumnKeys.length * 84 + 180)
    : 640;
  const emptyColSpan = useUniversalTable ? universalColumnKeys.length + 3 : 7;

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      {/* Create / edit form + import */}
      <section className={GATEWAY_FORM_SECTION}>
        <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleExcelFileChange}
            className="hidden"
            id="advance-aircraft-excel-import"
          />
          <label
            htmlFor="advance-aircraft-excel-import"
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 text-sm text-gray-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50"
          >
            <Upload className="h-4 w-4" />
            {excelFile ? (
              <span className="max-w-[10rem] truncate sm:max-w-[14rem]">{excelFile.name}</span>
            ) : (
              'Choose Excel file'
            )}
          </label>
          <motion.button
            type="button"
            onClick={() => void handleExcelImport()}
            disabled={!excelFile || excelImporting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={GATEWAY_GET_BTN}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {excelImporting ? 'Importing…' : 'Import from Excel'}
          </motion.button>
          <button
            type="button"
            onClick={() => void downloadAircraftExcelTemplate()}
            className="h-10 shrink-0 text-sm font-medium text-emerald-600 underline-offset-2 hover:text-emerald-700 hover:underline"
          >
            Download template
          </button>
          <p className="w-full text-xs text-gray-500 sm:ml-auto sm:w-auto sm:text-right">
            Required column: Aircraft Type
          </p>
        </div>

        <div className={GATEWAY_FORM_INNER}>
          <div className="grid grid-cols-1 items-start gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-aircraft">
                Aircraft
              </label>
              <input
                id="field-aircraft"
                name="aircraft"
                type="text"
                value={form.aircraft}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9\s/-]/g, '');
                  setForm((f) => ({ ...f, aircraft: v }));
                  clearField('aircraft');
                }}
                onBlur={() => {
                  const value = normalizeAircraftType(form.aircraft);
                  setForm((f) => ({ ...f, aircraft: value }));
                  setFieldError(
                    'aircraft',
                    !value
                      ? required(value, 'Aircraft type')
                      : isValidAircraftType(value)
                        ? null
                        : 'Use a valid aircraft type (e.g. A320 or B737-800).',
                  );
                }}
                aria-invalid={!!errors.aircraft}
                aria-describedby={errors.aircraft ? 'field-aircraft-error' : undefined}
                className={`${gatewayControlClass(!!errors.aircraft)} uppercase`}
                placeholder="e.g. A320, B737-800"
              />
              <FormFieldError id="field-aircraft-error" message={errors.aircraft} />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL}>Manufacturer</label>
              <input
                type="text"
                value={form.manufacturer}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    manufacturer: e.target.value.replace(/[^A-Za-z .&/-]/g, ''),
                  }))
                }
                className={gatewayControlClass()}
                placeholder="e.g. Airbus, Boeing"
              />
              <FormFieldError />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL}>ICAO Code</label>
              <input
                type="text"
                value={form.icaoCode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    icaoCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4),
                  }))
                }
                maxLength={4}
                className={`${gatewayControlClass()} uppercase`}
                placeholder="e.g. A320"
              />
              <FormFieldError />
            </div>
            <div className={`${GATEWAY_FORM_FIELD} relative z-20`}>
              <label className={GATEWAY_LABEL} htmlFor="field-aircraftBody">
                Aircraft Body
              </label>
              <AdminRadioDropdown
                id="field-aircraftBody"
                value={form.aircraftBody}
                onChange={(v) => {
                  setForm((f) => ({ ...f, aircraftBody: v as 'NB' | 'WB' }));
                  clearField('aircraftBody');
                }}
                options={['NB', 'WB']}
                placeholder="Select"
                className={gatewayControlClass(!!errors.aircraftBody)}
              />
              <FormFieldError id="field-aircraftBody-error" message={errors.aircraftBody} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-wingspan">Wingspan (m)</label>
              <input
                id="field-wingspan"
                name="wingspan"
                type="text"
                inputMode="decimal"
                value={form.wingspan}
                onChange={(e) => {
                  const value = e.target.value
                    .replace(/[^0-9.]/g, '')
                    .replace(/(\..*)\./g, '$1');
                  setForm((f) => ({ ...f, wingspan: value }));
                  setFieldError('wingspan', wingspanError(value));
                }}
                aria-invalid={!!errors.wingspan}
                aria-describedby={errors.wingspan ? 'field-wingspan-error' : undefined}
                className={gatewayControlClass(!!errors.wingspan)}
                placeholder="e.g. 35.8"
              />
              <FormFieldError id="field-wingspan-error" message={errors.wingspan} />
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
                className={gatewayControlClass()}
                placeholder="MTOW (kg)"
              />
              <FormFieldError />
            </div>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-passengerCapacity">
                Passenger Capacity
              </label>
              <input
                id="field-passengerCapacity"
                name="passengerCapacity"
                type="text"
                inputMode="numeric"
                value={form.passengerCapacity}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setForm((f) => ({ ...f, passengerCapacity: digits }));
                  if (digits !== '' && Number(digits) >= PASSENGER_CAPACITY_MAX) {
                    setFieldError(
                      'passengerCapacity',
                      `Passenger capacity must be less than ${PASSENGER_CAPACITY_MAX}.`,
                    );
                    return;
                  }
                  clearField('passengerCapacity');
                }}
                maxLength={4}
                aria-invalid={!!errors.passengerCapacity}
                aria-describedby={
                  errors.passengerCapacity ? 'field-passengerCapacity-error' : undefined
                }
                className={gatewayControlClass(!!errors.passengerCapacity)}
                placeholder="Less than 1000"
              />
              <FormFieldError
                id="field-passengerCapacity-error"
                message={errors.passengerCapacity}
              />
            </div>
            <div className={`${GATEWAY_FORM_FIELD} relative z-20`}>
              <label className={GATEWAY_LABEL} htmlFor="field-category">
                Category
              </label>
              <AdminRadioDropdown
                id="field-category"
                value={form.category}
                onChange={(v) => {
                  setForm((f) => ({ ...f, category: v }));
                  clearField('category');
                }}
                options={[
                  ...(form.category &&
                  !(CATEGORY_OPTIONS as readonly string[]).includes(form.category)
                    ? [{ value: form.category, label: `${form.category} (legacy — choose A–E)` }]
                    : []),
                  ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: c })),
                ]}
                placeholder="Select (A–E)"
                className={gatewayControlClass(!!errors.category)}
              />
              <FormFieldError id="field-category-error" message={errors.category} />
            </div>

            <div className={`${GATEWAY_FORM_FIELD} sm:col-span-2 lg:col-span-3`}>
              <label className={GATEWAY_LABEL}>Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={gatewayControlClass()}
                placeholder="Description"
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
            </div>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className={`${GATEWAY_TABLE_SECTION} min-h-[36rem] shrink-0 sm:min-h-[40rem]`}>
        <div className={GATEWAY_FILTER_BAR}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter table…"
              className={GATEWAY_FILTER_INPUT}
              aria-label="Filter aircraft table"
            />
          </div>
          <motion.button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={exporting || listLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={GATEWAY_SECONDARY_BTN}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export Excel'}
          </motion.button>
        </div>
        <div className={`${GATEWAY_TABLE_SCROLL} h-[32rem] min-h-[32rem] sm:h-[36rem] sm:min-h-[36rem]`}>
          <table
            className="w-full border-collapse text-left text-sm"
            style={{ minWidth: tableMinWidth }}
          >
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                {useUniversalTable ? (
                  <>
                    {universalColumnKeys.map((key) => (
                      <th
                        key={key}
                        scope="col"
                        className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                      >
                        {key}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Category
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Active
                    </th>
                    <th
                      scope="col"
                      className="w-24 whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Actions
                    </th>
                  </>
                ) : (
                  <>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Aircraft
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Aircraft Body
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      MTOW
                    </th>
                    <th
                      scope="col"
                      className="min-w-[10rem] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Description
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Category
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Active
                    </th>
                    <th
                      scope="col"
                      className="w-24 whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Actions
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={emptyColSpan} className="px-4 py-10 text-center text-gray-500">
                    No data. Add a record or adjust search.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/60">
                    {useUniversalTable ? (
                      <>
                        {universalColumnKeys.map((key) => (
                          <td
                            key={key}
                            className="max-w-[12rem] truncate px-3 py-2.5 align-middle text-gray-700"
                            title={displayCellValue(row, key)}
                          >
                            {displayCellValue(row, key)}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle text-gray-700">
                          {row.category}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                          <span
                            className={
                              row.active ? 'font-medium text-emerald-600' : 'text-gray-400'
                            }
                          >
                            {row.active ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle font-medium text-gray-900">
                          {row.aircraft}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle text-gray-700">
                          {row.aircraftBody}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle text-gray-700">
                          {row.mtow}
                        </td>
                        <td
                          className="max-w-[16rem] truncate px-3 py-2.5 align-middle text-gray-700"
                          title={row.description}
                        >
                          {row.description}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle text-gray-700">
                          {row.category}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                          <span
                            className={
                              row.active ? 'font-medium text-emerald-600' : 'text-gray-400'
                            }
                          >
                            {row.active ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2.5 text-right align-middle">
                      <div className="inline-flex items-center justify-end gap-1">
                        <motion.button
                          type="button"
                          onClick={() => {
                            const ur = row.universalRow;
                            setForm({
                              aircraft: row.aircraft,
                              manufacturer: ur?.['Manufacturer'] ?? '',
                              icaoCode: ur?.['ICAO Code'] ?? '',
                              aircraftBody: row.aircraftBody,
                              wingspan: wingspanFieldValue(ur, row.wingspan),
                              mtow: row.mtow,
                              passengerCapacity: ur?.['Passenger Capacity'] ?? '',
                              description: row.description,
                              category: row.category,
                              active: row.active,
                            });
                            setEditingId(row.id);
                            clearAll();
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </motion.button>
                        <motion.button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          disabled={deletingId === row.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </motion.button>
                      </div>
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
