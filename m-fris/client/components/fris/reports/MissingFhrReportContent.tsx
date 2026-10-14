'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, FileSpreadsheet, Search } from 'lucide-react';
import { getXLSXModule } from '@/lib/dynamic-imports';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { DatePicker } from '@/components/ui/DatePicker';
import { toast } from 'sonner';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { cn } from '@/lib/utils';
import {
  fetchFhrCollectionFlightLean,
  fetchFhrDocsBatch,
  fetchNonScheduledAirlineFlights,
  FHR_COLLECTION_UPDATED_EVENT,
  operationalSerialFromFlightKey,
} from '@/lib/api';
import { dailyScheduledFlightsQueryOptions } from '@/hooks/fris/useDailyScheduledFlightsQuery';
import {
  buildAirlinesHrefFromMissingFhr,
  type MissingFhrFlightKind,
} from '@/lib/missingFhrScheduledAirlinesNav';
import MissingFhrLockStatusCell from '@/components/fris/reports/MissingFhrLockStatusCell';
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
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_CLASS } from '@/components/fris/flights/flightFilterBarLayout';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  hasFieldErrors,
  validateYmdDateRange,
} from '@/lib/form-validation';
import {
  fetchNsFormPresenceMap,
  formPresenceFromFhrDoc,
  formPresenceFromFlightRow,
  type FormPresenceFlags,
} from '@/components/fris/reports/missingFhrPendingForms';
import { adaptNonScheduledFlight } from '@/components/fris/flights/non-scheduled-airlines/adaptNonScheduledFlight';
import { mapMainDetailsListToRows } from '@/features/fris/flights/non-scheduled/non-scheduled-airlines-filter-helpers';
import {
  processFlightData,
  type FlightData,
  displayScheduledAirlinesTableSerial,
  isScheduleCancelledFlightNo,
  nsFormSerialForFlight,
  scheduledAirlinesRowDedupeKey,
  shouldHideScheduledAirlinesTableRow,
} from '@/utils/dataProcessor';

type FlightSourceFilter = 'all' | MissingFhrFlightKind;

const FLIGHT_SOURCE_OPTIONS: { value: FlightSourceFilter; label: string }[] = [
  { value: 'all', label: 'All flights' },
  { value: 'scheduled', label: 'Scheduled only' },
  { value: 'non-scheduled', label: 'Non-scheduled only' },
];

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

function firstDayOfMonthYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function scheduleFilterCapDate(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function parseYmdToLocalDate(ymd: string): Date | null {
  const parts = String(ymd ?? '')
    .trim()
    .split('-')
    .map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, day] = parts;
  const dt = new Date(y!, m! - 1, day!);
  if (dt.getFullYear() !== y || dt.getMonth() !== m! - 1 || dt.getDate() !== day) return null;
  return dt;
}

function yyyyMmDdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function scheduleLabelToYmd(label: string): string | null {
  const raw = String(label ?? '').trim();
  if (!raw) return null;
  // Accept bare yyyy-MM-dd or ISO datetime prefix.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/** Prefer STA (operating day); fall back to STD. */
function flightReferenceYmd(f: FlightData): string | null {
  return (
    scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
    scheduleLabelToYmd(String(f.stdDate ?? '').trim())
  );
}

function filterFlightsToDateWindow(flights: FlightData[], fromYmd: string, toYmd: string): FlightData[] {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return flights;
  return flights.filter((f) => {
    const ymd = flightReferenceYmd(f);
    if (!ymd) return false;
    return ymd >= fromYmd && ymd <= toYmd;
  });
}

function dedupeFlights(flights: FlightData[]): FlightData[] {
  const seen = new Set<string>();
  const out: FlightData[] = [];
  for (const f of flights) {
    const key = scheduledAirlinesRowDedupeKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function isCancelledFlight(f: FlightData): boolean {
  if (String(f.flightStatus ?? '').toLowerCase() === 'cancelled') return true;
  if (f.isCancelled) return true;
  return isScheduleCancelledFlightNo(f.flightNo);
}

/**
 * Missing FHR targets flights whose operating day is before today
 * (STA preferred). Today's in-progress flights stay off this report.
 */
function isPastFlight(f: FlightData, todayYmd: string): boolean {
  const ref = flightReferenceYmd(f);
  if (!ref) return false;
  return ref < todayYmd;
}

function operationalSerialNumber(f: FlightData): number | null {
  return operationalSerialFromFlightKey(String(nsFormSerialForFlight(f) ?? f.slNo ?? ''));
}

type MissingFhrRow = {
  id: string;
  tableSerial: string;
  operationalSerial: string;
  flightKind: MissingFhrFlightKind;
  airline: string;
  flightNo: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  rampLocked: boolean;
  paxLocked: boolean;
  gsdLocked: boolean;
};

function applyPresenceToRow(row: MissingFhrRow, presence: FormPresenceFlags): MissingFhrRow {
  return {
    ...row,
    rampLocked: presence.rampLocked,
    paxLocked: presence.paxLocked,
    gsdLocked: presence.gsdLocked,
  };
}

function rowIsFullyLocked(row: MissingFhrRow): boolean {
  return row.rampLocked && row.paxLocked && row.gsdLocked;
}

function lockStatusLabel(locked: boolean): string {
  return locked ? 'Locked' : 'Open';
}

function flightKindLabel(kind: MissingFhrFlightKind): string {
  return kind === 'non-scheduled' ? 'Non-scheduled' : 'Scheduled';
}

function serialSortValue(serial: string): number {
  const n = Number(String(serial ?? '').trim());
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function sortRowsBySerial(rows: MissingFhrRow[]): MissingFhrRow[] {
  return [...rows].sort(
    (a, b) =>
      serialSortValue(a.tableSerial) - serialSortValue(b.tableSerial) ||
      a.tableSerial.localeCompare(b.tableSerial) ||
      a.flightKind.localeCompare(b.flightKind),
  );
}

function formatScheduleDateTime(date: string, time: string): string {
  const dateLabel = String(date ?? '').trim();
  const timeLabel = String(time ?? '').trim();
  if (!dateLabel && !timeLabel) return '—';
  if (!timeLabel) return dateLabel;
  return `${dateLabel} ${timeLabel}`;
}

function mapFlightToMissingFhrRow(
  f: FlightData,
  flightKind: MissingFhrFlightKind,
  presence?: FormPresenceFlags,
): MissingFhrRow {
  const slNo = String(f.slNo ?? '').trim();
  const operationalSerial = String(nsFormSerialForFlight(f) ?? '').trim() || slNo;
  const fromPresence = presence ?? formPresenceFromFlightRow(f);
  return {
    id: `${flightKind}:${scheduledAirlinesRowDedupeKey(f)}`,
    tableSerial: displayScheduledAirlinesTableSerial(f),
    operationalSerial,
    flightKind,
    airline: String(f.airline ?? '').trim() || '—',
    flightNo: String(f.flightNo ?? '').trim() || '—',
    staDate: String(f.staDate ?? '').trim(),
    staTime: String(f.staTime ?? '').trim(),
    stdDate: String(f.stdDate ?? '').trim(),
    stdTime: String(f.stdTime ?? '').trim(),
    rampLocked: fromPresence.rampLocked,
    paxLocked: fromPresence.paxLocked,
    gsdLocked: fromPresence.gsdLocked,
  };
}

function resolvePresenceForFlight(
  f: FlightData,
  flightKind: MissingFhrFlightKind,
  fhrBySerial: Map<number, Record<string, unknown>>,
  nsPresenceBySerial: Map<string, FormPresenceFlags>,
): FormPresenceFlags {
  const serialN = operationalSerialNumber(f);
  const serialKey = String(nsFormSerialForFlight(f) ?? f.slNo ?? '').trim();
  if (serialN != null && fhrBySerial.has(serialN)) {
    return formPresenceFromFhrDoc(fhrBySerial.get(serialN));
  }
  if (flightKind === 'non-scheduled') {
    return nsPresenceBySerial.get(serialKey) ?? formPresenceFromFlightRow(f);
  }
  // Scheduled: fall back to daily pipeline lock flags when FHR doc missing.
  return formPresenceFromFlightRow(f);
}

const thCell =
  'border border-emerald-300/90 border-r border-r-emerald-300 bg-emerald-100 px-2 py-2.5 text-center text-[10px] font-bold uppercase leading-tight text-slate-900 sm:text-xs';
const tdCell =
  'border border-slate-200/90 bg-white px-2 py-2 text-center text-xs text-slate-800 sm:text-sm';
const tdCellLeft = `${tdCell} text-left`;

const cardClass =
  'rounded-2xl border border-emerald-100/90 bg-white/90 p-4 shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04] backdrop-blur-sm sm:p-6';

const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterField = (typeof FILTER_FIELD_ORDER)[number];

export default function MissingFhrReportContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const todayYmd = useMemo(() => localCalendarYmd(), []);
  const [fromDate, setFromDate] = useState(() => firstDayOfMonthYmd());
  const [toDate, setToDate] = useState(() => todayYmd);
  const [flightSource, setFlightSource] = useState<FlightSourceFilter>('all');
  const [maxDate] = useState(() => scheduleFilterCapDate());
  const [rows, setRows] = useState<MissingFhrRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState<{
    from: string;
    to: string;
    source: FlightSourceFilter;
  } | null>(null);
  const [urlSearchHandled, setUrlSearchHandled] = useState(false);
  const { errors, clearField, applyAndFocus } = useFieldErrors<FilterField>(FILTER_FIELD_ORDER);

  useEffect(() => {
    const urlFrom = searchParams.get('from')?.trim() ?? '';
    const urlTo = searchParams.get('to')?.trim() ?? '';
    if (!urlFrom || !urlTo) return;
    setFromDate(urlFrom);
    setToDate(urlTo);
  }, [searchParams]);

  const fromDateMax = useMemo(() => {
    const to = parseYmdToLocalDate(toDate);
    if (!to) return maxDate;
    return to.getTime() <= maxDate.getTime() ? to : maxDate;
  }, [toDate, maxDate]);

  const toDateMin = useMemo(() => parseYmdToLocalDate(fromDate) ?? undefined, [fromDate]);
  const toDateMax = maxDate;

  const handleFromDateChange = useCallback(
    (v: string) => {
      setFromDate(v);
      clearField('fromDate');
      if (v && toDate && v > toDate) {
        setToDate(v);
        clearField('toDate');
      }
    },
    [clearField, toDate],
  );

  const handleToDateChange = useCallback(
    (v: string) => {
      setToDate(v);
      clearField('toDate');
      if (v && fromDate && v < fromDate) {
        setFromDate(v);
        clearField('fromDate');
      }
    },
    [clearField, fromDate],
  );

  const sortedRows = useMemo(() => sortRowsBySerial(rows), [rows]);
  const airlineCount = useMemo(
    () => new Set(sortedRows.map((row) => row.airline)).size,
    [sortedRows],
  );

  const loadMissingFhrRows = useCallback(async (
    fromYmd: string,
    toYmd: string,
    source: FlightSourceFilter,
    opts?: { showFieldErrors?: boolean },
  ) => {
    const next = validateYmdDateRange(fromYmd, toYmd, { toNotAfterToday: true });
    if (hasFieldErrors(next)) {
      if (opts?.showFieldErrors) applyAndFocus(next);
      else toast.warning(Object.values(next)[0] ?? 'Select a valid date range.');
      return;
    }

    const fromDd = yyyyMmDdToDdMmYyyy(fromYmd);
    const toDd = yyyyMmDdToDdMmYyyy(toYmd);
    if (!fromDd || !toDd) {
      if (opts?.showFieldErrors) {
        applyAndFocus({
          fromDate: 'From date must be a valid date.',
          toDate: 'To date must be a valid date.',
        });
      } else {
        toast.error('Invalid date range.');
      }
      return;
    }

    setLoading(true);
    setRows([]);
    setLastQuery({ from: fromYmd, to: toYmd, source });

    try {
      const today = localCalendarYmd();
      const includeScheduled = source === 'all' || source === 'scheduled';
      const includeNonScheduled = source === 'all' || source === 'non-scheduled';

      // Load sources independently so one permission/API failure does not wipe the other.
      let scheduledRaw: unknown[] = [];
      let nonScheduledRaw: unknown[] = [];
      const loadWarnings: string[] = [];

      if (includeScheduled) {
        try {
          const raw = await queryClient.fetchQuery(
            dailyScheduledFlightsQueryOptions(fromDd, toDd),
          );
          scheduledRaw = Array.isArray(raw) ? raw : [];
        } catch (e) {
          loadWarnings.push(
            e instanceof Error ? e.message : 'Failed to load scheduled flights.',
          );
        }
      }

      if (includeNonScheduled) {
        try {
          const raw = await fetchNonScheduledAirlineFlights({
            filterBy: 'AirlineDate',
            fromDate: fromYmd,
            tillDate: toYmd,
          });
          nonScheduledRaw = Array.isArray(raw) ? raw : [];
        } catch (e) {
          loadWarnings.push(
            e instanceof Error ? e.message : 'Failed to load non-scheduled flights.',
          );
        }
      }

      const scheduledUniverse = dedupeFlights(
        filterFlightsToDateWindow(processFlightData(scheduledRaw), fromYmd, toYmd),
      ).filter(
        (f) =>
          !isCancelledFlight(f) &&
          !shouldHideScheduledAirlinesTableRow(f) &&
          isPastFlight(f, today),
      );

      const nsUniverse = dedupeFlights(
        mapMainDetailsListToRows(nonScheduledRaw)
          .filter(
            (row) =>
              row.sNo > 0 &&
              (Boolean(row.bookingNo?.trim()) ||
                Boolean(row.challanNo?.trim()) ||
                /non[-\s]?scheduled/i.test(row.ops || '')),
          )
          .map(adaptNonScheduledFlight),
      )
        .filter((f) => filterFlightsToDateWindow([f], fromYmd, toYmd).length > 0)
        .filter((f) => !isCancelledFlight(f) && isPastFlight(f, today));

      const allForPresence = [...scheduledUniverse, ...nsUniverse];
      const serialNums = allForPresence
        .map((f) => operationalSerialNumber(f))
        .filter((n): n is number => n != null && n > 0);

      const fhrBySerial = await fetchFhrDocsBatch(serialNums);

      // NS flights without an FHR doc still need ns-raw form probes.
      const nsNeedRaw = nsUniverse.filter((f) => {
        const n = operationalSerialNumber(f);
        return n == null || !fhrBySerial.has(n);
      });
      const nsPresenceBySerial = await fetchNsFormPresenceMap(
        nsNeedRaw.map((f) => String(nsFormSerialForFlight(f) ?? f.slNo ?? '').trim()),
      );

      const scheduledRows = scheduledUniverse
        .map((f) => {
          const presence = resolvePresenceForFlight(
            f,
            'scheduled',
            fhrBySerial,
            nsPresenceBySerial,
          );
          return mapFlightToMissingFhrRow(f, 'scheduled', presence);
        })
        .filter((row) => !rowIsFullyLocked(row));

      const nonScheduledRows = nsUniverse
        .map((f) => {
          const presence = resolvePresenceForFlight(
            f,
            'non-scheduled',
            fhrBySerial,
            nsPresenceBySerial,
          );
          return mapFlightToMissingFhrRow(f, 'non-scheduled', presence);
        })
        .filter((row) => !rowIsFullyLocked(row));

      // Prefer scheduled when the same operating serial+day appears in both lists.
      const seenKeys = new Set<string>();
      const merged: MissingFhrRow[] = [];
      for (const row of [...scheduledRows, ...nonScheduledRows]) {
        const key = `${row.operationalSerial}|${scheduleLabelToYmd(row.staDate) ?? scheduleLabelToYmd(row.stdDate) ?? ''}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        merged.push(row);
      }

      const missingRows = sortRowsBySerial(merged);
      setRows(missingRows);

      if (loadWarnings.length > 0) {
        toast.warning(loadWarnings.join(' · '));
      }
      toast.success(
        missingRows.length
          ? `Found ${missingRows.length} past flight(s) with open ramp, pax, or GSD locks.`
          : 'No past flights with open locks in this date range.',
      );
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : 'Failed to load flights.');
    } finally {
      setLoading(false);
    }
  }, [applyAndFocus, queryClient]);

  useEffect(() => {
    if (urlSearchHandled) return;
    const urlFrom = searchParams.get('from')?.trim() ?? '';
    const urlTo = searchParams.get('to')?.trim() ?? '';
    if (!urlFrom || !urlTo) return;
    setUrlSearchHandled(true);
    void loadMissingFhrRows(urlFrom, urlTo, flightSource);
  }, [flightSource, loadMissingFhrRows, searchParams, urlSearchHandled]);

  const findRecords = useCallback(async () => {
    await loadMissingFhrRows(fromDate, toDate, flightSource, { showFieldErrors: true });
  }, [fromDate, toDate, flightSource, loadMissingFhrRows]);

  const exportExcel = useCallback(async () => {
    if (rows.length === 0) {
      toast.warning('Run Find record first, or no rows to export.');
      return;
    }
    const XLSX = await getXLSXModule();
    const exportData = sortedRows.map((row, index) => ({
      'S.No.': index + 1,
      Type: flightKindLabel(row.flightKind),
      'Flight Serial No': row.tableSerial,
      Airline: row.airline,
      'Flight No': row.flightNo,
      STA: formatScheduleDateTime(row.staDate, row.staTime),
      STD: formatScheduleDateTime(row.stdDate, row.stdTime),
      'Ramp Lock': lockStatusLabel(row.rampLocked),
      'Pax Lock': lockStatusLabel(row.paxLocked),
      'GSD Lock': lockStatusLabel(row.gsdLocked),
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Missing FHR');
    const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const from = lastQuery?.from ?? fromDate;
    const to = lastQuery?.to ?? toDate;
    const saveAs = await loadFileSaverSaveAs();
    saveAs(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `missing-fhr_${from}_${to}.xlsx`,
    );
    toast.success(`Exported ${sortedRows.length} flight(s).`);
  }, [rows.length, sortedRows, fromDate, toDate, lastQuery]);

  const airlinesContext = useMemo(
    () => ({
      fromYmd: lastQuery?.from ?? fromDate,
      toYmd: lastQuery?.to ?? toDate,
    }),
    [fromDate, lastQuery, toDate],
  );

  const updateRowPresence = useCallback((rowId: string, presence: FormPresenceFlags) => {
    setRows((prev) =>
      prev
        .map((row) => (row.id === rowId ? applyPresenceToRow(row, presence) : row))
        .filter((row) => !rowIsFullyLocked(row)),
    );
  }, []);

  useEffect(() => {
    const onFhrUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ serial: number }>).detail;
      const serialKey = String(detail?.serial ?? '').trim();
      if (!serialKey) return;

      void (async () => {
        const fhr = await fetchFhrCollectionFlightLean(serialKey);
        const presence = formPresenceFromFhrDoc(fhr);
        setRows((prev) =>
          prev
            .map((row) => {
              if (row.flightKind !== 'scheduled') return row;
              if (
                row.operationalSerial !== serialKey &&
                row.tableSerial !== serialKey &&
                row.id !== `scheduled:${serialKey}`
              ) {
                return row;
              }
              return applyPresenceToRow(row, presence);
            })
            .filter((row) => !rowIsFullyLocked(row)),
        );
      })();
    };

    window.addEventListener(FHR_COLLECTION_UPDATED_EVENT, onFhrUpdated);
    return () => window.removeEventListener(FHR_COLLECTION_UPDATED_EVENT, onFhrUpdated);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} w-full bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/35`}
    >
      <div className="w-full pt-6 md:pt-8">
        <FrisPageHeader title="Missing FHR report" icon={AlertCircle} />

        <div className={cardClass}>
          <div className="flex w-full flex-row flex-wrap items-end gap-x-4 gap-y-3">
            <div className={cn('min-w-0 w-[min(100%,12rem)] shrink-0 sm:w-44', errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-1.5 block text-sm font-medium text-emerald-950/85" htmlFor="field-fromDate">
                From date
              </label>
              <div className="rounded-lg border border-emerald-100/80 bg-emerald-50/30 p-0.5">
                <DatePicker
                  id="field-fromDate"
                  value={fromDate}
                  onChange={handleFromDateChange}
                  valueFormat="yyyy-MM-dd"
                  maxDate={fromDateMax}
                />
              </div>
              <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
            </div>
            <div className={cn('min-w-0 w-[min(100%,12rem)] shrink-0 sm:w-44', errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-1.5 block text-sm font-medium text-emerald-950/85" htmlFor="field-toDate">
                To date
              </label>
              <div className="rounded-lg border border-emerald-100/80 bg-emerald-50/30 p-0.5">
                <DatePicker
                  id="field-toDate"
                  value={toDate}
                  onChange={handleToDateChange}
                  valueFormat="yyyy-MM-dd"
                  minDate={toDateMin}
                  maxDate={toDateMax}
                />
              </div>
              <FormFieldError id="field-toDate-error" message={errors.toDate} />
            </div>
            <div className="min-w-0 w-[min(100%,14rem)] shrink-0 sm:w-52">
              <label className="mb-1.5 block text-sm font-medium text-emerald-950/85" htmlFor="field-flightSource">
                Flight type
              </label>
              <AdminRadioDropdown
                id="field-flightSource"
                value={flightSource}
                onChange={(v) => setFlightSource((v as FlightSourceFilter) || 'all')}
                options={FLIGHT_SOURCE_OPTIONS}
                className="h-10 w-full rounded-lg border border-emerald-100/80 bg-white"
                aria-label="Flight type"
              />
              <FormFieldError />
            </div>
            <div className={cn(FLIGHT_FILTER_ACTIONS_CLASS, 'sm:ml-auto')}>
              <button
                type="button"
                disabled={loading}
                onClick={() => void findRecords()}
                className={cn(
                  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500/70',
                  loading && 'cursor-wait opacity-80',
                )}
              >
                <Search className="h-4 w-4 shrink-0" aria-hidden />
                {loading ? 'Finding…' : 'Find record'}
              </button>
              <button
                type="button"
                disabled={rows.length === 0}
                onClick={exportExcel}
                className={cn(
                  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500/60',
                  rows.length === 0 && 'pointer-events-none opacity-50',
                )}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
                Export Excel
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm text-slate-600">
            {lastQuery ? (
              <>
                <span className="font-semibold text-emerald-950">Last search:</span> {lastQuery.from} → {lastQuery.to} ·{' '}
                <span className="font-semibold text-emerald-800">{sortedRows.length}</span> flight(s) pending FHR ·{' '}
                <span className="font-semibold text-emerald-800">{airlineCount}</span> airline(s)
              </>
            ) : (
              <span className="text-slate-500">
                Run <span className="font-semibold text-emerald-900">Find record</span> to list past
                scheduled and non-scheduled flights (STA before today) where at least one ramp, pax,
                or GSD form is still missing.
              </span>
            )}
          </p>

          <div className="overflow-hidden rounded-xl border border-emerald-100/90 bg-white shadow-md ring-1 ring-emerald-900/[0.04] p-3 sm:p-4">
            <ReportsAdaptiveTable
              mobile={
                loading ? (
                  <ReportsMobileEmpty title="Loading flights…" />
                ) : !lastQuery ? (
                  <ReportsMobileEmpty
                    title="No data loaded yet"
                    description="Use Find record after choosing dates."
                  />
                ) : sortedRows.length === 0 ? (
                  <ReportsMobileEmpty
                    title="No pending flights"
                    description="No past flights with open ramp, pax, or GSD locks in this range."
                  />
                ) : (
                  <ReportsMobileCardList>
                    {sortedRows.map((row, index) => (
                      <ReportsMobileCard key={row.id} tone="warning">
                        <ReportsMobileCardHeader
                          title={
                            <Link
                              href={buildAirlinesHrefFromMissingFhr(row.flightKind, row.tableSerial, airlinesContext,
                              )}
                              className="text-emerald-800 underline decoration-emerald-300 underline-offset-2"
                            >
                              {row.tableSerial}
                            </Link>
                          }
                          subtitle={`${flightKindLabel(row.flightKind)} · ${row.airline} · ${row.flightNo}`}
                          badge={
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              #{index + 1}
                            </span>
                          }
                        />
                        <ReportsMobileCardGrid>
                          <ReportsMobileCardField
                            label="STA"
                            value={formatScheduleDateTime(row.staDate, row.staTime)}
                          />
                          <ReportsMobileCardField
                            label="STD"
                            value={formatScheduleDateTime(row.stdDate, row.stdTime)}
                          />
                        </ReportsMobileCardGrid>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-3">
                          {(['ramp', 'pax', 'gsd'] as const).map((kind) => (
                            <div
                              key={kind}
                              className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-2 py-2.5 text-center"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                {kind}
                              </p>
                              <div className="mt-1 flex justify-center text-sm">
                                <MissingFhrLockStatusCell
                                  lockKind={kind}
                                  locked={
                                    kind === 'ramp'
                                      ? row.rampLocked
                                      : kind === 'pax'
                                        ? row.paxLocked
                                        : row.gsdLocked
                                  }
                                  tableSerial={row.tableSerial}
                                  operationalSerial={row.operationalSerial}
                                  flightKind={row.flightKind}
                                  dateContext={airlinesContext}
                                  onPresenceUpdated={(presence) => updateRowPresence(row.id, presence)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </ReportsMobileCard>
                    ))}
                  </ReportsMobileCardList>
                )
              }
              desktop={
                <ReportsResponsiveTable
                  showScrollHint={false}
                  scrollClassName="max-h-[min(36rem,75dvh)] overflow-y-auto overscroll-y-contain"
                >
                  <table className="w-full min-w-[62rem] border-separate border-spacing-0">
                <caption className="sr-only">Missing FHR flights sorted by flight serial number</caption>
                <thead className="sticky top-0 z-[1]">
                  <tr>
                    <th scope="col" className={cn(thCell, 'w-12')}>
                      S.No.
                    </th>
                    <th scope="col" className={cn(thCell, 'min-w-[7rem]')}>
                      Type
                    </th>
                    <th scope="col" className={cn(thCell, 'min-w-[7rem]')}>
                      Flight Serial No
                    </th>
                    <th scope="col" className={cn(thCell, 'min-w-[8rem]')}>
                      Airline
                    </th>
                    <th scope="col" className={cn(thCell, 'min-w-[8rem]')}>
                      Flight No
                    </th>
                    <th scope="col" className={cn(thCell, 'min-w-[9rem]')}>
                      STA
                    </th>
                    <th scope="col" className={cn(thCell, 'min-w-[9rem]')}>
                      STD
                    </th>
                    <th scope="col" className={cn(thCell, 'w-20')}>
                      Ramp
                    </th>
                    <th scope="col" className={cn(thCell, 'w-20')}>
                      Pax
                    </th>
                    <th scope="col" className={cn(thCell, 'w-20')}>
                      GSD
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className={cn(tdCell, 'py-10 text-slate-500')}>
                        Loading…
                      </td>
                    </tr>
                  ) : !lastQuery ? (
                    <tr>
                      <td colSpan={10} className={cn(tdCell, 'py-10 text-slate-500')}>
                        No data loaded yet. Use Find record after choosing dates.
                      </td>
                    </tr>
                  ) : sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className={cn(tdCell, 'py-10 text-slate-500')}>
                        No past flights with open ramp, pax, or GSD locks for this date range.
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row, index) => (
                      <tr key={row.id} className="hover:bg-emerald-50/40">
                        <td className={cn(tdCell, 'font-mono tabular-nums')}>{index + 1}</td>
                        <td className={cn(tdCellLeft, 'text-xs font-semibold text-slate-700')}>
                          {flightKindLabel(row.flightKind)}
                        </td>
                        <td className={cn(tdCell, 'font-mono tabular-nums font-semibold')}>
                          <Link
                            href={buildAirlinesHrefFromMissingFhr(
                              row.flightKind,
                              row.tableSerial,
                              airlinesContext,
                            )}
                            className="text-emerald-700 underline decoration-emerald-300 underline-offset-2 transition-colors hover:text-emerald-900 hover:decoration-emerald-500"
                          >
                            {row.tableSerial}
                          </Link>
                        </td>
                        <td className={cn(tdCellLeft, 'font-medium')}>{row.airline}</td>
                        <td className={tdCellLeft}>{row.flightNo}</td>
                        <td className={tdCellLeft}>{formatScheduleDateTime(row.staDate, row.staTime)}</td>
                        <td className={tdCellLeft}>{formatScheduleDateTime(row.stdDate, row.stdTime)}</td>
                        <td className={tdCell}>
                          <MissingFhrLockStatusCell
                            lockKind="ramp"
                            locked={row.rampLocked}
                            tableSerial={row.tableSerial}
                            operationalSerial={row.operationalSerial}
                            flightKind={row.flightKind}
                            dateContext={airlinesContext}
                            onPresenceUpdated={(presence) => updateRowPresence(row.id, presence)}
                          />
                        </td>
                        <td className={tdCell}>
                          <MissingFhrLockStatusCell
                            lockKind="pax"
                            locked={row.paxLocked}
                            tableSerial={row.tableSerial}
                            operationalSerial={row.operationalSerial}
                            flightKind={row.flightKind}
                            dateContext={airlinesContext}
                            onPresenceUpdated={(presence) => updateRowPresence(row.id, presence)}
                          />
                        </td>
                        <td className={tdCell}>
                          <MissingFhrLockStatusCell
                            lockKind="gsd"
                            locked={row.gsdLocked}
                            tableSerial={row.tableSerial}
                            operationalSerial={row.operationalSerial}
                            flightKind={row.flightKind}
                            dateContext={airlinesContext}
                            onPresenceUpdated={(presence) => updateRowPresence(row.id, presence)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-100/95 font-semibold text-emerald-950">
                    <td colSpan={9} className="border border-emerald-200/90 px-3 py-2.5 text-center text-sm">
                      Total Pending Flights
                    </td>
                    <td className="border border-emerald-200/90 px-2 py-2.5 text-center text-sm tabular-nums text-emerald-900">
                      {lastQuery && !loading ? sortedRows.length : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
                </ReportsResponsiveTable>
              }
            />
            {lastQuery && !loading ? (
              <p className="mt-3 text-center text-sm font-semibold text-emerald-900 lg:hidden">
                Total pending flights: {sortedRows.length}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
