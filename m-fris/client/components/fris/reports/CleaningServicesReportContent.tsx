'use client';

import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Download, FileText, RefreshCw, Sparkles, Table2 } from 'lucide-react';
import {
  buildScheduledAirlinesHrefFromCleaningServices,
  parseCleaningServicesReturnFromUrl,
} from '@/lib/cleaningServicesScheduledAirlinesNav';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchCleaningServicesReportRows,
  getApiBase,
  type CleaningServicesReportApiRow,
} from '@/lib/api';
import { dailyScheduledFlightsQueryOptions } from '@/hooks/fris/useDailyScheduledFlightsQuery';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
import {
  ReportsAdaptiveTable,
  ReportsMobileCard,
  ReportsMobileCardField,
  ReportsMobileCardGrid,
  ReportsMobileCardHeader,
  ReportsMobileCardList,
  ReportsMobileEmpty,
} from '@/components/fris/reports/ReportsMobileCards';
import { FRIS_REPORTS_PAGE_SHELL_CLASS, FRIS_REPORTS_PRIMARY_BTN_CLASS, FRIS_REPORTS_SECONDARY_BTN_CLASS } from '@/lib/fris-reports-responsive';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  displayScheduledAirlinesTableSerial,
  processFlightData,
  shouldHideScheduledAirlinesTableRow,
  type FlightData,
} from '@/utils/dataProcessor';

type CleaningServicesRow = {
  id: string;
  serialNo: number;
  staYmd: string;
  customer: string;
  airlineCode: string;
  flightSerialNo: string;
  flightNo: string;
  category: string;
  typeOfHandling: string;
  aircraftBody: string;
  typeOfFlight: 'Cargo' | 'Passenger';
  clFromDate: string;
  clFromTime: string;
  clEndDate: string;
  clEndTime: string;
  duration: string;
  supervisor: string;
  remarks: string;
  exportedStatus: 'Exported' | 'No';
};

const TABLE_COLUMNS: Array<{ key: keyof CleaningServicesRow; header: string }> = [
  { key: 'airlineCode', header: 'Airline Code' },
  { key: 'flightSerialNo', header: 'Flight Serial No' },
  { key: 'flightNo', header: 'Flight No' },
  { key: 'category', header: 'Category' },
  { key: 'typeOfHandling', header: 'Type of Handling' },
  { key: 'typeOfFlight', header: 'Type of Flight' },
  { key: 'aircraftBody', header: 'Aircraft Body' },
  { key: 'clFromDate', header: 'Cl. From Date' },
  { key: 'clFromTime', header: 'Cl. From Time' },
  { key: 'clEndDate', header: 'Cl. End Date' },
  { key: 'clEndTime', header: 'Cl. End Time' },
  { key: 'duration', header: 'Duration' },
  { key: 'supervisor', header: 'Supervisor' },
  { key: 'remarks', header: 'Remarks' },
];

function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function todayYmd(): string {
  const now = new Date();
  return formatYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

const DEFAULT_FROM_DATE = '2026-02-28';
const DEFAULT_TO_DATE = '2026-03-31';
const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;

function yyyyMmDdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return '';
  const [year, month, day] = parts;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function normalizeExportedStatus(value: unknown): 'Exported' | 'No' {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === 'exported' || raw === 'yes' || raw === 'true' || raw === 'y'
    ? 'Exported'
    : 'No';
}

function formatLoadError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (
    error instanceof TypeError &&
    (message === 'Failed to fetch' || message.toLowerCase().includes('fetch'))
  ) {
    const base = getApiBase().replace(/\/$/, '');
    return `Cannot reach the API at ${base || 'server'}.`;
  }
  return error instanceof Error ? error.message : fallback;
}

function xlsxArrayBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
  return new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function getAutoColumnWidths(rows: Array<Record<string, string>>): number[] {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0] ?? {});
  if (!headers.length) return [];

  return headers.map((header) => {
    const headerLen = String(header).length;
    const valueLen = rows.reduce((max, row) => {
      const cell = String(row?.[header] ?? '');
      const longestLine = cell
        .split(/\r?\n/)
        .reduce((lineMax, line) => Math.max(lineMax, line.length), 0);
      return Math.max(max, longestLine);
    }, 0);

    const ideal = Math.max(headerLen, valueLen) + 2;
    return Math.min(Math.max(ideal, 10), 40);
  });
}

function buildExportedStatusMap(flights: FlightData[]): Map<string, 'Exported' | 'No'> {
  const out = new Map<string, 'Exported' | 'No'>();

  for (const flight of flights) {
    if (shouldHideScheduledAirlinesTableRow(flight)) continue;
    const status = normalizeExportedStatus(flight.exportedNAV);
    const keys = [
      displayScheduledAirlinesTableSerial(flight),
      String(flight.slNo ?? '').trim(),
      String(flight.legacySlNo ?? '').trim(),
    ].filter(Boolean);
    for (const key of keys) {
      out.set(key, status);
    }
  }

  return out;
}

function mapApiRowToTableRow(
  row: CleaningServicesReportApiRow,
  exportedStatusBySerial: Map<string, 'Exported' | 'No'>,
): CleaningServicesRow {
  const serialKey = String(row.serialNo ?? '').trim();
  const displaySerial = String(row.flightSerialNo ?? '').trim() || serialKey;

  return {
    ...row,
    flightSerialNo: displaySerial,
    exportedStatus:
      exportedStatusBySerial.get(displaySerial) ??
      exportedStatusBySerial.get(serialKey) ??
      'No',
  };
}

export default function CleaningServicesReportContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const restored = useRef(false);

  const [fromDate, setFromDate] = useState(DEFAULT_FROM_DATE);
  const [toDate, setToDate] = useState(DEFAULT_TO_DATE);
  const [customer, setCustomer] = useState('');
  const [frisNo, setFrisNo] = useState('');
  const [exportedStatus, setExportedStatus] = useState<'all' | 'No' | 'Exported'>('No');
  const [rows, setRows] = useState<CleaningServicesRow[]>([]);
  const [hasRequested, setHasRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors(FILTER_FIELD_ORDER);

  // Restore filters when returning from Flights → Scheduled Airlines.
  if (!restored.current) {
    restored.current = true;
    const back = parseCleaningServicesReturnFromUrl(searchParams);
    if (back) {
      if (back.fromYmd) setFromDate(back.fromYmd);
      if (back.toYmd) setToDate(back.toYmd);
      if (back.customer !== null) setCustomer(back.customer ?? '');
      if (back.frisNo !== null) setFrisNo(back.frisNo ?? '');
      if (
        back.exportedStatus === 'all' ||
        back.exportedStatus === 'No' ||
        back.exportedStatus === 'Exported'
      ) {
        setExportedStatus(back.exportedStatus);
      }
    }
  }

  const recordsSummary = useMemo(() => {
    if (!hasRequested) return null;
    return `${rows.length} record${rows.length === 1 ? '' : 's'} found`;
  }, [hasRequested, rows.length]);

  const loadRecords = useCallback(async () => {
    setHasRequested(true);
    setError(null);

    const next = validateYmdDateRange(fromDate, toDate, { toNotAfterToday: true });
    if (applyAndFocus(next)) {
      setRows([]);
      return;
    }

    setLoading(true);

    try {
      const fromDd = yyyyMmDdToDdMmYyyy(fromDate);
      const toDd = yyyyMmDdToDdMmYyyy(toDate);
      const [cleaningRows, rawFlights] = await Promise.all([
        fetchCleaningServicesReportRows(fromDate, toDate),
        fromDd && toDd
          ? queryClient
              .fetchQuery(dailyScheduledFlightsQueryOptions(fromDd, toDd))
              .catch(() => [])
          : Promise.resolve([]),
      ]);
      const exportedStatusBySerial = buildExportedStatusMap(
        processFlightData(Array.isArray(rawFlights) ? rawFlights : []),
      );

      const customerFilter = customer.trim().toLowerCase();
      const frisFilter = frisNo.trim().toLowerCase();

      const filteredRows = cleaningRows
        .map((row) => mapApiRowToTableRow(row, exportedStatusBySerial))
        .filter((row) => {
          if (exportedStatus !== 'all' && row.exportedStatus !== exportedStatus) {
            return false;
          }

          if (customerFilter) {
            const haystack = `${row.customer} ${row.airlineCode}`.trim().toLowerCase();
            if (!haystack.includes(customerFilter)) return false;
          }

          if (frisFilter) {
            const serialCandidates = [
              row.flightSerialNo,
              String(row.serialNo ?? ''),
            ]
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean);
            if (!serialCandidates.some((value) => value.includes(frisFilter))) return false;
          }

          return true;
        });

      setRows(filteredRows);
      if (filteredRows.length === 0) {
        toast.message('No cleaning services records found for the selected filters.');
      }
    } catch (loadError) {
      const message = formatLoadError(
        loadError,
        'Unable to load cleaning services records.',
      );
      setRows([]);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [customer, exportedStatus, fromDate, frisNo, toDate, applyAndFocus, queryClient]);

  // Records populate automatically on load and whenever a filter changes.
  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRecords();
    }, 350);
    return () => clearTimeout(handle);
  }, [loadRecords]);

  const exportExcel = useCallback(async () => {
    if (rows.length === 0) {
      toast.warning('Load some records before exporting.');
      return;
    }

    setExportingExcel(true);
    try {
      const widthRows = rows.map((row) => {
        const out: Record<string, string> = {};
        TABLE_COLUMNS.forEach((column) => {
          out[column.header] = String(row[column.key] ?? '');
        });
        return out;
      });

      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Cleaning Services', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.addRow(TABLE_COLUMNS.map((column) => column.header));
      rows.forEach((row) => {
        worksheet.addRow(TABLE_COLUMNS.map((column) => String(row[column.key] ?? '')));
      });

      const headerRow = worksheet.getRow(1);
      headerRow.height = 26;
      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          size: 11,
          color: { argb: 'FF1F2937' },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDBEAFE' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
          left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
          bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
          right: { style: 'thin', color: { argb: 'FFBFDBFE' } },
        };
      });

      const widths = getAutoColumnWidths(widthRows);
      widths.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
      });

      const excelBuffer = await workbook.xlsx.writeBuffer();
      const blob = xlsxArrayBufferToBlob(
        excelBuffer instanceof ArrayBuffer ? excelBuffer : (excelBuffer as ArrayBufferView),
      );
      const saveAs = await loadFileSaverSaveAs();
      saveAs(blob, `cleaning-services_${fromDate}_${toDate}.xlsx`);
      toast.success('Cleaning services Excel exported.');
    } finally {
      setExportingExcel(false);
    }
  }, [fromDate, rows, toDate]);

  const exportPdf = useCallback(async () => {
    if (rows.length === 0) {
      toast.warning('Load some records before exporting.');
      return;
    }

    setExportingPdf(true);
    try {
      const filterParts: string[] = [];
      if (customer.trim()) filterParts.push(`Customer: ${customer.trim()}`);
      if (frisNo.trim()) filterParts.push(`FRIS No: ${frisNo.trim()}`);
      if (exportedStatus !== 'all') {
        filterParts.push(`Exported status: ${exportedStatus}`);
      }

      const { downloadCleaningServicesReportPdf } = await import(
        '@/components/fris/reports/cleaningServicesReportPdf'
      );
      await downloadCleaningServicesReportPdf({
        fromDate,
        toDate,
        filterSummary: filterParts.join('   ·   '),
        headers: TABLE_COLUMNS.map((column) => column.header),
        rows: rows.map((row) =>
          TABLE_COLUMNS.map((column) => String(row[column.key] ?? '').trim()),
        ),
        filename: `cleaning-services_${fromDate}_${toDate}.pdf`,
      });
      toast.success('Cleaning services PDF exported.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export PDF.');
    } finally {
      setExportingPdf(false);
    }
  }, [customer, exportedStatus, frisNo, fromDate, rows, toDate]);

  const renderCleaningFieldValue = (row: CleaningServicesRow, column: (typeof TABLE_COLUMNS)[number]) => {
    const value = String(row[column.key] ?? '').trim();
    if (column.key === 'flightSerialNo') {
      const serial = value || String(row.serialNo ?? '').trim();
      if (!serial) return '—';
      return (
        <Link
          href={buildScheduledAirlinesHrefFromCleaningServices(serial, {
            fromYmd: fromDate,
            toYmd: toDate,
            customer,
            frisNo,
            exportedStatus,
          })}
          className="font-semibold text-emerald-600 underline-offset-2 hover:text-emerald-700 hover:underline"
        >
          {serial}
        </Link>
      );
    }
    return value || '—';
  };

  return (
    <div className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} bg-emerald-50`}>
      <div className="mx-auto max-w-[1600px]">
        <FrisPageHeader
          title="Cleaning Services Data Export"
          icon={Sparkles}
          actions={
            recordsSummary ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-500">
                <Table2 className="h-4 w-4" />
                {recordsSummary}
              </div>
            ) : null
          }
        />

        <div className="rounded-3xl border border-emerald-100/80 bg-white p-4 shadow-sm md:p-5">
          <div className="grid gap-4 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
            <div className={cn(errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="field-fromDate">
                From Date
              </label>
              <div className="rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                <DatePicker
                  id="field-fromDate"
                  value={fromDate}
                  onChange={(v) => {
                    setFromDate(v);
                    clearField('fromDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  className="min-w-0 border-0"
                />
              </div>
              <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
            </div>

            <div className={cn(errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="field-toDate">
                Till Date
              </label>
              <div className="rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                <DatePicker
                  id="field-toDate"
                  value={toDate}
                  onChange={(v) => {
                    setToDate(v);
                    clearField('toDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  className="min-w-0 border-0"
                />
              </div>
              <FormFieldError id="field-toDate-error" message={errors.toDate} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Customer
              </label>
              <input
                type="text"
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
                placeholder="Enter customer"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <FormFieldError />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                FRIS No
              </label>
              <input
                type="text"
                value={frisNo}
                onChange={(event) => setFrisNo(event.target.value)}
                placeholder="Enter FRIS no"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <FormFieldError />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Exported Status
              </label>
              <Select
                value={exportedStatus}
                onValueChange={(value) =>
                  setExportedStatus(value as 'all' | 'No' | 'Exported')
                }
              >
                <SelectTrigger className="h-10 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 shadow-sm focus:ring-2 focus:ring-emerald-100 focus:ring-offset-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border border-slate-200 bg-white text-slate-700 shadow-lg">
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Exported">Exported</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <FormFieldError />
            </div>

            <div className={cn('flex flex-col justify-end gap-2 xl:min-w-[160px]', FLIGHT_FILTER_ACTIONS_PB)}>
              <button
                type="button"
                onClick={() => void exportExcel()}
                disabled={rows.length === 0 || exportingExcel || exportingPdf}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-500 shadow-sm transition-[background-color,transform,border-color] duration-150 hover:border-emerald-300 hover:bg-emerald-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportingExcel ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export in Excel
              </button>

              <button
                type="button"
                onClick={() => void exportPdf()}
                disabled={rows.length === 0 || exportingExcel || exportingPdf}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-700 shadow-sm transition-[background-color,transform,border-color] duration-150 hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportingPdf ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-3xl border border-emerald-100/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Cleaning service records</h2>
                <p className="text-xs text-slate-500">
                  Records populate automatically for the selected filter set.
                </p>
              </div>

              {loading ? (
                <span className="text-xs font-medium text-slate-500">Loading records...</span>
              ) : null}
            </div>

            <ReportsAdaptiveTable
              mobile={
                loading || !hasRequested ? (
                  <ReportsMobileEmpty title="Loading cleaning service records…" />
                ) : rows.length === 0 ? (
                  <ReportsMobileEmpty title="No records matched the selected filters." />
                ) : (
                  <ReportsMobileCardList className="p-3">
                    {rows.map((row) => (
                      <ReportsMobileCard key={row.id}>
                        <ReportsMobileCardHeader
                          title={`${row.airlineCode || '—'} · ${row.flightNo || '—'}`}
                          subtitle={`${row.typeOfFlight || '—'} · ${row.category || '—'}`}
                        />
                        <ReportsMobileCardGrid columns={1}>
                          {TABLE_COLUMNS.map((column) => (
                            <ReportsMobileCardField
                              key={column.key}
                              label={column.header}
                              value={renderCleaningFieldValue(row, column)}
                              fullWidth
                            />
                          ))}
                        </ReportsMobileCardGrid>
                      </ReportsMobileCard>
                    ))}
                  </ReportsMobileCardList>
                )
              }
              desktop={
                <ReportsResponsiveTable showScrollHint={false}>
                  <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-emerald-500 text-left text-[11px] font-semibold uppercase tracking-wide text-white">
                    {TABLE_COLUMNS.map((column) => (
                      <th key={column.key} className="whitespace-nowrap px-4 py-3">
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading || !hasRequested ? (
                    <tr>
                      <td
                        colSpan={TABLE_COLUMNS.length}
                        className="px-4 py-16 text-center text-slate-500"
                      >
                        Loading cleaning service records for the selected range...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={TABLE_COLUMNS.length}
                        className="px-4 py-16 text-center text-slate-500"
                      >
                        No records matched the selected filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={
                          index % 2 === 0
                            ? 'border-t border-emerald-100/80 bg-white'
                            : 'border-t border-emerald-100/80 bg-emerald-50/40'
                        }
                      >
                        {TABLE_COLUMNS.map((column) => {
                          const value = String(row[column.key] ?? '').trim();
                          if (column.key === 'flightSerialNo') {
                            const serial = value || String(row.serialNo ?? '').trim();
                            return (
                              <td
                                key={`${row.id}-${column.key}`}
                                className="whitespace-nowrap px-4 py-3"
                              >
                                {serial ? (
                                  <Link
                                    href={buildScheduledAirlinesHrefFromCleaningServices(serial, {
                                      fromYmd: fromDate,
                                      toYmd: toDate,
                                      customer,
                                      frisNo,
                                      exportedStatus,
                                    })}
                                    className="font-semibold text-emerald-600 underline-offset-2 transition-colors hover:text-emerald-700 hover:underline focus-visible:underline focus-visible:outline-none"
                                  >
                                    {serial}
                                  </Link>
                                ) : (
                                  <span className="text-slate-700">—</span>
                                )}
                              </td>
                            );
                          }
                          return (
                            <td
                              key={`${row.id}-${column.key}`}
                              className="whitespace-nowrap px-4 py-3 text-slate-700"
                            >
                              {value || '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
                </ReportsResponsiveTable>
              }
            />
          </div>
      </div>
    </div>
  );
}
