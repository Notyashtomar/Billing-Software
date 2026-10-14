'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  processFlightData,
  FlightData,
  displayFlightInstanceSerial,
  isScheduleCancelledFlightNo,
} from '@/utils/dataProcessor';
import {
  getApiBase,
  getNsRawFormSavedUrl,
  FORM_PATHS,
} from '@/lib/api';
import { dailyScheduledFlightsQueryOptions } from '@/hooks/fris/useDailyScheduledFlightsQuery';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { clearPaxShiftSessionScratch } from '@/components/fris/reports/paxShiftReportStorageKeys';
import PaxShiftReportTable from '@/components/fris/reports/PaxShiftReportTable';
import PaxShiftOpenSidebar from '@/components/fris/reports/PaxShiftOpenSidebar';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { ReportsHeaderActions } from '@/components/fris/reports/ReportsResponsiveTable';
import { FRIS_REPORTS_ACTION_BTN_CLASS, FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';
import { Filter, ChevronDown, XCircle, RefreshCw, X, Users, Luggage, ClipboardList } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { toast } from 'sonner';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;

const fetch = frisFetch;

function formatLoadError(error: unknown, fallback: string): string {
  const errMsg = error instanceof Error ? error.message : '';
  if (errMsg.trim().toLowerCase() === 'internal server error') {
    return 'The backend returned Internal Server Error while loading flights. Please verify the server logs and confirm the selected date range is valid.';
  }
  const isNetworkError =
    error instanceof TypeError && (errMsg === 'Failed to fetch' || errMsg.includes('fetch'));
  if (isNetworkError) {
    const base = getApiBase().replace(/\/$/, '');
    const target =
      base.startsWith('/') ? `${base} (dev proxy → Nest on 127.0.0.1:8080)` : base || 'http://127.0.0.1:8080';
    return (
      'Cannot reach the API. Make sure the backend is running and reachable at ' + target + '.'
    );
  }
  return error instanceof Error ? error.message : fallback;
}

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

/** Same as Scheduled Airlines: From + To default to the current local calendar day. */
function defaultPaxShiftDateRange(today = new Date()): { fromDate: string; toDate: string } {
  const ymd = localCalendarYmd(today);
  return { fromDate: ymd, toDate: ymd };
}

function scheduleFilterCapDate(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
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
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
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

function filterFlightsToDateWindow(flights: FlightData[], fromYmd: string, toYmd: string): FlightData[] {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return flights;
  return flights.filter((f) => {
    const ymd =
      scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
      scheduleLabelToYmd(String(f.stdDate ?? '').trim());
    if (!ymd) return false;
    return ymd >= fromYmd && ymd <= toYmd;
  });
}

async function loadScheduledFlightsForDateRange(
  queryClient: QueryClient,
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
  fromYmd: string,
  toYmd: string,
): Promise<FlightData[]> {
  const data = await queryClient.fetchQuery(
    dailyScheduledFlightsQueryOptions(fromDdMmYyyy, toDdMmYyyy),
  );
  const rows = processFlightData(Array.isArray(data) ? data : []);
  return filterFlightsToDateWindow(rows, fromYmd, toYmd);
}

/** Same cancel rules as Scheduled Airlines table (`fhr_collection` + CANC flight no.). */
function isRowCancelledForFilters(f: FlightData): boolean {
  return f.isCancelled || isScheduleCancelledFlightNo(f.flightNo);
}

export default function PaxShiftReportContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [allFlights, setAllFlights] = useState<FlightData[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [fromDate, setFromDate] = useState(() => defaultPaxShiftDateRange().fromDate);
  const [toDate, setToDate] = useState(() => defaultPaxShiftDateRange().toDate);
  const paxShiftDateKey = `${fromDate}|${toDate}`;
  const paxShiftDateKeyRef = useRef(paxShiftDateKey);
  useEffect(() => {
    if (paxShiftDateKeyRef.current === paxShiftDateKey) return;
    paxShiftDateKeyRef.current = paxShiftDateKey;
    clearPaxShiftSessionScratch();
  }, [paxShiftDateKey]);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [flightType, setFlightType] = useState('');
  const [aircraft, setAircraft] = useState('');
  const [serialNoSearch, setSerialNoSearch] = useState('');
  const [showCancelled, setShowCancelled] = useState(true);
  const [showOpened, setShowOpened] = useState(true);
  const [showClosed, setShowClosed] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedToolbarSlNo, setSelectedToolbarSlNo] = useState<string | null>(null);
  const [paxShiftSidebarOpen, setPaxShiftSidebarOpen] = useState(false);
  const [paxShiftSidebarFlight, setPaxShiftSidebarFlight] = useState<FlightData | null>(null);
  const { errors, clearField, applyAndFocus, clearAll } = useFieldErrors(FILTER_FIELD_ORDER);

  const lockStatusCache = React.useRef<Record<string, { rampLocked: string; paxLocked: string; gsdLocked: string }>>(
    {},
  );

  const isLockedValue = useCallback((v: unknown): boolean => {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
  }, []);

  const scheduleFilterMaxDate = scheduleFilterCapDate();
  const scheduleFilterMaxYyyyMmDd = localCalendarYmd();
  const scheduleFilterStartMaxDate = (() => {
    if (!toDate?.trim()) return scheduleFilterMaxDate;
    const parts = toDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return scheduleFilterMaxDate;
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    return end.getTime() <= scheduleFilterMaxDate.getTime() ? end : scheduleFilterMaxDate;
  })();

  const fetchLockStatusForSerial = useCallback(async (serialNo: string) => {
    const serial = String(serialNo ?? '').trim();
    if (!serial) return { rampLocked: 'false', paxLocked: 'false', gsdLocked: 'false' };
    if (lockStatusCache.current[serial]) return lockStatusCache.current[serial];

    const hasSavedRampOrTerminal = async (segment: string): Promise<boolean> => {
      try {
        const res = await fetch(getNsRawFormSavedUrl(segment, serial), { method: 'GET' });
        if (!res.ok) return false;
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        return !!(data && typeof data === 'object' && Object.keys(data).length > 0);
      } catch {
        return false;
      }
    };

    const isGsdLockedEquipmentVerified = async (): Promise<boolean> => {
      try {
        const res = await fetch(getNsRawFormSavedUrl(FORM_PATHS.equipmentManpower, serial), { method: 'GET' });
        if (!res.ok) return false;
        const data = (await res.json().catch(() => null)) as {
          entries?: unknown[];
          verifiedBy?: string;
          verifiedAt?: string;
        } | null;
        if (!data || typeof data !== 'object') return false;
        const entries = Array.isArray(data.entries) ? data.entries : [];
        if (entries.length === 0) return false;
        const vBy = String(data.verifiedBy ?? '').trim();
        const vAt = String(data.verifiedAt ?? '').trim();
        return vBy.length > 0 || vAt.length > 0;
      } catch {
        return false;
      }
    };

    const [hasRamp, hasTerminal, hasGsd] = await Promise.all([
      hasSavedRampOrTerminal('ramp-details'),
      hasSavedRampOrTerminal('terminal-details'),
      isGsdLockedEquipmentVerified(),
    ]);

    const status = {
      rampLocked: hasRamp ? 'true' : 'false',
      paxLocked: hasTerminal ? 'true' : 'false',
      gsdLocked: hasGsd ? 'true' : 'false',
    };
    lockStatusCache.current[serial] = status;
    return status;
  }, []);

  const hydrateLocksFromSavedForms = useCallback(
    async (flights: FlightData[]) => {
      if (!Array.isArray(flights) || flights.length === 0) return;
      const rows = await Promise.all(
        flights.map(async (f) => {
          const slNo = String(f.slNo ?? '').trim();
          if (!slNo) return null;
          const locks = await fetchLockStatusForSerial(slNo);
          return { slNo, locks };
        }),
      );
      const bySerial = new Map(
        rows.filter((r): r is NonNullable<typeof r> => r != null).map((r) => [r.slNo, r]),
      );
      setAllFlights((prev) =>
        prev.map((f) => {
          const key = String(f.slNo ?? '').trim();
          const row = bySerial.get(key);
          if (!row) return f;
          return { ...f, rampLocked: row.locks.rampLocked, paxLocked: row.locks.paxLocked, gsdLocked: row.locks.gsdLocked };
        }),
      );
    },
    [fetchLockStatusForSerial],
  );

  const loadFlightsForRange = useCallback(
    async (fromYmd: string, toYmd: string) => {
      setLoadingFlights(true);
      setFilterError(null);
      try {
        const fromDdMmYyyy = yyyyMmDdToDdMmYyyy(fromYmd);
        const toDdMmYyyy = yyyyMmDdToDdMmYyyy(toYmd);
        if (!fromDdMmYyyy || !toDdMmYyyy) {
          toast.warning('Invalid date selection.');
          return;
        }
        const flights = await loadScheduledFlightsForDateRange(
          queryClient,
          fromDdMmYyyy,
          toDdMmYyyy,
          fromYmd,
          toYmd,
        );
        setAllFlights(flights);
        void hydrateLocksFromSavedForms(flights);
        setCurrentPage(1);
      } catch (error) {
        setFilterError(formatLoadError(error, 'Filter request failed.'));
      } finally {
        setLoadingFlights(false);
      }
    },
    [hydrateLocksFromSavedForms, queryClient],
  );

  const resetAllFilters = useCallback(() => {
    // Client-side filters reset instantly; the date range reset is picked up by the
    // auto-apply effect below (only triggers a reload if the range actually changed).
    setSerialNoSearch('');
    setFlightType('');
    setAircraft('');
    const todayRange = defaultPaxShiftDateRange();
    setFromDate(todayRange.fromDate);
    setToDate(todayRange.toDate);
    setShowCancelled(true);
    setShowOpened(true);
    setShowClosed(true);
    setFilterError(null);
    clearAll();
    setCurrentPage(1);
  }, [clearAll]);

  /** Manual refresh: re-fetch the currently selected (already-applied) range. */
  const handleFilter = useCallback(async () => {
    const next = validateYmdDateRange(fromDate, toDate, { toNotAfterToday: true });
    if (applyAndFocus(next)) return;
    const capYmd = localCalendarYmd();
    if (toDate > capYmd || fromDate > capYmd) {
      if (toDate > capYmd) setToDate(capYmd);
      if (fromDate > capYmd) setFromDate(capYmd);
      return;
    }
    await loadFlightsForRange(fromDate, toDate);
  }, [fromDate, toDate, loadFlightsForRange, applyAndFocus]);

  // Dates apply instantly like every other filter: load immediately on mount,
  // then debounce reloads when the user changes the range.
  const didInitialLoad = React.useRef(false);
  useEffect(() => {
    if (!fromDate || !toDate || fromDate > toDate) return;
    const capYmd = localCalendarYmd();
    if (fromDate > capYmd || toDate > capYmd) return;

    if (!didInitialLoad.current) {
      didInitialLoad.current = true;
      void loadFlightsForRange(fromDate, toDate);
      return;
    }
    const timer = setTimeout(() => {
      void loadFlightsForRange(fromDate, toDate);
    }, 350);
    return () => clearTimeout(timer);
  }, [fromDate, toDate, loadFlightsForRange]);

  const flightTypes = useMemo(
    () => Array.from(new Set(allFlights.map((f) => f.flightType))).sort(),
    [allFlights],
  );
  const aircraftTypes = useMemo(
    () => Array.from(new Set(allFlights.map((f) => f.aircraft))).sort(),
    [allFlights],
  );

  const flightTypeDropdownOptions = useMemo(
    () => [{ value: '', label: 'All Types' }, ...flightTypes.map((t) => ({ value: t, label: t }))],
    [flightTypes],
  );

  const aircraftDropdownOptions = useMemo(
    () => [{ value: '', label: 'All Aircraft' }, ...aircraftTypes.map((a) => ({ value: a, label: a }))],
    [aircraftTypes],
  );

  const filteredFlights = useMemo(() => {
    const serialSortValue = (f: FlightData): number => {
      const n = Number(String(f.slNo ?? '').trim());
      return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    };
    const result = allFlights.filter((f) => {
      if (flightType && f.flightType !== flightType) return false;
      if (aircraft && f.aircraft !== aircraft) return false;
      if (serialNoSearch.trim()) {
        const q = serialNoSearch.trim().toLowerCase();
        const serialStr = String(f.slNo ?? '').toLowerCase();
        const serialLabelStr = String(f.serialLabel ?? '').toLowerCase();
        const airlineStr = String(f.airline ?? '').toLowerCase();
        if (!serialStr.includes(q) && !serialLabelStr.includes(q) && !airlineStr.includes(q)) return false;
      }
      if (!showCancelled && isRowCancelledForFilters(f)) return false;
      if (!isRowCancelledForFilters(f)) {
        const isClosed =
          isLockedValue(f.rampLocked) && isLockedValue(f.paxLocked) && isLockedValue(f.gsdLocked);
        if (isClosed && !showClosed) return false;
        if (!isClosed && !showOpened) return false;
      }
      return true;
    });
    result.sort((a, b) => serialSortValue(a) - serialSortValue(b));
    const seen = new Set<string>();
    const deduped: FlightData[] = [];
    for (const row of result) {
      const key = String(row.slNo ?? '').trim();
      if (!key) {
        deduped.push(row);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }
    return deduped;
  }, [flightType, aircraft, serialNoSearch, showCancelled, showOpened, showClosed, allFlights, isLockedValue]);

  useEffect(() => {
    setCurrentPage(1);
  }, [flightType, aircraft, serialNoSearch, showCancelled, showOpened, showClosed, fromDate, toDate]);

  const totalPages = Math.ceil(filteredFlights.length / itemsPerPage) || 1;
  const paginatedFlights = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFlights.slice(start, start + itemsPerPage);
  }, [filteredFlights, currentPage, itemsPerPage]);

  const selectedForToolbar = useMemo(() => {
    if (!selectedToolbarSlNo) return null;
    return filteredFlights.find((f) => String(f.slNo ?? '').trim() === selectedToolbarSlNo) ?? null;
  }, [filteredFlights, selectedToolbarSlNo]);

  const openShortShippedBag = () => {
    const fs = selectedToolbarSlNo?.trim();
    if (fs) {
      router.push(`/fris/reports/pax-shift/short-shipped-bag?flightSerial=${encodeURIComponent(fs)}`);
    } else {
      router.push('/fris/reports/pax-shift/short-shipped-bag');
    }
  };

  const openPaxShiftSidebar = useCallback((flight: FlightData) => {
    setPaxShiftSidebarFlight(flight);
    setPaxShiftSidebarOpen(true);
    setSelectedToolbarSlNo(String(flight.slNo ?? '').trim() || null);
  }, []);

  const closePaxShiftSidebar = useCallback(() => {
    setPaxShiftSidebarOpen(false);
    setPaxShiftSidebarFlight(null);
  }, []);

  const openDutyAllocation = () => {
    router.push('/fris/reports/pax-shift/duty-allocation');
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} bg-gradient-to-br from-gray-50 to-gray-100`}
      >
        <div className="mb-4">
          <FrisPageHeader
            title="Pax Shift Report"
            icon={Users}
            actions={
              <ReportsHeaderActions>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={openShortShippedBag}
                  className={`${FRIS_REPORTS_ACTION_BTN_CLASS} col-span-1 border border-gray-200 bg-white text-gray-800 shadow-sm hover:border-sky-300 hover:bg-sky-50`}
                >
                  <Luggage className="h-4 w-4 shrink-0 text-sky-600" />
                  <span className="truncate">Short shipped bag</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={openDutyAllocation}
                  className={`${FRIS_REPORTS_ACTION_BTN_CLASS} col-span-1 border border-gray-200 bg-white text-gray-800 shadow-sm hover:border-violet-300 hover:bg-violet-50`}
                >
                  <ClipboardList className="h-4 w-4 shrink-0 text-violet-600" />
                  <span className="truncate">Duty allocation</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowFilters(!showFilters)}
                  className={`${FRIS_REPORTS_ACTION_BTN_CLASS} col-span-2 border border-amber-400 bg-amber-500 text-white shadow-sm hover:bg-amber-600 sm:col-span-1`}
                >
                  <Filter className="h-4 w-4 shrink-0" />
                  <span className="font-medium">Filters</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </motion.button>
              </ReportsHeaderActions>
            }
          />
          {selectedToolbarSlNo && selectedForToolbar && (
            <p className="mt-2 text-center text-xs text-gray-600 xl:text-right">
              Selected for toolbar actions:{' '}
              <span className="font-semibold text-gray-900">
                {selectedForToolbar.airline} {selectedForToolbar.flightNo} (Sl.{' '}
                {displayFlightInstanceSerial(selectedForToolbar.slNo)})
              </span>
            </p>
          )}
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-visible rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="min-w-0 text-lg font-semibold text-gray-900">Advanced Filters</h3>
                  <div className="ml-auto flex shrink-0 items-center gap-3">
                    <p className="whitespace-nowrap text-sm text-gray-600">
                      Found <span className="font-bold text-emerald-600">{filteredFlights.length}</span> flights
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowFilters(false)}
                      className="rounded-lg p-2 hover:bg-gray-100"
                      aria-label="Close filters"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Airline or Flight serial (Sl. No.)
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder="e.g. Air India / 198120"
                      value={serialNoSearch}
                      onChange={(e) => setSerialNoSearch(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 transition-all hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                    <FormFieldError />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Flight Type</label>
                    <AdminRadioDropdown
                      value={flightType}
                      onChange={setFlightType}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 transition-all hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      options={flightTypeDropdownOptions}
                    />
                    <FormFieldError />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Aircraft Type</label>
                    <AdminRadioDropdown
                      value={aircraft}
                      onChange={setAircraft}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 transition-all hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      options={aircraftDropdownOptions}
                    />
                    <FormFieldError />
                  </div>
                  <div className={cn(errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                    <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-fromDate">
                      Start Date
                    </label>
                    <DatePicker
                      id="field-fromDate"
                      value={fromDate}
                      onChange={(v) => {
                        let next = v ?? '';
                        if (next > scheduleFilterMaxYyyyMmDd) next = scheduleFilterMaxYyyyMmDd;
                        if (toDate && next && next > toDate) next = toDate;
                        setFromDate(next);
                        clearField('fromDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      maxDate={scheduleFilterStartMaxDate}
                    />
                    <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
                  </div>
                  <div className={cn(errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                    <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-toDate">
                      End Date
                    </label>
                    <DatePicker
                      id="field-toDate"
                      value={toDate}
                      onChange={(v) => {
                        let next = v ?? '';
                        if (next > scheduleFilterMaxYyyyMmDd) next = scheduleFilterMaxYyyyMmDd;
                        if (fromDate && next && next < fromDate) next = fromDate;
                        setToDate(next);
                        clearField('toDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      minDate={
                        fromDate
                          ? (() => {
                              const [y, m, d] = fromDate.split('-').map(Number);
                              return new Date(y, m - 1, d);
                            })()
                          : undefined
                      }
                      maxDate={scheduleFilterMaxDate}
                    />
                    <FormFieldError id="field-toDate-error" message={errors.toDate} />
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                      <label className="flex cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={showCancelled}
                            onChange={(e) => setShowCancelled(e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">Show Cancelled Flights</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={showOpened}
                            onChange={(e) => setShowOpened(e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">Show Opened Flights</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={showClosed}
                            onChange={(e) => setShowClosed(e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">Show Closed Flights</span>
                      </label>
                    </div>
                    <div className="flex w-full shrink-0 flex-wrap items-stretch gap-2 sm:w-auto sm:justify-end">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => void handleFilter()}
                        disabled={loadingFlights}
                        className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                      >
                        <RefreshCw className={`h-4 w-4 ${loadingFlights ? 'animate-spin' : ''}`} />
                        Refresh
                      </motion.button>
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-4 font-medium text-gray-700 transition-all hover:bg-gray-50 sm:flex-none"
                      >
                        Reset Filters
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {filterError && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-800">Could not load flights</p>
              <p className="mt-1 text-sm text-red-700">{filterError}</p>
            </div>
            <button
              type="button"
              onClick={() => setFilterError(null)}
              className="shrink-0 p-1 text-red-600 hover:text-red-800"
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="overflow-visible rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Pax shift flights</h3>
              <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                {loadingFlights ? (
                  'Loading flights…'
                ) : (
                  <>
                    Showing {paginatedFlights.length} of {filteredFlights.length} filtered flights
                    {fromDate && toDate ? (
                      <span className="ml-2">
                        • Range: {fromDate} to {toDate}
                      </span>
                    ) : null}
                  </>
                )}
              </p>
            </div>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className={`rounded-lg p-2 ${currentPage === 1 ? 'cursor-not-allowed text-gray-400' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  ← Previous
                </motion.button>
                <span className="text-sm text-gray-500">
                  Page {currentPage} of {totalPages}
                </span>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`rounded-lg p-2 ${currentPage === totalPages ? 'cursor-not-allowed text-gray-400' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  Next →
                </motion.button>
              </div>
            )}
          </div>

          {loadingFlights ? (
            <div className="p-12 text-center">
              <RefreshCw className="mx-auto mb-4 h-10 w-10 animate-spin text-emerald-500" />
              <p className="font-medium text-gray-600">Loading flights…</p>
            </div>
          ) : filteredFlights.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600">No flights match the current filters.</p>
              <Link
                href="/fris/flights/scheduledairlines"
                className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:underline"
              >
                Go to Scheduled Airlines
              </Link>
            </div>
          ) : (
            <PaxShiftReportTable
              data={paginatedFlights}
              selectedSlNo={selectedToolbarSlNo}
              onSelectRow={(f) => setSelectedToolbarSlNo(String(f.slNo ?? '').trim() || null)}
              onOpenRow={openPaxShiftSidebar}
            />
          )}

          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              Page {currentPage} of {totalPages} • {itemsPerPage} per page
            </div>
            <div>
              <AdminRadioDropdown
                value={String(itemsPerPage)}
                onChange={(v) => {
                  setItemsPerPage(Number(v));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                options={[
                  { value: '10', label: '10 per page' },
                  { value: '20', label: '20 per page' },
                  { value: '50', label: '50 per page' },
                  { value: '100', label: '100 per page' },
                ]}
              />
            </div>
          </div>
        </div>
      </motion.div>

      <PaxShiftOpenSidebar
        isOpen={paxShiftSidebarOpen}
        onClose={closePaxShiftSidebar}
        flight={paxShiftSidebarFlight}
      />
    </>
  );
}
