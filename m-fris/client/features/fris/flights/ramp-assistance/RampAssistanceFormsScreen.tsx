'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, Search, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  FLIGHT_FILTER_ACTIONS_CLASS,
  FLIGHT_FILTER_PRIMARY_BTN_CLASS,
  FLIGHT_FILTER_ROW_CLASS,
  FLIGHT_FILTER_SECONDARY_BTN_CLASS,
} from '@/components/fris/flights/flightFilterBarLayout';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import RampAssistanceFlightsTable, {
  resolveCleaningFlags,
  type RafCleaningFlags,
} from '@/components/fris/flights/ramp-assistance/RampAssistanceFlightsTable';
import {
  creationRafRecordsToFlightData,
} from '@/components/fris/flights/ramp-assistance/creationRafToFlightData';
import type { RafCleaningReportKind } from '@/components/fris/flights/ramp-assistance/rafCleaningReportData';
import {
  defaultTableDateRange,
  formatDisplayDate,
} from '@/components/fris/creation/creationTableDateRange';
import {
  ADVANCE_PATHS,
  advanceList,
  fetchCreationRafByDateRange,
  fetchFhrCollectionFlightLean,
  type CreationRafRecord,
} from '@/lib/api';
import {
  resolveScheduledAirlinesFlightStatus,
  type FlightData,
  type MainDetailsData,
} from '@/utils/dataProcessor';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { FRIS_INVALID_PICKER_WRAP, validateYmdDateRange } from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import type { SidebarView } from '@/components/fris/flights/scheduledairlines/FlightDetailsSidebar';
import {
  billingSourceReturnLabel,
  buildBillingSourceReturnHref,
  buildPreparationReturnHref,
  preparationReturnLabel,
} from '@/lib/preparationScheduledAirlinesNav';

/** Match Scheduled Airlines filter chrome. */
const FILTER_LABEL_CLASS = 'mb-2 block text-sm font-medium text-gray-700';
const FILTER_CONTROL_CLASS =
  'box-border h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900 transition-all hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

const CLEANING_TOGGLE_TRACK_CLASS =
  "relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200";

/** Lazy sidebar — keeps full FHR form graph out of RAF entry chunk. */
const FlightDetailsSidebar = dynamic(
  () => import('@/components/fris/flights/scheduledairlines/FlightDetailsSidebar'),
  { ssr: false },
);

/** Client-only preview shell — keeps report UI + PDF chunk out of Worker SSR graph. */
const RafCleaningReportPreview = dynamic(
  () => import('@/components/fris/flights/ramp-assistance/RafCleaningReportPreview'),
  { ssr: false },
);

const FILTER_DATE_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterDateField = (typeof FILTER_DATE_FIELD_ORDER)[number];

type CleaningServiceFilterKey = 'deepCleaning' | 'nightHaltCleaning' | 'exteriorCleaning';

const CLEANING_SERVICE_FILTERS: Array<{ key: CleaningServiceFilterKey; label: string }> = [
  { key: 'deepCleaning', label: 'Deep Cleaning' },
  { key: 'nightHaltCleaning', label: 'Night Halt Cleaning' },
  { key: 'exteriorCleaning', label: 'Exterior Cleaning' },
];

type CleaningServiceFilterState = Record<CleaningServiceFilterKey, boolean>;

const EMPTY_CLEANING_FILTERS: CleaningServiceFilterState = {
  deepCleaning: false,
  nightHaltCleaning: false,
  exteriorCleaning: false,
};

function ddMmYyyyToYmd(label: string): string | null {
  const raw = String(label ?? '').trim();
  if (!raw) return null;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length !== 3 || parts[2]?.length !== 4) return null;
  const d = Number(parts[0]);
  const m = Number(parts[1]);
  const y = Number(parts[2]);
  if (!d || !m || !y) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function ymdFromPickerValue(raw: string): string {
  const iso = ddMmYyyyToYmd(raw);
  if (iso) return iso;
  return raw;
}

/** URL `from` / `to` (yyyy-MM-dd or dd/MM/yyyy) → dd/MM/yyyy for RAF DatePicker. */
function displayDateFromSearchParam(raw: string | null): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return formatDisplayDate(new Date(y, m - 1, d));
  }
  if (ddMmYyyyToYmd(s)) return s.includes('-') ? s.replace(/-/g, '/') : s;
  return null;
}

function partialFlightRowFromFhrApiDoc(fhr: Record<string, unknown>): Partial<FlightData> {
  const fhrR1 =
    fhr.rampDetails1 != null &&
    typeof fhr.rampDetails1 === 'object' &&
    !Array.isArray(fhr.rampDetails1);
  const eqE = fhr.equipmentManpower;
  let fhrG = false;
  if (eqE != null && typeof eqE === 'object' && !Array.isArray(eqE)) {
    const e = eqE as Record<string, unknown>;
    const entries = Array.isArray(e.entries) ? e.entries : [];
    if (entries.length > 0) fhrG = true;
  }
  return {
    hasRampDetails: fhrR1,
    hasEquipmentManpowerDetails: fhrG,
    rampLocked: fhrR1 ? 'Yes' : 'No',
    gsdLocked: fhrG ? 'Yes' : 'No',
  };
}

export function RampAssistanceFormsContent() {
  const searchParams = useSearchParams();
  const today = new Date();
  const defaultRange = defaultTableDateRange(today);

  const highlightSerialFromUrl =
    searchParams.get('highlightSerial')?.trim() ||
    searchParams.get('serial')?.trim() ||
    '';
  const openSidebarFromUrl = searchParams.get('openSidebar')?.trim() === '1';
  const airlineFromUrl = searchParams.get('airline')?.trim() ?? '';

  const returnHref = useMemo(
    () =>
      buildPreparationReturnHref(searchParams) ?? buildBillingSourceReturnHref(searchParams),
    [searchParams],
  );
  const returnLabel = useMemo(() => {
    if (buildPreparationReturnHref(searchParams)) return preparationReturnLabel();
    return billingSourceReturnLabel(searchParams);
  }, [searchParams]);

  const [fromDate, setFromDate] = useState(defaultRange.fromDate);
  const [toDate, setToDate] = useState(defaultRange.toDate);
  const [serialFilter, setSerialFilter] = useState('');
  const [draftSerial, setDraftSerial] = useState('');
  const [airlineFilter, setAirlineFilter] = useState('');
  const [cleaningFilters, setCleaningFilters] =
    useState<CleaningServiceFilterState>(EMPTY_CLEANING_FILTERS);
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cleaningByAirline, setCleaningByAirline] = useState<Map<string, RafCleaningFlags>>(
    new Map(),
  );

  const [detailsSidebarOpen, setDetailsSidebarOpen] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<FlightData | null>(null);
  const [mainDetailsFromServer, setMainDetailsFromServer] = useState<MainDetailsData | null>(
    null,
  );
  const [sidebarInitialView, setSidebarInitialView] = useState<SidebarView>('menu');
  const [sidebarCleaningKind, setSidebarCleaningKind] = useState<
    'deep' | 'night-halt' | 'exterior' | null
  >(null);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportPreviewFlight, setReportPreviewFlight] = useState<FlightData | null>(null);
  const [reportPreviewKind, setReportPreviewKind] = useState<RafCleaningReportKind | null>(
    null,
  );
  const deepLinkSidebarOpened = useRef(false);

  const { errors, applyAndFocus, clearAll } =
    useFieldErrors<FilterDateField>(FILTER_DATE_FIELD_ORDER);

  const loadCleaningFlags = useCallback(async () => {
    try {
      const list = (await advanceList(ADVANCE_PATHS.rafAirline)) as Record<string, unknown>[];
      const map = new Map<string, RafCleaningFlags>();
      for (const doc of list) {
        const airline = String(doc.airline ?? '').trim().toLowerCase();
        const code = String(doc.airlineCode ?? '').trim().toUpperCase();
        if (!airline) continue;
        const flags: RafCleaningFlags = {
          deepCleaning: Boolean(doc.deepCleaning),
          nightHaltCleaning: Boolean(doc.nightHaltCleaning),
          exteriorCleaning: Boolean(doc.exteriorCleaning),
        };
        map.set(airline, flags);
        if (code) map.set(`${airline}|${code}`, flags);
      }
      setCleaningByAirline(map);
    } catch {
      setCleaningByAirline(new Map());
    }
  }, []);

  const enrichFlightsWithFhr = useCallback(async (rows: FlightData[]) => {
    const enriched = await Promise.all(
      rows.map(async (flight) => {
        const serial = String(flight.slNo ?? '').trim();
        if (!serial) return flight;
        try {
          const fhr = await fetchFhrCollectionFlightLean(serial);
          if (!fhr || typeof fhr !== 'object') return flight;
          const merged = {
            ...flight,
            ...partialFlightRowFromFhrApiDoc(fhr as Record<string, unknown>),
          };
          return {
            ...merged,
            flightStatus: resolveScheduledAirlinesFlightStatus(merged),
          };
        } catch {
          return flight;
        }
      }),
    );
    return enriched;
  }, []);

  const loadFlights = useCallback(
    async (opts?: {
      serialOverride?: string;
      fromOverride?: string;
      toOverride?: string;
    }) => {
      const fromValue = opts?.fromOverride ?? fromDate;
      const toValue = opts?.toOverride ?? toDate;
      const fromYmd = ymdFromPickerValue(fromValue);
      const toYmd = ymdFromPickerValue(toValue);
      const next = validateYmdDateRange(fromYmd, toYmd, {
        fromLabel: 'From date',
        toLabel: 'To date',
      });
      if (applyAndFocus(next)) {
        toast.warning(next.toDate || next.fromDate || 'Select a valid date range.');
        return;
      }

      const serialForQuery =
        opts?.serialOverride !== undefined
          ? opts.serialOverride.trim()
          : draftSerial.trim();

      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetchCreationRafByDateRange(
          fromValue.trim(),
          toValue.trim(),
          serialForQuery || undefined,
        );
        const mapped = creationRafRecordsToFlightData((res.rows ?? []) as CreationRafRecord[]);
        const enriched = await enrichFlightsWithFhr(mapped);
        setFlights(enriched);
        setSerialFilter(serialForQuery);
        if (opts?.serialOverride !== undefined) {
          setDraftSerial(serialForQuery);
        }
        if (opts?.fromOverride !== undefined) setFromDate(opts.fromOverride);
        if (opts?.toOverride !== undefined) setToDate(opts.toOverride);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load RAF flights.';
        setLoadError(message);
        setFlights([]);
      } finally {
        setLoading(false);
      }
    },
    [applyAndFocus, draftSerial, enrichFlightsWithFhr, fromDate, toDate],
  );

  useEffect(() => {
    void loadCleaningFlags();
  }, [loadCleaningFlags]);

  /** Initial load: honour billing deep-link `?from=` / `?to=` / `?serial=` (else today). */
  useEffect(() => {
    const fromDd =
      displayDateFromSearchParam(searchParams.get('from')) ?? defaultRange.fromDate;
    const toDd =
      displayDateFromSearchParam(searchParams.get('to')) ?? defaultRange.toDate;
    const serial = highlightSerialFromUrl;
    // Prefer serial deep-link over airline filter — mismatched airline labels would hide the row.
    if (airlineFromUrl && !serial) setAirlineFilter(airlineFromUrl);
    void loadFlights({
      fromOverride: fromDd,
      toOverride: toDd,
      serialOverride: serial,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / URL deep-link only
  }, []);

  /** Deep-link: open RAF sidebar for the highlighted serial once rows load. */
  useEffect(() => {
    if (!openSidebarFromUrl || !highlightSerialFromUrl || loading) return;
    if (deepLinkSidebarOpened.current) return;
    const match = flights.find(
      (f) => String(f.slNo ?? '').trim() === highlightSerialFromUrl,
    );
    if (!match) return;
    deepLinkSidebarOpened.current = true;
    setSelectedFlight(match);
    setMainDetailsFromServer(null);
    setSidebarInitialView('menu');
    setSidebarCleaningKind(null);
    setDetailsSidebarOpen(true);
  }, [flights, highlightSerialFromUrl, loading, openSidebarFromUrl]);

  const airlineOptions = useMemo(() => {
    const names = new Set(
      flights.map((f) => String(f.airline ?? '').trim()).filter(Boolean),
    );
    if (airlineFilter.trim()) names.add(airlineFilter.trim());
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [flights, airlineFilter]);

  const activeCleaningFilterKeys = useMemo(
    () => CLEANING_SERVICE_FILTERS.filter((f) => cleaningFilters[f.key]).map((f) => f.key),
    [cleaningFilters],
  );

  const filteredFlights = useMemo(() => {
    const serialQ = serialFilter.trim();
    const airlineQ = airlineFilter.trim().toLowerCase();
    const cleaningActive = activeCleaningFilterKeys.length > 0;

    return flights.filter((f) => {
      if (serialQ && !String(f.slNo ?? '').includes(serialQ)) return false;
      if (airlineQ && String(f.airline ?? '').trim().toLowerCase() !== airlineQ) return false;
      if (cleaningActive) {
        const flags = resolveCleaningFlags(f, cleaningByAirline);
        const matchesAny = activeCleaningFilterKeys.some((key) => flags[key]);
        if (!matchesAny) return false;
      }
      return true;
    });
  }, [flights, serialFilter, airlineFilter, activeCleaningFilterKeys, cleaningByAirline]);

  const toggleCleaningFilter = useCallback((key: CleaningServiceFilterKey) => {
    setCleaningFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const clearClientFilters = useCallback(() => {
    setAirlineFilter('');
    setCleaningFilters(EMPTY_CLEANING_FILTERS);
    void loadFlights({ serialOverride: '' });
  }, [loadFlights]);

  const openFlightDetailsSidebar = useCallback(
    (
      flight: FlightData,
      view: SidebarView = 'menu',
      cleaningKind: 'deep' | 'night-halt' | 'exterior' | null = null,
    ) => {
      setSelectedFlight(flight);
      setMainDetailsFromServer(null);
      setSidebarInitialView(view);
      setSidebarCleaningKind(cleaningKind);
      setDetailsSidebarOpen(true);
    },
    [],
  );

  const closeFlightDetailsSidebar = useCallback(() => {
    setDetailsSidebarOpen(false);
    setSelectedFlight(null);
    setMainDetailsFromServer(null);
    setSidebarCleaningKind(null);
  }, []);

  const handleViewCleaning = useCallback(
    (flight: FlightData, kind: 'deep' | 'night-halt' | 'exterior') => {
      setReportPreviewFlight(flight);
      setReportPreviewKind(kind);
      setReportPreviewOpen(true);
    },
    [],
  );

  const closeReportPreview = useCallback(() => {
    setReportPreviewOpen(false);
    setReportPreviewFlight(null);
    setReportPreviewKind(null);
  }, []);

  const selectedCleaningFlags = useMemo((): RafCleaningFlags | null => {
    if (!selectedFlight) return null;
    const name = String(selectedFlight.airline ?? '').trim().toLowerCase();
    const code = String(
      (selectedFlight as { airlineCode?: string }).airlineCode ?? '',
    )
      .trim()
      .toUpperCase();
    if (!name) return null;
    const withCode = code ? cleaningByAirline.get(`${name}|${code}`) : undefined;
    return withCode ?? cleaningByAirline.get(name) ?? null;
  }, [selectedFlight, cleaningByAirline]);

  const handleRafExportStatusChange = useCallback((slNo: string, exportedNAV: string) => {
    const key = String(slNo ?? '').trim();
    if (!key) return;
    setFlights((prev) =>
      prev.map((f) =>
        String(f.slNo ?? '').trim() === key ? { ...f, exportedNAV } : f,
      ),
    );
    setSelectedFlight((prev) =>
      prev && String(prev.slNo ?? '').trim() === key
        ? { ...prev, exportedNAV }
        : prev,
    );
  }, []);

  const refreshRowLocksFromFhrCollection = useCallback(
    async (serialNo: string) => {
      const key = String(serialNo ?? '').trim();
      if (!key) return;
      try {
        const fhr = await fetchFhrCollectionFlightLean(key);
        if (!fhr || typeof fhr !== 'object') return;
        const partial = partialFlightRowFromFhrApiDoc(fhr as Record<string, unknown>);
        const applyPartial = (f: FlightData): FlightData => {
          const merged = { ...f, ...partial };
          return {
            ...merged,
            flightStatus: resolveScheduledAirlinesFlightStatus(merged),
          };
        };
        setFlights((prev) =>
          prev.map((f) => (String(f.slNo ?? '').trim() === key ? applyPartial(f) : f)),
        );
        setSelectedFlight((prev) => {
          if (!prev || String(prev.slNo ?? '').trim() !== key) return prev;
          return applyPartial(prev);
        });
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-3 pb-6 sm:p-4 sm:pb-8 lg:p-6 lg:pb-8"
      >
        <div className="mx-auto max-w-[1400px]">
          {returnHref && returnLabel ? (
            <div className="mb-3">
              <Link
                href={returnHref}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {returnLabel}
              </Link>
            </div>
          ) : null}
          <FrisPageHeader
            title="Ramp Assistance Forms"
            icon={Shield}
            className="mb-6 sm:mb-8"
            actions={
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void loadFlights()}
                disabled={loading}
                className={cn(
                  FLIGHT_FILTER_SECONDARY_BTN_CLASS,
                  'h-11 rounded-xl w-full sm:w-auto',
                )}
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </motion.button>
            }
          />

          <div className="mb-6 overflow-visible rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="min-w-0 text-lg font-semibold text-gray-900">Filters</h3>
              <p className="text-sm text-gray-600 whitespace-nowrap">
                Found{' '}
                <span className="font-bold text-emerald-600">{filteredFlights.length}</span>{' '}
                flights
              </p>
            </div>

            <div className={FLIGHT_FILTER_ROW_CLASS}>
              <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-4">
                <div className={cn('min-w-0', errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                  <label htmlFor="raf-from-date" className={FILTER_LABEL_CLASS}>
                    From Date
                  </label>
                  <DatePicker
                    id="raf-from-date"
                    value={fromDate}
                    onChange={setFromDate}
                    ariaLabel="From date"
                    className="h-10 w-full text-sm"
                  />
                  <FormFieldError id="raf-from-date-error" message={errors.fromDate} />
                </div>
                <div className={cn('min-w-0', errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                  <label htmlFor="raf-to-date" className={FILTER_LABEL_CLASS}>
                    To Date
                  </label>
                  <DatePicker
                    id="raf-to-date"
                    value={toDate}
                    onChange={setToDate}
                    ariaLabel="To date"
                    className="h-10 w-full text-sm"
                  />
                  <FormFieldError id="raf-to-date-error" message={errors.toDate} />
                </div>
                <div className="min-w-0">
                  <label htmlFor="raf-airline" className={FILTER_LABEL_CLASS}>
                    Airline Name
                  </label>
                  <AdminRadioDropdown
                    id="raf-airline"
                    value={airlineFilter}
                    onChange={setAirlineFilter}
                    options={[
                      { value: '', label: 'All Airlines' },
                      ...airlineOptions.map((name) => ({ value: name, label: name })),
                    ]}
                    className={FILTER_CONTROL_CLASS}
                    clearable
                    clearLabel="Clear airline filter"
                    searchPlaceholder="Search airline…"
                    aria-label="Filter by airline name"
                  />
                  <FormFieldError />
                </div>
                <div className="min-w-0">
                  <label htmlFor="raf-serial" className={FILTER_LABEL_CLASS}>
                    Serial No.
                  </label>
                  <input
                    id="raf-serial"
                    type="text"
                    value={draftSerial}
                    onChange={(e) =>
                      setDraftSerial(e.target.value.replace(/[^\d]/g, '').slice(0, 8))
                    }
                    className={FILTER_CONTROL_CLASS}
                    placeholder="Optional serial"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  <FormFieldError />
                </div>
              </div>
              <div className={FLIGHT_FILTER_ACTIONS_CLASS}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    clearAll();
                    void loadFlights();
                  }}
                  disabled={loading}
                  className={FLIGHT_FILTER_PRIMARY_BTN_CLASS}
                >
                  <Search className="h-4 w-4" />
                  Search / Find Record
                </motion.button>
                <button
                  type="button"
                  onClick={clearClientFilters}
                  disabled={
                    loading ||
                    (!airlineFilter.trim() &&
                      !activeCleaningFilterKeys.length &&
                      !serialFilter)
                  }
                  className={FLIGHT_FILTER_SECONDARY_BTN_CLASS}
                >
                  Clear filters
                </button>
              </div>
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Cleaning service filters</p>
              <div
                className="flex w-full flex-wrap items-center gap-x-6 gap-y-3"
                role="group"
                aria-label="Filter by cleaning service type"
              >
                {CLEANING_SERVICE_FILTERS.map(({ key, label }) => {
                  const checked = cleaningFilters[key];
                  const id = `raf-filter-${key}`;
                  return (
                    <label key={key} htmlFor={id} className="flex cursor-pointer items-center gap-3">
                      <div className="relative">
                        <input
                          id={id}
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCleaningFilter(key)}
                          className="peer sr-only text-emerald-500"
                        />
                        <div className={CLEANING_TOGGLE_TRACK_CLASS} aria-hidden />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <p className="mt-4 text-xs text-gray-500 sm:text-sm">
              Showing RAF flights for {fromDate} → {toDate}
              {airlineFilter.trim() ? ` · Airline: ${airlineFilter.trim()}` : ''}
              {serialFilter.trim() ? ` · Serial: ${serialFilter.trim()}` : ''}
              {activeCleaningFilterKeys.length
                ? ` · Cleaning: ${CLEANING_SERVICE_FILTERS.filter((f) =>
                    activeCleaningFilterKeys.includes(f.key),
                  )
                    .map((f) => f.label)
                    .join(', ')}`
                : ''}
            </p>
          </div>

          {loadError ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="flex-1 text-sm text-red-800">
                <span className="font-medium">Could not load flights. </span>
                {loadError}
              </p>
            </div>
          ) : null}

          <div className="overflow-visible rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Ramp Assistance Forms</h3>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                  {loading ? (
                    'Loading flights…'
                  ) : (
                    <>
                      Showing{' '}
                      <span className="font-medium text-emerald-600">{filteredFlights.length}</span>{' '}
                      flight(s)
                      {fromDate && toDate ? (
                        <span>
                          {' '}
                          · Date range: {fromDate} to {toDate}
                        </span>
                      ) : null}
                    </>
                  )}
                </p>
              </div>
            </div>

            <RampAssistanceFlightsTable
              data={filteredFlights}
              cleaningByAirline={cleaningByAirline}
              onOpenRow={(flight) => openFlightDetailsSidebar(flight, 'menu')}
              onViewCleaning={handleViewCleaning}
              loading={loading}
              highlightSerial={highlightSerialFromUrl || undefined}
            />

            <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span>
                {filteredFlights.length} flight(s)
                {fromDate && toDate ? (
                  <span className="ml-2">· Date Range: {fromDate} to {toDate}</span>
                ) : null}
              </span>
              {filteredFlights[0]?.slNo ? (
                <span className="font-medium text-emerald-600">
                  SL No : {filteredFlights[0].slNo}
                </span>
              ) : null}
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
        onEquipmentGsdSaved={refreshRowLocksFromFhrCollection}
        initialView={sidebarInitialView}
        variant="raf"
        cleaningFlags={selectedCleaningFlags}
        initialCleaningKind={sidebarCleaningKind}
        onRafExportStatusChange={handleRafExportStatusChange}
      />

      <RafCleaningReportPreview
        open={reportPreviewOpen}
        flight={reportPreviewFlight}
        kind={reportPreviewKind}
        onClose={closeReportPreview}
      />
    </>
  );
}
