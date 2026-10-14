'use client';

import { useCallback, useMemo, useState } from 'react';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import { motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, Download, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  fetchDailyScheduledFromAdvance,
  fetchFhrCollectionFlightLean,
} from '@/lib/api';
import {
  isExportedNavStatus,
  processFlightData,
  shouldHideScheduledAirlinesTableRow,
  type FlightData,
} from '@/utils/dataProcessor';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  required,
  validateYmdDateRange,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

type FilterMode = 'serial' | 'date';

const FILTER_FIELD_ORDER = ['serialNo', 'fromDate', 'toDate'] as const;
type FilterField = (typeof FILTER_FIELD_ORDER)[number];

type ExportErrorRow = {
  serialNo: string;
  flightNo: string;
  airline: string;
  staDate: string;
  exportStatus: string;
  errorMessage: string;
};

const DEFAULT_FROM_YMD = '2026-02-28';
const DEFAULT_TO_YMD = '2026-03-31';

const textInputClass =
  'h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

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

function flightToErrorRow(f: FlightData, message?: string): ExportErrorRow {
  const status = String(f.exportedNAV ?? '').trim() || 'No';
  return {
    serialNo: String(f.slNo ?? '').trim(),
    flightNo: String(f.flightNo ?? '').trim(),
    airline: String(f.airline ?? '').trim(),
    staDate: String(f.staDate ?? '').trim(),
    exportStatus: status,
    errorMessage:
      message ??
      (isExportedNavStatus(status)
        ? 'Export completed but flagged for review.'
        : 'Data not exported to Navision (ERP).'),
  };
}

function fhrDocToErrorRow(doc: Record<string, unknown>, serial: string): ExportErrorRow | null {
  const main =
    doc.mainDetails != null && typeof doc.mainDetails === 'object' && !Array.isArray(doc.mainDetails)
      ? (doc.mainDetails as Record<string, unknown>)
      : {};
  const exportStatus = String(
    main.exportedNAV ?? main.navisionDataExportStatus ?? doc.exportedNAV ?? 'No',
  ).trim();
  if (isExportedNavStatus(exportStatus) || exportStatus.toUpperCase() === 'Y') {
    return null;
  }
  return {
    serialNo: serial,
    flightNo: String(main.FlightNo ?? main.flightNo ?? main['Flight No'] ?? '').trim(),
    airline: String(main.Airline ?? main.airline ?? '').trim(),
    staDate: String(main.STADate ?? main.staDate ?? main['STA Date'] ?? '').trim(),
    exportStatus: exportStatus || 'No',
    errorMessage: 'Data not exported to Navision (ERP).',
  };
}

function xlsxArrayBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  // Ensure BlobPart is a plain ArrayBuffer for strict TS lib compatibility.
  const plainBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([plainBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export default function ExportedErrorReportContent() {
  const [filterMode, setFilterMode] = useState<FilterMode>('serial');
  const [serialNo, setSerialNo] = useState('');
  const [fromDate, setFromDate] = useState(DEFAULT_FROM_YMD);
  const [toDate, setToDate] = useState(DEFAULT_TO_YMD);
  const [rows, setRows] = useState<ExportErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus } =
    useFieldErrors<FilterField>(FILTER_FIELD_ORDER);

  const handleFind = useCallback(async () => {
    if (filterMode === 'serial') {
      const serialErr = required(serialNo, 'Serial number');
      const next: FieldErrors<FilterField> = serialErr ? { serialNo: serialErr } : {};
      if (applyAndFocus(next)) {
        setRows([]);
        return;
      }
    } else {
      const next = validateYmdDateRange(fromDate, toDate);
      if (applyAndFocus(next)) {
        setRows([]);
        return;
      }
    }

    setLoading(true);
    setSearched(true);
    try {
      if (filterMode === 'serial') {
        const serial = serialNo.trim();
        const doc = await fetchFhrCollectionFlightLean(serial);
        if (!doc) {
          toast.error('No flight record found for this serial number.');
          setRows([]);
          return;
        }
        const row = fhrDocToErrorRow(doc, serial);
        setRows(row ? [row] : []);
        if (!row) {
          toast.message('No export errors for this serial — record is marked exported.');
        }
        return;
      }

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

      const raw = await fetchDailyScheduledFromAdvance(fromDd, toDd);
      const flights = filterFlightsToDateWindow(
        processFlightData(Array.isArray(raw) ? raw : []),
        fromDate,
        toDate,
      ).filter((f) => !shouldHideScheduledAirlinesTableRow(f));

      const errorRows = flights
        .filter((f) => !isExportedNavStatus(f.exportedNAV))
        .map((f) => flightToErrorRow(f));

      setRows(errorRows);
      if (errorRows.length === 0) {
        toast.message('No export errors found for the selected date range.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load export errors.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applyAndFocus, filterMode, fromDate, serialNo, toDate]);

  const exportExcel = useCallback(async () => {
    if (rows.length === 0) {
      toast.warning('Run Find first — there are no rows to export.');
      return;
    }

    setExporting(true);
    try {
      const headers = [
        'Serial No',
        'Flight No',
        'Airline',
        'STA Date',
        'Export Status',
        'Error Message',
      ];
      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Export Errors', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      worksheet.addRow(headers);
      rows.forEach((row) => {
        worksheet.addRow([
          row.serialNo,
          row.flightNo,
          row.airline,
          row.staDate,
          row.exportStatus,
          row.errorMessage,
        ]);
      });

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF1F2937' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD1FAE5' },
        };
      });
      headers.forEach((_, i) => {
        worksheet.getColumn(i + 1).width = 18;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const saveAs = await loadFileSaverSaveAs();
      saveAs(
        xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
        `exported-error-erp_${filterMode === 'serial' ? serialNo.trim() : `${fromDate}_${toDate}`}.xlsx`,
      );
      toast.success('Excel exported.');
    } finally {
      setExporting(false);
    }
  }, [filterMode, fromDate, rows, serialNo, toDate]);

  const resultsSummary = useMemo(() => {
    if (!searched) return null;
    return `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  }, [rows.length, searched]);

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-emerald-50">
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader
          title="Exported error in ERP"
          icon={AlertCircle}
          actions={
            resultsSummary ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-500">
                {resultsSummary}
              </span>
            ) : null
          }
        />

        <p className="mb-4 text-sm font-medium text-red-600">
          Note : Error Report while exporting to Navision
        </p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.05 }}
          className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
        >
          <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 sm:px-6">
            <span className="text-sm font-semibold text-gray-800">Filter by</span>
          </div>

          <div className="p-5 sm:p-6">
            <div
              className="mb-5 flex flex-wrap items-center gap-6"
              role="radiogroup"
              aria-label="Filter mode"
            >
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="radio"
                  name="export-error-filter"
                  checked={filterMode === 'serial'}
                  onChange={() => {
                    setFilterMode('serial');
                    clearAll();
                  }}
                  className="h-4 w-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Serial no.
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="radio"
                  name="export-error-filter"
                  checked={filterMode === 'date'}
                  onChange={() => {
                    setFilterMode('date');
                    clearAll();
                  }}
                  className="h-4 w-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Date wise
              </label>
            </div>

            <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end xl:gap-5">
              {filterMode === 'serial' ? (
                <div className="min-w-[200px] flex-1">
                  <label htmlFor="field-serialNo" className="mb-2 block text-sm font-medium text-gray-700">
                    Fill serial no.
                  </label>
                  <input
                    id="field-serialNo"
                    type="text"
                    value={serialNo}
                    onChange={(e) => {
                      setSerialNo(e.target.value);
                      clearField('serialNo');
                    }}
                    autoComplete="off"
                    placeholder="Enter serial number"
                    aria-invalid={Boolean(errors.serialNo)}
                    aria-describedby={errors.serialNo ? 'field-serialNo-error' : undefined}
                    className={cn(textInputClass, errors.serialNo && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-serialNo-error" message={errors.serialNo} />
                </div>
              ) : (
                <>
                  <div className={cn('min-w-[160px] flex-1', errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
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
                  <div className={cn('min-w-[160px] flex-1', errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
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
                </>
              )}

              <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row xl:w-auto">
                <motion.button
                  type="button"
                  disabled={loading}
                  whileHover={loading ? undefined : { scale: 1.02 }}
                  whileTap={loading ? undefined : { scale: 0.98 }}
                  onClick={() => void handleFind()}
                  className={cn(
                    'inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 text-sm font-semibold text-white shadow-sm sm:flex-none',
                    loading ? 'cursor-not-allowed bg-red-400' : 'bg-red-600 hover:bg-red-700',
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  Find
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
                      ? 'cursor-not-allowed bg-sky-300'
                      : 'bg-sky-600 hover:bg-sky-700',
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
          </div>
        </motion.div>

        {searched ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.08 }}
            className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-emerald-50/80">
                  <tr>
                    {['Serial No', 'Flight No', 'Airline', 'STA Date', 'Export Status', 'Error'].map(
                      (h) => (
                        <th
                          key={h}
                          scope="col"
                          className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-700"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-400" aria-hidden />
                        No export errors for the current filter.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={`${row.serialNo}-${row.staDate}-${row.flightNo}`} className="hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{row.serialNo}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.flightNo || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.airline || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.staDate || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-red-600">{row.exportStatus}</td>
                        <td className="min-w-[200px] px-4 py-3 text-gray-600">{row.errorMessage}</td>
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
