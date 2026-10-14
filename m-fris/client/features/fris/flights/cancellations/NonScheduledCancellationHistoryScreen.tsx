'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Download, History, Plane, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  FLIGHT_FILTER_ACTIONS_CLASS,
  FLIGHT_FILTER_PRIMARY_BTN_CLASS,
  FLIGHT_FILTER_SECONDARY_BTN_CLASS,
} from '@/components/fris/flights/flightFilterBarLayout';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import {
  fetchNonScheduledCancellations,
  type NonScheduledCancellationRow,
} from '@/lib/api';
import { postDateScopedFlightCancel } from '@/services/api';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  hasFieldErrors,
  required,
  validateYmdDateRange,
  validDate,
} from '@/lib/form-validation';
import { tryParseCancellationDateToYmd } from '@/utils/cancellationDisplay';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import { cn } from '@/lib/utils';

const FILTER_DATE_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterDateField = (typeof FILTER_DATE_FIELD_ORDER)[number];

const RECORD_FIELD_ORDER = ['recordFlightId', 'recordDate'] as const;
type RecordField = (typeof RECORD_FIELD_ORDER)[number];

const TABLE_COLUMNS = [
  { label: 'Serial No', headerClass: 'text-left' },
  { label: 'Airline', headerClass: 'text-left' },
  { label: 'Flight', headerClass: 'text-left' },
  { label: 'Route', headerClass: 'text-left' },
  { label: 'Arrival', headerClass: 'text-center' },
  { label: 'Departure', headerClass: 'text-center' },
  { label: 'Aircraft', headerClass: 'text-center' },
  { label: 'Status', headerClass: 'text-center' },
] as const;

/** Mirrors the Scheduled export header fill so both exports read identically. */
const NS_EXPORT_HEADER_FILL_ARGB = 'FFFFDAB9';

const NS_EXPORT_HEADERS = [
  'SerialNo',
  'Airline',
  'Arrival Flight No',
  'Departure Flight No',
  'Route',
  'ATA date',
  'ATA time',
  'ATD date',
  'ATD time',
  'Aircraft',
  'Last updated',
] as const;

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

function ymdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function getDefaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  from.setFullYear(from.getFullYear() - 1);
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  to.setMonth(to.getMonth() + 3);
  return { from: localCalendarYmd(from), to: localCalendarYmd(to) };
}

function displayFlightNo(row: NonScheduledCancellationRow): string {
  const arr = row.arrivalFlightNo.trim();
  const dep = row.departureFlightNo.trim();
  if (arr && dep && arr !== dep) return `${arr} / ${dep}`;
  return arr || dep || '—';
}

function displayLeg(date: string, time: string): string {
  const d = date.trim();
  const t = time.trim();
  if (d && t) return `${d} ${t}`;
  return d || t || '—';
}

function nsCancellationRowInDateRange(
  row: NonScheduledCancellationRow,
  fromYmd: string,
  toYmd: string,
): boolean {
  const from = fromYmd.trim();
  const to = toYmd.trim();
  const ata = tryParseCancellationDateToYmd(row.ataDate);
  if (ata) return ata >= from && ata <= to;
  const atd = tryParseCancellationDateToYmd(row.atdDate);
  if (atd) return atd >= from && atd <= to;
  return false;
}

function excelJsWriteBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  return new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function nsExportColumnWidths(
  rows: Array<Record<(typeof NS_EXPORT_HEADERS)[number], string>>,
): number[] {
  const headers = [...NS_EXPORT_HEADERS];
  return headers.map((header) => {
    const headerLen = header.length;
    const valueLen = rows.reduce((max, row) => {
      const cell = String(row[header] ?? '');
      const longestLine = cell
        .split(/\r?\n/)
        .reduce((lineMax, line) => Math.max(lineMax, line.length), 0);
      return Math.max(max, longestLine);
    }, 0);
    const ideal = Math.max(headerLen, valueLen) + 4;
    return Math.min(Math.max(ideal, 12), 90);
  });
}

/** Best-effort userid from browser session (parity with Scheduled Cancellation screen). */
function cancellationUserIdFromStorage(): string {
  if (typeof window === 'undefined') return '';
  return String(
    localStorage.getItem('userid') ||
      localStorage.getItem('username') ||
      localStorage.getItem('userEmail') ||
      '',
  ).trim();
}

export function NonScheduledCancellationHistoryContent() {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const todayYmd = useMemo(() => localCalendarYmd(), []);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const { errors: dateErrors, clearField: clearDateField, applyAndFocus: applyDateErrors, setAll: setDateErrors } =
    useFieldErrors<FilterDateField>(FILTER_DATE_FIELD_ORDER);
  const [rows, setRows] = useState<NonScheduledCancellationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchSerial, setSearchSerial] = useState('');
  const [searchAirline, setSearchAirline] = useState('');
  const [searchFlightNo, setSearchFlightNo] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordFlightId, setRecordFlightId] = useState('');
  const [recordDate, setRecordDate] = useState(todayYmd);
  const { errors: recordErrors, clearField: clearRecordField, applyAndFocus: applyRecordErrors } =
    useFieldErrors<RecordField>(RECORD_FIELD_ORDER);
  const [recordReason, setRecordReason] = useState('');
  const [recordIntimationMode, setRecordIntimationMode] = useState('');
  const [recordAirline, setRecordAirline] = useState('');
  const [recordFlightNo, setRecordFlightNo] = useState('');
  const [recordRoute, setRecordRoute] = useState('');
  const [recordStaDate, setRecordStaDate] = useState('');
  const [recordStaTime, setRecordStaTime] = useState('');
  const [recordStdDate, setRecordStdDate] = useState('');
  const [recordStdTime, setRecordStdTime] = useState('');
  const [recordBusy, setRecordBusy] = useState(false);

  const load = useCallback(async (opts?: { focus?: boolean }) => {
    const from = fromDate.trim();
    const to = toDate.trim();
    const next = validateYmdDateRange(from, to, {
      fromLabel: 'From date',
      toLabel: 'To date',
    });
    if (opts?.focus) {
      if (applyDateErrors(next)) {
        toast.error(next.toDate || next.fromDate || 'Select both from and to dates.');
        return;
      }
    } else {
      setDateErrors(next);
      if (hasFieldErrors(next)) return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNonScheduledCancellations({ fromDate: from, tillDate: to });
      setRows(data.filter((row) => nsCancellationRowInDateRange(row, from, to)));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load non-scheduled cancellations';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [applyDateErrors, fromDate, setDateErrors, toDate]);

  useEffect(() => {
    void load({ focus: false });
  }, [load]);

  const displayRows = useMemo(() => {
    const serialQ = searchSerial.trim().toLowerCase();
    const airlineQ = searchAirline.trim().toLowerCase();
    const flightQ = searchFlightNo.trim().toLowerCase();
    return rows.filter((row) => {
      if (serialQ && !String(row.serialNo).includes(serialQ)) return false;
      if (airlineQ && !row.airline.toLowerCase().includes(airlineQ)) return false;
      if (flightQ) {
        const flight = displayFlightNo(row).toLowerCase();
        if (!flight.includes(flightQ)) return false;
      }
      return true;
    });
  }, [rows, searchSerial, searchAirline, searchFlightNo]);

  const hasActiveSearch =
    searchSerial.trim().length > 0 ||
    searchAirline.trim().length > 0 ||
    searchFlightNo.trim().length > 0;

  const displayContext = `${ymdToDdMmYyyy(fromDate)} – ${ymdToDdMmYyyy(toDate)}`;

  const exportCancellationData = useCallback(async () => {
    const from = fromDate.trim();
    const to = toDate.trim();
    if (!from || !to) {
      toast.error('Select from and to dates.');
      return;
    }
    if (from > to) {
      toast.error('From date must be on or before to date.');
      return;
    }
    if (displayRows.length === 0) {
      toast.error('No cancelled non-scheduled flights in the current list to export.');
      return;
    }
    setExportBusy(true);
    try {
      const exportRows: Array<
        Record<(typeof NS_EXPORT_HEADERS)[number], string>
      > = displayRows.map((row) => ({
        SerialNo: String(row.serialNo ?? ''),
        Airline: row.airline || '',
        'Arrival Flight No': row.arrivalFlightNo || '',
        'Departure Flight No': row.departureFlightNo || '',
        Route: row.route || '',
        'ATA date': row.ataDate || '',
        'ATA time': row.ataTime || '',
        'ATD date': row.atdDate || '',
        'ATD time': row.atdTime || '',
        Aircraft: row.aircraft || '',
        'Last updated': String(row.updatedAt ?? ''),
      }));

      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Non-Scheduled Cancellations', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.addRow([...NS_EXPORT_HEADERS]);
      for (const er of exportRows) {
        worksheet.addRow([...NS_EXPORT_HEADERS.map((h) => er[h])]);
      }

      const headerExcelRow = worksheet.getRow(1);
      headerExcelRow.height = 28;
      headerExcelRow.eachCell((cell) => {
        cell.font = { bold: true, size: 11, color: { argb: 'FF1F2937' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: NS_EXPORT_HEADER_FILL_ARGB },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      });

      nsExportColumnWidths(exportRows).forEach((width, idx) => {
        worksheet.getColumn(idx + 1).width = width;
      });

      const excelBuf = await workbook.xlsx.writeBuffer();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const saveAs = await loadFileSaverSaveAs();
      saveAs(
        excelJsWriteBufferToBlob(excelBuf),
        `non-scheduled-cancellation-history_${from}_${to}_${stamp}.xlsx`,
      );
      toast.success(`Exported ${exportRows.length} row(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportBusy(false);
    }
  }, [fromDate, toDate, displayRows]);

  const submitRecordCancellation = async (e: React.FormEvent) => {
    e.preventDefault();
    const fid = recordFlightId.trim().replace(/^FL-/i, '');
    const next: Partial<Record<RecordField, string>> = {};
    const flightReq = required(fid, 'Instance Sl. No.');
    if (flightReq) next.recordFlightId = flightReq;
    const dateReq = required(recordDate, 'Date');
    if (dateReq) next.recordDate = dateReq;
    else {
      const dateFmt = validDate(recordDate, 'Date');
      if (dateFmt) next.recordDate = dateFmt;
    }
    if (applyRecordErrors(next)) {
      toast.error('Flight ID (instance Sl. No.) and date are required.');
      return;
    }
    setRecordBusy(true);
    try {
      await postDateScopedFlightCancel({
        flightId: fid,
        date: recordDate.trim(),
        reason: recordReason.trim() || undefined,
        intimationMode: recordIntimationMode.trim() || undefined,
        cancelledByUserId: cancellationUserIdFromStorage() || undefined,
        airlineName: recordAirline.trim() || undefined,
        flightNo: recordFlightNo.trim() || undefined,
        route: recordRoute.trim() || undefined,
        staDate: recordStaDate.trim() || undefined,
        staTime: recordStaTime.trim() || undefined,
        stdDate: recordStdDate.trim() || undefined,
        stdTime: recordStdTime.trim() || undefined,
      });
      toast.success('Cancellation recorded for that date.');
      setRecordOpen(false);
      setRecordFlightId('');
      setRecordReason('');
      setRecordIntimationMode('');
      setRecordAirline('');
      setRecordFlightNo('');
      setRecordRoute('');
      setRecordStaDate('');
      setRecordStaTime('');
      setRecordStdDate('');
      setRecordStdTime('');
      await load({ focus: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record cancellation');
    } finally {
      setRecordBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6"
    >
      <div className="mb-4">
        <FrisPageHeader
          title="Non-Scheduled Cancellation History"
          icon={History}
          actions={
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className={cn(dateErrors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                <label htmlFor="field-fromDate" className="mb-1.5 block text-xs font-medium text-gray-600">From date</label>
                <DatePicker
                  id="field-fromDate"
                  value={fromDate}
                  onChange={(v) => {
                    setFromDate(v);
                    clearDateField('fromDate');
                    clearDateField('toDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  className="min-w-[200px]"
                  ariaLabel="From date"
                />
                <FormFieldError id="field-fromDate-error" message={dateErrors.fromDate} />
              </div>
              <div className={cn(dateErrors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                <label htmlFor="field-toDate" className="mb-1.5 block text-xs font-medium text-gray-600">To date</label>
                <DatePicker
                  id="field-toDate"
                  value={toDate}
                  onChange={(v) => {
                    setToDate(v);
                    clearDateField('toDate');
                    clearDateField('fromDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  className="min-w-[200px]"
                  ariaLabel="To date"
                />
                <FormFieldError id="field-toDate-error" message={dateErrors.toDate} />
              </div>
              <div className={FLIGHT_FILTER_ACTIONS_CLASS}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void load({ focus: true })}
                  disabled={loading}
                  className={FLIGHT_FILTER_PRIMARY_BTN_CLASS}
                >
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                  Refresh
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void exportCancellationData()}
                  disabled={loading || exportBusy || displayRows.length === 0}
                  className={FLIGHT_FILTER_SECONDARY_BTN_CLASS}
                >
                  <Download className={cn('h-4 w-4', exportBusy && 'opacity-60')} />
                  {exportBusy ? 'Exporting…' : 'Export data'}
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setRecordOpen((v) => {
                      const next = !v;
                      if (next) setRecordDate(fromDate.trim() || todayYmd);
                      return next;
                    });
                  }}
                  className={cn(
                    FLIGHT_FILTER_SECONDARY_BTN_CLASS,
                    'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
                  )}
                >
                  Record cancellation
                </motion.button>
              </div>
            </div>
          }
        />
      </div>

      {recordOpen && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          onSubmit={(e) => void submitRecordCancellation(e)}
          className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-900">
            Record a date-scoped non-scheduled cancellation
          </h3>
          <p className="text-xs text-gray-500">
            Hides this instance from the non-scheduled list for the chosen date only. Does not change
            booking or main-details masters.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="field-recordFlightId" className="block text-xs font-medium text-gray-600 mb-1">Instance Sl. No. *</label>
              <input
                id="field-recordFlightId"
                className={cn(
                  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm',
                  recordErrors.recordFlightId && FRIS_INVALID_CONTROL,
                )}
                value={recordFlightId}
                onChange={(e) => {
                  setRecordFlightId(e.target.value);
                  clearRecordField('recordFlightId');
                }}
                placeholder="e.g. 1001"
                aria-invalid={!!recordErrors.recordFlightId}
              />
              <FormFieldError id="field-recordFlightId-error" message={recordErrors.recordFlightId} />
            </div>
            <div className={cn(recordErrors.recordDate && FRIS_INVALID_PICKER_WRAP)}>
              <label htmlFor="field-recordDate" className="block text-xs font-medium text-gray-600 mb-1">Date (YYYY-MM-DD) *</label>
              <DatePicker
                id="field-recordDate"
                value={recordDate}
                onChange={(v) => {
                  setRecordDate(v);
                  clearRecordField('recordDate');
                }}
                valueFormat="yyyy-MM-dd"
                className="w-full"
                ariaLabel="Cancellation date"
              />
              <FormFieldError id="field-recordDate-error" message={recordErrors.recordDate} />
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordReason}
                onChange={(e) => setRecordReason(e.target.value)}
                placeholder="Operational / weather…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Intimation mode (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordIntimationMode}
                onChange={(e) => setRecordIntimationMode(e.target.value)}
                placeholder="e.g. Email, Phone, AIMS"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Airline (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordAirline}
                onChange={(e) => setRecordAirline(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Flight number (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordFlightNo}
                onChange={(e) => setRecordFlightNo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Route (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordRoute}
                onChange={(e) => setRecordRoute(e.target.value)}
                placeholder="DEL - BOM"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">STA date / time</label>
              <div className="flex gap-2">
                <input
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={recordStaDate}
                  onChange={(e) => setRecordStaDate(e.target.value)}
                  placeholder="dd/MM/yyyy"
                />
                <input
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={recordStaTime}
                  onChange={(e) => setRecordStaTime(e.target.value)}
                  placeholder="HH:mm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">STD date / time</label>
              <div className="flex gap-2">
                <input
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={recordStdDate}
                  onChange={(e) => setRecordStdDate(e.target.value)}
                  placeholder="dd/MM/yyyy"
                />
                <input
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={recordStdTime}
                  onChange={(e) => setRecordStdTime(e.target.value)}
                  placeholder="HH:mm"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700"
              onClick={() => setRecordOpen(false)}
            >
              Close
            </button>
            <button
              type="submit"
              disabled={recordBusy}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {recordBusy ? 'Saving…' : 'Save cancellation'}
            </button>
          </div>
        </motion.form>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Cancelled non-scheduled flights</h3>
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-4 w-4 text-gray-400" />
              Date range{' '}
              <span className="font-medium text-gray-700">{displayContext}</span>
              {!loading && (
                <span className="font-medium text-emerald-600">
                  · {displayRows.length} record{displayRows.length === 1 ? '' : 's'}
                  {hasActiveSearch && rows.length !== displayRows.length
                    ? ` (filtered from ${rows.length})`
                    : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="border-b border-gray-100 bg-gray-50/60 px-6 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Serial No</label>
              <input
                type="text"
                value={searchSerial}
                onChange={(e) => setSearchSerial(e.target.value)}
                placeholder="e.g. 1001"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <FormFieldError />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Airline</label>
              <input
                type="text"
                value={searchAirline}
                onChange={(e) => setSearchAirline(e.target.value)}
                placeholder="Airline name"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <FormFieldError />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Flight No</label>
              <input
                type="text"
                value={searchFlightNo}
                onChange={(e) => setSearchFlightNo(e.target.value)}
                placeholder="e.g. NS-8801"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <FormFieldError />
            </div>
            {hasActiveSearch && (
              <div className={FLIGHT_FILTER_ACTIONS_CLASS}>
                <button
                  type="button"
                  onClick={() => {
                    setSearchSerial('');
                    setSearchAirline('');
                    setSearchFlightNo('');
                  }}
                  className={FLIGHT_FILTER_SECONDARY_BTN_CLASS}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading cancellations…</div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-red-600">{error}</div>
        ) : displayRows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Plane className="h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">No cancelled non-scheduled flights</p>
            <p className="max-w-md text-xs text-gray-500">
              Flights cancelled from Non-Scheduled Main Details (OTP + intimation, same as
              scheduled) appear here for the selected date range. Widen the range if needed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-white">
                  {TABLE_COLUMNS.map(({ label, headerClass }) => (
                    <th
                      key={label}
                      className={cn(
                        'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500',
                        headerClass,
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr
                    key={`${row.serialNo}-${row.updatedAt ?? ''}`}
                    className="border-b border-gray-50 hover:bg-emerald-50/30"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{row.serialNo}</td>
                    <td className="px-4 py-3 text-gray-800">{row.airline || '—'}</td>
                    <td className="px-4 py-3 text-gray-800">{displayFlightNo(row)}</td>
                    <td className="px-4 py-3 text-gray-800">{row.route || '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {displayLeg(row.ataDate, row.ataTime)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {displayLeg(row.atdDate, row.atdTime)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.aircraft || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                        Cancelled
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">
        <Search className="h-3.5 w-3.5" />
        Separate from scheduled cancellation history — sourced from non-scheduled main details
        after OTP cancel.
      </p>
    </motion.div>
  );
}
