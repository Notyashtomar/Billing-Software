'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  processFlightData,
  displayScheduledAirlinesTableSerial,
  serialSearchMatches,
  nsFormSerialForFlight,
  scheduledAirlinesRowDedupeKey,
  scheduledAirlinesRowDomId,
  shouldHideScheduledAirlinesTableRow,
  isScheduleCancelledFlightNo,
  domesticInternationalBucketFromCateOfFlight,
  resolveScheduledAirlinesFlightStatus,
} from '@/utils/dataProcessor';
import type { FlightData, MainDetailsData } from '@/utils/dataProcessor';
import {
  getApiBase,
  fetchDailyScheduledFromAdvance,
  fetchFlightsReferenceAirlines,
  fetchFlightsReferenceAircraft,
  advanceDocId,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import ScheduledFlightsTable from '@/components/fris/flights/scheduledairlines/ScheduledFlightsTable';
import FlightDetailsSidebar, {
  type SidebarView,
} from '@/components/fris/flights/scheduledairlines/FlightDetailsSidebar';
import { isAllowedMissingFhrSidebarView } from '@/components/fris/reports/missingFhrPendingForms';
import {
  mainDetailsFromFhrEmbed,
  trySendSharedReportsWhenAllLocksLocked,
} from '@/components/fris/flights/scheduledairlines/ghRepLockedReportsEmail';
import ScheduledAirlinesActiveFlightsBar from '@/components/fris/flights/scheduledairlines/ScheduledAirlinesActiveFlightsBar';
import {
  computeScheduledAirlinesActiveFlightStats,
  countScheduledAirlinesKpiFromFlights,
  EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS,
  filterFlightsByActiveStatCategories,
  type ScheduledAirlinesActiveFlightStatKey,
  type ScheduledAirlinesActiveFlightStats,
} from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';
import { buildScheduledEquipmentReportSearchParams } from '@/components/fris/flights/scheduledairlines/scheduledRowSchedule';
import { persistEquipmentReportHeaderPrefill } from '@/components/fris/flights/scheduledairlines/scheduledEquipmentReportHeader';
import {
  Filter,
  Calendar,
  Plane,
  XCircle,
  Download,
  Search,
  ChevronDown,
  RefreshCw,
  X,
  SortAsc,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getXLSXModule } from '@/lib/dynamic-imports';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { toast } from 'sonner';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { useSearchParams } from 'next/navigation';
import { buildDashboardReturnHref } from '@/lib/dashboardScheduledAirlinesNav';
import {
  buildMissingFhrReturnHref,
  missingFhrReturnLabel,
} from '@/lib/missingFhrScheduledAirlinesNav';
import {
  buildDelayReportReturnHref,
  delayReportReturnLabel,
} from '@/lib/delayReportScheduledAirlinesNav';
import {
  buildCleaningServicesReturnHref,
  cleaningServicesReturnLabel,
} from '@/lib/cleaningServicesScheduledAirlinesNav';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  billingSourceReturnLabel,
  buildBillingSourceReturnHref,
  buildPreparationReturnHref,
  preparationReturnLabel,
} from '@/lib/preparationScheduledAirlinesNav';
import { cn } from '@/lib/utils';
import { isFrisAdminLikeSession } from '@/lib/fris-session';
import { isScheduledReportButtonAllowed, parseUserNavFlags } from '@/lib/nav-permissions';

const fetch = frisFetch;

const FILTER_DATE_FIELD_ORDER = ['fromDate', 'toDate'] as const;
const FILTER_LABEL_CLASS = 'mb-2 block text-sm font-medium text-gray-700';
const FILTER_CONTROL_CLASS =
  'box-border h-10 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900 transition-all hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';
type FilterDateField = (typeof FILTER_DATE_FIELD_ORDER)[number];

/** Empty = all • domestic/international from `FlightData.cateOfFlight` (main-details `Cate_of_Flight`). */
type ScheduledAirlinesFlightTypeFilter = '' | 'domestic' | 'international';

function isRowCancelledForFilters(f: FlightData): boolean {
  return f.isCancelled || isScheduleCancelledFlightNo(f.flightNo);
}

function formatLoadError(error: unknown, fallback: string): string {
  const errMsg = error instanceof Error ? error.message : '';
  if (errMsg.trim().toLowerCase() === 'internal server error') {
    return 'The backend returned Internal Server Error while loading scheduled flights. Please verify the server logs and confirm the selected date range is valid.';
  }
  const isNetworkError =
    error instanceof TypeError &&
    (errMsg === 'Failed to fetch' || errMsg.includes('fetch'));
  if (isNetworkError) {
    const base = getApiBase().replace(/\/$/, '');
    const target =
      base.startsWith('/')
        ? `${base} (dev proxy → Nest on 127.0.0.1:8080)`
        : base || 'http://127.0.0.1:8080';
    return (
      'Cannot reach the API. Make sure the backend is running (e.g. run "npm run start:dev" in the server folder) and reachable at ' +
      target +
      '.'
    );
  }
  return error instanceof Error ? error.message : fallback;
}

/** Default STA window: today's operating day (yyyy-MM-dd). */
function scheduledAirlinesDefaultDateYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Advance schedules can extend beyond “today”; keep pickers usable for future published ranges. */
function scheduleDatePickerMaxDate(): Date {
  return new Date(2030, 11, 31);
}

function scheduleDatePickerMaxYmd(): string {
  return '2030-12-31';
}

/** URL / form date → yyyy-MM-dd for filter state. */
function ymdFromSearchParam(raw: string | null): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/** yyyy-MM-dd → dd/MM/yyyy for `daily-from-advance` query params. */
function yyyyMmDdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** dd/MM/yyyy or yyyy-MM-dd → yyyy-MM-dd for comparing row dates to the loaded window. */
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
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d)
      return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Keep rows whose primary operating calendar day is inside [fromYmd, toYmd].
 * Uses STA date first (same rule as data-export); STD only when STA cannot be parsed.
 * Avoids counting cross-month legs where STA is outside the range but STD falls inside it.
 */
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

/** Lock + form-presence flags from `GET /fhr-collection/flight/:serial` (same rules as daily list). */
function partialFlightRowFromFhrApiDoc(fhr: Record<string, unknown>): Partial<FlightData> {
  const fhrM =
    fhr.mainDetails != null &&
    typeof fhr.mainDetails === 'object' &&
    !Array.isArray(fhr.mainDetails);
  const fhrT =
    fhr.terminalDetails != null &&
    typeof fhr.terminalDetails === 'object' &&
    !Array.isArray(fhr.terminalDetails);
  const fhrR1 =
    fhr.rampDetails1 != null &&
    typeof fhr.rampDetails1 === 'object' &&
    !Array.isArray(fhr.rampDetails1);
  const fhrL =
    fhr.loadControlDetails != null &&
    typeof fhr.loadControlDetails === 'object' &&
    !Array.isArray(fhr.loadControlDetails);
  const eqE = fhr.equipmentManpower;
  let fhrG = false;
  if (eqE != null && typeof eqE === 'object' && !Array.isArray(eqE)) {
    const e = eqE as Record<string, unknown>;
    const entries = Array.isArray(e.entries) ? e.entries : [];
    if (entries.length > 0) fhrG = true;
    else {
      for (const k of [
        'verifiedBy',
        'verifiedAt',
        'verifiedByCode',
        'flightNo',
        'airlinesOperator',
        'sta',
        'staDate',
        'std',
        'stdDate',
        'acType',
        'routing',
        'operations',
      ]) {
        if (String(e[k] ?? '').trim()) {
          fhrG = true;
          break;
        }
      }
    }
  }
  return {
    hasMainDetails: fhrM,
    hasTerminalDetails: fhrT,
    hasRampDetails: fhrR1,
    hasLoadControlDetails: fhrL,
    hasEquipmentManpowerDetails: fhrG,
    rampLocked: fhrR1 ? 'Yes' : 'No',
    paxLocked: fhrT ? 'Yes' : 'No',
    gsdLocked: fhrG ? 'Yes' : 'No',
  };
}

/** HH:MM, H:MM, or compact HHMM → minutes from midnight; invalid → 0. */
function scheduleTimeToMinutes(raw: string): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  const colon = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m;
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 3 && digits.length <= 4) {
    const n = Number(digits.slice(-4));
    const h = Math.floor(n / 100);
    const m = n % 100;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m;
  }
  return 0;
}

/** STA calendar day + time, ms — ascending = earliest first (from-date → to-date order). */
function flightChronologicalSortMs(f: FlightData): number {
  const ymd =
    scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
    scheduleLabelToYmd(String(f.stdDate ?? '').trim());
  if (!ymd) return Number.MAX_SAFE_INTEGER;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return Number.MAX_SAFE_INTEGER;
  const [y, mo, d] = parts;
  const dayMs = new Date(y!, mo! - 1, d!).getTime();
  const mins = scheduleTimeToMinutes(String(f.staTime ?? f.stdTime ?? '').trim());
  return dayMs + mins * 60 * 1000;
}


/** Align table row with saved main-details cancellation (CANC prefix + isCancelled). */
function applyCancelledFlightVisuals(flight: FlightData, cancelled: boolean): FlightData {
  const currentNo = String(flight.flightNo ?? '');
  const upper = currentNo.toUpperCase();
  let nextFlightNo = currentNo;
  if (cancelled) {
    if (!upper.startsWith('CANC')) nextFlightNo = `CANC ${currentNo}`.trim();
  } else {
    nextFlightNo = currentNo.replace(/^CANC[\s-]*/i, '').trim();
  }
  const nextStatus = cancelled
    ? 'Cancelled'
    : flight.flightStatus === 'Cancelled'
      ? 'Open'
      : (flight.flightStatus ?? 'Open');
  return {
    ...flight,
    flightNo: nextFlightNo,
    flightStatus: nextStatus,
    isCancelled: cancelled,
  };
}

export function ScheduledAirlinesContent() {
  const searchParams = useSearchParams();
  const highlightSerialFromUrl = searchParams.get('highlightSerial')?.trim() ?? '';
  const scheduledAirlinesBackHref = useMemo(
    () =>
      buildDashboardReturnHref(searchParams) ??
      buildPreparationReturnHref(searchParams) ??
      buildMissingFhrReturnHref(searchParams) ??
      buildDelayReportReturnHref(searchParams) ??
      buildCleaningServicesReturnHref(searchParams) ??
      buildBillingSourceReturnHref(searchParams),
    [searchParams],
  );
  const scheduledAirlinesBackLabel = useMemo(() => {
    if (buildMissingFhrReturnHref(searchParams)) return missingFhrReturnLabel();
    if (buildDelayReportReturnHref(searchParams)) return delayReportReturnLabel();
    if (buildCleaningServicesReturnHref(searchParams)) return cleaningServicesReturnLabel();
    if (buildPreparationReturnHref(searchParams)) return preparationReturnLabel();
    const billingSourceLabel = billingSourceReturnLabel(searchParams);
    if (billingSourceLabel) return billingSourceLabel;
    return 'Back to dashboard';
  }, [searchParams]);
  const openSidebarFromUrl = searchParams.get('openSidebar')?.trim() ?? '';
  const sidebarInitialView = useMemo((): SidebarView | null => {
    if (!isAllowedMissingFhrSidebarView(openSidebarFromUrl)) return null;
    return openSidebarFromUrl;
  }, [openSidebarFromUrl]);
  const sidebarDeepLinkHandledRef = React.useRef(false);

  const [allFlights, setAllFlights] = useState<FlightData[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);

  // Per-row report button visibility, gated by admin-assigned permission flags.
  // Defaults to visible (admins / unrestricted sessions); refined on mount for
  // panel users so a toggled-off report button is hidden entirely.
  const [reportButtonAccess, setReportButtonAccess] = useState({
    fhr: true,
    gse: true,
    team: true,
  });
  useEffect(() => {
    if (isFrisAdminLikeSession()) {
      setReportButtonAccess({ fhr: true, gse: true, team: true });
      return;
    }
    const flags = parseUserNavFlags(localStorage.getItem('userFlags'));
    if (!flags || Object.keys(flags).length === 0) {
      setReportButtonAccess({ fhr: true, gse: true, team: true });
      return;
    }
    setReportButtonAccess({
      fhr: isScheduledReportButtonAllowed(flags, 'FHR Report'),
      gse: isScheduledReportButtonAllowed(flags, 'GSE Report'),
      team: isScheduledReportButtonAllowed(flags, 'Team Report'),
    });
  }, []);

  // Filter states - HTML date inputs use yyyy-MM-dd format
  /** Default: today's STA window until the user changes the range. */
  const [fromDate, setFromDate] = useState(() => scheduledAirlinesDefaultDateYmd());
  const [toDate, setToDate] = useState(() => scheduledAirlinesDefaultDateYmd());
  const { errors: dateErrors, clearAll: clearDateErrors, clearField: clearDateField, applyAndFocus: applyDateErrors } =
    useFieldErrors<FilterDateField>(FILTER_DATE_FIELD_ORDER);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [flightType, setFlightType] = useState<ScheduledAirlinesFlightTypeFilter>('');
  const [airline, setAirline] = useState('');
  const [aircraft, setAircraft] = useState('');
  /** Station-scoped Advance masters for filter dropdowns (not limited to loaded flights). */
  const [masterAirlineNames, setMasterAirlineNames] = useState<string[]>([]);
  const [masterAircraftTypes, setMasterAircraftTypes] = useState<string[]>([]);
  /** Substring match on flight no., airline, serial, aircraft, destination. */
  const [searchText, setSearchText] = useState('');
  const [showCancelled, setShowCancelled] = useState(true);
  const [showOpened, setShowOpened] = useState(true);
  const [showClosed, setShowClosed] = useState(true);
  const [sortByColor, setSortByColor] = useState(false);
  /** When on, table order is chronological by STA date/time (start date → end date). */
  const [sortByDate, setSortByDate] = useState(false);

  const isLockedValue = useCallback((v: unknown): boolean => {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
  }, []);

  const schedulePickerMaxDate = scheduleDatePickerMaxDate();
  const schedulePickerMaxYmd = scheduleDatePickerMaxYmd();

  const scheduleFilterStartMaxDate = (() => {
    if (!toDate?.trim()) return schedulePickerMaxDate;
    const parts = toDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return schedulePickerMaxDate;
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    return end.getTime() <= schedulePickerMaxDate.getTime() ? end : schedulePickerMaxDate;
  })();

  // UI states
  const [showFilters, setShowFilters] = useState(false);
  const [showActiveFlightsPanel, setShowActiveFlightsPanel] = useState(false);
  const [activeStatFilters, setActiveStatFilters] = useState<
    Set<ScheduledAirlinesActiveFlightStatKey>
  >(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [isExporting, setIsExporting] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [detailsSidebarOpen, setDetailsSidebarOpen] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<FlightData | null>(null);
  const [mainDetailsFromServer, setMainDetailsFromServer] = useState<MainDetailsData | null>(null);
  const ghRepEmailInFlightRef = useRef(new Set<string>());

  /** Refresh lock + form-presence columns from `fhr_collection` after a save (e.g. GSD verify). */
  const refreshRowLocksFromFhrCollection = useCallback(
    async (instanceSlNo: string) => {
      const key = String(instanceSlNo ?? '').trim();
      if (!key) return;
      const flight = allFlights.find((f) => String(f.slNo ?? '').trim() === key);
      const apiSerial =
        String(nsFormSerialForFlight(flight ?? ({ slNo: key, legacySlNo: '' } as FlightData)) ?? '').trim() ||
        key;
      const base = getApiBase().replace(/\/$/, '');
      try {
        const res = await fetch(
          `${base}/fhr-collection/flight/${encodeURIComponent(apiSerial)}`,
        );
        if (!res.ok) return;
        const fhr = (await res.json()) as Record<string, unknown>;
        const partial = partialFlightRowFromFhrApiDoc(fhr);
        const applyPartial = (f: FlightData): FlightData => {
          const merged = { ...f, ...partial };
          return {
            ...merged,
            flightStatus: resolveScheduledAirlinesFlightStatus(merged),
          };
        };
        setAllFlights((prev) =>
          prev.map((f) => (String(f.slNo ?? '').trim() === key ? applyPartial(f) : f)),
        );
        setSelectedFlight((prev) => {
          if (!prev || String(prev.slNo ?? '').trim() !== key) return prev;
          return applyPartial(prev);
        });

        const flightForEmail = flight ? applyPartial(flight) : ({ slNo: key } as FlightData);
        const mainDetails = mainDetailsFromFhrEmbed(fhr);
        void trySendSharedReportsWhenAllLocksLocked({
          flight: flightForEmail,
          fhr,
          mainDetails,
          inFlightKeys: ghRepEmailInFlightRef.current,
        });
      } catch {
        /* ignore */
      }
    },
    [allFlights],
  );

  const loadFlightsForYmdRange = useCallback(
    async (fromYmd: string, toYmd: string) => {
      setLoadingFlights(true);
      setFilterError(null);
      try {
        const fromDdMmYyyy = yyyyMmDdToDdMmYyyy(fromYmd);
        const toDdMmYyyy = yyyyMmDdToDdMmYyyy(toYmd);
        if (!fromDdMmYyyy || !toDdMmYyyy) throw new Error('Invalid date selection.');
        if (fromYmd > toYmd) throw new Error('End date must be on or after start date.');

        const rawDaily = await fetchDailyScheduledFromAdvance(fromDdMmYyyy, toDdMmYyyy);

        const flights = filterFlightsToDateWindow(
          processFlightData(Array.isArray(rawDaily) ? rawDaily : []),
          fromYmd,
          toYmd,
        );

        console.info('[ScheduledAirlines] daily-from-advance', {
          fromYmd,
          toYmd,
          apiRows: Array.isArray(rawDaily) ? rawDaily.length : 0,
          tableRows: flights.length,
          legacyRows: flights.filter((f) =>
            String(f.legacySlNo ?? '').trim().length > 0,
          ).length,
        });

        setAllFlights(flights);
        setCurrentPage(1);
      } catch (error) {
        console.warn('Load flights failed.', error);
        setFilterError(formatLoadError(error, 'Could not load flights.'));
        setAllFlights([]);
      } finally {
        setLoadingFlights(false);
      }
    },
    [],
  );

  const resetAllFilters = useCallback(() => {
    const today = scheduledAirlinesDefaultDateYmd();
    setSearchText('');
    setFlightType('');
    setAirline('');
    setAircraft('');
    setFromDate(today);
    setToDate(today);
    setShowCancelled(true);
    setShowOpened(true);
    setShowClosed(true);
    setSortByColor(false);
    setSortByDate(false);
    setSortOrder('desc');
    setFilterError(null);
    clearDateErrors();
    setCurrentPage(1);
    void loadFlightsForYmdRange(today, today);
  }, [clearDateErrors, loadFlightsForYmdRange]);

  const handleFilter = useCallback(async () => {
    if (!fromDate && !toDate) {
      clearDateErrors();
      const today = scheduledAirlinesDefaultDateYmd();
      setFromDate(today);
      setToDate(today);
      await loadFlightsForYmdRange(today, today);
      return;
    }

    const next = validateYmdDateRange(fromDate, toDate, {
      fromLabel: 'Start date',
      toLabel: 'End date',
      toNotAfterToday: true,
      fromNotAfterToday: true,
    });
    if (applyDateErrors(next)) {
      toast.warning(
        next.toDate ||
          next.fromDate ||
          'Select both start and end dates, or clear both to reload today\'s schedule.',
      );
      return;
    }

    await loadFlightsForYmdRange(fromDate, toDate);
  }, [applyDateErrors, clearDateErrors, fromDate, toDate, loadFlightsForYmdRange]);

  /** Initial load: honour `?from=` / `?to=` (yyyy-MM-dd); otherwise load today's flights. */
  useEffect(() => {
    const today = scheduledAirlinesDefaultDateYmd();
    const fromYmd = ymdFromSearchParam(searchParams.get('from')) ?? today;
    const toYmd = ymdFromSearchParam(searchParams.get('to')) ?? today;
    setFromDate(fromYmd);
    setToDate(toYmd);
    void loadFlightsForYmdRange(fromYmd, toYmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount with URL defaults
  }, []);

  /** Deep-link: pre-fill serial filter (`highlightSerial` or `serial`). */
  useEffect(() => {
    const serial =
      highlightSerialFromUrl || searchParams.get('serial')?.trim() || '';
    if (!serial) return;
    setSearchText(serial);
  }, [highlightSerialFromUrl, searchParams]);

  const airlineFromUrl = searchParams.get('airline')?.trim() ?? '';
  const aircraftFromUrl = searchParams.get('aircraft')?.trim() ?? '';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [airlineDocs, aircraftDocs] = await Promise.all([
          fetchFlightsReferenceAirlines(),
          fetchFlightsReferenceAircraft(),
        ]);
        if (cancelled) return;
        const airlines = (airlineDocs as Record<string, unknown>[])
          .map((doc) => {
            const d = advanceDocId(doc);
            return String(d.name ?? d.airlineName ?? d.airline ?? '').trim();
          })
          .filter(Boolean);
        const aircraft = (aircraftDocs as Record<string, unknown>[])
          .map((doc) => {
            const d = advanceDocId(doc);
            return String(d.aircraft ?? d.type ?? '').trim();
          })
          .filter(Boolean);
        setMasterAirlineNames(Array.from(new Set(airlines)).sort((a, b) => a.localeCompare(b)));
        setMasterAircraftTypes(Array.from(new Set(aircraft)).sort((a, b) => a.localeCompare(b)));
      } catch {
        if (!cancelled) {
          setMasterAirlineNames([]);
          setMasterAircraftTypes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Station masters + any names present on loaded flights (covers ad-hoc labels).
  const airlineOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...masterAirlineNames,
          ...allFlights.map((f) => f.airline).filter(Boolean),
        ]),
      ).sort((a, b) => a.localeCompare(b)),
    [masterAirlineNames, allFlights],
  );

  const aircraftTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...masterAircraftTypes,
          ...allFlights.map((f) => f.aircraft).filter(Boolean),
        ]),
      ).sort((a, b) => a.localeCompare(b)),
    [masterAircraftTypes, allFlights],
  );

  /**
   * Deep-link: after flights load, align airline/aircraft filters with the
   * highlighted row so billing preparation links do not over-filter the target.
   */
  useEffect(() => {
    if (!highlightSerialFromUrl || allFlights.length === 0) return;
    const flight = allFlights.find((f) =>
      serialSearchMatches(f, highlightSerialFromUrl),
    );
    if (!flight) {
      if (airlineFromUrl) setAirline(airlineFromUrl);
      if (aircraftFromUrl) setAircraft(aircraftFromUrl);
      return;
    }
    if (airlineFromUrl && flight.airline) setAirline(flight.airline);
    if (aircraftFromUrl && flight.aircraft) setAircraft(flight.aircraft);
  }, [
    highlightSerialFromUrl,
    allFlights,
    airlineFromUrl,
    aircraftFromUrl,
  ]);

  // Apply filters (all conditions are AND; search no longer overrides airline/type/aircraft)
  const filteredFlights = useMemo(() => {
    const serialSortValue = (f: FlightData): number => {
      const n = Number(String(f.slNo ?? '').trim());
      return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    };

    const result = allFlights.filter((f) => {
      if (shouldHideScheduledAirlinesTableRow(f)) return false;

      if (flightType) {
        const bucket = domesticInternationalBucketFromCateOfFlight(f.cateOfFlight);
        if (bucket !== flightType) return false;
      }
      if (airline && f.airline !== airline) return false;
      if (aircraft && f.aircraft !== aircraft) return false;

      if (searchText.trim()) {
        const q = searchText.trim();
        const searchLower = q.toLowerCase();
        const match =
          f.flightNo.toLowerCase().includes(searchLower) ||
          f.airline.toLowerCase().includes(searchLower) ||
          f.aircraft.toLowerCase().includes(searchLower) ||
          String(f.slNo ?? '').toLowerCase().includes(searchLower) ||
          String(f.legacySlNo ?? '').toLowerCase().includes(searchLower) ||
          String(f.serialLabel ?? '').toLowerCase().includes(searchLower) ||
          (f.destination?.toLowerCase().includes(searchLower) ?? false) ||
          serialSearchMatches(f, q);
        if (!match) return false;
      }

      if (!showCancelled && isRowCancelledForFilters(f)) return false;
      if (!isRowCancelledForFilters(f)) {
        const status = String(f.flightStatus ?? '').trim().toLowerCase();
        const isClosed =
          status === 'closed' ||
          (isLockedValue(f.rampLocked) &&
            isLockedValue(f.paxLocked) &&
            isLockedValue(f.gsdLocked));
        if (isClosed && !showClosed) return false;
        if (!isClosed && !showOpened) return false;
      }

      return true;
    });

    // Sort: optional chronological by STA (from-date → to-date), else color/serial default.
    if (sortByDate) {
      result.sort((a, b) => {
        const dt = flightChronologicalSortMs(a) - flightChronologicalSortMs(b);
        if (dt !== 0) return dt;
        return serialSortValue(a) - serialSortValue(b);
      });
    } else if (sortByColor) {
      result.sort((a, b) => {
        const aCancelled = isRowCancelledForFilters(a);
        const bCancelled = isRowCancelledForFilters(b);

        if (sortOrder === 'desc') {
          if (aCancelled && !bCancelled) return -1;
          if (!aCancelled && bCancelled) return 1;
        } else {
          if (!aCancelled && bCancelled) return -1;
          if (aCancelled && !bCancelled) return 1;
        }

        return serialSortValue(a) - serialSortValue(b);
      });
    } else {
      result.sort((a, b) => serialSortValue(a) - serialSortValue(b));
    }

    // One row per operational serial + STA day (see `scheduledAirlinesRowDedupeKey`).
    const deduped: FlightData[] = [];
    const keyToIndex = new Map<string, number>();
    for (const row of result) {
      const key = scheduledAirlinesRowDedupeKey(row);
      const existingIdx = keyToIndex.get(key);
      if (existingIdx !== undefined) {
        const cur = deduped[existingIdx];
        const rowHandling = String(row.typeOfHandling ?? '').trim();
        const curHandling = String(cur.typeOfHandling ?? '').trim();
        if (rowHandling && !curHandling) {
          deduped[existingIdx] = { ...cur, typeOfHandling: row.typeOfHandling };
        }
        continue;
      }
      keyToIndex.set(key, deduped.length);
      deduped.push(row);
    }

    return deduped;
  }, [
    flightType,
    airline,
    aircraft,
    searchText,
    showCancelled,
    showOpened,
    showClosed,
    sortByColor,
    sortByDate,
    sortOrder,
    allFlights,
    isLockedValue,
  ]);

  useEffect(() => {
    console.info('[ScheduledAirlines] Filtered rows', {
      totalRows: allFlights.length,
      filteredRows: filteredFlights.length,
      searchText: searchText.trim(),
      hasFlightTypeFilter: Boolean(flightType),
      hasAirlineFilter: Boolean(airline),
      hasAircraftFilter: Boolean(aircraft),
      showCancelled,
      showOpened,
      showClosed,
      matched16616: filteredFlights.some(
        (f) =>
          String(f.slNo ?? '').trim() === '16616' ||
          String(f.legacySlNo ?? '').trim() === '16616',
      ),
    });
  }, [
    allFlights.length,
    filteredFlights,
    searchText,
    flightType,
    airline,
    aircraft,
    showCancelled,
    showOpened,
    showClosed,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    flightType,
    airline,
    aircraft,
    searchText,
    showCancelled,
    showOpened,
    showClosed,
    fromDate,
    toDate,
    sortByColor,
    sortByDate,
    sortOrder,
  ]);

  const filteredFlightKpi = useMemo(
    () => countScheduledAirlinesKpiFromFlights(filteredFlights),
    [filteredFlights],
  );

  const headerActiveCount = filteredFlightKpi.active;
  const headerCancelledCount = filteredFlightKpi.cancelled;

  const activeFlightsStats = useMemo((): ScheduledAirlinesActiveFlightStats => {
    if (filteredFlights.length === 0) {
      return EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS;
    }
    return computeScheduledAirlinesActiveFlightStats(filteredFlights, isLockedValue);
  }, [filteredFlights, isLockedValue]);

  const toggleActiveStatFilter = useCallback((key: ScheduledAirlinesActiveFlightStatKey) => {
    setActiveStatFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setCurrentPage(1);
  }, []);

  const clearActiveStatFilters = useCallback(() => {
    setActiveStatFilters(new Set());
    setCurrentPage(1);
  }, []);

  const tableFlights = useMemo(
    () => filterFlightsByActiveStatCategories(filteredFlights, activeStatFilters, isLockedValue),
    [filteredFlights, activeStatFilters, isLockedValue],
  );

  const statsLoading = loadingFlights;

  // Pagination
  const totalPages = Math.ceil(tableFlights.length / itemsPerPage);
  const paginatedFlights = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return tableFlights.slice(startIndex, startIndex + itemsPerPage);
  }, [tableFlights, currentPage, itemsPerPage]);

  /** Jump to the correct page and scroll when opened with `?highlightSerial=`. */
  useEffect(() => {
    if (!highlightSerialFromUrl || loadingFlights) return;
    const idx = tableFlights.findIndex((f) =>
      serialSearchMatches(f, highlightSerialFromUrl),
    );
    if (idx < 0) return;
    setCurrentPage(Math.floor(idx / itemsPerPage) + 1);
  }, [highlightSerialFromUrl, tableFlights, itemsPerPage, loadingFlights]);

  useEffect(() => {
    if (!highlightSerialFromUrl || loadingFlights) return;
    const flight = paginatedFlights.find((f) =>
      serialSearchMatches(f, highlightSerialFromUrl),
    );
    if (!flight) return;
    const id = scheduledAirlinesRowDomId(flight);
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [highlightSerialFromUrl, paginatedFlights, loadingFlights]);

  useEffect(() => {
    if (sidebarDeepLinkHandledRef.current) return;
    if (!highlightSerialFromUrl || !sidebarInitialView || loadingFlights) return;
    const flight = filteredFlights.find((f) =>
      serialSearchMatches(f, highlightSerialFromUrl),
    );
    if (!flight) return;
    sidebarDeepLinkHandledRef.current = true;
    setSelectedFlight(flight);
    setMainDetailsFromServer(null);
    setDetailsSidebarOpen(true);
  }, [
    filteredFlights,
    highlightSerialFromUrl,
    loadingFlights,
    sidebarInitialView,
  ]);

  const openFlightDetailsSidebar = (flight: FlightData) => {
    setSelectedFlight(flight);
    setMainDetailsFromServer(null);
    setDetailsSidebarOpen(true);
  };

  const closeFlightDetailsSidebar = () => {
    setDetailsSidebarOpen(false);
    setSelectedFlight(null);
    setMainDetailsFromServer(null);
  };

  const handleFlightCancelledChange = useCallback((slNo: string, cancelled: boolean) => {
    const key = String(slNo ?? '').trim();
    if (!key) return;
    // Keep the just-cancelled flight visible in table immediately.
    if (cancelled) setShowCancelled(true);
    setAllFlights((prev) =>
      prev.map((f) =>
        String(f.slNo ?? '').trim() === key ? applyCancelledFlightVisuals(f, cancelled) : f,
      ),
    );
    setSelectedFlight((prev) => {
      if (!prev) return prev;
      if (String(prev.slNo ?? '').trim() !== key) return prev;
      return applyCancelledFlightVisuals(prev, cancelled);
    });
  }, []);

  const handleViewReport = (flight: FlightData) => {
    const instanceSl = String(flight.slNo ?? '').trim();
    const apiSerial = String(nsFormSerialForFlight(flight) ?? '').trim() || instanceSl;
    const params = new URLSearchParams({
      flightSlNo: apiSerial,
      tableSerial: displayScheduledAirlinesTableSerial(flight),
    });
    if (instanceSl && apiSerial && instanceSl !== apiSerial) {
      params.set('instanceSlNo', instanceSl);
    }
    if (flight.staDate) params.set('staDate', flight.staDate);
    if (flight.staTime) params.set('staTime', flight.staTime);
    if (flight.stdDate) params.set('stdDate', flight.stdDate);
    if (flight.stdTime) params.set('stdTime', flight.stdTime);
    if (flight.route) params.set('routing', flight.route);
    if (flight.airline) params.set('airline', flight.airline);
    if (flight.flightNo) params.set('flightNo', flight.flightNo);
    if (flight.aircraft) params.set('aircraft', flight.aircraft);
    window.open(`/fris/flights/scheduledairlines/fhr-report?${params.toString()}`, '_blank');
  };

  const buildEquipmentReportParams = (flight: FlightData, reportType: 'summary' | 'detailed') =>
    persistEquipmentReportHeaderPrefill(flight, { reportType });

  const handleViewEquipment = (flight: FlightData) => {
    const params = buildEquipmentReportParams(flight, 'summary');
    window.open(`/fris/flights/scheduledairlines/equipment-report?${params.toString()}`, '_blank');
  };

  const handleViewDetailedEquipment = (flight: FlightData) => {
    const params = buildEquipmentReportParams(flight, 'detailed');
    window.open(`/fris/flights/scheduledairlines/equipment-report?${params.toString()}`, '_blank');
  };

  // Export to Excel
  const exportToExcel = async () => {
    setIsExporting(true);

    try {
      const XLSX = await getXLSXModule();
      const exportData = filteredFlights.map((flight) => {
        return {
          'Sl.No': displayScheduledAirlinesTableSerial(flight),
          'Flight No': flight.flightNo,
          Airline: flight.airline,
          Aircraft: flight.aircraft,
          'STA Date': flight.staDate,
          'STA Time': flight.staTime,
          'STD Date': flight.stdDate,
          'STD Time': flight.stdTime,
          Status: isRowCancelledForFilters(flight)
            ? 'Cancelled'
            : flight.flightStatus || 'Open',
          'Ramp Locked': String(flight.rampLocked).toLowerCase() === 'true' ? 'Locked' : 'Unlocked',
          'Pax Locked': String(flight.paxLocked).toLowerCase() === 'true' ? 'Locked' : 'Unlocked',
          'GSD Locked': String(flight.gsdLocked).toLowerCase() === 'true' ? 'Locked' : 'Unlocked',
          Category: flight.cateOfFlight ?? '',
          'F Bag': flight.fBag,
          'L Bag': flight.lBag,
          'Exported NAV': flight.exportedNAV,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Scheduled Flights');

      // Auto-size columns
      const wscols = [
        { wch: 6 }, // Sl.No
        { wch: 10 }, // Flight No
        { wch: 15 }, // Airline
        { wch: 12 }, // Aircraft
        { wch: 10 }, // STA Date
        { wch: 8 }, // STA Time
        { wch: 10 }, // STD Date
        { wch: 8 }, // STD Time
        { wch: 10 }, // Status
        { wch: 12 }, // Ramp Locked
        { wch: 12 }, // Pax Locked
        { wch: 12 }, // GSD Locked
        { wch: 28 }, // Category
        { wch: 8 }, // F Bag
        { wch: 8 }, // L Bag
        { wch: 12 }, // Exported NAV
      ];
      worksheet['!cols'] = wscols;

      const excelBuffer = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'array',
      });
      const data = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const timestamp = new Date().toISOString().split('T')[0];
      const saveAs = await loadFileSaverSaveAs();
      saveAs(data, `Scheduled_Flights_${timestamp}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-3 pb-6 sm:p-4 sm:pb-8 lg:p-6 lg:pb-8"
      >
        {/* Header */}
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
                Scheduled Airlines
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
                  {statsLoading ? (
                    <span
                      aria-hidden
                      className="inline-block h-8 min-w-[2.75rem] animate-pulse rounded-md bg-gray-200"
                    />
                  ) : (
                    <CountUpNumber
                      value={headerActiveCount}
                      duration={1.5}
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
                onClick={() => {
                  setShowCancelled((on) => !on);
                  setCurrentPage(1);
                }}
                aria-pressed={showCancelled}
                className={cn(
                  'group relative flex h-11 min-w-[170px] items-center justify-center rounded-xl border bg-white px-4 py-2 shadow-sm transition-all duration-300 ease-in-out',
                  showCancelled
                    ? 'border-amber-500 bg-amber-50 shadow-lg shadow-amber-500/25'
                    : 'border-gray-100 hover:border-amber-500 hover:bg-amber-50 hover:shadow-md hover:shadow-amber-500/20',
                )}
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  {statsLoading ? (
                    <span
                      aria-hidden
                      className="inline-block h-8 min-w-[2.75rem] animate-pulse rounded-md bg-gray-200"
                    />
                  ) : (
                    <CountUpNumber
                      value={headerCancelledCount}
                      duration={1.5}
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
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowFilters(!showFilters)}
                className="flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-500 bg-amber-500 px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-amber-600 sm:w-auto"
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={exportToExcel}
                disabled={isExporting || filteredFlights.length === 0}
                className={`flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-white transition-all sm:w-auto ${
                  isExporting || filteredFlights.length === 0
                    ? 'cursor-not-allowed bg-gray-400'
                    : 'bg-emerald-500 hover:bg-emerald-600 shadow-sm'
                }`}
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Export Excel</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* Active Flights breakdown panel */}
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
                loading={statsLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters Panel */}
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
                  <h3 className="min-w-0 text-lg font-semibold text-gray-900">
                    Advanced Filters
                  </h3>
                  <div className="ml-auto flex shrink-0 items-center gap-3">
                    <p className="text-sm text-gray-600 whitespace-nowrap">
                      Found{' '}
                      <span className="font-bold text-emerald-600">
                        {filteredFlights.length}
                      </span>{' '}
                      flights
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

                <div className="mb-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:gap-4">
                  <div className="min-w-0">
                    <label htmlFor="scheduled-filter-search" className={FILTER_LABEL_CLASS}>
                      Search
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        id="scheduled-filter-search"
                        type="text"
                        autoComplete="off"
                        placeholder="Flight no., airline, serial…"
                        value={searchText}
                        onChange={(e) => {
                          setSearchText(e.target.value);
                          setCurrentPage(1);
                        }}
                        className={cn(FILTER_CONTROL_CLASS, 'pl-10 pr-4')}
                      />
                    </div>
                    <FormFieldError />
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="scheduled-filter-airline" className={FILTER_LABEL_CLASS}>
                      Airline
                    </label>
                    <AdminRadioDropdown
                      id="scheduled-filter-airline"
                      value={airline}
                      onChange={(v) => {
                        setAirline(v);
                        setCurrentPage(1);
                      }}
                      options={[
                        { value: '', label: 'All Airlines' },
                        ...airlineOptions.map((a) => ({ value: a, label: a })),
                      ]}
                      className={FILTER_CONTROL_CLASS}
                    />
                    <FormFieldError />
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="scheduled-filter-category" className={FILTER_LABEL_CLASS}>
                      Category
                    </label>
                    <AdminRadioDropdown
                      id="scheduled-filter-category"
                      value={flightType}
                      onChange={(v) => setFlightType(v as ScheduledAirlinesFlightTypeFilter)}
                      options={[
                        { value: '', label: 'All Types' },
                        { value: 'domestic', label: 'Domestic' },
                        { value: 'international', label: 'International' },
                      ]}
                      className={FILTER_CONTROL_CLASS}
                    />
                    <FormFieldError />
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="scheduled-filter-aircraft" className={FILTER_LABEL_CLASS}>
                      Aircraft Type
                    </label>
                    <AdminRadioDropdown
                      id="scheduled-filter-aircraft"
                      value={aircraft}
                      onChange={(v) => setAircraft(v)}
                      options={[
                        { value: '', label: 'All Aircraft' },
                        ...aircraftTypes.map((a) => ({ value: a, label: a })),
                      ]}
                      className={FILTER_CONTROL_CLASS}
                    />
                    <FormFieldError />
                  </div>

                  <div className={cn('min-w-0', dateErrors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                    <label htmlFor="field-fromDate" className={FILTER_LABEL_CLASS}>
                      Start Date
                    </label>
                    <DatePicker
                      id="field-fromDate"
                      value={fromDate}
                      onChange={(v) => {
                        let next = v ?? '';
                        if (next > schedulePickerMaxYmd) next = schedulePickerMaxYmd;
                        if (toDate && next && next > toDate) next = toDate;
                        setFromDate(next);
                        clearDateField('fromDate');
                        clearDateField('toDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      maxDate={scheduleFilterStartMaxDate}
                      className="h-10 w-full text-sm"
                      ariaLabel="Start date"
                    />
                    <FormFieldError id="field-fromDate-error" message={dateErrors.fromDate} />
                  </div>

                  <div className={cn('min-w-0', dateErrors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                    <label htmlFor="field-toDate" className={FILTER_LABEL_CLASS}>
                      End Date
                    </label>
                    <DatePicker
                      id="field-toDate"
                      value={toDate}
                      onChange={(v) => {
                        let next = v ?? '';
                        if (next > schedulePickerMaxYmd) next = schedulePickerMaxYmd;
                        if (fromDate && next && next < fromDate) next = fromDate;
                        setToDate(next);
                        clearDateField('toDate');
                        clearDateField('fromDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      minDate={fromDate ? (() => { const [y, m, d] = fromDate.split('-').map(Number); return new Date(y, m - 1, d); })() : undefined}
                      maxDate={schedulePickerMaxDate}
                      className="h-10 w-full text-sm"
                      ariaLabel="End date"
                    />
                    <FormFieldError id="field-toDate-error" message={dateErrors.toDate} />
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
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200"></div>
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
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200"></div>
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
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200"></div>
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          Show Closed Flights
                        </span>
                      </label>

                      <label className="flex cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={sortByDate}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setSortByDate(on);
                              if (on) setSortByColor(false);
                            }}
                            className="peer sr-only text-emerald-500"
                          />
                          <div className="relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200"></div>
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                          <SortAsc className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                          Sort by date (earliest → latest)
                        </span>
                      </label>
                    </div>

                    <div className="flex h-10 w-full shrink-0 flex-nowrap items-center gap-2 sm:w-auto sm:justify-end">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleFilter}
                        className="inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-emerald-500 px-5 text-sm font-medium text-white transition-all hover:bg-emerald-600 sm:flex-none"
                      >
                        Apply Filters
                      </motion.button>
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 sm:flex-none"
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

        {/* Filter API error banner */}
        {filterError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Could not load flights</p>
              <p className="text-sm text-red-700 mt-1">{filterError}</p>
            </div>
            <button
              type="button"
              onClick={() => setFilterError(null)}
              className="text-red-600 hover:text-red-800 p-1 shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">
          {/* Table Header */}
          <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Flight Schedule
              </h3>
              <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                {loadingFlights ? (
                  'Loading flights…'
                ) : (
                  <>
                    Showing {paginatedFlights.length} of {tableFlights.length}{' '}
                    flights • Active:{' '}
                    <span className="text-emerald-600 font-medium">
                      {headerActiveCount}
                    </span>{' '}
                    • Cancelled:{' '}
                    <span className="text-red-600 font-medium">
                      {headerCancelledCount}
                    </span>
                    {!fromDate && !toDate ? (
                      <span className="ml-2">
                        • Default: today ({scheduledAirlinesDefaultDateYmd()})
                      </span>
                    ) : (
                      fromDate &&
                      toDate && (
                        <span className="ml-2">
                          • Date range (loaded): {fromDate} to {toDate}
                        </span>
                      )
                    )}
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className={`p-2 rounded-lg ${currentPage === 1
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    ← Previous
                  </motion.button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <motion.button
                          key={pageNum}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${currentPage === pageNum
                            ? 'bg-emerald-500 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                          {pageNum}
                        </motion.button>
                      );
                    })}
                  </div>

                  <span className="text-gray-500 mx-2">of {totalPages}</span>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className={`p-2 rounded-lg ${currentPage === totalPages
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    Next →
                  </motion.button>
                </>
              )}

              {scheduledAirlinesBackHref ? (
                <motion.div
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  className="shrink-0"
                >
                  <Link
                    href={scheduledAirlinesBackHref}
                    aria-label={scheduledAirlinesBackLabel}
                    className="group relative inline-flex h-10 items-center gap-2.5 overflow-hidden rounded-xl border border-emerald-200/90 bg-gradient-to-b from-white via-white to-emerald-50/90 px-3.5 text-sm font-semibold tracking-tight text-emerald-800 shadow-[0_1px_2px_rgba(16,185,129,0.1),0_4px_14px_rgba(16,185,129,0.14)] ring-1 ring-inset ring-white/90 transition-[border-color,box-shadow] duration-200 hover:border-emerald-300 hover:shadow-[0_2px_4px_rgba(16,185,129,0.12),0_10px_24px_rgba(16,185,129,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2"
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-400/0 via-emerald-400/5 to-emerald-500/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    />
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/35 transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:shadow-lg group-hover:shadow-emerald-600/40">
                      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="relative pr-0.5">{scheduledAirlinesBackLabel}</span>
                  </Link>
                </motion.div>
              ) : null}
            </div>
          </div>

          {/* Table */}
          {loadingFlights ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Loading flights…</p>
            </div>
          ) : filteredFlights.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-gray-100">
                  <Plane className="w-12 h-12 text-gray-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Flights Found</h3>
                  <p className="text-gray-600">
                    {fromDate || toDate || flightType || airline || aircraft || searchText
                      ? 'Try adjusting your filters to see more results'
                      : 'No flight data available'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <ScheduledFlightsTable
              data={paginatedFlights}
              onOpenRow={openFlightDetailsSidebar}
              onViewReport={handleViewReport}
              onViewFHRReport={handleViewReport}
              onViewEquipment={handleViewEquipment}
              onViewDetailedEquipment={handleViewDetailedEquipment}
              highlightSerial={highlightSerialFromUrl}
              canViewFHR={reportButtonAccess.fhr}
              canViewGSE={reportButtonAccess.gse}
              canViewTeam={reportButtonAccess.team}
            />
          )}

          {/* Footer */}
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              Page {currentPage} of {totalPages} • {itemsPerPage} flights per page
              {!fromDate && !toDate ? (
                <span className="ml-4">
                  • Default: today ({scheduledAirlinesDefaultDateYmd()})
                </span>
              ) : (
                fromDate &&
                toDate && (
                  <span className="ml-4">
                    • Date Range: {fromDate} to {toDate}
                  </span>
                )
              )}
            </div>
            <div>
              <AdminRadioDropdown
                value={String(itemsPerPage)}
                onChange={(v) => {
                  setItemsPerPage(Number(v));
                  setCurrentPage(1);
                }}
                options={[
                  { value: '10', label: '10 per page' },
                  { value: '20', label: '20 per page' },
                  { value: '50', label: '50 per page' },
                  { value: '100', label: '100 per page' },
                ]}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      </motion.div>

      <FlightDetailsSidebar
        isOpen={detailsSidebarOpen}
        onClose={closeFlightDetailsSidebar}
        flight={selectedFlight}
        mainDetails={mainDetailsFromServer}
        onMainDetailsLoaded={setMainDetailsFromServer}
        onFlightCancelledChange={handleFlightCancelledChange}
        onEquipmentGsdSaved={refreshRowLocksFromFhrCollection}
        initialView={sidebarInitialView}
      />
    </>
  );
}
