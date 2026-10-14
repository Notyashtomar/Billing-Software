'use client';

import { useCallback, useMemo, useState } from 'react';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { fetchDailyScheduledFromAdvance } from '@/lib/api';
import {
  displayScheduledAirlinesTableSerial,
  isScheduleCancelledFlightNo,
  processFlightData,
  shouldHideScheduledAirlinesTableRow,
  type FlightData,
} from '@/utils/dataProcessor';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

type FlightTypeFilter = 'scheduled' | 'non-scheduled' | 'additional' | 'raf';

const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterField = (typeof FILTER_FIELD_ORDER)[number];

type InvoicePendingRow = {
  slNo: string;
  airline: string;
  flightNo: string;
  regn: string;
  cargo: string;
  route: string;
  typeCraft: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
  exportedStatus: string;
  exportedBy: string;
  exportedDate: string;
};

const FLIGHT_TYPE_OPTIONS: { value: FlightTypeFilter; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled Flight' },
  { value: 'non-scheduled', label: 'Non Scheduled Flight' },
  { value: 'additional', label: 'Additional Flight' },
  { value: 'raf', label: 'RAF' },
];

const TABLE_COLUMNS: { key: keyof InvoicePendingRow; header: string }[] = [
  { key: 'slNo', header: 'Sl.No' },
  { key: 'airline', header: 'Airline' },
  { key: 'flightNo', header: 'Flight No' },
  { key: 'regn', header: 'Regn' },
  { key: 'cargo', header: 'Cargo' },
  { key: 'route', header: 'Route' },
  { key: 'typeCraft', header: 'Type Craft' },
  { key: 'staDate', header: 'STA Date' },
  { key: 'staTime', header: 'STA Time' },
  { key: 'stdDate', header: 'STD Date' },
  { key: 'stdTime', header: 'STD Time' },
  { key: 'ataDate', header: 'ATA Date' },
  { key: 'ataTime', header: 'ATA Time' },
  { key: 'atdDate', header: 'ATD Date' },
  { key: 'atdTime', header: 'ATD Time' },
  { key: 'exportedStatus', header: 'Exported Status' },
  { key: 'exportedBy', header: 'Exported By' },
  { key: 'exportedDate', header: 'Exported Date' },
];

const DEFAULT_FROM_YMD = '2026-02-28';
const DEFAULT_TO_YMD = '2026-03-31';

const dropdownFieldClass =
  'h-11 w-full min-w-[180px] rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-all hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200';

function yyyyMmDdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function scheduleLabelToYmd(label: string): string | null {
  const raw = String(label ?? '').trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function filterFlightsToDateWindow(
  flights: FlightData[],
  fromYmd: string,
  toYmd: string,
): FlightData[] {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return flights;
  return flights.filter((f) => {
    const ymd =
      scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
      scheduleLabelToYmd(String(f.stdDate ?? '').trim());
    if (!ymd) return false;
    return ymd >= fromYmd && ymd <= toYmd;
  });
}

function normIsRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function pickRaw(d: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = d[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function cargoLabel(f: FlightData): string {
  const cat = String(f.cateOfFlight ?? '').toLowerCase();
  const ft = String(f.flightType ?? '').toLowerCase();
  if (cat.includes('cargo') || cat.includes('freight') || ft.includes('cargo') || ft.includes('freight')) {
    return 'Yes';
  }
  return 'No';
}

function matchesFlightTypeFilter(f: FlightData, filter: FlightTypeFilter): boolean {
  const src = String(f.scheduleSource ?? '').toLowerCase();
  const ft = String(f.flightType ?? '').toLowerCase();
  const cat = String(f.cateOfFlight ?? '').toLowerCase();

  switch (filter) {
    case 'scheduled':
      return (
        !ft.includes('non-scheduled') &&
        !ft.includes('non scheduled') &&
        !cat.includes('raf') &&
        !ft.includes('raf') &&
        !cat.includes('additional') &&
        !ft.includes('additional')
      );
    case 'non-scheduled':
      return ft.includes('non-scheduled') || ft.includes('non scheduled') || cat.includes('non-scheduled');
    case 'additional':
      return (
        Boolean(f.scheduledAirlinesCreationCreatedAt) ||
        src.includes('scheduled_airlines_creation') ||
        ft.includes('additional') ||
        cat.includes('additional')
      );
    case 'raf':
      return ft.includes('raf') || cat.includes('raf');
    default:
      return true;
  }
}

function buildRawBySlNo(rawList: unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of rawList) {
    const base = normIsRecord(item) ? item : {};
    const nested = base.data;
    const d = normIsRecord(nested) ? nested : base;
    const sl = pickRaw(d, 'slNo', 'Sl No', 'Sl. No', 'Serial No', 'serialNo', 'SerialNo');
    if (sl) map.set(sl, d);
  }
  return map;
}

function flightToInvoiceRow(f: FlightData, raw?: Record<string, unknown>): InvoicePendingRow {
  const d = raw ?? {};
  return {
    slNo: displayScheduledAirlinesTableSerial(f),
    airline: String(f.airline ?? '').trim(),
    flightNo: String(f.flightNo ?? '').trim(),
    regn: pickRaw(d, 'regnNo', 'Regn', 'registration', 'Registration'),
    cargo: cargoLabel(f),
    route: String(f.route ?? f.destination ?? '').trim(),
    typeCraft: String(f.aircraft ?? '').trim(),
    staDate: String(f.staDate ?? '').trim(),
    staTime: String(f.staTime ?? '').trim(),
    stdDate: String(f.stdDate ?? '').trim(),
    stdTime: String(f.stdTime ?? '').trim(),
    ataDate: pickRaw(d, 'ataDate', 'ATADate', 'ATA Date'),
    ataTime: pickRaw(d, 'ataTime', 'ATATime', 'ATA Time'),
    atdDate: pickRaw(d, 'atdDate', 'ATDDate', 'ATD Date'),
    atdTime: pickRaw(d, 'atdTime', 'ATDTime', 'ATD Time'),
    exportedStatus: String(f.exportedNAV ?? '').trim() || 'No',
    exportedBy: pickRaw(d, 'exportedBy', 'Exported By', 'exportedByUser'),
    exportedDate: pickRaw(d, 'exportedDate', 'Exported Date', 'exportedOn'),
  };
}

function isOperationalFlight(f: FlightData): boolean {
  return !f.isCancelled && !isScheduleCancelledFlightNo(f.flightNo);
}

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

export default function InvoicePendingContent() {
  const [fromDate, setFromDate] = useState(DEFAULT_FROM_YMD);
  const [toDate, setToDate] = useState(DEFAULT_TO_YMD);
  const [flightType, setFlightType] = useState<FlightTypeFilter>('scheduled');
  const [rows, setRows] = useState<InvoicePendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);
  const { errors, clearField, applyAndFocus } = useFieldErrors<FilterField>(FILTER_FIELD_ORDER);

  const handleSearch = useCallback(async () => {
    const next = validateYmdDateRange(fromDate, toDate);
    if (applyAndFocus(next)) return;

    if (flightType !== 'scheduled') {
      toast.message('Only Scheduled Flight is loaded from the API today; other types return no rows.');
    }

    setLoading(true);
    setSearched(true);
    try {
      const fromDd = yyyyMmDdToDdMmYyyy(fromDate);
      const toDd = yyyyMmDdToDdMmYyyy(toDate);
      if (!fromDd || !toDd) {
        applyAndFocus({
          fromDate: 'From date must be a valid date.',
          toDate: 'To date must be a valid date.',
        });
        setRows([]);
        return;
      }

      const rawList = await fetchDailyScheduledFromAdvance(fromDd, toDd);
      const list = Array.isArray(rawList) ? rawList : [];
      const rawBySl = buildRawBySlNo(list);

      const flights = filterFlightsToDateWindow(processFlightData(list), fromDate, toDate)
        .filter((f) => !shouldHideScheduledAirlinesTableRow(f))
        .filter((f) => matchesFlightTypeFilter(f, flightType))
        .filter(isOperationalFlight);

      const nextRows = flights.map((f) => {
        const key = String(f.slNo ?? '').trim();
        return flightToInvoiceRow(f, rawBySl.get(key));
      });

      setRows(nextRows);
      if (nextRows.length === 0) {
        toast.message('No invoice-pending flights found for the selected filters.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Search failed.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applyAndFocus, flightType, fromDate, toDate]);

  const exportExcel = useCallback(async () => {
    if (rows.length === 0) {
      toast.warning('Run Search first — there are no rows to export.');
      return;
    }

    setExporting(true);
    try {
      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Invoice Pending', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.addRow(TABLE_COLUMNS.map((c) => c.header));
      rows.forEach((row) => {
        worksheet.addRow(TABLE_COLUMNS.map((c) => String(row[c.key] ?? '')));
      });

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF047857' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      TABLE_COLUMNS.forEach((_, i) => {
        worksheet.getColumn(i + 1).width = 14;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const saveAs = await loadFileSaverSaveAs();
      saveAs(
        xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
        `invoice-pending_${fromDate}_${toDate}.xlsx`,
      );
      toast.success('Excel exported.');
    } finally {
      setExporting(false);
    }
  }, [fromDate, rows, toDate]);

  const resultsLabel = useMemo(() => {
    if (!searched) return null;
    return `${rows.length} flight${rows.length === 1 ? '' : 's'}`;
  }, [rows.length, searched]);

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-emerald-50">
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader
          title="Flight data, invoice not created in ERP"
          icon={FileSpreadsheet}
          actions={
            resultsLabel ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-500">
                {resultsLabel}
              </span>
            ) : null
          }
        />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.05 }}
          className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end xl:gap-5">
            <div className={cn('min-w-[150px] flex-1', errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-fromDate">
                From date
              </label>
              <DatePicker
                id="field-fromDate"
                value={fromDate}
                onChange={(v) => {
                  setFromDate(v ?? '');
                  clearField('fromDate');
                }}
                valueFormat="yyyy-MM-dd"
              />
              <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
            </div>
            <div className={cn('min-w-[150px] flex-1', errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-toDate">
                To date
              </label>
              <DatePicker
                id="field-toDate"
                value={toDate}
                onChange={(v) => {
                  setToDate(v ?? '');
                  clearField('toDate');
                }}
                valueFormat="yyyy-MM-dd"
              />
              <FormFieldError id="field-toDate-error" message={errors.toDate} />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700">Flight type</label>
              <AdminRadioDropdown
                value={flightType}
                onChange={(v) => setFlightType(v as FlightTypeFilter)}
                options={FLIGHT_TYPE_OPTIONS}
                className={dropdownFieldClass}
              />
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row xl:w-auto">
              <motion.button
                type="button"
                disabled={loading}
                whileHover={loading ? undefined : { scale: 1.02 }}
                whileTap={loading ? undefined : { scale: 0.98 }}
                onClick={() => void handleSearch()}
                className={cn(
                  'inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 text-sm font-semibold text-white shadow-sm sm:flex-none',
                  loading ? 'cursor-not-allowed bg-amber-400' : 'bg-amber-500 hover:bg-amber-600',
                )}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="h-4 w-4 shrink-0" aria-hidden />
                )}
                Search
              </motion.button>
              <motion.button
                type="button"
                disabled={exporting || rows.length === 0}
                whileHover={exporting || rows.length === 0 ? undefined : { scale: 1.02 }}
                whileTap={exporting || rows.length === 0 ? undefined : { scale: 0.98 }}
                onClick={() => void exportExcel()}
                className={cn(
                  'inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 text-sm font-semibold text-white shadow-sm sm:flex-none',
                  exporting || rows.length === 0
                    ? 'cursor-not-allowed bg-amber-300'
                    : 'bg-amber-500 hover:bg-amber-600',
                )}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                )}
                Export in Excel
              </motion.button>
            </div>
          </div>
        </motion.div>

        {searched ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.08 }}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-emerald-800 text-white">
                    {TABLE_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={TABLE_COLUMNS.length} className="px-4 py-12 text-center text-gray-500">
                        No records for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr
                        key={`${row.slNo}-${row.staDate}-${idx}`}
                        className="hover:bg-emerald-50/40"
                      >
                        {TABLE_COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className="whitespace-nowrap px-3 py-2.5 text-gray-700"
                          >
                            {row[col.key] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
