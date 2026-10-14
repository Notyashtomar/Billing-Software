'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  NonScheduledFlightsTable,
  NonScheduledFlightDetailsSidebar,
} from '@/components/fris/flights/non-scheduled-airlines';
import type { NonScheduledFlightData } from '@/components/fris/flights/non-scheduled-airlines';
import {
  adaptNonScheduledFlight,
  resolveNonScheduledFlightStatus,
} from '@/components/fris/flights/non-scheduled-airlines/adaptNonScheduledFlight';
import {
  applyNsLockPartial,
  partialNsLocksFromFhrApiDoc,
} from '@/components/fris/flights/non-scheduled-airlines/nsFhrLockPartial';
import { frisFetch } from '@/lib/fris-auth-fetch';
import ScheduledAirlinesActiveFlightsBar from '@/components/fris/flights/scheduledairlines/ScheduledAirlinesActiveFlightsBar';
import {
  computeScheduledAirlinesActiveFlightStats,
  countScheduledAirlinesKpiFromFlights,
  EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS,
  filterFlightsByActiveStatCategories,
  type ScheduledAirlinesActiveFlightStatKey,
} from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import {
  FLIGHT_FILTER_CONTROL_CLASS,
  FLIGHT_FILTER_LABEL_CLASS,
  FLIGHT_FILTER_PRIMARY_BTN_CLASS,
  FLIGHT_FILTER_SECONDARY_BTN_CLASS,
} from '@/components/fris/flights/flightFilterBarLayout';
import {
  advanceDocId,
  fetchNonScheduledAirlineFlights,
  fetchNonScheduledBookingReferenceAirlines,
  getApiBase,
} from '@/lib/api';
import { buildDashboardReturnHref } from '@/lib/dashboardScheduledAirlinesNav';
import {
  buildMissingFhrReturnHref,
  missingFhrReturnLabel,
} from '@/lib/missingFhrScheduledAirlinesNav';
import { isAllowedMissingFhrSidebarView } from '@/components/fris/reports/missingFhrPendingForms';
import type { NonScheduledSidebarView } from '@/components/fris/flights/non-scheduled-airlines/NonScheduledFlightDetailsSidebar';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';
import { isScheduleCancelledFlightNo } from '@/utils/dataProcessor';
import {
  defaultNonScheduledDateRange,
  filterModeToApiFilterBy,
  mapMainDetailsListToRows,
  resolveNonScheduledFilterMode,
  validateNonScheduledFilterFields,
  validateNonScheduledFilterInput,
  type NonScheduledFilterMode,
} from '@/features/fris/flights/non-scheduled/non-scheduled-airlines-filter-helpers';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Filter,
  Loader2,
  Plane,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const NS_FILTER_FIELD_ORDER = [
  'serialNo',
  'challanNo',
  'bookingNo',
  'fromDate',
  'toDate',
] as const;
type NsFilterField = (typeof NS_FILTER_FIELD_ORDER)[number];

function serialMatches(flight: NonScheduledFlightData, serial: string): boolean {
  const target = String(serial ?? '').trim();
  if (!target) return false;
  return (
    String(flight.sNo) === target ||
    String(flight.flightSerialNo ?? '') === target
  );
}

function serialFromSearchParams(params: Pick<URLSearchParams, 'get'>): string {
  return (
    params.get('serialNo')?.trim() ||
    params.get('highlightSerial')?.trim() ||
    ''
  );
}

function isNsRowCancelled(f: NonScheduledFlightData): boolean {
  return (
    Boolean(f.isCancelled) ||
    resolveNonScheduledFlightStatus(f) === 'Cancelled' ||
    isScheduleCancelledFlightNo(f.flightNo)
  );
}

function nsFlightSerialKey(f: NonScheduledFlightData): string {
  return String(f.flightSerialNo ?? f.sNo).trim();
}

function applyNsCancelledFlightVisuals(
  flight: NonScheduledFlightData,
  cancelled: boolean,
): NonScheduledFlightData {
  const currentNo = String(flight.flightNo ?? '');
  const upper = currentNo.toUpperCase();
  let nextFlightNo = currentNo;
  if (cancelled) {
    if (!upper.startsWith('CANC')) nextFlightNo = `CANC ${currentNo}`.trim();
  } else {
    nextFlightNo = currentNo.replace(/^CANC[\s-]*/i, '').trim();
  }
  return {
    ...flight,
    flightNo: nextFlightNo,
    flightStatus: cancelled
      ? 'Cancelled'
      : flight.flightStatus === 'Cancelled'
        ? 'Open'
        : (flight.flightStatus ?? 'Open'),
    isCancelled: cancelled,
  };
}

export function NonScheduledAirlinesContent() {
  const searchParams = useSearchParams();
  const deepLinkSerial = useMemo(
    () => serialFromSearchParams(searchParams),
    [searchParams],
  );
  const dashboardBackHref = useMemo(
    () => buildDashboardReturnHref(searchParams),
    [searchParams],
  );
  const missingFhrBackHref = useMemo(
    () => buildMissingFhrReturnHref(searchParams),
    [searchParams],
  );
  const openSidebarFromUrl = searchParams.get('openSidebar')?.trim() ?? '';
  const sidebarInitialView = useMemo((): NonScheduledSidebarView | null => {
    if (!isAllowedMissingFhrSidebarView(openSidebarFromUrl)) return null;
    return openSidebarFromUrl;
  }, [openSidebarFromUrl]);
  const deepLinkHandledRef = useRef(false);

  const [showFilters, setShowFilters] = useState(false);
  const [showCancelled, setShowCancelled] = useState(true);
  const [showOpened, setShowOpened] = useState(true);
  const [showClosed, setShowClosed] = useState(true);
  const [showActiveFlightsPanel, setShowActiveFlightsPanel] = useState(false);
  const [activeStatFilters, setActiveStatFilters] = useState<
    Set<ScheduledAirlinesActiveFlightStatKey>
  >(() => new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [detailsSidebarOpen, setDetailsSidebarOpen] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<NonScheduledFlightData | null>(null);
  const [flights, setFlights] = useState<NonScheduledFlightData[]>([]);

  const [lastAppliedMode, setLastAppliedMode] = useState<NonScheduledFilterMode>(() =>
    deepLinkSerial ? 'serial-no' : 'airline-date',
  );
  const [serialNo, setSerialNo] = useState(() => deepLinkSerial);
  const [challanNo, setChallanNo] = useState('');
  const [bookingNo, setBookingNo] = useState('');
  const [airline, setAirline] = useState('');
  const [fromDate, setFromDate] = useState(() => defaultNonScheduledDateRange().fromDate);
  const [toDate, setToDate] = useState(() => defaultNonScheduledDateRange().toDate);
  const { errors: filterErrors, clearAll: clearFilterErrors, clearField: clearFilterField, applyAndFocus: applyFilterErrors } =
    useFieldErrors<NsFilterField>(NS_FILTER_FIELD_ORDER);
  const [airlineOptions, setAirlineOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: 'All Airlines' },
  ]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        // Booking/NS reference — no Advance → Non Scheduled Airline page required.
        const rows = (await fetchNonScheduledBookingReferenceAirlines()) as Record<
          string,
          unknown
        >[];
        if (!mounted) return;
        const names = rows
          .map((doc) => String(advanceDocId(doc).airline ?? '').trim())
          .filter(Boolean);
        const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b));
        setAirlineOptions([
          { value: '', label: 'All Airlines' },
          ...unique.map((name) => ({ value: name, label: name })),
        ]);
      } catch {
        /* keep All Airlines only */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filterEndMinDate = useMemo(() => {
    if (!fromDate?.trim()) return undefined;
    const parts = fromDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [y, m, day] = parts;
    return new Date(y!, m! - 1, day!);
  }, [fromDate]);

  const filterStartMaxDate = useMemo(() => {
    if (!toDate?.trim()) return new Date();
    const parts = toDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date();
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    const cap = new Date();
    cap.setHours(0, 0, 0, 0);
    return end.getTime() <= cap.getTime() ? end : cap;
  }, [toDate]);

  const openFlightDetailsSidebar = useCallback((flight: NonScheduledFlightData) => {
    setSelectedFlight(flight);
    setDetailsSidebarOpen(true);
  }, []);

  const closeFlightDetailsSidebar = useCallback(() => {
    setDetailsSidebarOpen(false);
    setSelectedFlight(null);
  }, []);

  const handleFlightCancelledChange = useCallback((serial: string, cancelled: boolean) => {
    const key = String(serial ?? '').trim();
    if (!key) return;
    if (cancelled) setShowCancelled(true);
    setFlights((prev) =>
      prev.map((f) =>
        nsFlightSerialKey(f) === key ? applyNsCancelledFlightVisuals(f, cancelled) : f,
      ),
    );
    setSelectedFlight((prev) => {
      if (!prev) return prev;
      if (nsFlightSerialKey(prev) !== key) return prev;
      return applyNsCancelledFlightVisuals(prev, cancelled);
    });
  }, []);

  /** Refresh Ramp / Pax / GSD lock icons from ns_fhr after form save (same as scheduled). */
  const refreshRowLocksFromFhrCollection = useCallback(async (serialRaw: string) => {
    const serial = String(serialRaw ?? '').trim();
    if (!serial) return;
    const base = getApiBase().replace(/\/$/, '');
    try {
      const res = await frisFetch(
        `${base}/fhr-collection/flight/${encodeURIComponent(serial)}`,
      );
      if (!res.ok) return;
      const fhr = (await res.json()) as Record<string, unknown>;
      const partial = partialNsLocksFromFhrApiDoc(fhr);
      setFlights((prev) =>
        prev.map((f) => {
          const key = String(f.flightSerialNo ?? f.sNo ?? '').trim();
          return key === serial ? applyNsLockPartial(f, partial) : f;
        }),
      );
      setSelectedFlight((prev) => {
        if (!prev) return prev;
        const key = String(prev.flightSerialNo ?? prev.sNo ?? '').trim();
        return key === serial ? applyNsLockPartial(prev, partial) : prev;
      });
    } catch {
      // best-effort — table still correct after next Get
    }
  }, []);

  const loadFlights = useCallback(
    async (opts: {
      mode?: NonScheduledFilterMode;
      serialNo: string;
      challanNo: string;
      bookingNo: string;
      airline: string;
      fromDate: string;
      toDate: string;
      closeFilters?: boolean;
      quietEmpty?: boolean;
    }) => {
      const mode =
        opts.mode ??
        resolveNonScheduledFilterMode({
          serialNo: opts.serialNo,
          challanNo: opts.challanNo,
          bookingNo: opts.bookingNo,
        });
      const next = validateNonScheduledFilterFields({
        mode,
        serialNo: opts.serialNo,
        challanNo: opts.challanNo,
        bookingNo: opts.bookingNo,
        airline: opts.airline,
        fromDate: opts.fromDate,
        toDate: opts.toDate,
      });
      if (applyFilterErrors(next)) {
        const summary = validateNonScheduledFilterInput({
          mode,
          serialNo: opts.serialNo,
          challanNo: opts.challanNo,
          bookingNo: opts.bookingNo,
          airline: opts.airline,
          fromDate: opts.fromDate,
          toDate: opts.toDate,
        });
        if (summary && !opts.quietEmpty) toast.warning(summary);
        return;
      }

      setLoading(true);
      setSearched(false);
      // Keep previous rows while refreshing — avoids blank flash + feels faster.

      try {
        const raw = await fetchNonScheduledAirlineFlights({
          filterBy: filterModeToApiFilterBy(mode),
          serialNo: mode === 'serial-no' ? opts.serialNo : undefined,
          challanNo: mode === 'challan-no' ? opts.challanNo : undefined,
          bookingNo: mode === 'booking-no' ? opts.bookingNo : undefined,
          airline: mode === 'airline-date' ? opts.airline : undefined,
          fromDate: mode === 'airline-date' ? opts.fromDate : undefined,
          tillDate: mode === 'airline-date' ? opts.toDate : undefined,
        });
        let rows = mapMainDetailsListToRows(raw).filter((row) => row.sNo > 0);
        // When date-range load, optionally narrow by serial / performa / booking client-side
        // if those were also typed (priority lookup already used them when primary).
        if (mode === 'airline-date') {
          const serialQ = opts.serialNo.trim().toLowerCase();
          const challanQ = opts.challanNo.trim().toLowerCase();
          const bookingQ = opts.bookingNo.trim().toLowerCase();
          if (serialQ) {
            rows = rows.filter((r) =>
              String(r.flightSerialNo ?? r.sNo)
                .toLowerCase()
                .includes(serialQ),
            );
          }
          if (challanQ) {
            rows = rows.filter((r) =>
              String(r.challanNo ?? '')
                .toLowerCase()
                .includes(challanQ),
            );
          }
          if (bookingQ) {
            rows = rows.filter((r) =>
              String(r.bookingNo ?? '')
                .toLowerCase()
                .includes(bookingQ),
            );
          }
        }
        setFlights(rows);
        setLastAppliedMode(mode);
        setSearched(true);
        if (opts.closeFilters) setShowFilters(false);
        if (rows.length === 0 && !opts.quietEmpty) {
          toast.message('No flights found for this filter.');
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load flights.');
        setSearched(true);
      } finally {
        setLoading(false);
      }
    },
    [applyFilterErrors],
  );

  const handleGet = useCallback(() => {
    void loadFlights({
      serialNo,
      challanNo,
      bookingNo,
      airline,
      fromDate,
      toDate,
      closeFilters: true,
    });
  }, [airline, bookingNo, challanNo, fromDate, loadFlights, serialNo, toDate]);

  const handleResetFilters = useCallback(() => {
    setSerialNo('');
    setChallanNo('');
    setBookingNo('');
    setAirline('');
    const todayRange = defaultNonScheduledDateRange();
    setFromDate(todayRange.fromDate);
    setToDate(todayRange.toDate);
    setShowOpened(true);
    setShowClosed(true);
    setShowCancelled(true);
    setLastAppliedMode('airline-date');
    clearFilterErrors();
  }, [clearFilterErrors]);

  // Deep-link from dashboard / Missing FHR: serial and/or date window, then open sidebar.
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const urlFrom = searchParams.get('from')?.trim() ?? '';
    const urlTo = searchParams.get('to')?.trim() ?? '';
    if (deepLinkSerial) {
      deepLinkHandledRef.current = true;
      setSerialNo(deepLinkSerial);
      if (urlFrom) setFromDate(urlFrom);
      if (urlTo) setToDate(urlTo);
      setShowFilters(true);
      void loadFlights({
        mode: 'serial-no',
        serialNo: deepLinkSerial,
        challanNo: '',
        bookingNo: '',
        airline: '',
        fromDate: urlFrom || fromDate,
        toDate: urlTo || toDate,
        closeFilters: false,
        quietEmpty: true,
      });
      return;
    }
    if (urlFrom && urlTo && missingFhrBackHref) {
      deepLinkHandledRef.current = true;
      setFromDate(urlFrom);
      setToDate(urlTo);
      void loadFlights({
        mode: 'airline-date',
        serialNo: '',
        challanNo: '',
        bookingNo: '',
        airline: '',
        fromDate: urlFrom,
        toDate: urlTo,
        quietEmpty: true,
      });
    }
  }, [
    deepLinkSerial,
    fromDate,
    loadFlights,
    missingFhrBackHref,
    searchParams,
    toDate,
  ]);

  useEffect(() => {
    if (!deepLinkSerial || loading || flights.length === 0) return;
    const match = flights.find((f) => serialMatches(f, deepLinkSerial));
    if (!match) return;
    setSelectedFlight(match);
    setDetailsSidebarOpen(true);
  }, [deepLinkSerial, flights, loading]);

  // Auto-load today’s STA window when not deep-linked (same as Scheduled Airlines).
  useEffect(() => {
    if (deepLinkSerial || deepLinkHandledRef.current) return;
    const { fromDate: from, toDate: to } = defaultNonScheduledDateRange();
    void loadFlights({
      mode: 'airline-date',
      serialNo: '',
      challanNo: '',
      bookingNo: '',
      airline: '',
      fromDate: from,
      toDate: to,
      quietEmpty: true,
    });
  }, [deepLinkSerial, loadFlights]);

  const exportToExcel = useCallback(() => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      toast.message('Export will be available once the report API is connected.');
    }, 400);
  }, []);

  const isLockedValue = useCallback((v: unknown): boolean => {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
  }, []);

  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      const cancelled = isNsRowCancelled(f);
      if (cancelled) return showCancelled;
      const status = resolveNonScheduledFlightStatus(f);
      if (status === 'Closed') return showClosed;
      return showOpened;
    });
  }, [flights, showCancelled, showOpened, showClosed]);

  const adaptedFiltered = useMemo(
    () => filteredFlights.map(adaptNonScheduledFlight),
    [filteredFlights],
  );

  const filteredFlightKpi = useMemo(
    () => countScheduledAirlinesKpiFromFlights(adaptedFiltered),
    [adaptedFiltered],
  );
  const headerActiveCount = filteredFlightKpi.active;
  const headerCancelledCount = filteredFlightKpi.cancelled;

  const activeFlightsStats = useMemo(() => {
    if (filteredFlights.length === 0) {
      return EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS;
    }
    return computeScheduledAirlinesActiveFlightStats(adaptedFiltered, isLockedValue);
  }, [filteredFlights.length, adaptedFiltered, isLockedValue]);

  const toggleActiveStatFilter = useCallback((key: ScheduledAirlinesActiveFlightStatKey) => {
    setActiveStatFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearActiveStatFilters = useCallback(() => {
    setActiveStatFilters(new Set());
  }, []);

  const tableFlights = useMemo(() => {
    if (activeStatFilters.size === 0) return filteredFlights;
    const adaptedTable = filterFlightsByActiveStatCategories(
      adaptedFiltered,
      activeStatFilters,
      isLockedValue,
    );
    const allowed = new Set(
      adaptedTable.map((f) => String(f.slNo ?? '').trim()).filter(Boolean),
    );
    return filteredFlights.filter((f) => allowed.has(nsFlightSerialKey(f)));
  }, [filteredFlights, adaptedFiltered, activeStatFilters, isLockedValue]);

  const scheduleSubtitle = searched
    ? lastAppliedMode === 'airline-date' && fromDate === toDate
      ? `Showing ${tableFlights.length} flight${tableFlights.length === 1 ? '' : 's'} for ${fromDate}`
      : `Showing ${tableFlights.length} flight${tableFlights.length === 1 ? '' : 's'}`
    : 'Loading today’s flights…';

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-full w-full bg-gradient-to-br from-gray-50 to-gray-100 p-3 pb-6 sm:p-4 sm:pb-8 lg:p-6 lg:pb-8"
      >
        <div className="mb-6 sm:mb-8">
          <motion.div
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex shrink-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/25">
                <Plane className="h-6 w-6" aria-hidden />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Non-Scheduled Airlines
              </h1>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 sm:flex-nowrap">
              <motion.button
                type="button"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowActiveFlightsPanel((open) => !open)}
                aria-expanded={showActiveFlightsPanel}
                className={cn(
                  'group relative flex h-11 min-w-[170px] items-center justify-center rounded-xl border bg-white px-4 py-2 shadow-sm transition-all duration-300 ease-in-out',
                  showActiveFlightsPanel
                    ? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/25'
                    : 'border-gray-100 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-md hover:shadow-emerald-500/20',
                )}
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <span
                      aria-hidden
                      className="inline-block h-8 min-w-[2.75rem] animate-pulse rounded-md bg-gray-200"
                    />
                  ) : (
                    <CountUpNumber
                      value={headerActiveCount}
                      duration={0.6}
                      className="text-2xl font-bold leading-none text-emerald-600"
                    />
                  )}
                  <span className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-emerald-700 sm:text-base">
                    Active Flights
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-emerald-600 transition-transform duration-200',
                      showActiveFlightsPanel && 'rotate-180',
                    )}
                  />
                </div>
              </motion.button>

              <motion.button
                type="button"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCancelled((on) => !on)}
                aria-pressed={showCancelled}
                className={cn(
                  'group relative flex h-11 min-w-[170px] items-center justify-center rounded-xl border bg-white px-4 py-2 shadow-sm transition-all duration-300 ease-in-out',
                  showCancelled
                    ? 'border-amber-500 bg-amber-50 shadow-lg shadow-amber-500/25'
                    : 'border-gray-100 hover:border-amber-500 hover:bg-amber-50 hover:shadow-md hover:shadow-amber-500/20',
                )}
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <span
                      aria-hidden
                      className="inline-block h-8 min-w-[2.75rem] animate-pulse rounded-md bg-gray-200"
                    />
                  ) : (
                    <CountUpNumber
                      value={headerCancelledCount}
                      duration={0.6}
                      className="text-2xl font-bold leading-none text-amber-500"
                    />
                  )}
                  <span className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-amber-700 sm:text-base">
                    Cancelled Flights
                  </span>
                </div>
              </motion.button>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 sm:flex-nowrap lg:justify-end">
              {missingFhrBackHref ? (
                <Link
                  href={missingFhrBackHref}
                  className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50"
                >
                  {missingFhrReturnLabel()}
                </Link>
              ) : null}
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowFilters((open) => !open)}
                className="flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-500 bg-amber-500 px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-amber-600 sm:w-auto"
                aria-expanded={showFilters}
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    showFilters ? 'rotate-180' : '',
                  )}
                />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={exportToExcel}
                disabled={isExporting || tableFlights.length === 0}
                className={cn(
                  'flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-white shadow-sm transition-all sm:w-auto',
                  isExporting || tableFlights.length === 0
                    ? 'cursor-not-allowed bg-gray-400'
                    : 'bg-emerald-500 hover:bg-emerald-600',
                )}
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Export Excel</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {showActiveFlightsPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-md"
              aria-label="Active flights panel"
            >
              <ScheduledAirlinesActiveFlightsBar
                stats={activeFlightsStats}
                selectedFilters={activeStatFilters}
                onToggleFilter={toggleActiveStatFilter}
                onClearFilters={clearActiveStatFilters}
                loading={loading}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {showFilters ? (
            <motion.div
              key="ns-airlines-filters"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mb-6 overflow-visible rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="min-w-0 text-lg font-semibold text-gray-900">
                    Advanced Filters
                  </h3>
                  <div className="ml-auto flex shrink-0 items-center gap-3">
                    {searched ? (
                      <p className="whitespace-nowrap text-sm text-gray-600">
                        Found{' '}
                        <span className="font-bold text-emerald-600">
                          {tableFlights.length}
                        </span>{' '}
                        flights
                      </p>
                    ) : null}
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

                <div className="mb-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:gap-4">
                  <div className="min-w-0">
                    <label htmlFor="field-serialNo" className={FLIGHT_FILTER_LABEL_CLASS}>
                      Serial No
                    </label>
                    <input
                      id="field-serialNo"
                      type="text"
                      value={serialNo}
                      onChange={(e) => {
                        setSerialNo(e.target.value);
                        clearFilterField('serialNo');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleGet();
                      }}
                      className={cn(
                        FLIGHT_FILTER_CONTROL_CLASS,
                        filterErrors.serialNo && FRIS_INVALID_CONTROL,
                      )}
                      autoComplete="off"
                      placeholder="Serial number"
                      aria-invalid={!!filterErrors.serialNo}
                    />
                    <FormFieldError
                      id="field-serialNo-error"
                      message={filterErrors.serialNo}
                    />
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="field-challanNo" className={FLIGHT_FILTER_LABEL_CLASS}>
                      Performa No
                    </label>
                    <input
                      id="field-challanNo"
                      type="text"
                      value={challanNo}
                      onChange={(e) => {
                        setChallanNo(e.target.value.toUpperCase());
                        clearFilterField('challanNo');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleGet();
                      }}
                      className={cn(
                        FLIGHT_FILTER_CONTROL_CLASS,
                        filterErrors.challanNo && FRIS_INVALID_CONTROL,
                      )}
                      autoComplete="off"
                      placeholder="Performa number"
                      aria-invalid={!!filterErrors.challanNo}
                    />
                    <FormFieldError
                      id="field-challanNo-error"
                      message={filterErrors.challanNo}
                    />
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="field-bookingNo" className={FLIGHT_FILTER_LABEL_CLASS}>
                      Booking No
                    </label>
                    <input
                      id="field-bookingNo"
                      type="text"
                      value={bookingNo}
                      onChange={(e) => {
                        setBookingNo(e.target.value.toUpperCase());
                        clearFilterField('bookingNo');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleGet();
                      }}
                      className={cn(
                        FLIGHT_FILTER_CONTROL_CLASS,
                        filterErrors.bookingNo && FRIS_INVALID_CONTROL,
                      )}
                      autoComplete="off"
                      placeholder="Booking number"
                      aria-invalid={!!filterErrors.bookingNo}
                    />
                    <FormFieldError
                      id="field-bookingNo-error"
                      message={filterErrors.bookingNo}
                    />
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="ns-filter-airline" className={FLIGHT_FILTER_LABEL_CLASS}>
                      Airline
                    </label>
                    <AdminRadioDropdown
                      id="ns-filter-airline"
                      value={airline}
                      onChange={setAirline}
                      options={airlineOptions}
                      className={FLIGHT_FILTER_CONTROL_CLASS}
                    />
                    <FormFieldError />
                  </div>

                  <div
                    className={cn(
                      'min-w-0',
                      filterErrors.fromDate && FRIS_INVALID_PICKER_WRAP,
                    )}
                  >
                    <label htmlFor="field-fromDate" className={FLIGHT_FILTER_LABEL_CLASS}>
                      From Date
                    </label>
                    <DatePicker
                      id="field-fromDate"
                      value={fromDate}
                      onChange={(v) => {
                        setFromDate(v);
                        clearFilterField('fromDate');
                        clearFilterField('toDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      maxDate={filterStartMaxDate}
                      className="h-10 w-full text-sm"
                      ariaLabel="From date"
                    />
                    <FormFieldError
                      id="field-fromDate-error"
                      message={filterErrors.fromDate}
                    />
                  </div>

                  <div
                    className={cn(
                      'min-w-0',
                      filterErrors.toDate && FRIS_INVALID_PICKER_WRAP,
                    )}
                  >
                    <label htmlFor="field-toDate" className={FLIGHT_FILTER_LABEL_CLASS}>
                      To Date
                    </label>
                    <DatePicker
                      id="field-toDate"
                      value={toDate}
                      onChange={(v) => {
                        setToDate(v);
                        clearFilterField('toDate');
                        clearFilterField('fromDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      minDate={filterEndMinDate}
                      maxDate={new Date()}
                      className="h-10 w-full text-sm"
                      ariaLabel="To date"
                    />
                    <FormFieldError
                      id="field-toDate-error"
                      message={filterErrors.toDate}
                    />
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
                            className="peer sr-only text-emerald-500"
                          />
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          Show Cancelled Flights
                        </span>
                      </label>

                      <label className="flex cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={showOpened}
                            onChange={(e) => setShowOpened(e.target.checked)}
                            className="peer sr-only text-emerald-500"
                          />
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          Show Opened Flights
                        </span>
                      </label>

                      <label className="flex cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={showClosed}
                            onChange={(e) => setShowClosed(e.target.checked)}
                            className="peer sr-only text-emerald-500"
                          />
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          Show Closed Flights
                        </span>
                      </label>
                    </div>

                    <div className="flex h-10 w-full shrink-0 flex-nowrap items-center gap-2 sm:w-auto sm:justify-end">
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        disabled={loading}
                        className={cn(FLIGHT_FILTER_SECONDARY_BTN_CLASS, 'flex-1 sm:flex-none')}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGet()}
                        disabled={loading}
                        className={cn(FLIGHT_FILTER_PRIMARY_BTN_CLASS, 'flex-1 sm:flex-none')}
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Search className="h-4 w-4" aria-hidden />
                        )}
                        Get
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="min-w-0 rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900">Non-Scheduled Flight Schedule</h3>
              <p className="mt-1 text-sm text-gray-500">{scheduleSubtitle}</p>
            </div>
            {dashboardBackHref ? (
              <motion.div
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="shrink-0"
              >
                <Link
                  href={dashboardBackHref}
                  aria-label="Back to dashboard"
                  className="group relative inline-flex h-10 items-center gap-2.5 overflow-hidden rounded-xl border border-emerald-200/90 bg-gradient-to-b from-white via-white to-emerald-50/90 px-3.5 text-sm font-semibold tracking-tight text-emerald-800 shadow-[0_1px_2px_rgba(16,185,129,0.1),0_4px_14px_rgba(16,185,129,0.14)] ring-1 ring-inset ring-white/90 transition-[border-color,box-shadow] duration-200 hover:border-emerald-300 hover:shadow-[0_2px_4px_rgba(16,185,129,0.12),0_10px_24px_rgba(16,185,129,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-400/0 via-emerald-400/5 to-emerald-500/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  />
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/35 transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:shadow-lg group-hover:shadow-emerald-600/40">
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  <span className="relative pr-0.5">Back to dashboard</span>
                </Link>
              </motion.div>
            ) : null}
          </div>

          {loading && tableFlights.length === 0 ? (
            <div
              className="px-4 py-6 sm:px-6"
              role="status"
              aria-live="polite"
              aria-label="Loading flights"
            >
              <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
                <span
                  aria-hidden
                  className="relative inline-flex h-5 w-5 shrink-0"
                >
                  <span className="absolute inset-0 rounded-full border-2 border-emerald-200" />
                  <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-emerald-600" />
                </span>
                Loading flights…
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <div className="grid grid-cols-6 gap-3 border-b border-gray-100 bg-slate-50/80 px-3 py-3 sm:grid-cols-8">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span
                      key={`h-${i}`}
                      className="hidden h-3 animate-pulse rounded bg-gray-200 sm:block first:block"
                    />
                  ))}
                </div>
                <div className="divide-y divide-gray-50">
                  {Array.from({ length: 8 }).map((_, row) => (
                    <div
                      key={`r-${row}`}
                      className="grid grid-cols-6 gap-3 px-3 py-3.5 sm:grid-cols-8"
                      style={{ animationDelay: `${row * 40}ms` }}
                    >
                      {Array.from({ length: 8 }).map((_, col) => (
                        <span
                          key={`c-${row}-${col}`}
                          className={cn(
                            'h-3.5 animate-pulse rounded bg-gray-100',
                            col > 5 && 'hidden sm:block',
                            col === 0 && 'bg-emerald-100/80',
                          )}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : searched && tableFlights.length === 0 && !loading ? (
            <p className="px-4 py-16 text-center text-sm text-gray-500 sm:px-6">
              {flights.length === 0
                ? 'No flights for this STA range / filter. Widen the STA dates, or create a Non-Scheduled booking and generate challan for this station (IXC / Chandigarh bookings only show here after challan).'
                : 'No flights match the current Active Flights / Cancelled filters.'}
            </p>
          ) : (
            <div className="relative">
              {loading ? (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-emerald-100"
                  aria-hidden
                >
                  <div className="h-full w-full origin-left animate-pulse bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
                </div>
              ) : null}
              <NonScheduledFlightsTable
                data={tableFlights}
                onOpenRow={openFlightDetailsSidebar}
                highlightSerial={deepLinkSerial}
              />
              {loading ? (
                <p className="sr-only" role="status" aria-live="polite">
                  Refreshing flights
                </p>
              ) : null}
            </div>
          )}
        </div>
      </motion.div>

      <NonScheduledFlightDetailsSidebar
        isOpen={detailsSidebarOpen}
        onClose={closeFlightDetailsSidebar}
        flight={selectedFlight}
        initialView={sidebarInitialView}
        onFhrLocksMayHaveChanged={refreshRowLocksFromFhrCollection}
        onFlightCancelledChange={handleFlightCancelledChange}
      />
    </>
  );
}
