'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ScrollText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { fetchDailyScheduledFromAdvance } from '@/lib/api';
import { FRIS_NATIVE_FIELD_FOCUS } from '@/lib/fris-field-classes';
import { cn } from '@/lib/utils';
import {
  displayScheduledAirlinesTableSerial,
  isExportedNavStatus,
  isScheduleCancelledFlightNo,
  processFlightData,
  shouldHideScheduledAirlinesTableRow,
  type FlightData,
} from '@/utils/dataProcessor';
import {
  EXPORT_LOG_TABLE_COLUMNS,
  exportLogTypeLabel,
  type ExportLogRow,
  type ExportLogType,
  DEFAULT_EXPORT_LOG_TYPE,
  EXPORT_LOG_TYPE_OPTIONS,
} from '@/components/fris/others/exported-data-log-types';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';

const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterField = (typeof FILTER_FIELD_ORDER)[number];

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

function firstDayOfMonthYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function yyyyMmDdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, day] = parts;
  return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
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

function matchesExportLogType(f: FlightData, exportTypeLabel: string): boolean {
  const label = exportTypeLabel.trim().toLowerCase();
  const ft = String(f.flightType ?? '').toLowerCase();
  const cat = String(f.cateOfFlight ?? '').toLowerCase();
  const src = String(f.scheduleSource ?? '').toLowerCase();
  const isNonSched =
    ft.includes('non-scheduled') || ft.includes('non scheduled') || cat.includes('non-scheduled');
  const isRaf = ft.includes('raf') || cat.includes('raf');
  const isAdditional =
    Boolean(f.scheduledAirlinesCreationCreatedAt) ||
    src.includes('scheduled_airlines_creation') ||
    ft.includes('additional') ||
    cat.includes('additional');
  const isScheduled = !isNonSched && !isRaf && !isAdditional;
  const isCancelled =
    f.isCancelled || isScheduleCancelledFlightNo(f.flightNo);

  if (label === 'manpower') return true;

  if (label.startsWith('cancel scheduled')) {
    return isCancelled;
  }

  if (label.startsWith('non scheduled')) {
    return isNonSched && !isCancelled;
  }

  if (label.startsWith('raf')) {
    return isRaf && !isCancelled;
  }

  if (label.startsWith('scheduled')) {
    return isScheduled && !isCancelled;
  }

  return true;
}

function isEquipExportType(exportTypeLabel: string): boolean {
  return /equipment/i.test(exportTypeLabel);
}

function isManpowerExportType(exportTypeLabel: string): boolean {
  const label = exportTypeLabel.trim().toLowerCase();
  return label === 'manpower' || /manpower/i.test(label);
}

function hasEquipExport(raw?: Record<string, unknown>): boolean {
  if (!raw) return false;
  const flag = pickRaw(raw, 'equipmentExported', 'equipExported', 'exportedEquip');
  if (flag && isExportedNavStatus(flag)) return true;
  const entries = raw.equipmentEntries ?? raw.equipmentManpowerEntries;
  if (Array.isArray(entries)) {
    return entries.some((entry) => {
      if (!normIsRecord(entry)) return false;
      return isExportedNavStatus(String(entry.exportedInNav ?? entry.exportedNAV ?? '').trim());
    });
  }
  return false;
}

function isExportedLogRow(
  f: FlightData,
  raw: Record<string, unknown> | undefined,
  exportTypeLabel: string,
): boolean {
  const status = String(f.exportedNAV ?? '').trim();
  const exportedDate = pickRaw(raw ?? {}, 'exportedDate', 'Exported Date', 'exportedOn');
  const equipOnly = isEquipExportType(exportTypeLabel);
  const manpowerOnly = isManpowerExportType(exportTypeLabel);
  if (equipOnly) return hasEquipExport(raw);
  if (manpowerOnly && exportTypeLabel.trim().toLowerCase() !== 'manpower') {
    return isExportedNavStatus(status) || Boolean(exportedDate);
  }
  return isExportedNavStatus(status) || Boolean(exportedDate);
}

function rowDateYmd(f: FlightData, raw?: Record<string, unknown>): string | null {
  const exported = scheduleLabelToYmd(
    pickRaw(raw ?? {}, 'exportedDate', 'Exported Date', 'exportedOn'),
  );
  if (exported) return exported;
  return (
    scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
    scheduleLabelToYmd(String(f.stdDate ?? '').trim())
  );
}

function flightToExportLogRow(
  f: FlightData,
  exportType: string,
  raw?: Record<string, unknown>,
): ExportLogRow {
  const d = raw ?? {};
  return {
    serialNo: displayScheduledAirlinesTableSerial(f),
    flightNo: String(f.flightNo ?? '').trim(),
    airline: String(f.airline ?? '').trim(),
    exportType: exportLogTypeLabel(exportType),
    exportedBy: pickRaw(d, 'exportedBy', 'Exported By', 'exportedByUser'),
    exportedDate: pickRaw(d, 'exportedDate', 'Exported Date', 'exportedOn'),
    exportedStatus: String(f.exportedNAV ?? '').trim() || 'Exported',
  };
}

const dropdownFieldClass =
  'h-11 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-all hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-0';

const textInputClass = cn(
  'h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 hover:border-gray-300',
  FRIS_NATIVE_FIELD_FOCUS,
);

export default function ExportedDataLogContent() {
  const [exportType, setExportType] = useState<ExportLogType>(DEFAULT_EXPORT_LOG_TYPE);
  const [fromDate, setFromDate] = useState(() => firstDayOfMonthYmd());
  const [toDate, setToDate] = useState(() => localCalendarYmd());
  const [serialNo, setSerialNo] = useState('');
  const [rows, setRows] = useState<ExportLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { errors, clearField, applyAndFocus } = useFieldErrors<FilterField>(FILTER_FIELD_ORDER);

  const handleGet = useCallback(async () => {
    const next = validateYmdDateRange(fromDate, toDate);
    if (applyAndFocus(next)) return;

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
      const serialQuery = serialNo.trim().toLowerCase();

      const nextRows = processFlightData(list)
        .filter((f) => !shouldHideScheduledAirlinesTableRow(f))
        .filter((f) => {
          const label = exportType.trim().toLowerCase();
          if (label.startsWith('cancel scheduled')) return true;
          return !f.isCancelled && !isScheduleCancelledFlightNo(f.flightNo);
        })
        .filter((f) => matchesExportLogType(f, exportType))
        .filter((f) => {
          const key = String(f.slNo ?? '').trim();
          const raw = rawBySl.get(key);
          return isExportedLogRow(f, raw, exportType);
        })
        .filter((f) => {
          const key = String(f.slNo ?? '').trim();
          const raw = rawBySl.get(key);
          const ymd = rowDateYmd(f, raw);
          if (!ymd) return false;
          return ymd >= fromDate && ymd <= toDate;
        })
        .filter((f) => {
          if (!serialQuery) return true;
          const key = String(f.slNo ?? '').trim().toLowerCase();
          const label = String(f.serialLabel ?? '').trim().toLowerCase();
          const airline = String(f.airline ?? '').trim().toLowerCase();
          return key.includes(serialQuery) || label.includes(serialQuery) || airline.includes(serialQuery);
        })
        .map((f) => {
          const key = String(f.slNo ?? '').trim();
          return flightToExportLogRow(f, exportType, rawBySl.get(key));
        })
        .sort((a, b) => a.serialNo.localeCompare(b.serialNo, undefined, { numeric: true }));

      setRows(nextRows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load export log.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applyAndFocus, exportType, fromDate, serialNo, toDate]);

  const resultsSummary = useMemo(() => {
    if (!searched) return null;
    return `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  }, [rows.length, searched]);

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-emerald-50">
      <div className="w-full px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader
          title="Exported Data Log Details"
          icon={ScrollText}
          actions={
            resultsSummary ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-500">
                {resultsSummary}
              </span>
            ) : null
          }
        />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.05 }}
          className="mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-emerald-600">Filter with</p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_minmax(0,1.2fr)_auto] xl:items-end xl:gap-5">
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-gray-700">Type</label>
              <AdminRadioDropdown
                value={exportType}
                onChange={(v) => setExportType(v as ExportLogType)}
                options={EXPORT_LOG_TYPE_OPTIONS}
                className={dropdownFieldClass}
                aria-label="Export type"
              />
            </div>

            <div className={cn('min-w-0', errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-fromDate">
                From Date
              </label>
              <DatePicker
                id="field-fromDate"
                value={fromDate}
                onChange={(v) => {
                  setFromDate(v);
                  clearField('fromDate');
                }}
                valueFormat="yyyy-MM-dd"
                className="w-full"
              />
              <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
            </div>

            <div className={cn('min-w-0', errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-toDate">
                To Date
              </label>
              <DatePicker
                id="field-toDate"
                value={toDate}
                onChange={(v) => {
                  setToDate(v);
                  clearField('toDate');
                }}
                valueFormat="yyyy-MM-dd"
                className="w-full"
                minDate={
                  fromDate
                    ? (() => {
                        const [y, m, d] = fromDate.split('-').map(Number);
                        return new Date(y!, m! - 1, d!);
                      })()
                    : undefined
                }
              />
              <FormFieldError id="field-toDate-error" message={errors.toDate} />
            </div>

            <div className="min-w-0">
              <label htmlFor="export-log-serial" className="mb-2 block text-sm font-medium text-gray-700">
                Serial No
              </label>
              <input
                id="export-log-serial"
                type="text"
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                placeholder="Optional"
                autoComplete="off"
                className={textInputClass}
              />
            </div>

            <div className="flex shrink-0 xl:justify-end">
              <motion.button
                type="button"
                whileHover={loading ? undefined : { scale: 1.02 }}
                whileTap={loading ? undefined : { scale: 0.98 }}
                onClick={() => void handleGet()}
                disabled={loading}
                className={cn(
                  'inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 text-sm font-semibold text-white shadow-sm xl:w-auto xl:min-w-[7rem]',
                  loading ? 'cursor-not-allowed bg-emerald-400' : 'bg-emerald-500 hover:bg-emerald-600',
                )}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {loading ? 'Loading…' : 'Get'}
              </motion.button>
            </div>
          </div>
        </motion.div>

        {(loading || searched) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.08 }}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
          >
            {loading ? (
              <div className="flex min-h-[14rem] items-center justify-center px-4 py-16 text-sm text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" aria-hidden />
                Loading export log…
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-[14rem] items-center justify-center px-4 py-16 text-center text-sm text-gray-700">
                There is no record found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-emerald-500 text-left text-xs font-semibold uppercase tracking-wide text-white">
                      {EXPORT_LOG_TABLE_COLUMNS.map((col) => (
                        <th key={col.key} scope="col" className="whitespace-nowrap px-4 py-3">
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        key={`${row.serialNo}-${index}`}
                        className={cn(
                          'border-b border-gray-100',
                          index % 2 === 0 ? 'bg-white' : 'bg-emerald-50/40',
                        )}
                      >
                        {EXPORT_LOG_TABLE_COLUMNS.map((col) => (
                          <td key={col.key} className="whitespace-nowrap px-4 py-3 text-gray-800">
                            {String(row[col.key] ?? '').trim() || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
