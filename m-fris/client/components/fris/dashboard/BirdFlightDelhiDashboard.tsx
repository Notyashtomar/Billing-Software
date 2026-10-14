'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, UIEvent } from 'react';
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  MessageSquare,
  Plane,
  RefreshCw,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Cell,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  DashboardModalInstantOpenContext,
  DashboardScheduledAirlinesLinkContext,
  useDashboardModalInstantOpen,
  useDashboardScheduledAirlinesLinkContext,
} from '@/components/fris/dashboard/DashboardScheduledAirlinesLinkContext';
import { DashboardDateRangePicker } from '@/components/fris/dashboard/DashboardDateRangePicker';
import {
  parseDashboardFlightScopeFromSearch,
} from '@/lib/dashboardFlightScope';
import {
  buildAirlinesHighlightHref,
  buildAirlinesHrefFromDashboard,
  dashboardHrefAfterReturnRestore,
  flightScheduleYmdRangeFromIso,
  flightScheduleYmdRangeFromLabels,
  parseDashboardReturnFromUrl,
  parseDashboardNotificationReturnFromUrl,
} from '@/lib/dashboardScheduledAirlinesNav';
import StaAtaLineChartCard, {
  type StaAtaChartFlightInput,
} from '@/components/fris/dashboard/StaAtaLineChartCard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FHR_COLLECTION_UPDATED_EVENT,
  type DashboardFlightScope,
  type DashboardGhaImprovementCard,
  type DashboardPerformanceDrilldownPayload,
  type DashboardPerformanceDrillFlightRow,
  type AircraftAnalysisFlightRow,
} from '@/lib/api';
import {
  useBirdDashboardCardFetches,
  type EquipmentDashboardUtilPayload,
  type EquipmentUtilSlotMode,
} from '@/hooks/useBirdDashboardCardFetches';
import type {
  AircraftCategoryMixResponse,
  ScheduledCategoryMix,
} from '@/utils/dashboardAircraftCategory';
import type { Flight } from '@/types/flight';
import {
  buildStaKeyToDbRowMap,
  mapDbRowsToPerformanceFlightsForReport,
  performanceDrillRowToDisplayDetail,
  type BirdSheetCancellationFlightRow,
  type PerformanceFlightFromDb,
} from '@/utils/performanceFlightsFromDb';
import { formatGroundDurationMinutesAsHhMm } from '@/utils/flightGroundTiming';
import {
  aggregateFhrGhaDelayCodesFromDashboardRows,
  collectFhrGhaBandCodesFromDashboardRow,
  FHR_GHA_STATION_DELAY_CODES,
  getFhrGhaAggregationFlightKey,
} from '@/utils/fhrGhaDelayCodes';
import { getDelayReasonLabel } from '@/data/iataDelayCodes';
import { cn } from '@/lib/utils';
import {
  useCancellationBell,
  dismissCancellationBell,
} from '@/lib/cancellation-bell';
import {
  DASH_MOBILE_LIST_CLASS,
  DASH_MODAL_MOBILE_PADDING_CLASS,
  DASH_MODAL_MOBILE_WIDTH_CLASS,
  DASH_TABLE_DESKTOP_CLASS,
  DASH_TOUCH_TARGET_CLASS,
} from '@/lib/dashboard-mobile';
import { useHoverCapable } from '@/lib/use-compact-picker-viewport';
import {
  DASH_CARD_HOVER_IN_DELAY,
  DASH_CARD_INTERACTION_DURATION,
  DASH_CARD_INTERACTION_EASE,
  dashboardAnalyticsCardHover,
  dashboardCardBgTransition,
  dashboardCardRingTransition,
  dashboardKpiStripShellHover,
  dashboardSurfaceTransition,
} from '@/components/fris/dashboard/dashboardCardInteraction';
import { NotificationCenterCard } from '@/components/fris/dashboard/NotificationCenterCard';
import { ThemeToggle } from '@/components/fris/dashboard/ThemeToggle';
import { useDashboardTheme } from '@/components/fris/dashboard/DashboardThemeProvider';
import {
  getGroundTimes,
  parseTimeMs,
  type GroundTimes,
} from '@/components/fris/dashboard/birdFlightDelhiDashboardGroundTiming';
import { displayFlightInstanceSerial } from '@/utils/dataProcessor';
import { motion, useReducedMotion } from 'framer-motion';
import {
  DashCountFixed,
  DashCountInt,
  DashCountPct,
} from '@/components/fris/dashboard/DashboardCountUp';
import {
  DASH_CARD_GLOW_ANIM,
  DASH_CARD_MOTION_DURATION_SEC,
  DASH_CARD_MOTION_EASE,
  KPI_CELL_LIGHT,
  KPI_GLOW_BORDER_WRAP_AMBER_DARK,
  KPI_GLOW_BORDER_WRAP_EMERALD_DARK,
  KPI_HALO_AMBER_DARK,
  KPI_HALO_EMERALD_DARK,
  KPI_SLOT_SHELL,
  KPI_STRIP_AMBER_DARK_TRANSPARENT,
  KPI_STRIP_AMBER_FACE,
  KPI_STRIP_EMERALD_DARK_TRANSPARENT,
  KPI_STRIP_EMERALD_FACE,
} from '@/styles/dashboardStyles';
import {
  isCancelledDbPerformanceFlight,
  listOtpBeforeStaGtLeStdFlights,
} from '@/utils/birdDashboardPerformance';
import { displayCancellationRoute, ymdToDdMmYyyy } from '@/utils/cancellationDisplay';
import { formatGroundHoursShort, pct } from '@/utils/dashboardMath';
import { AIRLINE_REMARKS_RATINGS } from '@/utils/dataProcessor';
import prMetricRowUnderline from '@/components/fris/dashboard/performanceReportMetricRow.module.css';

export {
  getAGT,
  getGroundTimes,
  getSGT,
  parseTimeMs,
  type GroundTimes,
} from '@/components/fris/dashboard/birdFlightDelhiDashboardGroundTiming';

const isGhaAttributed = (f: PerformanceFlightRecord): boolean => {
  const boxed = f as unknown as Record<string, unknown>;
  const reason = String(
    boxed.delayReason ??
      boxed.reason ??
      boxed.delay ??
      '',
  ).toUpperCase();
  return (
    reason.includes('GHA') ||
    reason.includes('GROUND') ||
    reason.includes('HANDLING')
  );
};

const isNonGha = (f: PerformanceFlightRecord): boolean => !isGhaAttributed(f);

/** Wheel/touch/keyboard scrolling unchanged; thin scrollbars on phones, hidden on lg+ desktops. */
const SCROLL_AREA_NO_BAR =
  'max-lg:[scrollbar-width:thin] max-lg:[-ms-overflow-style:auto] max-lg:[&::-webkit-scrollbar]:block max-lg:[&::-webkit-scrollbar]:h-1.5 max-lg:[&::-webkit-scrollbar]:w-1.5 max-lg:[&::-webkit-scrollbar-thumb]:rounded-full max-lg:[&::-webkit-scrollbar-thumb]:bg-[var(--dash-text-muted)]/40 lg:[scrollbar-width:none] lg:[-ms-overflow-style:none] lg:[&::-webkit-scrollbar]:hidden';

/** Data values on dashboard cards (not card titles or column headers). Top KPI strip excluded. */
const DASH_CARD_VALUE_TEXT = 'text-[14px]';

function dashCardMetricValueClass(dashDark: boolean): string {
  return dashDark ? 'text-emerald-400' : 'text-emerald-600';
}

/** Placeholder for DB-backed cells when data is loading or unavailable (not a computed zero). */
const DASH_DB_PLACEHOLDER = '-';

/** Sticky first row in scrollable `thead` (light / dialog tables). */
const STICKY_TH_TOP_LIGHT =
  'sticky top-0 z-20 border-b border-[var(--dash-border-subtle)] bg-[#ecfdf5] dark:bg-[#232730]';
/** Sticky first row in emerald performance-style tables. */
const STICKY_TH_TOP_EMERALD = 'sticky top-0 z-20 border-b border-white/15 bg-emerald-950/95 shadow-sm';
/** Sticky header on card surface (e.g. performance report) — matches `bg-[var(--dash-card)]/90` tables. */
const STICKY_TH_TOP_CARD =
  'sticky top-0 z-20 border-b border-[var(--dash-border-subtle)] bg-[var(--dash-card)] shadow-sm';

type DelayBreakdown = { onTime: number; delayed: number; beforeTime: number; other: number };
type StaffUtilizationPayload = {
  totalActivePct: number;
  categories: { name: string; active: number; roster: number; activePct: number }[];
};
type AirlineRemarksFromSheet = {
  remarkRowCount: number;
  dateMin: string | null;
  dateMax: string | null;
};
type AtaStaDailyRow = {
  date: string;
  ataOnOrBeforeSta: number;
  ataAfterSta: number;
  /** Per STA date: sum over flights with both times of (ATA−STA) minutes. Positive ⇒ net late vs schedule. */
  netStaDeviationMinutes?: number;
  /** Count of rows with both STA+ATA for deviation sum. */
  flightsPairedInDeviation?: number;
};
type MonthData = {
  key: string;
  label: string;
  totalFlights: number;
  additionalFlights?: number;
  cancellationCount?: number;
  activeDaysSta?: number;
  avgFlightsPerActiveStaDay?: number;
  staOnTimeCount?: number;
  ataOnOrBeforeStaCount?: number;
  ataStaDailyComparison?: AtaStaDailyRow[];
  delayBreakdown: DelayBreakdown;
  delayCategories: { code: string; count: number }[];
  topAirlines: { name: string; count: number }[];
  /** Every carrier in the month (for full tables); optional on older JSON. */
  allAirlines?: { name: string; count: number }[];
  topDelayReasons: { reason: string; count: number }[];
  delayDurationBuckets: { bucket: string; count: number }[];
  groundTime?: {
    totalAgtMinutes: number;
    totalSgtMinutes: number;
    gtAddedFlightCount: number;
    flightsWithAgt: number;
  };
  /** Movements by sector (intl/dom) and aircraft body; from Bird JSON generator. */
  carrierVolume?: {
    international: number;
    domestic: number;
    unclassifiedSector?: number;
    wideBody: number;
    narrowBody: number;
    unclassifiedBody?: number;
  };
  /** Normalized aircraft labels (e.g. A320) with counts. */
  aircraftTypeVolume?: { type: string; count: number }[];
  /** Excel-derived ops KPIs (MAA / Bird generator). */
  didFlyCount?: number;
  nsFlightsCount?: number;
  onTimeAtaCount?: number;
  groundTimeSavedMinutes?: number;
  scheduledGroundMinutesTotal?: number;
  departedBeforeStdCount?: number;
  agtGtSgtCount?: number;
  staffUtilization?: StaffUtilizationPayload | null;
  airlineRemarksFromSheet?: AirlineRemarksFromSheet | null;
  /** Per-row cancellations matching `cancellationCount` (Bird workbook); optional on older JSON. */
  cancellationFlights?: BirdSheetCancellationFlightRow[];
};

/** ISO datetimes + identifiers from Mongo (`mapDbRowsToPerformanceFlightsForReport`). */
type PerformanceFlightRecord = PerformanceFlightFromDb;

/** DB-computed performance report row (single source of truth for the table). */
type PerformanceReportSnapshot = {
  onTimeCount: number;
  cancelledCount: number;
  offSkdCount: number;
  aCount: number;
  bCount: number;
  cCount: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  ghaImprovement: number;
  totalFlights: number;
};

type Payload = {
  meta: { title: string; subtitle: string };
  months: MonthData[];
  combined: { totalFlights: number; monthOverMonthFlightChangePct: number | null; avgFlightsPerCalendarDay?: number };
  performanceFlights?: PerformanceFlightRecord[];
};

type CardId =
  | 'volume'
  | 'punctuality'
  | 'carrierMix'
  | 'equipmentUtilization'
  | 'airlines'
  | 'reasons'
  | 'duration'
  | 'categories'
  | 'cancellations'
  | 'ghaDelays'
  | 'agtSgt'
  | 'airlineRemarks'
  | 'ghaImprovement'
  | 'onTimeFlights'
  | 'performanceReport'
  | 'performanceReportDrill';

function buildChartTheme(isDark: boolean) {
  return {
    tooltip: {
      backgroundColor: isDark ? '#1c1f26' : '#ffffff',
      border: `1px solid ${isDark ? '#2a2f3a' : '#a7f3d0'}`,
      borderRadius: 8,
      fontSize: 14,
      color: isDark ? '#e8eaed' : '#111827',
    },
    grid: isDark ? 'rgba(160, 167, 177, 0.2)' : '#d1fae5',
    axis: isDark ? '#a0a7b1' : '#047857',
    linePrimary: isDark ? '#22c55e' : '#059669',
    lineSecondary: isDark ? '#4ade80' : '#10b981',
    barPrimary: isDark ? '#22c55e' : '#10b981',
    barSecondary: isDark ? '#059669' : '#059669',
    /** Warm / cancellation series — muted in dark mode */
    amber: isDark ? '#d9a23a' : '#ffb808',
  } as const;
}

type GhaImprovementModalBarRow = { code: string; count: number; description: string };

function GhaImprovementModalBarTooltip({
  active,
  payload,
  chartTooltipStyle,
}: {
  active?: boolean;
  payload?: { payload: GhaImprovementModalBarRow }[];
  chartTooltipStyle: CSSProperties;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const n = row.count;
  const countLabel = Number.isFinite(n) && n === 1 ? '1 flight' : `${n} flights`;
  return (
    <div
      style={{
        ...chartTooltipStyle,
        padding: '10px 12px',
        maxWidth: 300,
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Delay code {row.code}</div>
      <div style={{ fontSize: 13, lineHeight: 1.4, opacity: 0.92, marginBottom: 8 }}>{row.description}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Flights: {countLabel}</div>
    </div>
  );
}

/**
 * Theme-toggle flip: one 360° Y-rotation per card (calm ease-out in `ThemeFlipCard`).
 * Stagger runs in layout order (top → bottom): KPI 0–4; row1: performance 5, staff 6; row2: equipment 7; remarks 8; aircraft/airline analytics 9.
 */
const THEME_FLIP_PLAYBACK_RATE = 0.7;
const THEME_FLIP_DURATION_SEC = 0.52 / THEME_FLIP_PLAYBACK_RATE;
const THEME_FLIP_STAGGER_SEC = 0.065 / THEME_FLIP_PLAYBACK_RATE;

/** Recharts: bars animate from baseline — vertical charts grow upward; `layout="vertical"` grows along the value axis. */
const BAR_SLOW_EMERGE = {
  isAnimationActive: true as const,
  animationDuration: 1800,
  animationBegin: 0,
  animationEasing: 'ease-out' as const,
};

const AIRLINE_REMARKS_BLANK_LABEL = 'Blanks';

/** Per-rating accent (poor → excellent, blanks neutral) — labels, values, and row tints. */
const AIRLINE_RATING_UI_COLORS: Record<string, string> = {
  'Not Satisfactory': '#dc2626',
  'Below Average': '#ea580c',
  Satisfactory: '#ca8a04',
  Good: '#16a34a',
  Excellent: '#047857',
  [AIRLINE_REMARKS_BLANK_LABEL]: '#64748b',
};

function airlineRatingUi(rating: string): { color: string } {
  const color = AIRLINE_RATING_UI_COLORS[rating] ?? '#64748b';
  return { color };
}

/** Dashboard + modal display order (best → worst, blanks last). */
const AIRLINE_RATING_ORDER = [
  'Excellent',
  'Good',
  'Satisfactory',
  'Below Average',
  'Not Satisfactory',
] as const;

const AIRLINE_REMARKS_MODAL_TABS = [...AIRLINE_RATING_ORDER, AIRLINE_REMARKS_BLANK_LABEL] as const;

type AirlineRemarksModalTab = (typeof AIRLINE_REMARKS_MODAL_TABS)[number];

/** Same bucket rules as the KPI aggregator: blanks = empty / invalid classification value. */
const AIRLINE_REMARKS_RATINGS_SET = new Set<string>(AIRLINE_REMARKS_RATINGS as readonly string[]);

function canonicalAirlineRemarksRatingKey(raw: string | undefined): string {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t || !AIRLINE_REMARKS_RATINGS_SET.has(t)) return '';
  return t;
}

/** Modal rows: grouped by canonical rating bucket (invalid → Blanks bucket). */
function airlineRemarkRowMatchesModalTab(
  airlineRemarksRating: string | undefined,
  tab: AirlineRemarksModalTab,
): boolean {
  const bucket = canonicalAirlineRemarksRatingKey(airlineRemarksRating);
  if (tab === AIRLINE_REMARKS_BLANK_LABEL) return bucket === '';
  return bucket === tab;
}

function toInputDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** First calendar day of a payload month bucket (e.g. key JAN26 → 1 Jan 2026). */
function monthStartFromMonthData(m: MonthData): Date {
  const key = m.key.toUpperCase();
  const mon = key.slice(0, 3);
  const yy = Number(key.slice(-2));
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  const map: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };
  return new Date(year, map[mon] ?? 0, 1);
}

/** Default dashboard range: full latest month only (first → last day of that month). */
function defaultDateRangeLastMonthOnly(months: MonthData[]): { from: string; to: string } | null {
  if (!months.length) return null;
  const sorted = [...months].sort(
    (a, b) => monthStartFromMonthData(a).getTime() - monthStartFromMonthData(b).getTime()
  );
  const last = sorted[sorted.length - 1];
  const start = monthStartFromMonthData(last);
  return { from: toInputDate(start), to: toInputDate(endOfMonth(start)) };
}

const DASHBOARD_META = {
  subtitle: 'Bird Flight Delhi · STA date range (fhr_collection)',
} as const;

/**
 * Full previous calendar month (local), all stations.
 * e.g. any day in Sep 2026 → 2026-08-01 … 2026-08-31.
 */
function previousCalendarMonthYmdRange(now: Date = new Date()): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from: toInputDate(start), to: toInputDate(endOfMonth(start)) };
}

/** Initial dashboard filter: previous month for every station. */
function defaultDashboardInitialState(): { from: string; to: string } {
  return previousCalendarMonthYmdRange();
}

/** Parse stored YYYY-MM-DD as a local calendar date (avoids UTC shifts from `new Date(iso)`). */
function parseLocalYmd(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDisplayDate(iso: string) {
  if (!iso) return 'Select';
  const parsed = parseLocalYmd(iso);
  if (!parsed) return 'Select';
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const MS_PER_DAY = 86400000;

const ATA_DAY_MON: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function monthOverlapsRange(m: MonthData, rangeFrom: Date, rangeTo: Date): boolean {
  const ms = monthStartFromMonthData(m);
  const me = endOfMonth(ms);
  const rf = startOfLocalDay(rangeFrom).getTime();
  const rt = startOfLocalDay(rangeTo).getTime();
  return startOfLocalDay(ms).getTime() <= rt && startOfLocalDay(me).getTime() >= rf;
}

/**
 * Flights in the current dashboard view. Does **not** require all four timestamps — uses the first
 * parseable anchor in order STA → ATA → STD → ATD (local calendar day) for range / month. Rows with
 * no parseable time are omitted from this slice (cannot be placed in the view).
 */
function filterPerformanceFlightsForRange(
  flights: PerformanceFlightRecord[] | undefined,
  effectiveDayRange: { from: Date; to: Date } | 'invalid' | null,
  filteredMonths: MonthData[],
  monthDateFrom: (m: MonthData) => Date
): PerformanceFlightRecord[] {
  if (!flights?.length) return [];
  const out: PerformanceFlightRecord[] = [];
  for (const f of flights) {
    const staT = parseTimeMs(f.sta);
    const ataT = parseTimeMs(f.ata);
    const stdT = parseTimeMs(f.std);
    const atdT = parseTimeMs(f.atd);
    const refMs = staT ?? ataT ?? stdT ?? atdT;
    if (refMs == null) continue;
    const refDay = startOfLocalDay(new Date(refMs));
    if (effectiveDayRange && effectiveDayRange !== 'invalid' && typeof effectiveDayRange === 'object') {
      const rf = startOfLocalDay(effectiveDayRange.from).getTime();
      const rt = startOfLocalDay(effectiveDayRange.to).getTime();
      if (refDay.getTime() < rf || refDay.getTime() > rt) continue;
    } else {
      if (!filteredMonths.length) continue;
      const y = refDay.getFullYear();
      const mo = refDay.getMonth();
      const inMonth = filteredMonths.some((m) => {
        const m0 = monthDateFrom(m);
        return m0.getFullYear() === y && m0.getMonth() === mo;
      });
      if (!inMonth) continue;
    }
    out.push(f);
  }
  return out;
}

type PerformanceGroundTimingMetrics = GroundTimes;

function performanceGroundTimingMetrics(
  f: PerformanceFlightRecord,
): PerformanceGroundTimingMetrics | null {
  return getGroundTimes(f);
}

/**
 * Single-pass primary partition over all flights (mutually exclusive):
 * - Row 1: On-Time (ATA===STA exact date+time), non-cancelled with parseable ATA/STA
 * - Row 2: Cancelled (`isCancelled` or flight number starts with `CANC`)
 * - Row 3: Off-SKD (all remaining non-cancelled flights, including incomplete timings)
 */
function partitionPerformanceFlightsSinglePass(flights: PerformanceFlightRecord[]): {
  onTimeFlights: PerformanceFlightRecord[];
  cancelledFlights: PerformanceFlightRecord[];
  offSkdFlights: PerformanceFlightRecord[];
} {
  const onTimeFlights: PerformanceFlightRecord[] = [];
  const cancelledFlights: PerformanceFlightRecord[] = [];
  const offSkdFlights: PerformanceFlightRecord[] = [];
  if (!flights?.length) return { onTimeFlights, cancelledFlights, offSkdFlights };

  for (const f of flights) {
    if (isCancelledDbPerformanceFlight(f)) {
      cancelledFlights.push(f);
      continue;
    }

    const ataMs = parseTimeMs(f.ata);
    const staMs = parseTimeMs(f.sta);
    if (ataMs != null && staMs != null && ataMs === staMs) {
      onTimeFlights.push(f);
      continue;
    }

    const metrics = performanceGroundTimingMetrics(f);
    if (!metrics) {
      offSkdFlights.push(f);
      continue;
    }

    offSkdFlights.push(f);
  }

  return { onTimeFlights, cancelledFlights, offSkdFlights };
}

/**
 * Row 3 split with one exclusive bucket per off-SKD flight:
 * - Row 3A: ATD <= STD OR (ATD > STD AND AGT <= SGT)
 * - Row 3B: (ATD < STD AND AGT = SGT) + (ATD < STD AND AGT > SGT)
 * - Row 3C: ATD > STD AND AGT > SGT (plus residual fallback)
 *
 * Uses full datetime math (milliseconds): AGT = ATD−ATA, SGT = STD−STA.
 */
function partitionOffSkdFlights(flights: PerformanceFlightRecord[]): {
  a: PerformanceFlightRecord[];
  b: PerformanceFlightRecord[];
  c: PerformanceFlightRecord[];
  ghaImprovement: PerformanceFlightRecord[];
  row3bCond1Count: number;
  row3bCond2Count: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  row3cTotalCount: number;
} {
  const a: PerformanceFlightRecord[] = [];
  const b: PerformanceFlightRecord[] = [];
  const c: PerformanceFlightRecord[] = [];
  const ghaImprovement: PerformanceFlightRecord[] = [];
  const row3bCond1Flights: PerformanceFlightRecord[] = [];
  const row3bCond2Flights: PerformanceFlightRecord[] = [];
  if (!flights?.length) {
    return {
      a,
      b,
      c,
      ghaImprovement,
      row3bCond1Count: 0,
      row3bCond2Count: 0,
      row3cGhaCount: 0,
      row3cNonGhaCount: 0,
      row3cTotalCount: 0,
    };
  }

  const totalFlights = flights.length;

  for (const f of flights) {
    const metrics = performanceGroundTimingMetrics(f);
    if (!metrics) {
      // Keep row-3 partition exhaustive when any timing is missing.
      a.push(f);
      continue;
    }

    const inRow3BCond1 = metrics.atd < metrics.std && metrics.AGT === metrics.SGT;
    const inRow3BCond2 = metrics.atd < metrics.std && metrics.AGT > metrics.SGT;
    const inRow3B = inRow3BCond1 || inRow3BCond2;
    const inRow3A =
      metrics.atd <= metrics.std ||
      (metrics.atd > metrics.std && metrics.AGT <= metrics.SGT);
    const inRow3C = metrics.atd > metrics.std && metrics.AGT > metrics.SGT;
    if (inRow3B) {
      b.push(f);
      if (inRow3BCond1) row3bCond1Flights.push(f);
      if (inRow3BCond2) row3bCond2Flights.push(f);
    } else if (inRow3A) {
      a.push(f);
    } else if (inRow3C) {
      c.push(f);
    } else {
      c.push(f);
    }

    if (metrics.AGT > metrics.SGT) ghaImprovement.push(f);
  }

  const usedFlights = a.length + b.length + c.length;
  const row3bCond1Count = row3bCond1Flights.length;
  const row3bCond2Count = row3bCond2Flights.length;
  const row3bCount = row3bCond1Count + row3bCond2Count;
  const overlap = row3bCond1Flights.filter((f) => row3bCond2Flights.includes(f)).length;
  const row3CBase = ghaImprovement;
  const row3C_GHA = row3CBase.filter((f) => isGhaAttributed(f));
  const row3C_NON_GHA = row3CBase.filter((f) => isNonGha(f));
  const row3cGhaCount = row3C_GHA.length;
  const row3cNonGhaCount = row3C_NON_GHA.length;
  const row3cTotalCount = row3cGhaCount + row3cNonGhaCount;
  if (process.env.NODE_ENV === 'development' && usedFlights !== totalFlights) {
    // eslint-disable-next-line no-console
    console.assert(false, 'Row 3A + 3B + 3C must equal Row 3 flights');
  }
  if (process.env.NODE_ENV === 'development' && overlap > 0) {
    // eslint-disable-next-line no-console
    console.error('Overlap detected in Row 3B!');
  }
  if (process.env.NODE_ENV === 'development' && row3bCount !== b.length) {
    // eslint-disable-next-line no-console
    console.error('Row 3B count mismatch: cond1 + cond2 must equal row 3B');
  }
  if (process.env.NODE_ENV === 'development' && row3cTotalCount !== row3CBase.length) {
    // eslint-disable-next-line no-console
    console.error('Mismatch in 3C attribution split!');
  }
  return {
    a,
    b,
    c,
    ghaImprovement,
    row3bCond1Count,
    row3bCond2Count,
    row3cGhaCount,
    row3cNonGhaCount,
    row3cTotalCount,
  };
}

function sortPerformanceFlightsBySta<T extends { sta: string }>(flights: T[]): T[] {
  return [...flights].sort((x, y) => {
    const ax = parseTimeMs(x.sta) ?? 0;
    const ay = parseTimeMs(y.sta) ?? 0;
    return ax - ay;
  });
}

function formatPerformanceIsoBrief(iso: string): string {
  if (!iso?.trim()) return DASH_DB_PLACEHOLDER;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso.trim();
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPerformanceIsoDate(iso: string): string {
  if (!iso?.trim()) return DASH_DB_PLACEHOLDER;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return DASH_DB_PLACEHOLDER;
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPerformanceIsoTime(iso: string): string {
  if (!iso?.trim()) return DASH_DB_PLACEHOLDER;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return DASH_DB_PLACEHOLDER;
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function pickDelayReasonText(entry: Record<string, unknown>): string {
  const keys = [
    'reasonOfDelay',
    'ReasonofDelay',
    'ReasonOfDelay',
    'reason',
    'Reason',
    'Reason of Delay',
    'Reason Of Delay',
  ] as const;
  for (const k of keys) {
    const s = String(entry[k] ?? '').trim();
    if (s) return s;
  }
  return '';
}

function collectAllDelaysForModalRow(rawRow: unknown): {
  code: string;
  delayTime: string;
  description: string;
}[] {
  const outer =
    rawRow && typeof rawRow === 'object' && !Array.isArray(rawRow)
      ? (rawRow as Record<string, unknown>)
      : {};
  const d =
    outer.data && typeof outer.data === 'object' && !Array.isArray(outer.data)
      ? (outer.data as Record<string, unknown>)
      : outer;
  const nested =
    d.mainDetails && typeof d.mainDetails === 'object' && !Array.isArray(d.mainDetails)
      ? (d.mainDetails as Record<string, unknown>)
      : null;

  const out: { code: string; delayTime: string; description: string }[] = [];
  const seen = new Set<string>();
  const absorb = (container: Record<string, unknown>) => {
    const arrays = [
      container.arrivalDelays,
      container.ArrivalDelays,
      container.departureDelays,
      container.DepartureDelays,
    ];
    for (const arr of arrays) {
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const e = item as Record<string, unknown>;
        const reason = pickDelayReasonText(e);
        const delayTime = String(e.Delay ?? e.delay ?? '').trim() || DASH_DB_PLACEHOLDER;
        const codeMatch = reason.match(/^(\d{2})\b/);
        const code = codeMatch?.[1] ?? DASH_DB_PLACEHOLDER;
        const description = codeMatch ? getDelayReasonLabel(code) : reason || 'Unmapped reason';
        const key = `${code}|${delayTime}|${reason}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ code, delayTime, description });
      }
    }
  };

  if (nested) absorb(nested);
  absorb(d);

  out.sort((a, b) => {
    const ai = Number(a.code);
    const bi = Number(b.code);
    const codeCmp =
      Number.isFinite(ai) && Number.isFinite(bi)
        ? ai - bi
        : String(a.code).localeCompare(String(b.code));
    if (codeCmp !== 0) return codeCmp;
    return a.delayTime.localeCompare(b.delayTime);
  });
  return out;
}

function agtGreaterThanSgtFromDrillRow(f: DashboardPerformanceDrillFlightRow): boolean | null {
  const am = f.agtMinutes;
  const sm = f.sgtMinutes;
  if (
    am != null &&
    sm != null &&
    Number.isFinite(am) &&
    Number.isFinite(sm)
  ) {
    return am > sm + 1e-9;
  }
  const sta = Date.parse(f.sta);
  const ata = Date.parse(f.ata);
  const std = Date.parse(f.std);
  const atd = Date.parse(f.atd);
  if (![sta, ata, std, atd].every((n) => Number.isFinite(n))) return null;
  return atd - ata > std - sta;
}

/**
 * Row d modal list — prefer explicit `inPerformanceReportGhaImprovementRow` (drill schema v2+).
 * Legacy v1 shards without per-row flags cannot be filtered reliably; returns false unless
 * `hasStationGhaDelayCode` + path geometry + AGT > SGT per path (partial safety net).
 */
function drillFlightMatchesPerformanceReportGhaImprovementRow(
  f: DashboardPerformanceDrillFlightRow,
  drillSchemaVersion: number | undefined,
): boolean {
  if (typeof f.inPerformanceReportGhaImprovementRow === 'boolean') {
    return f.inPerformanceReportGhaImprovementRow;
  }
  if ((drillSchemaVersion ?? 0) >= 2) {
    return false;
  }
  if (f.hasStationGhaDelayCode !== true) return false;
  const agtGtSgt = agtGreaterThanSgtFromDrillRow(f);
  if (agtGtSgt !== true) return false;
  const sta = Date.parse(f.sta);
  const ata = Date.parse(f.ata);
  const std = Date.parse(f.std);
  const atd = Date.parse(f.atd);
  if (![sta, ata, std, atd].every((n) => Number.isFinite(n))) return false;
  if (ata > sta) return true;
  if (ata < sta && atd > std) return true;
  return false;
}

/** Backfill drill row flags when stored shards predate schema v2. */
function normalizePerformanceDrilldownPayload(
  raw: DashboardPerformanceDrilldownPayload,
): DashboardPerformanceDrilldownPayload {
  const flights = raw.flights.map((f) => {
    if (typeof f.isOnTime === 'boolean' && typeof f.isCancelled === 'boolean') {
      return f;
    }
    const delay = String((f as { delay?: string }).delay ?? '')
      .trim()
      .toUpperCase();
    const isCancelled =
      f.isCancelled === true || delay.includes('CANC') || delay === 'CANCELLED';
    const staMs = Date.parse(f.sta);
    const ataMs = Date.parse(f.ata);
    const isOnTime =
      !isCancelled &&
      Number.isFinite(staMs) &&
      Number.isFinite(ataMs) &&
      staMs === ataMs;
    return { ...f, isCancelled, isOnTime };
  });
  return { ...raw, flights };
}

function performanceFlightsForReportDrillKey(
  key: string,
  drilldown: DashboardPerformanceDrilldownPayload,
): DashboardPerformanceDrillFlightRow[] {
  const { flights, schemaVersion: drillSchemaVersion } = drilldown;
  let filtered: DashboardPerformanceDrillFlightRow[];
  switch (key) {
    case 'on-time':
      filtered = flights.filter((f) => f.isOnTime && !f.isCancelled);
      break;
    case 'cancelled':
      filtered = flights.filter((f) => f.isCancelled);
      break;
    case 'off-skd':
      filtered = flights.filter((f) => !f.isCancelled && !f.isOnTime);
      break;
    case 'gt-saved':
      filtered = flights.filter((f) => !f.isCancelled && !f.isOnTime && f.partition === 'A');
      break;
    case 'before-std':
      filtered = flights.filter((f) => !f.isCancelled && !f.isOnTime && f.partition === 'B');
      break;
    case 'agt-sgt':
      filtered = flights.filter((f) => !f.isCancelled && !f.isOnTime && f.partition === 'C');
      break;
    case 'gha-improvement':
      filtered = flights.filter((f) =>
        drillFlightMatchesPerformanceReportGhaImprovementRow(f, drillSchemaVersion),
      );
      break;
    case 'total-classified':
      filtered = [...flights];
      break;
    default:
      filtered = [];
  }
  return sortPerformanceFlightsBySta(filtered);
}

const PERFORMANCE_REPORT_DRILL_TITLES: Record<string, string> = {
  'on-time': '1. Flight Operated on time',
  'off-skd': '2. Flight Operated Off-SKD',
  'gt-saved': 'a. Ground time saved',
  'before-std': 'b. Departed on or before STD',
  'agt-sgt': 'c. AGT > SGT (NON-GHA)',
  'gha-improvement': 'd. Improvement for GHA',
  cancelled: '3. Cancelled Flight',
  'total-classified': 'Total Flights',
};

function performanceReportDrillTitle(key: string): string {
  return PERFORMANCE_REPORT_DRILL_TITLES[key] ?? key;
}

function performanceReportDrillMetaLine(
  drillKey: string,
  flightCount: number,
  cancelledReportTotal: number,
): string {
  if (drillKey === 'cancelled') {
    return `${flightCount.toLocaleString()} flight${flightCount === 1 ? '' : 's'} · database (STA range) · report total ${cancelledReportTotal.toLocaleString()}`;
  }
  const base = `${flightCount.toLocaleString()} flight${flightCount === 1 ? '' : 's'}`;
  if (drillKey === 'on-time') return `${base} · STA date/time = ATA date/time`;
  return base;
}

const DRILL_VIRT_ROW_PX = 44;
const DRILL_VIRT_MIN_ROWS = 100;

/** Sl. → open Scheduled / Non-Scheduled Airlines with this serial (`?highlightSerial=` / `?serialNo=`). */
function PerformanceReportSerialCell({
  drillRow,
  displaySerial,
  className,
}: {
  drillRow: DashboardPerformanceDrillFlightRow;
  displaySerial: string;
  className?: string;
}) {
  const dashboardReturn = useDashboardScheduledAirlinesLinkContext();
  const n = drillRow.serialNo;
  const canLink =
    n != null &&
    Number.isFinite(n) &&
    displaySerial.trim() !== '' &&
    displaySerial !== '—';
  if (!canLink) {
    return <span className={className}>{displaySerial}</span>;
  }
  const flightDateRange = flightScheduleYmdRangeFromIso(drillRow.sta, drillRow.std);
  const href = dashboardReturn
    ? buildAirlinesHrefFromDashboard(Math.trunc(n), dashboardReturn, flightDateRange)
    : buildAirlinesHighlightHref(Math.trunc(n), undefined, flightDateRange);
  return (
    <Link
      href={href}
      className={cn(
        className,
        'text-orange-500 underline decoration-orange-500/70 underline-offset-2 hover:text-orange-400',
      )}
    >
      {displaySerial}
    </Link>
  );
}

/** Phone/tablet card list for performance drill flight rows. */
function PerformanceReportDrillFlightMobileList({
  drillKey,
  flights,
  dashDark,
  compact,
}: {
  drillKey: string;
  flights: DashboardPerformanceDrillFlightRow[];
  dashDark: boolean;
  compact?: boolean;
}) {
  const pad = compact ? 'p-2.5' : 'p-3';
  const cancelled = drillKey === 'cancelled';

  if (flights.length === 0) {
    return (
      <p className={cn(pad, 'text-sm text-[var(--dash-text-muted)]', DASH_MOBILE_LIST_CLASS)}>
        No flights in this bucket.
      </p>
    );
  }

  return (
    <ul className={cn('flex flex-col gap-2', DASH_MOBILE_LIST_CLASS, pad)}>
      {flights.map((f, i) => {
        const d = performanceDrillRowToDisplayDetail(f);
        const rowKey = `${d.sta}-${d.serial}-${i}`;
        return (
          <li
            key={rowKey}
            className={cn(
              'rounded-xl border text-sm',
              dashDark ? 'border-white/12 bg-black/20' : 'border-[var(--dash-table-border)] bg-[var(--dash-card)]/90'
            )}
          >
            <div
              className={cn(
                'flex items-start justify-between gap-2 border-b px-3 py-2',
                dashDark ? 'border-white/10' : 'border-[var(--dash-border-subtle)]'
              )}
            >
              <div className="min-w-0">
                <p className={cn('font-semibold', dashDark ? 'text-white/95' : 'text-[var(--dash-text-strong)]')}>
                  {d.airline}
                  {cancelled && d.flightNo ? (
                    <span className="ml-1.5 font-normal text-[var(--dash-text-muted)]">· {d.flightNo}</span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--dash-text-muted)]">
                  <PerformanceReportSerialCell drillRow={f} displaySerial={d.serial} />
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2.5 text-xs">
              {!cancelled ? (
                <>
                  <div>
                    <dt className="text-[var(--dash-text-muted)]">AGT</dt>
                    <dd className={cn('tabular-nums font-medium', dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]')}>
                      {formatGroundDurationMinutesAsHhMm(d.agtMinutes)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--dash-text-muted)]">SGT</dt>
                    <dd className="tabular-nums text-[var(--dash-text-muted)]">
                      {formatGroundDurationMinutesAsHhMm(d.sgtMinutes)}
                    </dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt className="text-[var(--dash-text-muted)]">STA</dt>
                <dd className="tabular-nums text-[var(--dash-text-muted)]">{formatPerformanceIsoBrief(d.sta)}</dd>
              </div>
              <div>
                <dt className="text-[var(--dash-text-muted)]">ATA</dt>
                <dd className="tabular-nums text-[var(--dash-text-muted)]">{formatPerformanceIsoBrief(d.ata)}</dd>
              </div>
              <div>
                <dt className="text-[var(--dash-text-muted)]">STD</dt>
                <dd className="tabular-nums text-[var(--dash-text-muted)]">{formatPerformanceIsoBrief(d.std)}</dd>
              </div>
              <div>
                <dt className="text-[var(--dash-text-muted)]">ATD</dt>
                <dd className="tabular-nums text-[var(--dash-text-muted)]">{formatPerformanceIsoBrief(d.atd)}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

/** Scrollable flight list used by the performance report drill flip and the drill dialog. */
function PerformanceReportDrillFlightTable({
  drillKey,
  flights,
  dashDark,
  compact,
}: {
  drillKey: string;
  flights: DashboardPerformanceDrillFlightRow[];
  dashDark: boolean;
  compact?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight || 400);
    });
    ro.observe(el);
    setViewportH(el.clientHeight || 400);
    return () => ro.disconnect();
  }, [drillKey, flights.length]);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const virtualized = flights.length >= DRILL_VIRT_MIN_ROWS;
  const { start, end, padTop, padBot } = useMemo(() => {
    if (!virtualized) {
      return { start: 0, end: flights.length, padTop: 0, padBot: 0 };
    }
    const overscan = 8;
    const first = Math.max(0, Math.floor(scrollTop / DRILL_VIRT_ROW_PX) - overscan);
    const vis = Math.ceil(viewportH / DRILL_VIRT_ROW_PX) + overscan * 2;
    const last = Math.min(flights.length, first + vis);
    return {
      start: first,
      end: last,
      padTop: first * DRILL_VIRT_ROW_PX,
      padBot: (flights.length - last) * DRILL_VIRT_ROW_PX,
    };
  }, [flights.length, scrollTop, viewportH, virtualized]);

  const visible = useMemo(() => flights.slice(start, end), [flights, start, end]);

  const drillListPad = compact ? 'px-1 py-1' : 'px-2 py-1.5';
  const drillCell = compact ? 'px-1.5 py-1 text-left text-[14px]' : 'px-2 py-1.5 text-left text-sm';
  const rowBorder = cn('border-t', dashDark ? 'border-white/10' : 'border-[var(--dash-table-border)]');
  const colSpanCancelled = 7;
  const colSpanStandard = 8;

  const drillScrollShellClass = cn(
    'h-full min-h-0 max-h-full flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch]',
    SCROLL_AREA_NO_BAR,
  );

  if (drillKey === 'cancelled') {
    if (flights.length === 0) {
      return (
        <p className={cn(drillListPad, 'text-[var(--dash-text-muted)]')}>No flights in this bucket.</p>
      );
    }
    return (
      <div ref={scrollRef} onScroll={onScroll} className={drillScrollShellClass}>
        <PerformanceReportDrillFlightMobileList
          drillKey={drillKey}
          flights={flights}
          dashDark={dashDark}
          compact={compact}
        />
        <div
          className={cn(
            DASH_TABLE_DESKTOP_CLASS,
            'overflow-x-auto rounded-md border touch-pan-x',
            dashDark ? 'border-white/10 bg-black/20' : 'border-[var(--dash-table-border)] bg-white/40',
          )}
        >
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr
              className={cn(
                'border-b',
                dashDark ? 'border-white/15' : 'border-[var(--dash-table-border)]',
              )}
            >
              {['Sl.', 'Airline', 'Flight', 'STA', 'ATA', 'STD', 'ATD'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className={cn(
                    drillListPad,
                    'font-semibold uppercase tracking-wide',
                    dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD,
                    dashDark ? 'text-amber-400/95' : 'text-[var(--dash-warm-caption)]',
                    compact ? 'text-[12px]' : 'text-[13px]',
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 ? (
              <tr aria-hidden className="pointer-events-none" style={{ border: 0 }}>
                <td colSpan={colSpanCancelled} style={{ height: padTop, padding: 0, border: 0, lineHeight: 0 }} />
              </tr>
            ) : null}
            {visible.map((f, i) => {
              const d = performanceDrillRowToDisplayDetail(f);
              const rowKey = `${d.sta}-${d.flightNo}-${start + i}`;
              return (
                <tr key={rowKey} className={rowBorder}>
                  <td className={cn(drillCell, 'tabular-nums text-[var(--dash-text-muted)]')}>
                    <PerformanceReportSerialCell drillRow={f} displaySerial={d.serial} />
                  </td>
                  <td className={cn(drillCell, dashDark ? 'text-white/90' : 'text-[var(--dash-text)]')}>
                    {d.airline}
                  </td>
                  <td
                    className={cn(
                      drillCell,
                      'tabular-nums',
                      dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]',
                    )}
                  >
                    {d.flightNo}
                  </td>
                  <td className={cn(drillCell, 'whitespace-nowrap tabular-nums text-[var(--dash-text-muted)]')}>
                    {formatPerformanceIsoBrief(d.sta)}
                  </td>
                  <td className={cn(drillCell, 'whitespace-nowrap tabular-nums text-[var(--dash-text-muted)]')}>
                    {formatPerformanceIsoBrief(d.ata)}
                  </td>
                  <td className={cn(drillCell, 'whitespace-nowrap tabular-nums text-[var(--dash-text-muted)]')}>
                    {formatPerformanceIsoBrief(d.std)}
                  </td>
                  <td className={cn(drillCell, 'whitespace-nowrap tabular-nums text-[var(--dash-text-muted)]')}>
                    {formatPerformanceIsoBrief(d.atd)}
                  </td>
                </tr>
              );
            })}
            {padBot > 0 ? (
              <tr aria-hidden className="pointer-events-none" style={{ border: 0 }}>
                <td colSpan={colSpanCancelled} style={{ height: padBot, padding: 0, border: 0, lineHeight: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>
    );
  }

  if (flights.length === 0) {
    return (
      <p className={cn(drillListPad, 'text-[var(--dash-text-muted)]')}>No flights in this bucket.</p>
    );
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className={drillScrollShellClass}>
      <PerformanceReportDrillFlightMobileList
        drillKey={drillKey}
        flights={flights}
        dashDark={dashDark}
        compact={compact}
      />
      <div
        className={cn(
          DASH_TABLE_DESKTOP_CLASS,
          'overflow-x-auto rounded-md border touch-pan-x',
          dashDark ? 'border-white/10 bg-black/20' : 'border-[var(--dash-table-border)] bg-white/40',
        )}
      >
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <thead>
          <tr
            className={cn(
              'border-b',
              dashDark ? 'border-white/15' : 'border-[var(--dash-table-border)]',
            )}
          >
            {['Sl.', 'Airline', 'AGT', 'SGT', 'STA', 'ATA', 'STD', 'ATD'].map((h) => (
              <th
                key={h}
                scope="col"
                className={cn(
                  drillListPad,
                  'font-semibold uppercase tracking-wide',
                  dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD,
                  dashDark ? 'text-amber-400/95' : 'text-[var(--dash-warm-caption)]',
                  compact ? 'text-[12px]' : 'text-[13px]',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 ? (
            <tr aria-hidden className="pointer-events-none" style={{ border: 0 }}>
              <td colSpan={colSpanStandard} style={{ height: padTop, padding: 0, border: 0, lineHeight: 0 }} />
            </tr>
          ) : null}
          {visible.map((f, i) => {
            const d = performanceDrillRowToDisplayDetail(f);
            const rowKey = `${d.sta}-${d.serial}-${start + i}`;
            return (
              <tr key={rowKey} className={rowBorder}>
                <td className={cn(drillCell, 'tabular-nums text-[var(--dash-text-muted)]')}>
                  <PerformanceReportSerialCell drillRow={f} displaySerial={d.serial} />
                </td>
                <td className={cn(drillCell, dashDark ? 'text-white/90' : 'text-[var(--dash-text)]')}>
                  {d.airline}
                </td>
                <td
                  className={cn(
                    drillCell,
                    'tabular-nums',
                    dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]',
                  )}
                >
                  {formatGroundDurationMinutesAsHhMm(d.agtMinutes)}
                </td>
                <td className={cn(drillCell, 'tabular-nums text-[var(--dash-text-muted)]')}>
                  {formatGroundDurationMinutesAsHhMm(d.sgtMinutes)}
                </td>
                <td className={cn(drillCell, 'whitespace-nowrap tabular-nums text-[var(--dash-text-muted)]')}>
                  {formatPerformanceIsoBrief(d.sta)}
                </td>
                <td className={cn(drillCell, 'whitespace-nowrap tabular-nums text-[var(--dash-text-muted)]')}>
                  {formatPerformanceIsoBrief(d.ata)}
                </td>
                <td className={cn(drillCell, 'whitespace-nowrap tabular-nums text-[var(--dash-text-muted)]')}>
                  {formatPerformanceIsoBrief(d.std)}
                </td>
                <td className={cn(drillCell, 'whitespace-nowrap tabular-nums text-[var(--dash-text-muted)]')}>
                  {formatPerformanceIsoBrief(d.atd)}
                </td>
              </tr>
            );
          })}
          {padBot > 0 ? (
            <tr aria-hidden className="pointer-events-none" style={{ border: 0 }}>
              <td colSpan={colSpanStandard} style={{ height: padBot, padding: 0, border: 0, lineHeight: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function calendarDaysInclusive(a: Date, b: Date): number {
  return Math.max(1, Math.round((startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()) / MS_PER_DAY) + 1);
}

function overlapDaysInMonth(monthStart: Date, rangeFrom: Date, rangeTo: Date): number {
  const monthEnd = endOfMonth(monthStart);
  const rf = startOfLocalDay(rangeFrom);
  const rt = startOfLocalDay(rangeTo);
  const m0 = startOfLocalDay(monthStart);
  const m1 = startOfLocalDay(monthEnd);
  const segStart = rf.getTime() > m0.getTime() ? rf : m0;
  const segEnd = rt.getTime() < m1.getTime() ? rt : m1;
  if (segStart.getTime() > segEnd.getTime()) return 0;
  return calendarDaysInclusive(segStart, segEnd);
}

function daysInFullMonth(monthStart: Date): number {
  return calendarDaysInclusive(startOfLocalDay(monthStart), endOfMonth(monthStart));
}

function parseAtaStaDayLabel(m: MonthData, label: string): Date | null {
  const year = monthStartFromMonthData(m).getFullYear();
  const mch = label.trim().match(/^(\d{1,2})\s+([A-Za-z]+)/);
  if (!mch) return null;
  const day = Number(mch[1]);
  const monAbbr = mch[2].slice(0, 3);
  const mi = ATA_DAY_MON[monAbbr];
  if (mi === undefined || !Number.isFinite(day)) return null;
  const dt = new Date(year, mi, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== mi || dt.getDate() !== day) return null;
  return dt;
}

/** March 2026: daily `net` = Σ(ATA−STA) min; JSON `netStaDeviationMinutes` + always 31 points, `net` never null. */
const NET_PRIMARY_LINE = '#94A3B8';
const NET_DELAY = '#22C55E';
const NET_EARLY = '#F59E0B';
const NET_ZERO_REF = '#475569';
/** Fills: green tint above the axis (0 → net), orange tint below (net → 0). */
const NET_POS_AREA_FILL = 'rgba(34, 197, 94, 0.22)';
const NET_NEG_AREA_FILL = 'rgba(245, 158, 11, 0.2)';

/** March: odd days only on X — less clutter, keys match `dayKey` 01..31. */
const MARCH_ODD_DAY_X_TICKS = Array.from({ length: 16 }, (_, i) => String(2 * i + 1).padStart(2, '0'));

type MarchNetPoint = {
  dayKey: string;
  dayIndex0: number;
  dateLabel: string;
  /** Always a finite number (â‰¥31 days, Mar 2026). */
  net: number;
  pos: number | null;
  neg: number | null;
  /** max(0, net) for area fill to baseline 0. */
  posFill: number | null;
  /** min(0, net) for area fill to baseline 0. */
  negFill: number | null;
  flights: number;
};

function buildMarch2026NetDeviationSeries(marMonth: MonthData | undefined): MarchNetPoint[] {
  const year = 2026;
  const monthIdx = 2;
  const daysInMonth = 31;
  const byDay = new Map<number, AtaStaDailyRow>();
  if (marMonth?.ataStaDailyComparison?.length) {
    for (const row of marMonth.ataStaDailyComparison) {
      const dt = parseAtaStaDayLabel(marMonth, row.date);
      if (!dt || dt.getFullYear() !== year || dt.getMonth() !== monthIdx) continue;
      byDay.set(dt.getDate(), row);
    }
  }
  const out: MarchNetPoint[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const row = byDay.get(d);
    const counts = (row?.ataOnOrBeforeSta ?? 0) + (row?.ataAfterSta ?? 0);
    const paired = row?.flightsPairedInDeviation ?? counts;
    const raw = row?.netStaDeviationMinutes;
    const net =
      typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    const full = new Date(year, monthIdx, d);
    const dateLabel = full.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    out.push({
      dayKey: String(d).padStart(2, '0'),
      dayIndex0: d - 1,
      dateLabel,
      net,
      pos: net > 0 ? net : null,
      neg: net < 0 ? net : null,
      posFill: net > 0 ? net : null,
      negFill: net < 0 ? net : null,
      flights: paired,
    });
  }
  return out;
}

function MarchNetDeviationTooltipBody(
  props: {
    active?: boolean;
    payload?: ReadonlyArray<{ dataKey?: string; payload?: MarchNetPoint }>;
  }
) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;
  const row =
    (payload as { dataKey?: string; payload?: MarchNetPoint }[]).find(
      (e) => e.dataKey === 'net' && e.payload != null
    )?.payload ?? (payload[0] as { payload?: MarchNetPoint }).payload;
  if (row == null) return null;
  const statusText = row.net > 0 ? 'Delayed' : row.net < 0 ? 'Early' : 'On Time';
  const totalMinStr = row.net === 0 ? '0' : row.net > 0 ? `+${row.net}` : `${row.net}`;
  const statusClass =
    row.net > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : row.net < 0
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[var(--dash-text-muted)]';
  return (
    <div className="max-w-[16rem] rounded-lg border border-[var(--dash-border)] bg-[var(--dash-card)] px-2.5 py-2 text-left text-[13px] leading-snug text-[var(--dash-text)] shadow-md">
      <p className="font-semibold text-[var(--dash-text-strong)]">{row.dateLabel}</p>
      <p className="mt-1 tabular-nums text-[var(--dash-text)]">
        Net minutes: <span className="font-medium text-[var(--dash-text-strong)]">{totalMinStr}</span>
      </p>
      <p className="mt-0.5">
        Status: <span className={cn('font-medium', statusClass)}>{statusText}</span>
      </p>
      <p className="mt-0.5 tabular-nums text-[var(--dash-text-muted)]">Total flights: {row.flights}</p>
    </div>
  );
}

/** Rounds Y-axis step to 1/2/5/10… multiples for readable tick labels. */
function roundStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  if (normalized <= 1) return 1 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function MarchNetDeviationComposedChart({
  data,
  yDomain,
  yTicks,
  chartTheme,
  reduceMotion,
}: {
  data: MarchNetPoint[];
  yDomain: [number, number];
  yTicks: number[];
  chartTheme: ReturnType<typeof buildChartTheme>;
  reduceMotion: boolean;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console -- debug per product spec: verify JSON vs empty chart
      console.log(data.map((d) => d.net));
    }
  }, [data]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="min-h-0 w-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: 2, bottom: 0 }}>
        <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="dayKey"
          type="category"
          tick={{ fill: chartTheme.axis, fontSize: 10 }}
          tickLine={false}
          interval={0}
          ticks={MARCH_ODD_DAY_X_TICKS}
          tickFormatter={(v) => String(parseInt(String(v), 10))}
          height={32}
        />
        <YAxis
          yAxisId="dev"
          tick={{ fill: chartTheme.axis, fontSize: 11 }}
          width={72}
          domain={yDomain}
          ticks={yTicks}
          interval={0}
          allowDecimals
          label={{
            value: 'Delay/Early in minutes',
            angle: -90,
            position: 'insideLeft',
            offset: 4,
            style: {
              textAnchor: 'middle',
              dominantBaseline: 'middle',
              fill: chartTheme.axis,
              fontSize: 12,
              fontWeight: 500,
            },
          }}
        />
        <ReferenceLine yAxisId="dev" y={0} stroke={NET_ZERO_REF} strokeWidth={1.5} />
        <Area
          yAxisId="dev"
          type="linear"
          dataKey="posFill"
          stroke="none"
          fill={NET_POS_AREA_FILL}
          isAnimationActive={!reduceMotion}
          connectNulls={false}
          legendType="none"
        />
        <Area
          yAxisId="dev"
          type="linear"
          dataKey="negFill"
          stroke="none"
          fill={NET_NEG_AREA_FILL}
          isAnimationActive={!reduceMotion}
          connectNulls={false}
          legendType="none"
        />
        <Line
          yAxisId="dev"
          type="linear"
          dataKey="net"
          name="Net"
          stroke={NET_PRIMARY_LINE}
          strokeWidth={2}
          dot={{ r: 3, fill: NET_PRIMARY_LINE, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: NET_PRIMARY_LINE, stroke: chartTheme.tooltip.backgroundColor, strokeWidth: 1 }}
          isAnimationActive={!reduceMotion}
        />
        <Line
          yAxisId="dev"
          type="linear"
          dataKey="pos"
          name="Delay"
          stroke={NET_DELAY}
          strokeWidth={2}
          connectNulls={false}
          dot={false}
          isAnimationActive={!reduceMotion}
        />
        <Line
          yAxisId="dev"
          type="linear"
          dataKey="neg"
          name="Early"
          stroke={NET_EARLY}
          strokeWidth={2}
          connectNulls={false}
          dot={false}
          isAnimationActive={!reduceMotion}
        />
        <Tooltip content={MarchNetDeviationTooltipBody as never} wrapperStyle={{ outline: 'none' }} />
      </ComposedChart>
    </ResponsiveContainer>
      </div>
      <div
        className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-0.5 border-t border-[var(--dash-border)]/20 pr-1 pt-1.5 text-[12px] text-[var(--dash-text)]"
        role="status"
        aria-label="Chart legend: Net, Delay, Early"
      >
        <span className="mr-1 text-[11px] font-medium text-[var(--dash-text-muted)]">Date</span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-4 shrink-0 rounded-sm" style={{ background: NET_PRIMARY_LINE }} aria-hidden />
          Net
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-4 shrink-0 rounded-sm" style={{ background: NET_DELAY }} aria-hidden />
          Delay
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-4 shrink-0 rounded-sm" style={{ background: NET_EARLY }} aria-hidden />
          Early
        </span>
      </div>
    </div>
  );
}

function scaleCount(n: number, ratio: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.round(n * ratio));
}

/** Scale monthly aggregates to the intersection of [rangeFrom, rangeTo] and clip daily STA/ATA rows to those days. */
function adjustMonthDataForDateRange(m: MonthData, rangeFrom: Date, rangeTo: Date): MonthData {
  const ms = monthStartFromMonthData(m);
  const fullDays = daysInFullMonth(ms);
  const overlapDays = overlapDaysInMonth(ms, rangeFrom, rangeTo);
  const ratio = fullDays > 0 ? Math.min(1, Math.max(0, overlapDays / fullDays)) : 0;
  const dailyAll = m.ataStaDailyComparison ?? [];
  const dailyFiltered = dailyAll.filter((row) => {
    const dt = parseAtaStaDayLabel(m, row.date);
    if (!dt) return false;
    const t = startOfLocalDay(dt).getTime();
    return t >= startOfLocalDay(rangeFrom).getTime() && t <= startOfLocalDay(rangeTo).getTime();
  });
  const isFullMonthInRange = overlapDays >= fullDays;

  if (isFullMonthInRange && dailyFiltered.length === dailyAll.length && Math.abs(ratio - 1) < 1e-9) {
    return m;
  }

  const totalFlights = scaleCount(m.totalFlights, ratio);
  const on = scaleCount(m.delayBreakdown.onTime, ratio);
  const delayed = scaleCount(m.delayBreakdown.delayed, ratio);
  const before = scaleCount(m.delayBreakdown.beforeTime, ratio);
  const other = Math.max(0, totalFlights - on - delayed - before);
  const delayBreakdown: DelayBreakdown = { onTime: on, delayed, beforeTime: before, other };

  const sumLe = dailyFiltered.reduce((s, r) => s + r.ataOnOrBeforeSta, 0);

  let ataStaDailyComparison: MonthData['ataStaDailyComparison'];
  if (dailyFiltered.length > 0) ataStaDailyComparison = dailyFiltered;
  else if (isFullMonthInRange) ataStaDailyComparison = dailyAll;
  else ataStaDailyComparison = [];

  const ataOnOrBeforeStaCount =
    dailyFiltered.length > 0 ? sumLe : scaleCount(m.ataOnOrBeforeStaCount ?? m.delayBreakdown.onTime, ratio);
  const staOnTimeCount = scaleCount(m.staOnTimeCount ?? m.delayBreakdown.onTime, ratio);

  const scaleRowList = (rows: { name: string; count: number }[]) =>
    rows.map((r) => ({ ...r, count: scaleCount(r.count, ratio) }));
  const scaleReasons = (rows: { reason: string; count: number }[]) =>
    rows.map((r) => ({ ...r, count: scaleCount(r.count, ratio) }));
  const scaleBuckets = (rows: { bucket: string; count: number }[]) =>
    rows.map((r) => ({ ...r, count: scaleCount(r.count, ratio) }));
  const scaleCategories = (rows: { code: string; count: number }[]) =>
    rows.map((r) => ({ ...r, count: scaleCount(r.count, ratio) }));

  const activeDaysScaled =
    m.activeDaysSta !== undefined ? Math.max(1, scaleCount(m.activeDaysSta, ratio) || 1) : undefined;

  let avgFlightsPerActiveStaDay = m.avgFlightsPerActiveStaDay;
  if (activeDaysScaled && totalFlights > 0) {
    avgFlightsPerActiveStaDay = Math.round((totalFlights / activeDaysScaled) * 10) / 10;
  } else if (avgFlightsPerActiveStaDay !== undefined) {
    avgFlightsPerActiveStaDay = Math.round(avgFlightsPerActiveStaDay * ratio * 10) / 10;
  }

  let groundTime = m.groundTime;
  if (groundTime) {
    groundTime = {
      totalAgtMinutes: scaleCount(groundTime.totalAgtMinutes, ratio),
      totalSgtMinutes: scaleCount(groundTime.totalSgtMinutes, ratio),
      gtAddedFlightCount: scaleCount(groundTime.gtAddedFlightCount, ratio),
      flightsWithAgt: scaleCount(groundTime.flightsWithAgt, ratio),
    };
  }

  const scaleCarrierVolume = (cv: NonNullable<MonthData['carrierVolume']>): MonthData['carrierVolume'] => ({
    international: scaleCount(cv.international, ratio),
    domestic: scaleCount(cv.domestic, ratio),
    unclassifiedSector: scaleCount(cv.unclassifiedSector ?? 0, ratio),
    wideBody: scaleCount(cv.wideBody, ratio),
    narrowBody: scaleCount(cv.narrowBody, ratio),
    unclassifiedBody: scaleCount(cv.unclassifiedBody ?? 0, ratio),
  });
  const scaleAircraftTypes = (rows: { type: string; count: number }[]) =>
    rows.map((r) => ({ ...r, count: scaleCount(r.count, ratio) }));

  const rf = toInputDate(startOfLocalDay(rangeFrom));
  const rt = toInputDate(startOfLocalDay(rangeTo));
  let cancellationFlightsAdjusted: MonthData['cancellationFlights'] = m.cancellationFlights;
  let cancellationCountAdjusted =
    m.cancellationCount !== undefined ? scaleCount(m.cancellationCount, ratio) : undefined;
  if (m.cancellationFlights?.length) {
    cancellationFlightsAdjusted = m.cancellationFlights.filter((row) => {
      const ymd = row.staDate?.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
      return ymd >= rf && ymd <= rt;
    });
    cancellationCountAdjusted = cancellationFlightsAdjusted.length;
  }

  return {
    ...m,
    totalFlights,
    cancellationCount: cancellationCountAdjusted,
    cancellationFlights: cancellationFlightsAdjusted,
    additionalFlights:
      m.additionalFlights !== undefined ? scaleCount(m.additionalFlights, ratio) : undefined,
    activeDaysSta: activeDaysScaled,
    avgFlightsPerActiveStaDay,
    staOnTimeCount,
    ataOnOrBeforeStaCount,
    ataStaDailyComparison,
    delayBreakdown,
    delayCategories: scaleCategories(m.delayCategories ?? []),
    topAirlines: scaleRowList(m.topAirlines ?? []),
    allAirlines: m.allAirlines?.length ? scaleRowList(m.allAirlines) : undefined,
    topDelayReasons: scaleReasons(m.topDelayReasons ?? []),
    delayDurationBuckets: scaleBuckets(m.delayDurationBuckets ?? []),
    groundTime,
    carrierVolume: m.carrierVolume ? scaleCarrierVolume(m.carrierVolume) : undefined,
    aircraftTypeVolume:
      m.aircraftTypeVolume?.length ? scaleAircraftTypes(m.aircraftTypeVolume) : undefined,
    didFlyCount: m.didFlyCount !== undefined ? scaleCount(m.didFlyCount, ratio) : undefined,
    nsFlightsCount: m.nsFlightsCount !== undefined ? scaleCount(m.nsFlightsCount, ratio) : undefined,
    onTimeAtaCount: m.onTimeAtaCount !== undefined ? scaleCount(m.onTimeAtaCount, ratio) : undefined,
    groundTimeSavedMinutes:
      m.groundTimeSavedMinutes !== undefined ? scaleCount(m.groundTimeSavedMinutes, ratio) : undefined,
    scheduledGroundMinutesTotal:
      m.scheduledGroundMinutesTotal !== undefined
        ? scaleCount(m.scheduledGroundMinutesTotal, ratio)
        : undefined,
    departedBeforeStdCount:
      m.departedBeforeStdCount !== undefined ? scaleCount(m.departedBeforeStdCount, ratio) : undefined,
    agtGtSgtCount: m.agtGtSgtCount !== undefined ? scaleCount(m.agtGtSgtCount, ratio) : undefined,
    staffUtilization: m.staffUtilization,
    airlineRemarksFromSheet: m.airlineRemarksFromSheet
      ? {
          remarkRowCount: scaleCount(m.airlineRemarksFromSheet.remarkRowCount, ratio),
          dateMin: m.airlineRemarksFromSheet.dateMin,
          dateMax: m.airlineRemarksFromSheet.dateMax,
        }
      : undefined,
  };
}

/** Subtitle + long description; shown only when hovering (or focusing) the corner icon. */
function DashboardTileInfoHover({
  icon,
  subtitle,
  description,
  compact,
}: {
  icon: ReactNode;
  subtitle: ReactNode;
  description: string;
  /** Smaller trigger (used with compact dashboard tiles). */
  compact?: boolean;
}) {
  const hoverCapable = useHoverCapable();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const touchPointer = useRef(false);
  const openedAt = useRef(0);
  const toggledOnPointerUp = useRef(false);
  const lastTouchToggleAt = useRef(0);

  const toggleFromTouch = () => {
    const now = Date.now();
    if (now - lastTouchToggleAt.current < 450) return;
    lastTouchToggleAt.current = now;
    touchPointer.current = true;
    toggledOnPointerUp.current = true;
    clearCloseTimer();
    openedAt.current = now;
    setOpen((current) => !current);
  };

  const clearCloseTimer = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const show = () => {
    if (touchPointer.current) return;
    clearCloseTimer();
    setOpen(true);
  };

  const scheduleHide = () => {
    if (touchPointer.current || !hoverCapable) return;
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  const panel = (
    <>
      <p className="text-sm font-medium text-[var(--dash-text)]">{subtitle}</p>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--dash-text-muted)]">{description}</p>
    </>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Show section information"
          aria-expanded={open}
          className={cn(
            'relative inline-flex shrink-0 cursor-help items-center justify-center rounded-lg border border-[var(--dash-warm)]/60 bg-[var(--dash-card)] text-[var(--dash-text-muted)] shadow-[0_8px_18px_-12px_rgba(255,184,8,0.75)] outline-none touch-manipulation',
            compact ? 'min-h-11 min-w-11 p-1 [&_svg]:h-3 [&_svg]:w-3' : 'min-h-11 min-w-11 p-2',
            'transition-colors',
            DASH_CARD_INTERACTION_DURATION,
            DASH_CARD_INTERACTION_EASE,
            DASH_CARD_HOVER_IN_DELAY,
            'hover:border-[var(--dash-warm)]/90 hover:text-[var(--dash-text)]',
            'focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-card)]'
          )}
          onPointerDown={(event) => {
            event.stopPropagation();
            touchPointer.current = event.pointerType === 'touch';
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            if (event.pointerType !== 'touch') return;
            toggleFromTouch();
          }}
          onTouchEnd={(event) => {
            event.stopPropagation();
            event.preventDefault();
            toggleFromTouch();
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (toggledOnPointerUp.current) {
              toggledOnPointerUp.current = false;
              event.preventDefault();
              return;
            }
            if (touchPointer.current || !hoverCapable) {
              event.preventDefault();
              clearCloseTimer();
              openedAt.current = Date.now();
              setOpen((current) => !current);
            }
          }}
          onMouseEnter={hoverCapable ? show : undefined}
          onMouseLeave={hoverCapable ? scheduleHide : undefined}
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          if (Date.now() - openedAt.current < 500) event.preventDefault();
        }}
        onClick={(event) => event.stopPropagation()}
        onMouseEnter={hoverCapable ? show : undefined}
        onMouseLeave={hoverCapable ? scheduleHide : undefined}
        className="z-[200] w-[min(17rem,calc(100vw-2rem))] border-[var(--dash-border-subtle)] bg-[var(--dash-card)] p-3 text-left text-[var(--dash-text)] shadow-xl"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

/** Calm ease-out for theme flips (avoids harsh linear + full-page jitter). */
const THEME_FLIP_EASE: [number, number, number, number] = [0.33, 1, 0.68, 1];

/** One full Y spin per theme toggle (alternating 0° ↔ −360°); isolated layer, no child remount (remount caused layout flicker). */
function ThemeFlipCard({
  flipSeq,
  staggerIndex,
  reduceMotion,
  className,
  fillHeight = true,
  children,
}: {
  flipSeq: number;
  staggerIndex: number;
  reduceMotion: boolean;
  className?: string;
  /** When false, card height follows content (dashboard analytics tiles). */
  fillHeight?: boolean;
  children: ReactNode;
}) {
  const hoverCapable = useHoverCapable();
  const targetY = reduceMotion ? 0 : (flipSeq % 2) * -360;
  const hoverLift =
    reduceMotion || !hoverCapable
      ? undefined
      : {
          y: -6,
        };
  const tapPress =
    reduceMotion || !hoverCapable
      ? undefined
      : {
          y: -2,
        };
  return (
    <motion.div
      className={cn('isolate min-h-0 w-full [perspective:2200px]', className)}
      style={{ perspective: 2200 }}
      whileHover={hoverLift}
      whileTap={tapPress}
      transition={{ type: 'spring', stiffness: 280, damping: 24, mass: 0.7 }}
    >
      <motion.div
        className={cn(
          /* Omit backface-visibility:hidden — it can hide table text/CountUp under preserve-3d in some GPUs. */
          'min-h-0 w-full origin-center transform-gpu',
          fillHeight ? 'h-full' : 'h-auto'
        )}
        initial={false}
        animate={{ rotateY: targetY }}
        transition={{
          duration: reduceMotion ? 0 : THEME_FLIP_DURATION_SEC,
          ease: reduceMotion ? DASH_CARD_MOTION_EASE : THEME_FLIP_EASE,
          delay: reduceMotion ? 0 : staggerIndex * THEME_FLIP_STAGGER_SEC,
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** 3D flip toward viewer (rotateY) for chart areas inside dashboard modals. */
function FlipOpenChart({
  animationKey,
  className,
  children,
}: {
  animationKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const instantOpen = useDashboardModalInstantOpen();
  if (instantOpen) {
    return <div className={cn('h-full w-full', className)}>{children}</div>;
  }
  return (
    <div
      className={cn('w-full overflow-visible [perspective:1600px]', className)}
      style={{ perspective: 1600 }}
    >
      <motion.div
        key={animationKey}
        initial={{ rotateY: -88, rotateX: 0, opacity: 0, scale: 0.94 }}
        animate={{ rotateY: 0, rotateX: 0, opacity: 1, scale: 1 }}
        transition={{ duration: DASH_CARD_MOTION_DURATION_SEC, ease: DASH_CARD_MOTION_EASE }}
        className="h-full w-full origin-center will-change-transform [transform-style:preserve-3d] [backface-visibility:hidden]"
      >
        <div className="h-full w-full">{children}</div>
      </motion.div>
    </div>
  );
}

function otpMatrixCellValueForTotals(matrix: number[][] | null | undefined, rowIdx: number, colIdx: number): number {
  const n = matrix?.[rowIdx]?.[colIdx];
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

/** Matrix column index for `>GT & >STD`. */
const OTP_MATRIX_GT_STD_COL_INDEX = 3;

/**
 * OTP headline numerator: columns 0–2 only (entire `>GT & >STD` column is red and excluded).
 */
function otpMatrixGreenSumForOtpPct(matrix: number[][] | null | undefined): number {
  let s = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      s += otpMatrixCellValueForTotals(matrix, r, c);
    }
  }
  return s;
}

function otpMatrixGrandTotal(matrix: number[][] | null | undefined): number {
  let g = 0;
  if (!matrix?.length) return 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      g += otpMatrixCellValueForTotals(matrix, r, c);
    }
  }
  return g;
}

/** Em dash for zero counts in OTP matrix (aligned with dashboard count styling). */
function otpMatrixCountDisplay(n: number, hasMatrix: boolean): string {
  if (!hasMatrix) return '\u2014';
  if (n === 0) return '\u2014';
  return n.toLocaleString();
}

/** On-time performance: matrix from `fhr_collection`-backed legs; header `title`s document GT/SGT/AGT. */
function OtpGtStdMatrixTable({
  dashDark,
  compact,
  matrix,
  dashboardCard,
}: {
  dashDark: boolean;
  compact?: boolean;
  matrix: number[][] | null | undefined;
  /** Dashboard OTP tile: fixed column widths so the matrix does not squash in a half-width card. */
  dashboardCard?: boolean;
}) {
  const rowLabels = ['Before STA', 'On Time', 'After STA'] as const;
  const dashboardCompact = Boolean(compact && dashboardCard);

  const headerLabelClass = dashboardCompact
    ? 'text-[11px] font-bold leading-tight tracking-wide'
    : compact
      ? 'text-[15px] font-bold leading-none tracking-wide whitespace-nowrap'
      : 'text-[18px] font-bold leading-none tracking-wide whitespace-nowrap';
  /** Two short lines so headers never overlap in a narrow (1/3 width) card. */
  const headerStackClass = dashboardCompact
    ? 'flex flex-col items-center justify-center gap-0 text-center text-[10px] font-bold leading-[1.15] tracking-wide'
    : compact
      ? 'flex flex-col items-center justify-center gap-0 text-center text-[14px] font-bold leading-tight tracking-wide sm:text-[17px]'
      : 'flex flex-col items-center justify-center gap-0 text-center text-[15px] font-bold leading-tight tracking-wide sm:text-[18px]';

  const valueCellClass = dashboardCompact
    ? cn('text-[12px]', 'font-semibold tabular-nums leading-none')
    : compact
      ? cn(DASH_CARD_VALUE_TEXT, 'font-semibold tabular-nums leading-none')
      : 'text-[17px] font-semibold tabular-nums';

  /** GT columns: compare actual ground AGT (= ATD−ATA) vs scheduled ground SGT (= STD−STA). */
  const otpMatrixColumns: { key: string; title: string; heading: ReactNode }[] = [
    {
      key: 'lt-gt',
      title:
        '<GT bucket: AGT < SGT, where AGT = (ATD date+time − ATA date+time), SGT = (STD − STA) scheduled ground duration.',
      heading: <span className={headerLabelClass}>{'<'}GT</span>,
    },
    {
      key: 'eq-gt',
      title:
        '=GT bucket: AGT === SGT in ms — AGT = ATD−ATA; SGT = STD−STA on full date+time. Before STA: ATA < STA. On time: ATA === STA and ATD === STD. After STA: ATA > STA.',
      heading: <span className={headerLabelClass}>{'=GT'}</span>,
    },
    {
      key: 'gt-eq-sta',
      title:
        '>GT & <=STD bucket (Before STA): ATA < STA and AGT > SGT and ATD <= STD using full datetime milliseconds.',
      heading: dashboardCompact ? (
        <span className={headerStackClass} title=">GT & <=STD">
          <span>{'>'}GT</span>
          <span>
            {'<'}
            {'='}STD
          </span>
        </span>
      ) : (
        <span className={headerStackClass} title=">GT & <=STD">
          <span className="whitespace-nowrap">{'>'}GT & {'<='}STD</span>
        </span>
      ),
    },
    {
      key: 'gt-gt-sta',
      title:
        '>GT & >STD bucket: AGT > SGT and ATD > STD. Row split by ATA vs STA (Before/On Time/After) using full datetime milliseconds.',
      heading: dashboardCompact ? (
        <span className={headerStackClass} title=">GT & >STD">
          <span>{'>'}GT</span>
          <span>
            {'>'}STD
          </span>
        </span>
      ) : (
        <span className={headerStackClass} title=">GT & >STD">
          <span className="whitespace-nowrap">{'>'}GT & {'>'}STD</span>
        </span>
      ),
    },
  ];

  const { colTotals, rowTotals, grandTotal } = useMemo(() => {
    const colT = [0, 1, 2, 3].map((c) =>
      [0, 1, 2].reduce((s, r) => s + otpMatrixCellValueForTotals(matrix, r, c), 0)
    );
    const rowT = [0, 1, 2].map((r) =>
      [0, 1, 2, 3].reduce((s, c) => s + otpMatrixCellValueForTotals(matrix, r, c), 0)
    );
    return { colTotals: colT, rowTotals: rowT, grandTotal: colT.reduce((a, b) => a + b, 0) };
  }, [matrix]);

  const padCorner = dashboardCompact
    ? 'py-1 pl-1 pr-1'
    : compact
      ? 'py-1.5 pl-1.5 pr-1'
      : 'py-2 pl-2 pr-1.5';
  const padData = dashboardCompact ? 'px-0.5 py-1' : compact ? 'px-1 py-1.5' : 'px-1.5 py-2';
  const colGridLine = dashDark ? 'border-l border-white/25' : 'border-l border-[var(--dash-table-border)]';
  const rowAxisDivider = dashDark ? 'border-r border-white/25' : 'border-r border-[var(--dash-table-border)]';
  const theadBg = dashDark ? 'bg-emerald-950/90' : 'bg-[var(--dash-table-header)]';
  const rowLabelBg = dashDark ? 'bg-emerald-900/55' : 'bg-[var(--dash-kpi-strip-bg)]';
  const dataCellBgEven = dashDark ? 'bg-emerald-950/25' : 'bg-white';
  const dataCellBgOdd = dashDark ? 'bg-emerald-950/40' : 'bg-[var(--dash-chart-well)]/80';
  const neutralDataText = dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]';
  const greenMetricText = dashDark ? 'text-emerald-400' : 'text-emerald-700';
  const redMetricText = dashDark ? 'text-red-400' : 'text-red-600';

  const hasMatrix = matrix != null;

  return (
    <div
      className={cn(
        'relative w-full min-w-0 max-w-full rounded-lg border',
        compact ? 'mt-1' : 'mt-1.5',
        dashDark ? 'border-emerald-800/50 bg-emerald-950/90' : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/90',
        dashboardCompact ? 'flex min-h-0 flex-1 flex-col p-0.5' : compact ? 'p-0.5' : 'p-1.5'
      )}
    >
      <div
        className={cn(
          'min-w-0 max-w-full overscroll-x-contain [-webkit-overflow-scrolling:touch]',
          dashboardCompact
            ? cn(
                'min-h-0 flex-1 overflow-x-auto overflow-y-auto',
                SCROLL_AREA_NO_BAR,
              )
            : compact
              ? 'overflow-x-auto overflow-y-visible'
              : 'max-h-[min(60vh,28rem)] overflow-x-auto overflow-y-auto',
          (dashboardCompact || !compact) && SCROLL_AREA_NO_BAR
        )}
      >
        <table
          className={cn(
            'border-collapse text-left',
            dashboardCompact ? 'w-full min-w-0 max-w-full table-fixed' : 'w-max min-w-full'
          )}
        >
          <colgroup>
            {dashboardCompact ? (
              <>
                <col style={{ width: '28%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '18%' }} />
              </>
            ) : (
              <>
                <col style={{ minWidth: '6.5rem' }} />
                <col style={{ minWidth: '2.75rem' }} />
                <col style={{ minWidth: '2.5rem' }} />
                <col style={{ minWidth: '4.5rem' }} />
                <col style={{ minWidth: '4.5rem' }} />
                <col style={{ minWidth: '4rem' }} />
              </>
            )}
          </colgroup>
          <thead>
            <tr
              className={cn(
                theadBg,
                'border-b-2',
                dashboardCompact && 'isolate',
                dashDark ? 'border-white/25' : 'border-[var(--dash-table-border)]'
              )}
            >
              <th
                scope="col"
                className={cn(
                  padCorner,
                  theadBg,
                  !dashboardCompact && 'sticky top-0 z-20 shadow-sm',
                  rowAxisDivider,
                  'align-middle leading-snug',
                  dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]'
                )}
                title={
                  'Row labels compare actual arrival ATA to scheduled arrival STA using full ATA date+time vs STA date+time.'
                }
              >
                {dashboardCompact ? (
                  <span
                    className={cn(
                      headerStackClass,
                      dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]'
                    )}
                  >
                    <span>Flight</span>
                    <span>Arrived</span>
                  </span>
                ) : (
                  <span
                    className={cn(
                      'block',
                      headerLabelClass,
                      dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]'
                    )}
                  >
                    Flight Arrived
                  </span>
                )}
              </th>
              {otpMatrixColumns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    padData,
                    theadBg,
                    !dashboardCompact && 'sticky top-0 z-20 shadow-sm',
                    colGridLine,
                    'align-middle text-center',
                    (col.key === 'lt-gt' || col.key === 'eq-gt') && 'whitespace-nowrap tabular-nums',
                    (col.key === 'gt-eq-sta' || col.key === 'gt-gt-sta') && 'px-0.5',
                    dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]'
                  )}
                  title={col.title}
                >
                  {col.heading}
                </th>
              ))}
              <th
                scope="col"
                className={cn(
                  padData,
                  theadBg,
                  !dashboardCompact && 'sticky top-0 z-20 shadow-sm',
                  colGridLine,
                  'text-center',
                  !dashboardCompact && 'whitespace-nowrap',
                  dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]'
                )}
                title="Sum of cells in each row."
              >
                <span className={headerStackClass}>
                  <span className="whitespace-nowrap">Row</span>
                  <span className="whitespace-nowrap">Total</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label, rowIdx) => (
              <tr
                key={label}
                className={cn(
                  'border-t',
                  dashDark ? 'border-white/12' : 'border-[var(--dash-table-border)]'
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    padCorner,
                    rowAxisDivider,
                    rowLabelBg,
                    'text-left font-bold tracking-wide',
                    dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]',
                    compact ? (dashboardCompact ? 'text-[11px]' : 'text-[14px]') : 'text-[15px]'
                  )}
                  title={
                    label === 'Before STA'
                      ? 'ATA strictly before STA (full date+time). <GT: AGT < SGT. =GT: AGT === SGT. >GT & <=STD: AGT > SGT and ATD <= STD. >GT & >STD: AGT > SGT and ATD > STD.'
                      : label === 'On Time'
                        ? 'ATA equals STA (full date+time). <GT: AGT < SGT. =GT: ATD === STD and AGT === SGT. >GT & >STD: AGT > SGT and ATD > STD.'
                        : 'ATA after STA (full date+time). <GT: AGT < SGT. =GT: AGT === SGT. >GT & >STD: AGT > SGT and ATD > STD.'
                  }
                >
                  {label}
                </th>
                {([0, 1, 2, 3] as const).map((i) => {
                  const stripe = rowIdx % 2 === 0 ? dataCellBgEven : dataCellBgOdd;
                  const cellN = hasMatrix ? otpMatrixCellValueForTotals(matrix!, rowIdx, i) : 0;
                  const text = otpMatrixCountDisplay(cellN, hasMatrix);
                  const isRedGtStdCell = i === OTP_MATRIX_GT_STD_COL_INDEX;
                  const tbodyTextClass = isRedGtStdCell ? redMetricText : greenMetricText;
                  return (
                    <td
                      key={i}
                      className={cn(
                        padData,
                        colGridLine,
                        stripe,
                        'text-center align-middle',
                        valueCellClass,
                        tbodyTextClass
                      )}
                    >
                      {text}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    padData,
                    colGridLine,
                    rowIdx % 2 === 0 ? dataCellBgEven : dataCellBgOdd,
                    'text-center align-middle',
                    valueCellClass,
                    neutralDataText
                  )}
                >
                  {otpMatrixCountDisplay(rowTotals[rowIdx] ?? 0, hasMatrix)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr
              className={cn(
                'border-t-2',
                dashDark ? 'border-white/25' : 'border-[var(--dash-table-border)]'
              )}
            >
              <th
                scope="row"
                className={cn(
                  padCorner,
                  rowAxisDivider,
                  rowLabelBg,
                  'text-left font-bold tracking-wide',
                  compact ? (dashboardCompact ? 'text-[11px]' : 'text-[14px]') : 'text-[15px]',
                  neutralDataText
                )}
              >
                Total
              </th>
              {([0, 1, 2, 3] as const).map((i) => (
                <td
                  key={i}
                  className={cn(
                    padData,
                    colGridLine,
                    dataCellBgEven,
                    'text-center align-middle',
                    valueCellClass,
                    neutralDataText
                  )}
                >
                  {otpMatrixCountDisplay(colTotals[i] ?? 0, hasMatrix)}
                </td>
              ))}
              <td
                className={cn(
                  padData,
                  colGridLine,
                  dataCellBgEven,
                  'text-center align-middle',
                  valueCellClass,
                  neutralDataText
                )}
              >
                {otpMatrixCountDisplay(grandTotal, hasMatrix)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** True when the performance report tile shows a single March 2026 column (Bird JSON `label`). */
function isPerformanceReportMarch2026Heading(heading: string): boolean {
  return heading.trim() === 'March 2026';
}

const PERFORMANCE_REPORT_NO_DATA_MSG =
  'Performance report loads from the database for the selected date range. Wait for the fetch or adjust the range.';

/** Hyphen when DB report is not ready — not a computed zero. */
function PerformanceReportMissingDataMark() {
  return (
    <ShadcnTooltip>
      <TooltipTrigger
        asChild
        className="inline-flex max-w-full cursor-default justify-center"
      >
        <span className="border-b border-dotted border-[var(--dash-text-muted)]/50 text-[var(--dash-text-muted)] tabular-nums">
          {DASH_DB_PLACEHOLDER}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="max-w-[16rem] text-left text-sm leading-snug"
      >
        {PERFORMANCE_REPORT_NO_DATA_MSG}
      </TooltipContent>
    </ShadcnTooltip>
  );
}

/** Station GHA delay codes table — shared by the dashboard tile and the GHA improvement modal. */
function GhaRelatedDelayCodesSnippet({
  dashDark,
  codes,
  className,
}: {
  dashDark: boolean;
  codes: { code: string | number; count: number }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative z-[11] overflow-auto rounded-lg border',
        dashDark ? 'border-emerald-700/45 bg-emerald-950/95' : 'border-[var(--dash-border)] bg-[var(--dash-card)]',
        'p-1',
        SCROLL_AREA_NO_BAR,
        className
      )}
    >
      <p
        className={cn(
          'font-bold uppercase tracking-wide',
          dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]',
          'text-[12px]'
        )}
      >
        delay codes
      </p>
      <table className={cn('mt-1 w-full table-fixed border-collapse text-left', DASH_CARD_VALUE_TEXT)}>
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-8" />
        </colgroup>
        <thead>
          <tr
            className={cn(
              'border-b',
              dashDark ? 'border-white/15 bg-white/5' : 'border-[var(--dash-table-border)] bg-[var(--dash-table-header)]'
            )}
          >
            <th className={cn('px-0.5 py-0.5 font-semibold text-[12px] text-[var(--dash-text-strong)]')}>Code</th>
            <th className={cn('min-w-0 px-0.5 py-0.5 font-semibold text-[12px] text-[var(--dash-text-strong)]')}>
              Description
            </th>
            <th className={cn('px-0.5 py-0.5 text-right font-semibold text-[12px] text-[var(--dash-text-strong)]')}>
              Flt
            </th>
          </tr>
        </thead>
        <tbody>
          {codes.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className={cn(
                  'border-t px-1 py-1.5 text-center text-[11px] leading-snug text-[var(--dash-text-muted)]',
                  dashDark ? 'border-white/10' : 'border-[var(--dash-table-border)]'
                )}
              >
                No GHA codes in range.
              </td>
            </tr>
          ) : (
            codes.map((row) => (
              <tr
                key={String(row.code)}
                className={cn('border-t', dashDark ? 'border-white/10' : 'border-[var(--dash-table-border)]')}
              >
                <td className={cn('px-0.5 py-0.5 align-top tabular-nums font-bold text-[var(--dash-text-strong)]', DASH_CARD_VALUE_TEXT)}>
                  {row.code}
                </td>
                <td
                  className={cn(
                    'min-w-0 px-0.5 py-0.5 align-top leading-snug text-[var(--dash-text)] [overflow-wrap:anywhere]',
                    DASH_CARD_VALUE_TEXT
                  )}
                  title={getDelayReasonLabel(String(row.code))}
                >
                  {getDelayReasonLabel(String(row.code))}
                </td>
                <td className={cn('px-0.5 py-0.5 align-top text-right tabular-nums font-semibold', dashCardMetricValueClass(dashDark), DASH_CARD_VALUE_TEXT)}>
                  {row.count.toLocaleString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Performance report table — counts and % from `data` (Mongo legs only). */
function PerformanceReportTable({
  dashDark,
  compact,
  monthHeading,
  data,
  reportLoading,
  reportRangeReady,
  drilldown,
  onOpenOnTimeDetail,
  onOpenGhaImprovementDetail,
  onOpenPerformanceDrill,
  drilldownLoading = false,
  drilldownError = null,
  className,
  omitGhaImprovementRow,
  dashboardCard,
}: {
  dashDark: boolean;
  compact?: boolean;
  monthHeading: string;
  data: PerformanceReportSnapshot | null;
  reportLoading: boolean;
  reportRangeReady: boolean;
  drilldown: DashboardPerformanceDrilldownPayload | null;
  /** Opens a separate on-screen card for row 1 (on-time flights + OTP matrix). */
  onOpenOnTimeDetail?: () => void;
  /** Opens the GHA improvement dialog (chart + flights + delay codes) instead of flipping this table. */
  onOpenGhaImprovementDetail?: () => void;
  /**
   * When set (e.g. dashboard tile), drillable counts open a dialog instead of flipping inside the card.
   */
  onOpenPerformanceDrill?: (drillKey: string) => void;
  /** Lazy drill payload: rows stay clickable from summary counts while this loads. */
  drilldownLoading?: boolean;
  /** Failed drill fetch — surfaced instead of silent empty states. */
  drilldownError?: string | null;
  className?: string;
  /** Hide row 4 when it is shown as a standalone card in the main column. */
  omitGhaImprovementRow?: boolean;
  /** Embedded on dashboard: size to visible rows, no arbitrary max-height scroll. */
  dashboardCard?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const useExternalDrill = Boolean(onOpenPerformanceDrill);

  const padCorner = compact ? 'py-1.5 pl-1.5 pr-1' : 'py-2 pl-2 pr-1.5';
  const padData = compact ? 'px-1.5 py-1.5' : 'px-2 py-2';

  const miss = !reportRangeReady || reportLoading || data == null;
  const onTimeN = data?.onTimeCount ?? 0;
  const cancelled = data?.cancelledCount ?? 0;
  const offSkdCount = data?.offSkdCount ?? 0;
  /** Denominator matches the total row (on-time + off-SKD + cancelled), same as June 2 Bird report. */
  const classifiedTotal = onTimeN + cancelled + offSkdCount;
  const may =
    classifiedTotal > 0 ? classifiedTotal : (data?.totalFlights ?? 0);
  const aCount = data?.aCount ?? 0;
  const beforeStdN = data?.bCount ?? 0;
  const agtGtN = data?.cCount ?? 0;
  const ghaN = data?.ghaImprovement ?? 0;

  const onTimePct = pct(onTimeN, may);
  const cancelledPct = pct(cancelled, may);
  const offSkdPct = pct(offSkdCount, may);
  const aCountPct = pct(aCount, may);
  const beforePct = pct(beforeStdN, may);
  const gtAddedRate = pct(agtGtN, may);
  const ghaPct = pct(ghaN, may);

  const mar26Col = isPerformanceReportMarch2026Heading(monthHeading);
  const marchGreenData =
    dashDark
      ? 'text-emerald-400 [&_span]:text-emerald-400 [&_span]:border-emerald-400/40'
      : 'text-emerald-700 [&_span]:text-emerald-700 [&_span]:border-emerald-600/35';
  const marchRedData =
    dashDark
      ? 'text-red-400 [&_span]:text-red-400 [&_span]:border-red-400/50 [&_button]:text-red-400'
      : 'text-red-600 [&_span]:text-red-600 [&_span]:border-red-600/50 [&_button]:text-red-600';

  const ghaRowText = marchRedData;

  const zeroValidFlights = !miss && may > 0 && offSkdCount === 0;
  const zeroV = zeroValidFlights;

  const offSkdValue =
    miss ? (
      <PerformanceReportMissingDataMark />
    ) : zeroV ? (
      <DashCountInt end={0} />
    ) : (
      <DashCountInt end={offSkdCount} />
    );
  const offSkdPctNode = miss ? (
    <PerformanceReportMissingDataMark />
  ) : zeroV ? (
    <DashCountPct end={pct(0, may)} />
  ) : (
    <DashCountPct end={offSkdPct} />
  );
  const aValue = miss ? <PerformanceReportMissingDataMark /> : <DashCountInt end={aCount} />;
  const aPctNode = miss ? <PerformanceReportMissingDataMark /> : <DashCountPct end={aCountPct} />;
  const bValue = miss ? <PerformanceReportMissingDataMark /> : <DashCountInt end={beforeStdN} />;
  const bPctNode = miss ? <PerformanceReportMissingDataMark /> : <DashCountPct end={beforePct} />;
  const cValue = miss ? <PerformanceReportMissingDataMark /> : <DashCountInt end={agtGtN} />;
  const cPctNode = miss ? <PerformanceReportMissingDataMark /> : <DashCountPct end={gtAddedRate} />;
  const ghaValue = miss ? (
    <PerformanceReportMissingDataMark />
  ) : ghaN === 0 ? (
    <span className="tabular-nums">0</span>
  ) : (
    <DashCountInt end={ghaN} />
  );
  const ghaPctNode = miss ? (
    <PerformanceReportMissingDataMark />
  ) : ghaPct === 0 ? (
    <span className="tabular-nums">0%</span>
  ) : (
    <DashCountPct end={ghaPct} />
  );

  const onTimeValueNode = miss ? <PerformanceReportMissingDataMark /> : <DashCountInt end={onTimeN} />;
  const onTimePctNode = miss ? <PerformanceReportMissingDataMark /> : <DashCountPct end={onTimePct} />;
  const cancelledValueNode = miss ? <PerformanceReportMissingDataMark /> : <DashCountInt end={cancelled} />;
  const cancelledPctNode = miss ? <PerformanceReportMissingDataMark /> : <DashCountPct end={cancelledPct} />;
  const totalClassified = classifiedTotal;

  const timingDrillCount = (key: string): number =>
    drilldown ? performanceFlightsForReportDrillKey(key, drilldown).length : 0;

  const canDrillRow = (key: string): boolean => {
    if (miss) return false;
    if (key === 'total-classified') return false;

    if (key === 'gha-improvement' && onOpenGhaImprovementDetail != null) {
      return ghaN > 0;
    }

    if (key === 'on-time' && onOpenOnTimeDetail != null) {
      return onTimeN > 0;
    }

    if (key === 'cancelled') {
      if (cancelled <= 0) return false;
      if (useExternalDrill) return true;
      return timingDrillCount('cancelled') > 0;
    }

    if (useExternalDrill && onOpenPerformanceDrill) {
      switch (key) {
        case 'on-time':
          return onTimeN > 0;
        case 'off-skd':
          return !zeroV && offSkdCount > 0;
        case 'gt-saved':
          return aCount > 0;
        case 'before-std':
          return beforeStdN > 0;
        case 'agt-sgt':
          return agtGtN > 0;
        default:
          break;
      }
    }

    if (!drilldown) return false;
    return timingDrillCount(key) > 0;
  };

  const openRowDrill = (key: string) => {
    if (onOpenPerformanceDrill) {
      if (key === 'on-time' && onOpenOnTimeDetail) {
        onOpenOnTimeDetail();
        return;
      }
      if (key === 'gha-improvement' && onOpenGhaImprovementDetail) {
        onOpenGhaImprovementDetail();
        return;
      }
      onOpenPerformanceDrill(key);
      return;
    }
    if (key === 'on-time' && onOpenOnTimeDetail) {
      onOpenOnTimeDetail();
      return;
    }
    if (key === 'gha-improvement' && onOpenGhaImprovementDetail) {
      onOpenGhaImprovementDetail();
      return;
    }
    setDrillKey(key);
  };

  const rows: {
    key: string;
    label: string;
    indent?: boolean;
    value: ReactNode;
    pctNode: ReactNode;
  }[] = [
    {
      key: 'on-time',
      label: '1. Flight Operated on time',
      value: onTimeValueNode,
      pctNode: onTimePctNode,
    },
    {
      key: 'off-skd',
      label: '2. Flight Operated Off-SKD',
      value: offSkdValue,
      pctNode: offSkdPctNode,
    },
    {
      key: 'gt-saved',
      label: 'a. Ground time saved',
      indent: true,
      value: aValue,
      pctNode: aPctNode,
    },
    {
      key: 'before-std',
      label: 'b. Departed on or before STD',
      indent: true,
      value: bValue,
      pctNode: bPctNode,
    },
    {
      key: 'agt-sgt',
      label: 'c. AGT > SGT (NON-GHA)',
      indent: true,
      value: cValue,
      pctNode: cPctNode,
    },
    {
      key: 'gha-improvement',
      label: 'd. Improvement for GHA',
      indent: true,
      value: ghaValue,
      pctNode: ghaPctNode,
    },
    {
      key: 'cancelled',
      label: '3. Cancelled Flight',
      value: cancelledValueNode,
      pctNode: cancelledPctNode,
    },
    {
      key: 'total-classified',
      label: 'Total Flights',
      value: <DashCountInt end={totalClassified} />,
      pctNode: <span className="tabular-nums">100%</span>,
    },
  ].filter((row) => !(omitGhaImprovementRow && row.key === 'gha-improvement'));

  const drillTitle = drillKey ? performanceReportDrillTitle(drillKey) : '';

  const drillListFlights =
    drilldown && drillKey ? performanceFlightsForReportDrillKey(drillKey, drilldown) : [];
  const showDrillBack = !useExternalDrill && drillKey != null;

  const flipDuration = reduceMotion ? 0 : 0.55;

  const dashboardEmbedded = Boolean(compact && dashboardCard);

  const tableFace = (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col',
        dashboardEmbedded || compact ? 'shrink-0' : 'flex-1',
        showDrillBack && !reduceMotion && 'pointer-events-none'
      )}
      style={!reduceMotion ? { backfaceVisibility: 'hidden' } : undefined}
    >
      <div
        className={cn(
          'min-h-0 min-w-0 overscroll-x-contain [-webkit-overflow-scrolling:touch]',
          dashboardEmbedded
            ? cn(
                'max-h-[min(50vh,24rem)] max-w-full overflow-auto overscroll-contain [touch-action:pan-x_pan-y_pinch-zoom] [-webkit-overflow-scrolling:touch]',
                SCROLL_AREA_NO_BAR,
              )
            : 'overflow-auto',
          !dashboardEmbedded && (compact ? 'shrink-0' : 'max-h-full flex-1'),
          !dashboardEmbedded && SCROLL_AREA_NO_BAR
        )}
      >
        <table className="w-max min-w-[42rem] border-collapse text-left">
          <colgroup>
            <col />
            <col style={{ width: '8.5rem' }} />
            <col style={{ width: '7rem' }} />
          </colgroup>
          <thead>
            <tr
              className={cn(
                'border-b',
                dashDark ? 'border-white/20' : 'border-[var(--dash-table-border)]'
              )}
            >
              <th
                scope="col"
                className={cn(
                  padCorner,
                  'align-middle font-bold uppercase leading-none tracking-wide whitespace-nowrap',
                  dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD,
                  dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]',
                  compact ? 'text-[15px]' : 'text-[16px]'
                )}
              >
                {dashboardEmbedded ? 'Metric' : 'Performance report'}
              </th>
              <th
                scope="col"
                className={cn(
                  padData,
                  'align-middle text-center font-bold uppercase leading-snug tracking-wide',
                  dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD,
                  dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]',
                  compact ? 'text-[15px]' : 'text-[16px]'
                )}
              >
                {monthHeading}
              </th>
              <th
                scope="col"
                className={cn(
                  padData,
                  'align-middle text-center font-bold uppercase tracking-wide',
                  dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD,
                  dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]',
                  compact ? 'text-[15px]' : 'text-[16px]'
                )}
              >
                Percentage
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isTotalRow = row.key === 'total-classified';
              const neutralLabel = dashDark ? 'text-white/90' : 'text-[var(--dash-text)]';
              const neutralData = dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]';

              let thTextClass = neutralLabel;
              let tdToneClass = neutralData;

              const agtSgtValueTone = dashDark
                ? 'text-emerald-400 [&_span]:text-emerald-400 [&_button]:text-emerald-400'
                : 'text-emerald-600 [&_span]:text-emerald-600 [&_button]:text-emerald-600';

              if (!isTotalRow && row.key === 'agt-sgt') {
                thTextClass = neutralLabel;
                tdToneClass = agtSgtValueTone;
              } else if (!isTotalRow && row.key === 'gha-improvement') {
                thTextClass = ghaRowText;
                tdToneClass = ghaRowText;
              } else if (!isTotalRow && mar26Col) {
                if (['on-time', 'off-skd', 'gt-saved', 'before-std'].includes(row.key)) {
                  tdToneClass = marchGreenData;
                }
              }

              const labelNode =
                mar26Col && row.key === 'agt-sgt' ? (
                  <span className={neutralLabel}>
                    c. AGT {'>'} SGT (NON-GHA)
                  </span>
                ) : (
                  row.label
                );
              const labelInner = labelNode;
              const metricDrillable = canDrillRow(row.key);

              return (
                <tr
                  key={row.key}
                  className={cn(
                    'border-t',
                    dashDark ? 'border-white/12' : 'border-[var(--dash-table-border)]',
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      padCorner,
                      'whitespace-nowrap text-left font-medium leading-none',
                      row.indent ? (compact ? 'pl-5' : 'pl-6') : '',
                      !metricDrillable && (mar26Col && row.key === 'agt-sgt' ? undefined : thTextClass),
                      !metricDrillable && (compact ? DASH_CARD_VALUE_TEXT : 'text-base'),
                    )}
                  >
                    {metricDrillable ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openRowDrill(row.key);
                        }}
                        className={cn(
                          'pointer-events-auto inline-block w-max max-w-full min-w-0 text-left font-medium leading-none',
                          'm-0 cursor-pointer border-0 bg-transparent px-0 pb-px pt-0 font-inherit',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 focus-visible:ring-offset-1 rounded-sm',
                          dashDark ? 'focus-visible:ring-offset-emerald-950' : 'focus-visible:ring-offset-[var(--dash-card)]',
                          mar26Col && ['on-time', 'off-skd', 'gt-saved', 'before-std'].includes(row.key)
                            ? marchGreenData
                            : mar26Col && row.key === 'agt-sgt'
                              ? undefined
                              : thTextClass,
                          compact ? DASH_CARD_VALUE_TEXT : 'text-base',
                        )}
                      >
                        <span className={prMetricRowUnderline.metricLabelUnderline}>{labelInner}</span>
                      </button>
                    ) : (
                      <span className={prMetricRowUnderline.metricLabelUnderline}>{labelInner}</span>
                    )}
                  </th>
                  <td
                    className={cn(
                      padData,
                      'text-center align-middle font-semibold tabular-nums',
                      compact ? DASH_CARD_VALUE_TEXT : 'text-base',
                      tdToneClass,
                    )}
                  >
                    {row.value}
                  </td>
                  <td
                    className={cn(
                      padData,
                      'text-center align-middle font-semibold tabular-nums',
                      compact ? DASH_CARD_VALUE_TEXT : 'text-base',
                      tdToneClass,
                    )}
                  >
                    {row.pctNode}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {reportLoading && reportRangeReady ? (
        <p
          className={cn(
            'shrink-0 px-0.5 pt-1.5 text-center text-[13px] leading-snug',
            'text-[var(--dash-text-muted)]',
            compact && 'pt-1 text-[12px]'
          )}
        >
          Loading flight data from database…
        </p>
      ) : null}
      {zeroValidFlights ? (
        <p
          className={cn(
            'shrink-0 px-0.5 pt-1.5 text-center text-[13px] leading-snug',
            'text-[var(--dash-text-muted)]',
            compact && 'pt-1 text-[12px]'
          )}
        >
          No valid flight records with complete timestamps
        </p>
      ) : null}
      {useExternalDrill && drilldownLoading ? (
        <p
          className={cn(
            'shrink-0 px-0.5 pt-1 text-center text-[12px] leading-snug text-[var(--dash-text-muted)]',
            compact && 'pt-0.5 text-[11px]',
          )}
        >
          Loading flight-level drill-down…
        </p>
      ) : null}
    </div>
  );

  const drillFace =
    drillKey != null && drilldown ? (
    <div
      className={cn(
        'flex min-h-0 flex-col rounded-lg',
        reduceMotion ? 'relative min-h-[12rem] flex-1' : 'absolute inset-0',
        compact ? 'p-1' : 'p-1.5',
        dashDark ? 'bg-emerald-950/90' : 'bg-[var(--dash-card)]/90'
      )}
      style={!reduceMotion ? { backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' } : undefined}
    >
      <button
        type="button"
        onClick={() => setDrillKey(null)}
        className={cn(
          'mb-1 inline-flex shrink-0 items-center gap-0.5 rounded-md font-medium transition-colors',
          compact ? 'py-0.5 text-[13px]' : 'py-1 text-sm',
          dashDark ? 'text-amber-400 hover:text-amber-300' : 'text-[var(--dash-warm-caption)] hover:opacity-90'
        )}
      >
        <ChevronLeft className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
        Back
      </button>
      <div className="min-h-0 shrink-0 border-b border-[var(--dash-table-border)] pb-1 dark:border-white/15">
        <p
          className={cn(
            'font-semibold leading-tight',
            dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]',
            compact ? 'text-[14px]' : 'text-base'
          )}
        >
          {drillTitle}
        </p>
        <p className={cn('mt-0.5 text-[var(--dash-text-muted)]', compact ? 'text-[12px]' : 'text-[13px]')}>
          {performanceReportDrillMetaLine(drillKey, drillListFlights.length, cancelled)}
        </p>
      </div>
      <div className="mt-1 min-h-0 flex-1">
        <PerformanceReportDrillFlightTable
          drillKey={drillKey}
          flights={drillListFlights}
          dashDark={dashDark}
          compact={compact}
        />
      </div>
    </div>
  ) : null;

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          'relative flex flex-col',
          dashboardEmbedded ? 'h-auto shrink-0' : compact ? 'mt-0 shrink-0' : 'mt-1.5 min-h-0 flex-1',
          !dashboardEmbedded && 'rounded-lg border',
          !dashboardEmbedded &&
            (dashDark ? 'border-emerald-800/50 bg-emerald-950/90' : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/90'),
          compact ? (dashboardEmbedded ? 'p-0' : 'p-1') : 'p-1.5',
          className
        )}
        style={!reduceMotion && !useExternalDrill ? { perspective: '1200px' } : undefined}
      >
        {dashboardEmbedded ? (
          <p
            className={cn(
              'mb-1 shrink-0 px-0.5 font-bold uppercase tracking-wide',
              dashDark ? 'text-emerald-400' : 'text-[var(--dash-text-muted)]',
              compact ? 'text-[14px]' : 'text-base'
            )}
          >
            Performance report
          </p>
        ) : null}
        <div
          className={cn(
            dashboardEmbedded && 'rounded-lg border',
            dashboardEmbedded &&
              (dashDark
                ? 'border-white/10 bg-white/[0.04] backdrop-blur-[2px]'
                : 'border-slate-200/70 bg-white/45 backdrop-blur-[2px]'),
            dashboardEmbedded && (compact ? 'p-1' : 'p-1.5')
          )}
        >
        {useExternalDrill ? (
          <div className={cn('relative', dashboardEmbedded ? 'shrink-0' : 'min-h-0 flex-1')}>{tableFace}</div>
        ) : reduceMotion ? (
          showDrillBack ? (
            drillFace
          ) : (
            <div className={cn('relative', dashboardEmbedded ? 'shrink-0' : 'min-h-0 flex-1')}>{tableFace}</div>
          )
        ) : (
          <motion.div
            className={cn(
              'relative min-w-0',
              dashboardEmbedded || compact ? 'h-auto min-h-0 shrink-0' : 'min-h-[12rem] flex-1',
            )}
            style={{ transformStyle: 'preserve-3d' }}
            initial={false}
            animate={{ rotateY: showDrillBack ? 180 : 0 }}
            transition={{ duration: flipDuration, ease: [0.4, 0, 0.2, 1] }}
          >
            {tableFace}
            {drillFace}
          </motion.div>
        )}
        </div>
      </div>
    </TooltipProvider>
  );
}


type EquipmentUtilChartCategory = 'motorised' | 'nonMotorised' | 'towable';

const EQUIP_UTIL_CATEGORY_OPTIONS: { id: EquipmentUtilChartCategory; label: string }[] = [
  { id: 'motorised', label: 'Motorised' },
  { id: 'nonMotorised', label: 'Non-motorised' },
  { id: 'towable', label: 'Towable' },
];

const EQUIP_UTIL_CHART_COLORS = {
  motorised: '#047857',
  nonMotorised: '#10b981',
  towable: '#6ee7b7',
} as const;

function equipmentUtilCategoryChartMeta(category: EquipmentUtilChartCategory) {
  switch (category) {
    case 'motorised':
      return {
        label: 'Motorised',
        color: EQUIP_UTIL_CHART_COLORS.motorised,
        countOf: (slot: EquipmentDashboardUtilPayload['slots'][number]) => slot.motorisedCount,
        pctOf: (slot: EquipmentDashboardUtilPayload['slots'][number]) => slot.motorisedPct,
      };
    case 'nonMotorised':
      return {
        label: 'Non-motorised',
        color: EQUIP_UTIL_CHART_COLORS.nonMotorised,
        countOf: (slot: EquipmentDashboardUtilPayload['slots'][number]) => slot.nonMotorisedCount,
        pctOf: (slot: EquipmentDashboardUtilPayload['slots'][number]) => slot.nonMotorisedPct,
      };
    case 'towable':
      return {
        label: 'Towable',
        color: EQUIP_UTIL_CHART_COLORS.towable,
        countOf: (slot: EquipmentDashboardUtilPayload['slots'][number]) => slot.towableCount,
        pctOf: (slot: EquipmentDashboardUtilPayload['slots'][number]) => slot.towablePct,
      };
  }
}

/** 6-hour bands (4 slabs) shown by the Equipment utilization table. Anchored at 22:00. */
const EQUIP_UTIL_BAND_LABELS_6H = [
  '22:00 - 04:00',
  '04:00 - 10:00',
  '10:00 - 16:00',
  '16:00 - 22:00',
] as const;

/** 4-hour bands (6 slabs). Anchored at 22:00 to align with the 6h bands' night-start. */
const EQUIP_UTIL_BAND_LABELS_4H = [
  '22:00 - 02:00',
  '02:00 - 06:00',
  '06:00 - 10:00',
  '10:00 - 14:00',
  '14:00 - 18:00',
  '18:00 - 22:00',
] as const;

function equipmentUtilBandLabels(mode: EquipmentUtilSlotMode): readonly string[] {
  return mode === '4h' ? EQUIP_UTIL_BAND_LABELS_4H : EQUIP_UTIL_BAND_LABELS_6H;
}

function formatEquipUtilColPct(p: number): string {
  const x = Math.round(p * 10) / 10;
  if (!Number.isFinite(x)) return DASH_DB_PLACEHOLDER;
  return `${Number.isInteger(x) ? x : x.toFixed(1)}%`;
}

function alignEquipmentUtilSlots(
  slots:
    | {
        label: string;
        motorisedCount?: number;
        motorisedPct?: number;
        nonMotorisedCount?: number;
        nonMotorisedPct?: number;
        towableCount?: number;
        towablePct?: number;
        motorisedEquipment?: { equipmentName: string; count: number }[];
        nonMotorisedEquipment?: { equipmentName: string; count: number }[];
        towableEquipment?: { equipmentName: string; count: number }[];
      }[]
    | undefined,
  mode: EquipmentUtilSlotMode,
): EquipmentDashboardUtilPayload['slots'] {
  const labels = equipmentUtilBandLabels(mode);
  if (!slots?.length) {
    return labels.map((label) => ({
      label,
      motorisedCount: 0,
      motorisedPct: 0,
      nonMotorisedCount: 0,
      nonMotorisedPct: 0,
      towableCount: 0,
      towablePct: 0,
      motorisedEquipment: [],
      nonMotorisedEquipment: [],
      towableEquipment: [],
    }));
  }
  const byLabel = new Map(slots.map((s) => [s.label, s]));
  return labels.map((label) => {
    const s = byLabel.get(label);
    return {
      label,
      motorisedCount:
        typeof s?.motorisedCount === 'number' && Number.isFinite(s.motorisedCount) ? s.motorisedCount : 0,
        motorisedPct:
        typeof s?.motorisedPct === 'number' && Number.isFinite(s.motorisedPct) ? s.motorisedPct : 0,
      nonMotorisedCount:
        typeof s?.nonMotorisedCount === 'number' && Number.isFinite(s.nonMotorisedCount)
          ? s.nonMotorisedCount
          : 0,
      nonMotorisedPct:
        typeof s?.nonMotorisedPct === 'number' && Number.isFinite(s.nonMotorisedPct)
          ? s.nonMotorisedPct
          : 0,
      towableCount:
        typeof s?.towableCount === 'number' && Number.isFinite(s.towableCount) ? s.towableCount : 0,
      towablePct:
        typeof s?.towablePct === 'number' && Number.isFinite(s.towablePct) ? s.towablePct : 0,
      motorisedEquipment: Array.isArray(s?.motorisedEquipment) ? s.motorisedEquipment : [],
      nonMotorisedEquipment: Array.isArray(s?.nonMotorisedEquipment) ? s.nonMotorisedEquipment : [],
      towableEquipment: Array.isArray(s?.towableEquipment) ? s.towableEquipment : [],
    };
  });
}

/** Phone/tablet cards for equipment utilization time slots. */
function EquipmentUtilMobileSlotList({
  dashDark,
  compact,
  slots,
  totalRow,
  loading,
}: {
  dashDark: boolean;
  compact?: boolean;
  slots: EquipmentDashboardUtilPayload['slots'];
  totalRow: EquipmentDashboardUtilPayload['totalRow'];
  loading?: boolean;
}) {
  const countCell = (n: number) =>
    loading ? '…' : n.toLocaleString();
  const pctCell = (p: number, isTotal?: boolean) =>
    loading ? '…' : isTotal ? '100%' : formatEquipUtilColPct(p);

  const cardPad = compact ? 'p-2.5' : 'p-3';
  const metricClass = cn('tabular-nums font-semibold', dashCardMetricValueClass(dashDark));

  return (
    <ul className={cn('flex flex-col gap-2', DASH_MOBILE_LIST_CLASS, compact ? 'px-0.5 pb-1' : 'px-1 pb-1.5')}>
      {slots.map((slot) => {
        const rowSum = slot.motorisedCount + slot.nonMotorisedCount + slot.towableCount;
        const hasBand = rowSum > 0;
        return (
          <li
            key={slot.label}
            className={cn(
              'rounded-xl border',
              dashDark ? 'border-emerald-800/50 bg-emerald-950/90' : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/90'
            )}
          >
            <div
              className={cn(
                cardPad,
                'border-b font-medium tabular-nums',
                dashDark ? 'border-white/12 text-white/90' : 'border-[var(--dash-border-subtle)] text-[var(--dash-text)]'
              )}
            >
              {slot.label}
            </div>
            <dl className={cn('flex flex-col gap-1.5', cardPad, 'pt-2 text-xs')}>
              {(
                [
                  ['Motorised', countCell(slot.motorisedCount), !loading && !hasBand ? DASH_DB_PLACEHOLDER : pctCell(slot.motorisedPct)],
                  ['Non-motorised', countCell(slot.nonMotorisedCount), !loading && !hasBand ? DASH_DB_PLACEHOLDER : pctCell(slot.nonMotorisedPct)],
                  ['Towable', countCell(slot.towableCount), !loading && !hasBand ? DASH_DB_PLACEHOLDER : pctCell(slot.towablePct)],
                ] as const
              ).map(([label, count, pct]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[var(--dash-text-muted)]">{label}</dt>
                  <dd className={cn(metricClass, 'min-w-0 text-right')}>
                    {count}
                    <span className="ml-2 text-[11px] font-medium">{pct}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
      <li
        className={cn(
          'rounded-xl border-2 font-semibold',
          dashDark ? 'border-white/25 bg-white/[0.06]' : 'border-[var(--dash-table-border)] bg-black/[0.03]'
        )}
      >
        <div className={cn(cardPad, dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]')}>TOTAL</div>
        <dl className={cn('flex flex-col gap-1.5', cardPad, 'pt-2 text-xs')}>
          {(
            [
              ['Motorised', countCell(totalRow.motorisedCount), pctCell(totalRow.motorisedPct, true)],
              ['Non-motorised', countCell(totalRow.nonMotorisedCount), pctCell(totalRow.nonMotorisedPct, true)],
              ['Towable', countCell(totalRow.towableCount), pctCell(totalRow.towablePct, true)],
            ] as const
          ).map(([label, count, pct]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-[var(--dash-text-muted)]">{label}</dt>
              <dd className={cn(metricClass, 'min-w-0 text-right')}>
                {count}
                <span className="ml-2 text-[11px] font-medium">{pct}</span>
              </dd>
            </div>
          ))}
        </dl>
      </li>
    </ul>
  );
}

/** Equipment utilization: slab **counts** by From Time only; column-wise % within each category (master catalog). */
function EquipmentUtilTimeSlotsTable({
  dashDark,
  compact,
  rows,
  totalRow,
  loading,
  mode,
  fillCard,
}: {
  dashDark: boolean;
  compact?: boolean;
  rows: EquipmentDashboardUtilPayload['slots'];
  totalRow: EquipmentDashboardUtilPayload['totalRow'];
  loading?: boolean;
  mode: EquipmentUtilSlotMode;
  /** When set with `compact`, the table area grows to fill the dashboard tile (scrolls if content overflows). */
  fillCard?: boolean;
}) {
  const slots = alignEquipmentUtilSlots(rows, mode);

  const pad = compact ? (fillCard ? 'px-1 py-1' : 'px-1.5 py-1.5') : 'px-2 py-2';
  const thClass = cn(
    pad,
    'align-middle font-bold uppercase tracking-wide whitespace-nowrap',
    dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]',
    compact ? 'text-[13px] leading-tight' : 'text-[14px] leading-none sm:text-[17px]'
  );
  const countCell = (n: number) =>
    loading ? (
      <span className="opacity-60">…</span>
    ) : (
      <span className={cn('tabular-nums', dashCardMetricValueClass(dashDark))}>{n.toLocaleString()}</span>
    );
  const pctCell = (p: number, isTotal?: boolean) =>
    loading ? (
      <span className="opacity-60">…</span>
    ) : isTotal ? (
      <span className={dashCardMetricValueClass(dashDark)}>100%</span>
    ) : (
      <span className={dashCardMetricValueClass(dashDark)}>{formatEquipUtilColPct(p)}</span>
    );
  const equipValueCell = cn(
    'text-center font-semibold tabular-nums',
    dashCardMetricValueClass(dashDark),
    compact ? DASH_CARD_VALUE_TEXT : 'text-base'
  );
  const equipTotalValueCell = cn(
    'text-center tabular-nums',
    dashCardMetricValueClass(dashDark),
    compact ? DASH_CARD_VALUE_TEXT : 'text-base'
  );

  return (
    <div
      className={cn(
        'relative rounded-lg border',
        fillCard && compact
          ? 'mt-0 flex w-full shrink-0 flex-col overflow-hidden'
          : 'mt-1.5',
        dashDark ? 'border-emerald-800/50 bg-emerald-950/90' : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/90',
        compact ? (fillCard ? 'p-0.5' : 'p-1') : 'p-1.5'
      )}
    >
      <EquipmentUtilMobileSlotList
        dashDark={dashDark}
        compact={compact}
        slots={slots}
        totalRow={totalRow}
        loading={loading}
      />
      <div
        className={cn(
          DASH_TABLE_DESKTOP_CLASS,
          fillCard && compact
            ? 'max-h-[min(70vh,34rem)] overflow-auto [-webkit-overflow-scrolling:touch]'
            : 'max-h-[min(52vh,24rem)] overflow-auto [-webkit-overflow-scrolling:touch]',
          SCROLL_AREA_NO_BAR
        )}
      >
        <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col style={{ width: '16%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr
            className={cn(
              'border-b',
              dashDark ? 'border-white/20' : 'border-[var(--dash-table-border)]'
            )}
          >
            <th
              scope="col"
              className={cn(
                thClass,
                'text-left',
                dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD
              )}
            >
              Time slot
            </th>
            <th
              scope="col"
              className={cn(
                thClass,
                'text-center',
                dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD
              )}
            >
              {compact ? 'Mot.' : 'Motorised'}
            </th>
            <th
              scope="col"
              className={cn(
                thClass,
                'text-center',
                dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD
              )}
            >
              {compact ? 'Mot %' : 'Motorised %'}
            </th>
            <th
              scope="col"
              className={cn(
                thClass,
                'text-center',
                dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD
              )}
            >
              {compact ? 'NM' : 'Non motorised'}
            </th>
            <th
              scope="col"
              className={cn(
                thClass,
                'text-center',
                dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD
              )}
            >
              {compact ? 'NM %' : 'Non motorised %'}
            </th>
            <th
              scope="col"
              className={cn(
                thClass,
                'text-center',
                dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD
              )}
            >
              {compact ? 'Tow.' : 'Towable'}
            </th>
            <th
              scope="col"
              className={cn(
                thClass,
                'text-center',
                dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD
              )}
            >
              {compact ? 'Tow %' : 'Towable %'}
            </th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => {
            const rowSum = slot.motorisedCount + slot.nonMotorisedCount + slot.towableCount;
            const hasBand = rowSum > 0;
            return (
              <tr
                key={slot.label}
                className={cn(
                  'border-t',
                  dashDark ? 'border-white/12' : 'border-[var(--dash-table-border)]',
                )}
              >
                <td
                  className={cn(
                    pad,
                    'font-medium tabular-nums',
                    dashDark ? 'text-white/90' : 'text-[var(--dash-text)]',
                    compact ? DASH_CARD_VALUE_TEXT : 'text-base'
                  )}
                >
                  {slot.label}
                </td>
                <td
                  className={cn(pad, equipValueCell)}
                >
                  {countCell(slot.motorisedCount)}
                </td>
                <td
                  className={cn(pad, equipValueCell)}
                >
                  {!loading && !hasBand ? DASH_DB_PLACEHOLDER : pctCell(slot.motorisedPct)}
                </td>
                <td
                  className={cn(pad, equipValueCell)}
                >
                  {countCell(slot.nonMotorisedCount)}
                </td>
                <td
                  className={cn(pad, equipValueCell)}
                >
                  {!loading && !hasBand ? DASH_DB_PLACEHOLDER : pctCell(slot.nonMotorisedPct)}
                </td>
                <td
                  className={cn(pad, equipValueCell)}
                >
                  {countCell(slot.towableCount)}
                </td>
                <td
                  className={cn(pad, equipValueCell)}
                >
                  {!loading && !hasBand ? DASH_DB_PLACEHOLDER : pctCell(slot.towablePct)}
                </td>
              </tr>
            );
          })}
          <tr
            className={cn(
              'border-t-2 font-semibold',
              dashDark ? 'border-white/25 bg-white/[0.06]' : 'border-[var(--dash-table-border)] bg-black/[0.03]'
            )}
          >
            <td
              className={cn(
                pad,
                'tabular-nums',
                dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]',
                compact ? DASH_CARD_VALUE_TEXT : 'text-base'
              )}
            >
              TOTAL
            </td>
            <td className={cn(pad, equipTotalValueCell)}>{countCell(totalRow.motorisedCount)}</td>
            <td className={cn(pad, equipTotalValueCell)}>{pctCell(totalRow.motorisedPct, true)}</td>
            <td className={cn(pad, equipTotalValueCell)}>{countCell(totalRow.nonMotorisedCount)}</td>
            <td className={cn(pad, equipTotalValueCell)}>{pctCell(totalRow.nonMotorisedPct, true)}</td>
            <td className={cn(pad, equipTotalValueCell)}>{countCell(totalRow.towableCount)}</td>
            <td className={cn(pad, equipTotalValueCell)}>{pctCell(totalRow.towablePct, true)}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Canonical slab label for charts: `HH:MM - HH:MM` (matches table / API). */
function equipmentUtilSlotDisplayLabel(full: string): string {
  const parts = full.split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return full.trim();
  const toHHmm = (raw: string) => {
    const t = raw.trim();
    const m = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return t;
    const h = m[1].padStart(2, '0');
    const min = (m[2] ?? '00').padStart(2, '0');
    return `${h}:${min}`;
  };
  return `${toHHmm(parts[0])} - ${toHHmm(parts[1])}`;
}

function EquipmentUtilChartTooltip({
  active,
  payload,
  label,
  chartTooltipStyle,
  categoryLabel,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    color?: string;
    name?: string;
    /** Recharts attaches the original datum here for custom tooltips. */
    payload?: { slotLabel?: string; count?: number; pct?: number };
  }>;
  label?: string;
  chartTooltipStyle: CSSProperties;
  categoryLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      style={{
        ...chartTooltipStyle,
        padding: '10px 12px',
        minWidth: 160,
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{row.slotLabel ?? label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {categoryLabel}: {(row.count ?? 0).toLocaleString()} ({formatEquipUtilColPct(row.pct ?? 0)})
      </div>
    </div>
  );
}

/** Equipment utilization by time slab for one category (modal). */
function EquipmentUtilTimeSlotsChart({
  mode,
  rows,
  loading,
  chartTheme,
  category,
}: {
  mode: EquipmentUtilSlotMode;
  rows: EquipmentDashboardUtilPayload['slots'];
  loading?: boolean;
  chartTheme: ReturnType<typeof buildChartTheme>;
  category: EquipmentUtilChartCategory;
}) {
  const categoryMeta = equipmentUtilCategoryChartMeta(category);
  const chartData = useMemo(() => {
    return alignEquipmentUtilSlots(rows, mode).map((slot) => ({
      slotLabel: equipmentUtilSlotDisplayLabel(slot.label),
      count: categoryMeta.countOf(slot),
      pct: categoryMeta.pctOf(slot),
    }));
  }, [rows, mode, categoryMeta]);

  if (loading) {
    return (
      <div className="flex h-80 min-h-[16rem] items-center justify-center text-sm text-[var(--dash-text-muted)]">
        Loading utilization…
      </div>
    );
  }

  return (
    <div className="h-[clamp(14rem,42vh,20rem)] w-full min-h-[14rem] sm:h-80 sm:min-h-[16rem]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="slotLabel"
            tick={{ fill: chartTheme.axis, fontSize: 11 }}
            interval={0}
            angle={0}
            textAnchor="middle"
            height={36}
            tickFormatter={(value) => {
              const parts = String(value).split(/\s*-\s*/);
              if (parts.length !== 2) return String(value);
              const hour = (part: string) => part.trim().slice(0, 2);
              return `${hour(parts[0])}–${hour(parts[1])}`;
            }}
          />
          <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            content={(props) => (
              <EquipmentUtilChartTooltip
                active={props.active}
                payload={
                  props.payload as unknown as Parameters<
                    typeof EquipmentUtilChartTooltip
                  >[0]['payload']
                }
                label={props.label != null ? String(props.label) : undefined}
                chartTooltipStyle={chartTheme.tooltip}
                categoryLabel={categoryMeta.label}
              />
            )}
          />
          <Bar
            {...BAR_SLOW_EMERGE}
            dataKey="count"
            name={categoryMeta.label}
            fill={categoryMeta.color}
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Per-category equipment breakdown per slab (each `equipment_name` line count); used inside the opened card. */
function EquipmentUtilCategoryPerSlotBreakdown({
  category,
  slots,
  loading,
  mode,
  dashDark,
}: {
  category: 'motorised' | 'nonMotorised' | 'towable';
  slots: EquipmentDashboardUtilPayload['slots'] | null | undefined;
  loading: boolean;
  mode: EquipmentUtilSlotMode;
  dashDark: boolean;
}) {
  const labels = equipmentUtilBandLabels(mode);
  const heading =
    category === 'motorised'
      ? 'Motorised — count per equipment by slab'
      : category === 'nonMotorised'
        ? 'Non-motorised — count per equipment by slab'
        : 'Towable — count per equipment by slab';
  const pickList = (
    row: EquipmentDashboardUtilPayload['slots'][number] | undefined,
  ): { equipmentName: string; count: number }[] => {
    if (!row) return [];
    if (category === 'motorised') return row.motorisedEquipment ?? [];
    if (category === 'nonMotorised') return row.nonMotorisedEquipment ?? [];
    return row.towableEquipment ?? [];
  };
  const emptyCopy =
    category === 'motorised'
      ? 'No motorised lines'
      : category === 'nonMotorised'
        ? 'No non-motorised lines'
        : 'No towable lines';
  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-[var(--dash-text-muted)]">
        {heading}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {labels.map((label) => {
          const row = slots?.find((s) => s.label === label);
          const list = pickList(row);
          const total = list.reduce((sum, e) => sum + e.count, 0);
          return (
            <div
              key={label}
              className="overflow-hidden rounded-lg border border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/60"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[var(--dash-border-subtle)] bg-[var(--dash-table-header)]/40 px-2.5 py-2 text-[13px] font-semibold">
                <span className="min-w-0 break-words leading-snug text-[var(--dash-text-strong)]">{label}</span>
                <span className={cn('tabular-nums', dashCardMetricValueClass(dashDark))}>
                  {total.toLocaleString()}
                </span>
              </div>
              {loading ? (
                <div className="px-2 py-1.5 text-[var(--dash-text-muted)]">Loading…</div>
              ) : list.length === 0 ? (
                <div className="px-2 py-1.5 text-[var(--dash-text-muted)]">{emptyCopy}</div>
              ) : (
                <ul className={cn('max-h-44 overflow-auto px-2 py-1.5', SCROLL_AREA_NO_BAR)}>
                  {list.map((e) => (
                    <li
                      key={e.equipmentName}
                      className="flex flex-col gap-0.5 border-b border-[var(--dash-border-subtle)]/60 py-1.5 last:border-b-0"
                    >
                      <span className="break-words leading-snug text-[var(--dash-text)]">
                        {e.equipmentName}
                      </span>
                      <span className={cn('font-semibold tabular-nums', dashCardMetricValueClass(dashDark))}>
                        {e.count.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OverviewTile({
  title,
  value,
  titleTrailing,
  extra,
  subtitle,
  description,
  detailRows,
  detailRowMax = 3,
  onClick,
  icon,
  className,
  compact,
  dashDark = false,
  /** Compact tiles: grow `extra` to fill remaining column height (e.g. Airline Remarks). */
  fillCompactExtra = false,
  /** Compact tiles: less padding header gap (e.g. Equipment utilization hugs its table). */
  tightChrome = false,
}: {
  title: string;
  /** Large figure under the title; omit when using only `titleTrailing` (e.g. OTP). */
  value?: ReactNode;
  /** Shown on the same band as the title (e.g. headline %). */
  titleTrailing?: ReactNode;
  /** Optional block below the header (e.g. OTP matrix). */
  extra?: ReactNode;
  subtitle: ReactNode;
  description: string;
  /** When omitted or empty, the Quick facts panel is not shown. */
  detailRows?: { label: string; value: ReactNode }[];
  /** Max quick-fact rows (default 3). */
  detailRowMax?: number;
  onClick: () => void;
  icon: ReactNode;
  className?: string;
  /** Dense tile (~half default size) for fitting more on one viewport */
  compact?: boolean;
  /** When true with `compact`, emerald/amber headings and white quick-fact parameters. */
  dashDark?: boolean;
  fillCompactExtra?: boolean;
  tightChrome?: boolean;
}) {
  const quickFactsRows = detailRows ?? [];
  const showMainValue = value !== undefined && value !== null;
  return (
    <div
      className={cn(
        dashboardAnalyticsCardHover,
        'group relative flex w-full flex-col overflow-visible rounded-xl border text-left antialiased',
        compact
          ? fillCompactExtra
            ? 'h-full min-h-0'
            : 'h-auto min-h-0'
          : 'h-full min-h-[178px]',
        DASH_CARD_GLOW_ANIM,
        dashboardCardBgTransition,
        className
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`Open ${title} details`}
        className="absolute inset-0 z-0 rounded-xl border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-card)]"
      />
      <div className="pointer-events-auto absolute right-1.5 top-1.5 z-30 [transform:translateZ(2px)]">
        <DashboardTileInfoHover compact={compact} icon={icon} subtitle={subtitle} description={description} />
      </div>
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-[1] bg-gradient-to-br from-[var(--dash-card)] via-[var(--dash-gradient-mid)] to-[var(--dash-warm)]/10 opacity-80 transition-opacity group-hover:opacity-90',
          DASH_CARD_INTERACTION_DURATION,
          DASH_CARD_INTERACTION_EASE,
          DASH_CARD_HOVER_IN_DELAY
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-[1] rounded-xl ring-0 ring-emerald-400/35',
          dashboardCardRingTransition,
          'group-hover:ring-2 group-hover:ring-emerald-400/50 group-hover:shadow-[inset_0_0_28px_rgba(16,185,129,0.09)]'
        )}
      />
      <div
        className={cn(
          'relative z-10 flex flex-col pointer-events-none',
          compact ? (fillCompactExtra ? 'h-full min-h-0 flex-1 p-1.5' : cn('h-auto', tightChrome ? 'px-1 pb-1 pt-0.5' : 'p-1.5')) : 'min-h-0 flex-1 p-3'
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-start justify-between gap-2 pr-14',
            compact ? (tightChrome ? 'mb-0.5' : 'mb-1') : 'mb-2'
          )}
        >
          <div className="relative min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p
                className={cn(
                  'font-bold uppercase tracking-wide',
                  dashDark ? 'text-emerald-400' : 'text-[var(--dash-text-muted)]',
                  compact ? 'text-[14px]' : 'text-base'
                )}
              >
                {title}
              </p>
              {titleTrailing != null && (
                <span
                  className={cn(
                    'font-bold tabular-nums tracking-tight text-[var(--dash-text-strong)]',
                    compact ? DASH_CARD_VALUE_TEXT : 'text-2xl sm:text-3xl'
                  )}
                >
                  {titleTrailing}
                </span>
              )}
            </div>
            {showMainValue && (
              <p
                className={cn(
                  'font-bold tracking-tight text-[var(--dash-text-strong)]',
                  compact ? DASH_CARD_VALUE_TEXT : 'text-3xl',
                  titleTrailing != null && 'mt-0.5'
                )}
              >
                {value}
              </p>
            )}
          </div>
        </div>
        {extra != null ? (
          <div
            className={cn(
              'min-w-0',
              compact
                ? fillCompactExtra
                  ? 'flex min-h-0 min-w-0 flex-1 flex-col'
                  : 'shrink-0'
                : 'flex min-h-0 min-w-0 flex-1 flex-col'
            )}
          >
            {extra}
          </div>
        ) : null}
        {quickFactsRows.length > 0 && (
          <div
            className={cn(
              'relative rounded-lg border',
              compact ? 'mt-1.5' : 'mt-auto',
              dashDark ? 'border-emerald-800/50 bg-emerald-950/90' : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/90',
              compact ? 'p-1' : 'p-2'
            )}
          >
            <p
              className={cn(
                'font-semibold uppercase tracking-wide',
                dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]',
                compact ? 'mb-0.5 text-[13px]' : 'mb-1 text-sm'
              )}
            >
              Quick facts
            </p>
            <table className={cn('w-full', compact ? DASH_CARD_VALUE_TEXT : 'text-base')}>
              <tbody>
                {quickFactsRows.slice(0, detailRowMax).map((row, idx) => (
                  <tr
                    key={`${row.label}-${idx}`}
                    className={cn(
                      'border-t first:border-t-0',
                      dashDark ? 'border-white/15' : 'border-[var(--dash-table-border)]'
                    )}
                  >
                    <td
                      className={cn(
                        'pr-2',
                        dashDark ? 'text-white' : 'text-[var(--dash-text-muted)]',
                        compact ? 'py-px' : 'py-0.5'
                      )}
                    >
                      {row.label}
                    </td>
                    <td
                      className={cn(
                        'text-right font-semibold',
                        dashDark ? 'text-white' : 'text-[var(--dash-text-strong)]',
                        compact ? 'py-px' : 'py-0.5'
                      )}
                    >
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export type { ScheduledCategoryMix, AircraftCategoryMixResponse } from '@/utils/dashboardAircraftCategory';

const AIRCRAFT_ANALYSIS_MIX_ROWS: readonly {
  schCode: keyof Pick<
    ScheduledCategoryMix,
    | 'SCH-I-P-NB'
    | 'SCH-I-P-WB'
    | 'SCH-D-P-NB'
    | 'SCH-D-P-WB'
    | 'SCH-I-F-NB'
    | 'SCH-I-F-WB'
    | 'SCH-D-F-NB'
    | 'SCH-D-F-WB'
  >;
  uiLabel: string;
  /** Expanded label used only by the Scheduled/Additional split tables. */
  fullLabel: string;
  title: string;
}[] = [
  { schCode: 'SCH-I-P-NB', uiLabel: 'I-P-NB', fullLabel: 'International-Passenger-Narrow Body', title: 'International passenger narrow body' },
  { schCode: 'SCH-I-P-WB', uiLabel: 'I-P-WB', fullLabel: 'International-Passenger-Wide Body', title: 'International passenger wide body' },
  { schCode: 'SCH-D-P-NB', uiLabel: 'D-P-NB', fullLabel: 'Domestic-Passenger-Narrow Body', title: 'Domestic passenger narrow body' },
  { schCode: 'SCH-D-P-WB', uiLabel: 'D-P-WB', fullLabel: 'Domestic-Passenger-Wide Body', title: 'Domestic passenger wide body' },
  { schCode: 'SCH-I-F-NB', uiLabel: 'I-F-NB', fullLabel: 'International-Freight-Narrow Body', title: 'International freight narrow body' },
  { schCode: 'SCH-I-F-WB', uiLabel: 'I-F-WB', fullLabel: 'International-Freight-Wide Body', title: 'International freight wide body' },
  { schCode: 'SCH-D-F-NB', uiLabel: 'D-F-NB', fullLabel: 'Domestic-Freight-Narrow Body', title: 'Domestic freight narrow body' },
  { schCode: 'SCH-D-F-WB', uiLabel: 'D-F-WB', fullLabel: 'Domestic-Freight-Wide Body', title: 'Domestic freight wide body' },
] as const;

/** Sum scheduled + additional counts for category rows matching `predicate` (excludes `mix.other`). */
function sumAircraftCategorySlices(
  aircraftCategoryMix: AircraftCategoryMixResponse,
  predicate: (row: (typeof AIRCRAFT_ANALYSIS_MIX_ROWS)[number]) => boolean,
): number {
  return AIRCRAFT_ANALYSIS_MIX_ROWS.filter(predicate).reduce(
    (s, row) =>
      s +
      scheduledMixCountForSchCode(aircraftCategoryMix.scheduled, row.schCode) +
      scheduledMixCountForSchCode(aircraftCategoryMix.additional, row.schCode),
    0,
  );
}

function scheduledMixCountForSchCode(mix: ScheduledCategoryMix, schCode: (typeof AIRCRAFT_ANALYSIS_MIX_ROWS)[number]['schCode']): number {
  switch (schCode) {
    case 'SCH-I-P-NB':
      return mix['SCH-I-P-NB'] ?? mix.SIP;
    case 'SCH-I-P-WB':
      return mix['SCH-I-P-WB'] ?? 0;
    case 'SCH-D-P-NB':
      return mix['SCH-D-P-NB'] ?? mix.SDP;
    case 'SCH-D-P-WB':
      return mix['SCH-D-P-WB'] ?? 0;
    case 'SCH-I-F-NB':
      return mix['SCH-I-F-NB'] ?? mix.SIF;
    case 'SCH-I-F-WB':
      return mix['SCH-I-F-WB'] ?? 0;
    case 'SCH-D-F-NB':
      return mix['SCH-D-F-NB'] ?? mix.SDF;
    case 'SCH-D-F-WB':
      return mix['SCH-D-F-WB'] ?? 0;
    default:
      return 0;
  }
}

const AIRCRAFT_ANALYSIS_OTHER_KEY = 'OTHER';

type AircraftAnalysisCategoryRow = {
  /** `SCH-*` bucket key, or `'OTHER'`. */
  code: string;
  label: string;
  title: string;
  count: number;
};

/** Per-carrier category rows (8 SCH buckets + `Other` when present). */
function buildAircraftAnalysisCategoryRows(
  mix: ScheduledCategoryMix,
): AircraftAnalysisCategoryRow[] {
  const rows: AircraftAnalysisCategoryRow[] = AIRCRAFT_ANALYSIS_MIX_ROWS.map(
    ({ schCode, fullLabel, title }) => ({
      code: schCode,
      label: fullLabel,
      title,
      count: scheduledMixCountForSchCode(mix, schCode),
    }),
  );
  const other = mix.other ?? 0;
  if (other > 0) {
    rows.push({
      code: AIRCRAFT_ANALYSIS_OTHER_KEY,
      label: 'Other',
      title: 'Other / uncategorized',
      count: other,
    });
  }
  return rows;
}

/** Format a `dd/MM/yyyy` or `yyyy-MM-dd` date as `dd Mon yyyy` (falls back to the raw value). */
function formatAircraftAnalysisDate(raw: string): string {
  const date = String(raw ?? '').trim();
  if (!date) return '';
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(date);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (Number.isNaN(d.getTime())) return date;
    const mon = d.toLocaleString('en-US', { month: 'short' });
    return `${dmy[1].padStart(2, '0')} ${mon} ${dmy[3]}`;
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if (Number.isNaN(d.getTime())) return date;
    const mon = d.toLocaleString('en-US', { month: 'short' });
    return `${ymd[3]} ${mon} ${ymd[1]}`;
  }
  return date;
}

/** Combine a date + time into a single `dd Mon yyyy HH:mm` cell (em dash when both empty). */
function formatAircraftAnalysisDateTime(dateRaw: string, timeRaw: string): string {
  const date = formatAircraftAnalysisDate(dateRaw);
  const time = String(timeRaw ?? '').trim();
  const parts = [date, time].filter((s) => s.length > 0);
  return parts.length ? parts.join(' ') : '—';
}

/** Sl.No → Scheduled / Non-Scheduled Airlines with this flight filtered (`?highlightSerial=` / `?serialNo=`). */
function AircraftAnalysisFlightSerialCell({
  serialNo,
  staYmd,
  staDate,
  stdDate,
  ataDate,
}: {
  serialNo: number | null;
  staYmd?: string;
  staDate?: string;
  stdDate?: string;
  ataDate?: string;
}) {
  const dashboardReturn = useDashboardScheduledAirlinesLinkContext();
  if (serialNo == null || !Number.isFinite(serialNo)) {
    return <span className="text-[var(--dash-text-muted)]">—</span>;
  }
  const n = Math.trunc(serialNo);
  const flightDateRange = flightScheduleYmdRangeFromLabels({
    staYmd,
    staDate,
    stdDate,
    ataDate,
  });
  const href = dashboardReturn
    ? buildAirlinesHrefFromDashboard(n, dashboardReturn, flightDateRange)
    : buildAirlinesHighlightHref(n, undefined, flightDateRange);
  return (
    <Link
      href={href}
      className="text-orange-500 underline decoration-orange-500/70 underline-offset-2 hover:text-orange-400"
    >
      {n}
    </Link>
  );
}

/** Expanded flight list for one category row inside a carrier table. */
function AircraftAnalysisCategoryFlightList({
  flights,
  loading,
}: {
  flights: AircraftAnalysisFlightRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="px-3 py-2 text-[12px] text-[var(--dash-text-muted)]">
        Loading flights…
      </div>
    );
  }
  if (flights.length === 0) {
    return (
      <div className="px-3 py-2 text-[12px] text-[var(--dash-text-muted)]">
        No flights found for this category in the selected range.
      </div>
    );
  }
  return (
    <div
      className={cn(
        'max-h-[16rem] overflow-y-auto overflow-x-auto px-2 pb-2',
        SCROLL_AREA_NO_BAR,
      )}
    >
      <ul className="flex flex-col gap-2 lg:hidden">
        {flights.map((f, idx) => (
          <li
            key={`${f.serialNo ?? 'na'}-${f.flightNo}-${f.staYmd}-${idx}-m`}
            className="rounded-lg border border-[var(--dash-border-subtle)] px-3 py-2.5 text-[12px]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="shrink-0 text-[var(--dash-text-muted)]">Sl. No</span>
              <span className="min-w-0 text-right font-medium">
                <AircraftAnalysisFlightSerialCell
                  serialNo={f.serialNo}
                  staYmd={f.staYmd}
                  staDate={f.staDate}
                  stdDate={f.stdDate}
                />
              </span>
            </div>
            <p className="mt-1 break-words font-medium leading-snug text-[var(--dash-text)]">{f.airline || '—'}</p>
            <dl className="mt-2 flex flex-col gap-1.5">
              {(
                [
                  ['STA', formatAircraftAnalysisDateTime(f.staDate || f.staYmd, f.staTime)],
                  ['STD', formatAircraftAnalysisDateTime(f.stdDate, f.stdTime)],
                  ['ATA', formatAircraftAnalysisDateTime(f.ataDate, f.ataTime)],
                  ['ATD', formatAircraftAnalysisDateTime(f.atdDate, f.atdTime)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[var(--dash-text-muted)]">{label}</dt>
                  <dd className="min-w-0 text-right tabular-nums text-[var(--dash-text)]">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
      <table className="w-full min-w-[40rem] whitespace-nowrap text-left text-[12px]">
        <thead>
          <tr className="text-[var(--dash-text-soft)]">
            <th className="sticky top-0 z-10 whitespace-nowrap bg-[var(--dash-surface)] px-2 py-1 font-medium">Sl. No</th>
            <th className="sticky top-0 z-10 whitespace-nowrap bg-[var(--dash-surface)] px-2 py-1 font-medium">Airline</th>
            <th className="sticky top-0 z-10 whitespace-nowrap bg-[var(--dash-surface)] px-2 py-1 font-medium">STA date &amp; time</th>
            <th className="sticky top-0 z-10 whitespace-nowrap bg-[var(--dash-surface)] px-2 py-1 font-medium">STD date &amp; time</th>
            <th className="sticky top-0 z-10 whitespace-nowrap bg-[var(--dash-surface)] px-2 py-1 font-medium">ATA date &amp; time</th>
            <th className="sticky top-0 z-10 whitespace-nowrap bg-[var(--dash-surface)] px-2 py-1 font-medium">ATD date &amp; time</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f, idx) => (
            <tr
              key={`${f.serialNo ?? 'na'}-${f.flightNo}-${f.staYmd}-${idx}`}
              className="border-t border-[var(--dash-border-subtle)]/60"
            >
              <td className="px-2 py-1 tabular-nums font-medium">
                <AircraftAnalysisFlightSerialCell
                  serialNo={f.serialNo}
                  staYmd={f.staYmd}
                  staDate={f.staDate}
                  stdDate={f.stdDate}
                />
              </td>
              <td className="px-2 py-1 text-[var(--dash-text)]">
                {f.airline || '—'}
              </td>
              <td className="whitespace-nowrap px-2 py-1 tabular-nums text-[var(--dash-text)]">
                {formatAircraftAnalysisDateTime(f.staDate || f.staYmd, f.staTime)}
              </td>
              <td className="whitespace-nowrap px-2 py-1 tabular-nums text-[var(--dash-text)]">
                {formatAircraftAnalysisDateTime(f.stdDate, f.stdTime)}
              </td>
              <td className="whitespace-nowrap px-2 py-1 tabular-nums text-[var(--dash-text)]">
                {formatAircraftAnalysisDateTime(f.ataDate, f.ataTime)}
              </td>
              <td className="whitespace-nowrap px-2 py-1 tabular-nums text-[var(--dash-text)]">
                {formatAircraftAnalysisDateTime(f.atdDate, f.atdTime)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** One carrier track table (Scheduled or Additional) with expandable category rows. */
function AircraftAnalysisCarrierTable({
  title,
  carrierType,
  mix,
  flights,
  flightsLoading,
  expandedKey,
  onToggle,
}: {
  title: string;
  carrierType: 'scheduled' | 'additional';
  mix: ScheduledCategoryMix;
  flights: AircraftAnalysisFlightRow[] | null;
  flightsLoading: boolean;
  expandedKey: string | null;
  onToggle: (key: string) => void;
}) {
  const rows = useMemo(() => buildAircraftAnalysisCategoryRows(mix), [mix]);
  const flightsByCategory = useMemo(() => {
    const map = new Map<string, AircraftAnalysisFlightRow[]>();
    if (!flights) return map;
    for (const f of flights) {
      if (f.carrierType !== carrierType) continue;
      const arr = map.get(f.mixCategory);
      if (arr) arr.push(f);
      else map.set(f.mixCategory, [f]);
    }
    return map;
  }, [flights, carrierType]);

  const carrierTotal = mix.total ?? 0;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--dash-border-subtle)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--dash-border-subtle)] bg-[var(--dash-table-header)] px-3 py-2">
        <span className="text-[13px] font-semibold text-[var(--dash-text-strong)]">
          {title}
        </span>
        <span className="text-[12px] tabular-nums text-[var(--dash-text-soft)]">
          {carrierTotal.toLocaleString()} flights
        </span>
      </div>
      <table className="w-full table-fixed text-left text-sm">
        <thead>
          <tr>
            <th className={cn('px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]', STICKY_TH_TOP_LIGHT)}>
              Category
            </th>
            <th className={cn('w-20 px-2 py-1.5 text-right font-semibold text-[var(--dash-text-strong)]', STICKY_TH_TOP_LIGHT)}>
              Flights
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = `${carrierType}:${row.code}`;
            const isOpen = expandedKey === key;
            const clickable = row.count > 0;
            const rowFlights = flightsByCategory.get(row.code) ?? [];
            return (
              <Fragment key={key}>
                <tr
                  className={cn(
                    'border-t border-[var(--dash-border-subtle)] transition-colors',
                    clickable
                      ? 'cursor-pointer hover:bg-[var(--dash-row-hover)]'
                      : 'opacity-70',
                    isOpen && 'bg-[var(--dash-row-hover)]',
                  )}
                  onClick={clickable ? () => onToggle(key) : undefined}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-expanded={clickable ? isOpen : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onToggle(key);
                          }
                        }
                      : undefined
                  }
                >
                  <td className="px-2 py-1.5 font-medium text-[var(--dash-text-strong)]" title={row.title}>
                    <span className="flex min-w-0 items-start gap-1.5">
                      <ChevronRight
                        className={cn(
                          'mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dash-text-soft)] transition-transform duration-200',
                          isOpen && 'rotate-90',
                          !clickable && 'invisible',
                        )}
                      />
                      <span className="min-w-0 break-words leading-snug">{row.label}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-[var(--dash-text)]">
                    <DashCountInt end={row.count} />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-[var(--dash-border-subtle)] bg-[var(--dash-surface)]">
                    <td colSpan={2} className="p-0">
                      <AircraftAnalysisCategoryFlightList
                        flights={rowFlights}
                        loading={flightsLoading}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Stacked Scheduled + Additional category tables with per-row flight drill-down. */
function AircraftAnalysisCategoryTables({
  mix,
  flights,
  flightsLoading,
}: {
  mix: AircraftCategoryMixResponse;
  flights: AircraftAnalysisFlightRow[] | null;
  flightsLoading: boolean;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const onToggle = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);
  return (
    <div className="mt-4 space-y-4">
      <AircraftAnalysisCarrierTable
        title="Scheduled"
        carrierType="scheduled"
        mix={mix.scheduled}
        flights={flights}
        flightsLoading={flightsLoading}
        expandedKey={expandedKey}
        onToggle={onToggle}
      />
      <AircraftAnalysisCarrierTable
        title="Additional"
        carrierType="additional"
        mix={mix.additional}
        flights={flights}
        flightsLoading={flightsLoading}
        expandedKey={expandedKey}
        onToggle={onToggle}
      />
      <p className="text-[12px] text-[var(--dash-text-muted)]">
        Click a category to view its flights. Select a flight&apos;s Sl. No to
        open it in Scheduled Airlines.
      </p>
    </div>
  );
}

const STAFF_UTILIZATION_CATEGORIES = [
  'SCH-I-P-NB',
  'SCH-I-P-WB',
  'SCH-D-P-NB',
  'SCH-D-P-WB',
  'SCH-I-F-NB',
  'SCH-I-F-WB',
  'SCH-D-F-NB',
  'SCH-D-F-WB',
] as const;

type StaffUtilHourCell = {
  ramp: { high: number; low: number; avg: number };
  terminal: { high: number; low: number; avg: number };
};

/** `high` = total hours, `avg` = idle hours; active = total − idle. */
function staffUtilBandMetrics(band: { high: number; low: number; avg: number }) {
  const total = band.high;
  const idle = band.avg;
  const active = total - idle;
  return { total, idle, active };
}

function formatStaffUtilHours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return DASH_DB_PLACEHOLDER;
  const rounded = Math.abs(hours - Math.round(hours)) < 0.01;
  if (rounded) return `${Math.round(hours).toLocaleString()} h`;
  return `${hours.toFixed(1)} h`;
}

/**
 * Demo staff hours (plain hours) until `staffUtilization` in Bird JSON matches this shape.
 */
const STAFF_UTILIZATION_HOURS_DEMO: Record<(typeof STAFF_UTILIZATION_CATEGORIES)[number], StaffUtilHourCell> = {
  'SCH-I-P-NB': {
    ramp: { high: 234, low: 185.8, avg: 48.2 },
    terminal: { high: 198.3, low: 162.3, avg: 36 },
  },
  'SCH-I-P-WB': {
    ramp: { high: 156, low: 113.8, avg: 42.2 },
    terminal: { high: 142, low: 103.5, avg: 38.5 },
  },
  'SCH-D-P-NB': {
    ramp: { high: 120.8, low: 92.8, avg: 28 },
    terminal: { high: 98, low: 75.8, avg: 22.2 },
  },
  'SCH-D-P-WB': {
    ramp: { high: 110, low: 84, avg: 26 },
    terminal: { high: 92, low: 71, avg: 21 },
  },
  'SCH-I-F-NB': {
    ramp: { high: 88, low: 68, avg: 20 },
    terminal: { high: 72, low: 53.2, avg: 18.8 },
  },
  'SCH-I-F-WB': {
    ramp: { high: 64.5, low: 48.5, avg: 16 },
    terminal: { high: 58, low: 43, avg: 15 },
  },
  'SCH-D-F-NB': {
    ramp: { high: 40, low: 28, avg: 12 },
    terminal: { high: 36, low: 25, avg: 11 },
  },
  'SCH-D-F-WB': {
    ramp: { high: 44, low: 31, avg: 13 },
    terminal: { high: 38, low: 26.5, avg: 11.5 },
  },
};

/** Phone/tablet cards for staff utilization matrix. */
function StaffUtilizationMobileList({
  dashDark,
  compact,
}: {
  dashDark: boolean;
  compact?: boolean;
}) {
  const pad = compact ? 'p-2.5' : 'p-3';
  const dataTxt = dashCardMetricValueClass(dashDark);
  const rowLabel = dashDark ? 'text-white/90' : 'text-[var(--dash-text)]';

  return (
    <ul className={cn('flex flex-col gap-2', DASH_MOBILE_LIST_CLASS, compact && '-mx-0.5')}>
      {STAFF_UTILIZATION_CATEGORIES.map((code) => {
        const cell = STAFF_UTILIZATION_HOURS_DEMO[code];
        const ramp = staffUtilBandMetrics(cell.ramp);
        const terminal = staffUtilBandMetrics(cell.terminal);
        return (
          <li
            key={code}
            className={cn(
              'rounded-xl border',
              dashDark ? 'border-emerald-800/50 bg-emerald-950/30' : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/80'
            )}
          >
            <div
              className={cn(
                pad,
                'border-b text-sm font-medium tabular-nums',
                dashDark ? 'border-white/10 text-amber-400' : 'border-[var(--dash-border-subtle)] text-[var(--dash-text-strong)]'
              )}
            >
              {code}
            </div>
            <div className="flex flex-col gap-3 p-2.5">
              {(
                [
                  ['Ramp', ramp],
                  ['Terminal', terminal],
                ] as const
              ).map(([area, metrics]) => (
                <div key={area}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-400/90">{area}</p>
                  <dl className="flex flex-col gap-1.5">
                    {(
                      [
                        ['Total', metrics.total],
                        ['Active', metrics.active],
                        ['Idle', metrics.idle],
                      ] as const
                    ).map(([label, hours]) => (
                      <div key={label} className="flex items-baseline justify-between gap-3">
                        <dt className={cn('shrink-0 text-xs', rowLabel)}>{label}</dt>
                        <dd className={cn('min-w-0 text-right text-sm font-semibold tabular-nums', dataTxt)}>
                          {formatStaffUtilHours(hours)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StaffUtilizationSpreadsheetTable({
  dashDark,
  compact,
  showSheetTitle = true,
}: {
  dashDark: boolean;
  compact?: boolean;
  /** Set false on the small dashboard tile; title already comes from the parent card. */
  showSheetTitle?: boolean;
}) {
  const b = cn(
    'border text-center align-middle',
    dashDark ? 'border-white/12' : 'border-[var(--dash-table-border)]'
  );
  /** Match `PerformanceReportTable` / `padCorner` + `padData`. */
  const padCorner = compact ? 'py-1.5 pl-1.5 pr-1' : 'py-2 pl-2 pr-1.5';
  const padData = compact ? 'px-1.5 py-1.5' : 'px-2 py-2';
  const headText = compact ? 'text-[14px]' : 'text-[15px]';
  const labelText = compact ? DASH_CARD_VALUE_TEXT : 'text-base';
  const dataText = compact ? DASH_CARD_VALUE_TEXT : 'text-base';
  const capHead = cn(padData, headText);
  const capCorner = cn(padCorner, headText);
  /** Aligned with Performance report / equipment tiles — Total / Active / Idle. */
  const headGroup = cn(
    'font-bold uppercase tracking-wide',
    dashDark ? 'bg-emerald-950/50 text-amber-400' : 'bg-[var(--dash-table-header)] text-[var(--dash-text-strong)]'
  );
  const headSub = cn(
    'font-semibold',
    dashDark ? 'text-amber-400/90 bg-white/[0.04]' : 'text-[var(--dash-warm-caption)] bg-[var(--dash-hover-surface)]'
  );
  const thCorner = cn(
    'font-bold leading-tight',
    dashDark ? 'text-amber-400 bg-[var(--dash-card)]' : 'text-[var(--dash-text-strong)] bg-[var(--dash-card)]'
  );
  const subHeaderStickyTop = compact
    ? 'sticky top-[1.875rem] z-20 shadow-sm'
    : 'sticky top-[2.75rem] z-20 shadow-sm';
  const bodyRow = dashDark ? 'bg-emerald-950/20' : 'bg-[var(--dash-card)]/90';
  const dataTxt = dashCardMetricValueClass(dashDark);
  const rowLabel = dashDark ? 'text-white/90' : 'text-[var(--dash-text)]';
  return (
    <div
      className={cn(
        showSheetTitle ? 'mt-1 w-full min-w-0 max-w-full min-h-0 overflow-x-auto' : 'w-full min-w-0 max-w-full min-h-0 overflow-x-auto',
        SCROLL_AREA_NO_BAR,
        compact && '-mx-0.5'
      )}
    >
      {showSheetTitle ? (
        <p
          className={cn(
            'mb-0.5 text-center font-bold uppercase tracking-wide',
            dashDark ? 'text-emerald-400' : 'text-[var(--dash-text-muted)]',
            compact ? 'text-[13px]' : 'text-base'
          )}
        >
          STAFF UTILIZATION
        </p>
      ) : null}
      <StaffUtilizationMobileList dashDark={dashDark} compact={compact} />
      <div
        className={cn(
          DASH_TABLE_DESKTOP_CLASS,
          'overflow-hidden rounded-lg border',
          dashDark ? 'border-emerald-800/50 bg-emerald-950/30' : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/80'
        )}
      >
        <table className="w-full min-w-[40rem] border-collapse whitespace-nowrap text-left">
          <thead>
            <tr>
              <th
                scope="col"
                rowSpan={2}
                className={cn(
                  b,
                  capCorner,
                  thCorner,
                  'sticky top-0 z-40',
                  'min-w-[5.5rem] max-w-[7rem] align-middle text-left'
                )}
              >
                <span className="inline-block leading-snug text-amber-400">Category parameters</span>
              </th>
              <th
                scope="colgroup"
                colSpan={3}
                className={cn(b, capHead, headGroup, 'sticky top-0 z-30 shadow-sm')}
              >
                Ramp
              </th>
              <th
                scope="colgroup"
                colSpan={3}
                className={cn(b, capHead, headGroup, 'sticky top-0 z-30 shadow-sm')}
              >
                Terminal
              </th>
            </tr>
            <tr>
              <th scope="col" className={cn(b, capHead, headSub, subHeaderStickyTop)}>
                Total
              </th>
              <th scope="col" className={cn(b, capHead, headSub, subHeaderStickyTop)}>
                Active
              </th>
              <th scope="col" className={cn(b, capHead, headSub, subHeaderStickyTop)}>
                Idle
              </th>
              <th scope="col" className={cn(b, capHead, headSub, subHeaderStickyTop)}>
                Total
              </th>
              <th scope="col" className={cn(b, capHead, headSub, subHeaderStickyTop)}>
                Active
              </th>
              <th scope="col" className={cn(b, capHead, headSub, subHeaderStickyTop)}>
                Idle
              </th>
            </tr>
          </thead>
          <tbody>
            {STAFF_UTILIZATION_CATEGORIES.map((code) => {
              const cell = STAFF_UTILIZATION_HOURS_DEMO[code];
              const ramp = staffUtilBandMetrics(cell.ramp);
              const terminal = staffUtilBandMetrics(cell.terminal);
              return (
                <tr
                  key={code}
                  className={cn('border-t', dashDark ? 'border-white/10' : 'border-[var(--dash-table-border)]')}
                >
                  <th
                    scope="row"
                    className={cn(
                      b,
                      padCorner,
                      labelText,
                      'text-left font-medium leading-none tabular-nums',
                      bodyRow,
                      rowLabel
                    )}
                  >
                    {code}
                  </th>
                  <td
                    className={cn(
                      b,
                      padData,
                      dataText,
                      bodyRow,
                      dataTxt,
                      'text-center font-semibold tabular-nums'
                    )}
                  >
                    {formatStaffUtilHours(ramp.total)}
                  </td>
                  <td
                    className={cn(
                      b,
                      padData,
                      dataText,
                      bodyRow,
                      dataTxt,
                      'text-center font-semibold tabular-nums'
                    )}
                  >
                    {formatStaffUtilHours(ramp.active)}
                  </td>
                  <td
                    className={cn(
                      b,
                      padData,
                      dataText,
                      bodyRow,
                      dataTxt,
                      'text-center font-semibold tabular-nums'
                    )}
                  >
                    {formatStaffUtilHours(ramp.idle)}
                  </td>
                  <td
                    className={cn(
                      b,
                      padData,
                      dataText,
                      bodyRow,
                      dataTxt,
                      'text-center font-semibold tabular-nums'
                    )}
                  >
                    {formatStaffUtilHours(terminal.total)}
                  </td>
                  <td
                    className={cn(
                      b,
                      padData,
                      dataText,
                      bodyRow,
                      dataTxt,
                      'text-center font-semibold tabular-nums'
                    )}
                  >
                    {formatStaffUtilHours(terminal.active)}
                  </td>
                  <td
                    className={cn(
                      b,
                      padData,
                      dataText,
                      bodyRow,
                      dataTxt,
                      'text-center font-semibold tabular-nums'
                    )}
                  >
                    {formatStaffUtilHours(terminal.idle)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AircraftMixCategoryRows({
  mix,
  dashDark,
  compact,
  placeholder = false,
}: {
  mix?: ScheduledCategoryMix | null;
  dashDark: boolean;
  compact?: boolean;
  placeholder?: boolean;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-y-1', compact ? DASH_CARD_VALUE_TEXT : 'text-base')}>
      {AIRCRAFT_ANALYSIS_MIX_ROWS.map(({ schCode, uiLabel, title }) => {
        const n = placeholder || !mix ? null : scheduledMixCountForSchCode(mix, schCode);
        return (
          <div
            key={schCode}
            className="flex w-full items-center justify-between gap-2 border-b border-dashed border-[var(--dash-table-border)] pb-0.5 last:border-0 dark:border-white/10"
            title={title}
          >
            <span
              className={cn(
                'font-medium tabular-nums whitespace-nowrap',
                dashDark ? 'text-white/90' : 'text-[var(--dash-text)]'
              )}
            >
              {uiLabel}
            </span>
            <span
              className={cn(
                'ml-auto font-semibold tabular-nums whitespace-nowrap',
                n == null
                  ? dashDark
                    ? 'text-white/40'
                    : 'text-[var(--dash-text-muted)]'
                  : dashCardMetricValueClass(dashDark)
              )}
            >
              {n == null ? '–' : <DashCountInt end={n} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Body scroll clamp for aircraft tile beside compact equipment utilization (~ equipment table band). */
const DASH_EQUIP_ROW_ANALYTICS_CLAMP =
  'max-h-[min(17.75rem,52vh)] overflow-y-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]';

/** Airline remarks: a bit shorter than aircraft clamp so the card reads slightly tighter. */
const DASH_AIRLINE_REMARKS_ROW_CLAMP =
  'max-h-[min(16rem,45vh)] overflow-y-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]';

function TypeCraftInsightTile({
  totalFlights,
  subtitle,
  description,
  onClick,
  className,
  compact,
  dashDark = false,
  aircraftCategoryMix,
  aircraftCategoryLoading,
  equipmentRowClamp = false,
}: {
  totalFlights: number;
  subtitle: string;
  description: string;
  onClick: () => void;
  className?: string;
  compact?: boolean;
  dashDark?: boolean;
  aircraftCategoryMix?: AircraftCategoryMixResponse | null;
  aircraftCategoryLoading?: boolean;
  /** Caps scroll region to ~ equipment utilization tile height when both sit in the same dashboard row. */
  equipmentRowClamp?: boolean;
}) {
  const clampRow = Boolean(compact && equipmentRowClamp);
  return (
    <div
      className={cn(
        dashboardAnalyticsCardHover,
        'group relative flex w-full flex-col overflow-visible rounded-xl border text-left antialiased',
        compact ? 'h-auto min-h-0' : 'h-full min-h-[178px]',
        DASH_CARD_GLOW_ANIM,
        dashboardCardBgTransition,
        className
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label="Open aircraft analysis details"
        className="absolute inset-0 z-0 rounded-xl border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-card)]"
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-[1] bg-gradient-to-br from-[var(--dash-card)] via-[var(--dash-gradient-mid)] to-[var(--dash-warm)]/10 opacity-80 transition-opacity group-hover:opacity-90',
          DASH_CARD_INTERACTION_DURATION,
          DASH_CARD_INTERACTION_EASE,
          DASH_CARD_HOVER_IN_DELAY
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-[1] rounded-xl ring-0 ring-emerald-400/35',
          dashboardCardRingTransition,
          'group-hover:ring-2 group-hover:ring-emerald-400/50 group-hover:shadow-[inset_0_0_28px_rgba(16,185,129,0.09)]'
        )}
      />
      <div
        className={cn(
          'relative z-10 flex flex-col pointer-events-none',
          compact ? (clampRow ? 'h-auto px-1 pb-1 pt-0.5' : 'h-auto p-1.5') : 'min-h-0 flex-1 p-3'
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-start justify-between gap-2',
            compact ? (clampRow ? 'mb-0.5' : 'mb-1') : 'mb-2'
          )}
        >
          <div className="relative min-w-0 flex-1">
            <p
              className={cn(
                'font-bold uppercase tracking-wide',
                dashDark ? 'text-emerald-400' : 'text-[var(--dash-text-muted)]',
                compact ? 'text-[14px]' : 'text-base'
              )}
            >
              Aircraft analysis
            </p>
          </div>
          <div
            className="pointer-events-auto relative z-20"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <DashboardTileInfoHover
              compact={compact}
              icon={<Layers className={compact ? 'h-3.5 w-3.5' : 'h-5 w-5'} />}
              subtitle={subtitle}
              description={description}
            />
          </div>
        </div>

        <div
          className={cn(
            'relative rounded-lg border',
            clampRow ? cn('mt-1 p-1', DASH_EQUIP_ROW_ANALYTICS_CLAMP, SCROLL_AREA_NO_BAR) : compact ? 'mt-1.5 p-1.5' : 'mt-2 p-2',
            dashDark ? 'border-emerald-800/50 bg-emerald-950/90' : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/90'
          )}
        >
            {aircraftCategoryLoading ? (
              <p
                className={cn(
                  'tabular-nums',
                  dashDark ? 'text-white/80' : 'text-[var(--dash-text-muted)]',
                  compact ? DASH_CARD_VALUE_TEXT : 'text-base'
                )}
              >
                …
              </p>
            ) : aircraftCategoryMix &&
              aircraftCategoryMix.scheduled.total === 0 &&
              aircraftCategoryMix.additional.total === 0 ? (
              <p
                className={cn(
                  dashDark ? 'text-white/70' : 'text-[var(--dash-text-muted)]',
                  compact ? DASH_CARD_VALUE_TEXT : 'text-base'
                )}
              >
                No operated flights in this STA date range in fhr_collection, or categories could not be read from mainDetails.
              </p>
            ) : (
              <div
                className={cn(
                  'grid min-w-0 grid-cols-2 gap-x-0',
                  compact ? 'text-[14px]' : 'text-[15px]'
                )}
              >
                <div
                  className={cn(
                    'flex min-w-0 flex-col',
                    compact ? 'pr-1.5' : 'pr-2',
                    'border-r border-dashed',
                    dashDark ? 'border-white/15' : 'border-[var(--dash-table-border)]'
                  )}
                >
                  <p
                    className={cn(
                      'shrink-0 font-bold uppercase tracking-wide',
                      dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]',
                      compact ? 'mb-0.5 text-[13px]' : 'mb-1 text-sm'
                    )}
                  >
                    Sch-flts
                  </p>

                  <div className="min-w-0">
                    <AircraftMixCategoryRows
                      mix={aircraftCategoryMix?.scheduled ?? null}
                      placeholder={!aircraftCategoryMix}
                      dashDark={dashDark}
                      compact={compact}
                    />
                  </div>
                </div>
                <div className={cn('flex min-w-0 flex-col', compact ? 'pl-1.5' : 'pl-2')}>
                  <p
                    className={cn(
                      'shrink-0 font-bold uppercase tracking-wide',
                      dashDark ? 'text-amber-400' : 'text-[var(--dash-warm-caption)]',
                      compact ? 'mb-0.5 text-[13px]' : 'mb-1 text-sm'
                    )}
                  >
                    Addl-flts
                  </p>

                  <div className="min-w-0">
                    <AircraftMixCategoryRows
                      mix={aircraftCategoryMix?.additional ?? null}
                      placeholder={!aircraftCategoryMix}
                      dashDark={dashDark}
                      compact={compact}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

/** KPI strip: caption left, dominant number right; optional watermark icon centered in the tile. */
function KpiStripMetricLine({
  dashDark,
  label,
  tone,
  title,
  ready,
  end,
}: {
  dashDark: boolean;
  label: string;
  tone: 'amber' | 'emerald';
  title?: string;
  ready: boolean;
  end: number;
}) {
  const captionClass =
    tone === 'amber'
      ? dashDark
        ? 'text-amber-200/85'
        : 'text-amber-900/65'
      : dashDark
        ? 'text-emerald-200/85'
        : 'text-emerald-900/65';

  const valueClass =
    tone === 'amber'
      ? dashDark
        ? 'text-white'
        : 'text-amber-950'
      : dashDark
        ? 'text-white'
        : 'text-emerald-950';

  return (
    <div
      title={title}
      className="relative flex min-h-0 min-w-0 w-full max-w-full flex-row items-center justify-between gap-2 overflow-hidden px-1.5 py-2 text-left sm:gap-3 sm:px-2 sm:py-2.5"
    >
      <span
        className={cn(
          'relative z-[1] min-w-0 flex-1 truncate text-left text-[14px] font-bold uppercase tracking-[0.1em] sm:text-[15px] md:text-[16px] md:tracking-[0.11em]',
          captionClass
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'relative z-[1] shrink-0 whitespace-nowrap text-right tabular-nums text-[1.2rem] font-bold leading-none tracking-tight sm:text-[1.35rem] sm:leading-none lg:text-[1.5rem]',
          valueClass
        )}
      >
        {ready ? <DashCountInt end={end} /> : '\u00a0'}
      </span>
    </div>
  );
}

/** Top KPI row: glowing rim + halo only when `dashDark` (dashboard theme toggle). */
function KpiStripCell({
  dashDark,
  haloClass,
  borderWrapClass,
  faceClass,
  faceDarkClass,
  children,
}: {
  dashDark: boolean;
  haloClass: string;
  borderWrapClass: string;
  faceClass: string;
  faceDarkClass: string;
  children: ReactNode;
}) {
  if (!dashDark) {
    return (
      <div className={cn(KPI_CELL_LIGHT, dashboardKpiStripShellHover)}>
        <div className={cn(faceClass, 'min-h-0 flex-1')}>{children}</div>
      </div>
    );
  }
  return (
    <div className={cn(KPI_SLOT_SHELL, dashboardKpiStripShellHover)}>
      <div className={haloClass} aria-hidden />
      <div className={cn(borderWrapClass, 'flex min-h-0 flex-1 flex-col')}>
        <div className={cn(faceClass, faceDarkClass, 'min-h-0 flex-1 rounded-[11px]')}>{children}</div>
      </div>
    </div>
  );
}

/** Airline remarks card body: rating rows with counts (no bar charts). */
const AIRLINE_REMARKS_CARD_VALUE_TEXT = 'text-[14px] leading-snug';

function AirlineRemarksRatingBars({
  rows,
  denominator,
}: {
  rows: { rating: string; count: number; sharePct: number }[];
  denominator: number;
}) {
  return (
    <div className="flex flex-col justify-start gap-1 py-0.5 sm:gap-1.5 sm:py-0.5">
      {rows.map((row) => {
        const ui = airlineRatingUi(row.rating);
        return (
          <div
            key={row.rating}
            className="min-w-0 rounded-md border-l-[3px] border-solid py-1 pl-2 pr-1 sm:py-1.5"
            style={{
              borderLeftColor: ui.color,
            }}
            title={`${row.count.toLocaleString()} of ${denominator.toLocaleString()} active non-cancelled flights (${row.sharePct}%)`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn('min-w-0 truncate font-semibold', AIRLINE_REMARKS_CARD_VALUE_TEXT)}
                style={{ color: ui.color }}
              >
                {row.rating}
              </span>
              <span
                className={cn(
                  'shrink-0 text-right font-semibold tabular-nums leading-snug',
                  AIRLINE_REMARKS_CARD_VALUE_TEXT
                )}
                style={{ color: ui.color }}
              >
                {denominator > 0 ? (
                  <>
                    <span className="tabular-nums">{row.count.toLocaleString()}</span>
                    <span className="ml-1 font-medium tabular-nums opacity-85">({row.sharePct}%)</span>
                  </>
                ) : (
                  DASH_DB_PLACEHOLDER
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BirdFlightDelhiDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboardReturnRestoredRef = useRef(false);
  /** Frozen for this mount so picker fallbacks match the initial From/To. */
  const initialRange = useMemo(() => defaultDashboardInitialState(), []);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const dashboardFlightScope: DashboardFlightScope =
    parseDashboardFlightScopeFromSearch(searchParams);
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  const [performanceReportDrillKey, setPerformanceReportDrillKey] = useState<string | null>(null);
  /** Skip modal flip/zoom when reopening a drill after "Back to dashboard" from Scheduled Airlines. */
  const [dashboardModalOpenInstant, setDashboardModalOpenInstant] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [airlineRemarksDrillRetrySeq, setAirlineRemarksDrillRetrySeq] = useState(0);
  /** Flights-with-text modal: one tab per rating + Blanks (`remarks.airlineRemarksRating`). */
  const [airlineRemarksModalTab, setAirlineRemarksModalTab] = useState<AirlineRemarksModalTab>('Satisfactory');
  const [equipmentUtilSlotMode, setEquipmentUtilSlotMode] = useState<EquipmentUtilSlotMode>('4h');
  const [equipmentUtilChartCategory, setEquipmentUtilChartCategory] =
    useState<EquipmentUtilChartCategory>('motorised');
  /** Bumps when `fhr_collection` is merged (e.g. main details save) so dashboard cards refetch. */
  const [fhrCollectionRefreshSeq, setFhrCollectionRefreshSeq] = useState(0);
  /** Snooze bell: visible while a cancellation event is newer than the last time the user opened and closed the center. */
  const onCancellationBellEvent = useCallback(() => {
    setFhrCollectionRefreshSeq((n) => n + 1);
  }, []);
  const { visible: cancellationBellVisible } = useCancellationBell(onCancellationBellEvent);
  const handleNotificationCenterOpenChange = useCallback((open: boolean) => {
    setNotificationCenterOpen(open);
    if (!open) dismissCancellationBell();
  }, []);
  const { resolved } = useDashboardTheme();
  /** Dashboard toggle dark — drive tile typography so it always matches the toggle (not only `html.dark`). */
  const dashDark = resolved === 'dark';
  const prefersReducedMotion = useReducedMotion();
  const [themeFlipSeq, setThemeFlipSeq] = useState(0);
  const chartTheme = useMemo(() => buildChartTheme(resolved === 'dark'), [resolved]);

  useEffect(() => {
    setOpenCard(null);
    setPerformanceReportDrillKey(null);
  }, [dashboardFlightScope]);

  const openModal = useCallback((id: CardId) => {
    if (id === 'airlineRemarks') setAirlineRemarksModalTab('Satisfactory');
    setOpenCard(id);
  }, []);

  const openPerformanceReportDrill = useCallback((key: string) => {
    setPerformanceReportDrillKey(key);
    setOpenCard('performanceReportDrill');
  }, []);

  const scheduledAirlinesLinkContext = useMemo(() => {
    const scopeFields = { flightScope: dashboardFlightScope };
    if (openCard === 'onTimeFlights') {
      return { dashFrom: fromDate, dashTo: toDate, dashOpenCard: 'onTimeFlights' as const, ...scopeFields };
    }
    if (openCard === 'ghaImprovement') {
      return { dashFrom: fromDate, dashTo: toDate, dashOpenCard: 'ghaImprovement' as const, ...scopeFields };
    }
    if (openCard === 'performanceReportDrill' && performanceReportDrillKey) {
      return {
        dashFrom: fromDate,
        dashTo: toDate,
        dashOpenCard: 'performanceReportDrill' as const,
        dashDrillKey: performanceReportDrillKey,
        ...scopeFields,
      };
    }
    if (openCard === 'carrierMix') {
      return { dashFrom: fromDate, dashTo: toDate, dashOpenCard: 'carrierMix' as const, ...scopeFields };
    }
    if (openCard === 'airlineRemarks') {
      return { dashFrom: fromDate, dashTo: toDate, dashOpenCard: 'airlineRemarks' as const, ...scopeFields };
    }
    return null;
  }, [openCard, fromDate, toDate, performanceReportDrillKey, dashboardFlightScope]);

  useEffect(() => {
    if (dashboardReturnRestoredRef.current) return;

    const notifRestore = parseDashboardNotificationReturnFromUrl(searchParams);
    if (notifRestore) {
      dashboardReturnRestoredRef.current = true;
      if (notifRestore.dashFrom) setFromDate(notifRestore.dashFrom);
      if (notifRestore.dashTo) setToDate(notifRestore.dashTo);
      setNotificationCenterOpen(true);
      router.replace(dashboardHrefAfterReturnRestore(dashboardFlightScope), { scroll: false });
      return;
    }

    const restore = parseDashboardReturnFromUrl(searchParams);
    if (!restore) return;
    dashboardReturnRestoredRef.current = true;

    if (restore.dashFrom) setFromDate(restore.dashFrom);
    if (restore.dashTo) setToDate(restore.dashTo);

    setDashboardModalOpenInstant(true);

    if (restore.dashOpenCard === 'onTimeFlights') {
      openModal('onTimeFlights');
    } else if (restore.dashOpenCard === 'ghaImprovement') {
      openModal('ghaImprovement');
    } else if (restore.dashOpenCard === 'performanceReportDrill' && restore.dashDrillKey) {
      openPerformanceReportDrill(restore.dashDrillKey);
    } else if (restore.dashOpenCard === 'carrierMix') {
      openModal('carrierMix');
    } else if (restore.dashOpenCard === 'airlineRemarks') {
      openModal('airlineRemarks');
    }

    router.replace(dashboardHrefAfterReturnRestore(restore.flightScope), { scroll: false });
  }, [searchParams, router, openModal, openPerformanceReportDrill, dashboardFlightScope]);

  useEffect(() => {
    if (!dashboardModalOpenInstant || openCard === null) return;
    const id = window.setTimeout(() => setDashboardModalOpenInstant(false), 64);
    return () => window.clearTimeout(id);
  }, [openCard, dashboardModalOpenInstant]);

  useEffect(() => {
    const onFhrMerged = () => setFhrCollectionRefreshSeq((s) => s + 1);
    window.addEventListener(FHR_COLLECTION_UPDATED_EVENT, onFhrMerged);
    return () => window.removeEventListener(FHR_COLLECTION_UPDATED_EVENT, onFhrMerged);
  }, []);

  const monthDateFrom = useCallback((m: MonthData) => monthStartFromMonthData(m), []);

  /** Clamped inclusive day range when both start and end are set; `invalid` if start > end. */
  const effectiveDayRange = useMemo((): { from: Date; to: Date } | 'invalid' | null => {
    const from = fromDate ? parseLocalYmd(fromDate) : null;
    const to = toDate ? parseLocalYmd(toDate) : null;
    if (!from || !to) return null;
    if (startOfLocalDay(from).getTime() > startOfLocalDay(to).getTime()) return 'invalid';
    return { from: startOfLocalDay(from), to: startOfLocalDay(to) };
  }, [fromDate, toDate]);

  /** Dashboard date range for `GET /flights/cancellations` — same calendar range as the date pickers (inclusive). */
  const dashboardCancellationApiRange = useMemo((): { from: string; to: string } | null => {
    if (effectiveDayRange === 'invalid') return null;
    const f = fromDate.trim();
    const t = toDate.trim();
    const ymdOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (f && t && ymdOk(f) && ymdOk(t) && f <= t) {
      return { from: f, to: t };
    }
    if (effectiveDayRange && typeof effectiveDayRange === 'object') {
      return { from: toInputDate(effectiveDayRange.from), to: toInputDate(effectiveDayRange.to) };
    }
    return null;
  }, [effectiveDayRange, fromDate, toDate]);

  const dashboardRangeFrom = dashboardCancellationApiRange?.from ?? '';
  const dashboardRangeTo = dashboardCancellationApiRange?.to ?? '';
  const dashboardRangeActive = dashboardCancellationApiRange != null;

  const {
    airlineRatingsSummary,
    airlineRatingsLoading,
    airlineRemarksWithTextRows,
    airlineRemarksWithTextLoading,
    airlineRemarksDrillError,
    airlineRemarksDrillMeta,
    equipmentUtilSlotsPayload,
    equipmentUtilSlotsLoading,
    aircraftCategoryMix,
    aircraftCategoryLoading,
    aircraftAnalysisFlights,
    aircraftAnalysisFlightsLoading,
    primaryCards,
    primaryCardsLoading,
    performanceReportCard,
    performanceReportCardLoading,
    performanceDrilldownPayload,
    performanceDrilldownLoading,
  } = useBirdDashboardCardFetches({
    rangeFrom: dashboardRangeFrom,
    rangeTo: dashboardRangeTo,
    rangeActive: dashboardRangeActive,
    fhrRefreshSeq: fhrCollectionRefreshSeq,
    openCard,
    airlineRemarksDrillRetrySeq,
    equipmentUtilSlotMode,
    flightScope: dashboardFlightScope,
  });

  const filteredMonths = useMemo((): MonthData[] => [], []);
  const activeMonths = useMemo((): MonthData[] => [], []);

  const mar26MonthForNetChart = useMemo(
    () => undefined as MonthData | undefined,
    [],
  );
  const mar26MonthForNetChartMerged = mar26MonthForNetChart;
  const march2026NetDeviationLineData = useMemo(
    () => buildMarch2026NetDeviationSeries(mar26MonthForNetChartMerged),
    [mar26MonthForNetChartMerged]
  );
  const { yDomain: march2026NetYDomain, yTicks: march2026NetYTicks } = useMemo((): {
    yDomain: [number, number];
    yTicks: number[];
  } => {
    const values = march2026NetDeviationLineData.map((d) => d.net);
    const maxAbs = values.length === 0 ? 0 : Math.max(...values.map((v) => Math.abs(v)));
    const safeMax = Math.max(maxAbs, 40);
    const rawStep = Math.ceil(safeMax / 3);
    const step = roundStep(rawStep);
    const yDomain: [number, number] = [-step * 3, step * 3];
    const yTicks = [-step * 3, -step * 2, -step, 0, step, step * 2, step * 3];
    return { yDomain, yTicks };
  }, [march2026NetDeviationLineData]);

  const firstMonth = activeMonths[0];
  const lastMonth = activeMonths[activeMonths.length - 1];

  const totals = useMemo(
    () => ({ on: 0, delayed: 0, before: 0, other: 0, total: 0 }),
    [],
  );

  const topAirlines = useMemo(() => {
    if (!activeMonths.length) return [] as { name: string; count: number }[];
    const map = new Map<string, number>();
    for (const m of activeMonths) for (const a of m.topAirlines) map.set(a.name, (map.get(a.name) ?? 0) + a.count);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [activeMonths]);

  /** Full carrier list in range (merged from `allAirlines` per month when present; else capped `topAirlines`). */
  const allAirlinesInRange = useMemo(() => {
    if (!activeMonths.length) return [] as { name: string; count: number }[];
    const map = new Map<string, number>();
    for (const m of activeMonths) {
      const rows = m.allAirlines?.length ? m.allAirlines : m.topAirlines;
      for (const a of rows) map.set(a.name, (map.get(a.name) ?? 0) + a.count);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [activeMonths]);

  const reasons = useMemo(() => {
    if (!activeMonths.length) return [] as { reason: string; count: number }[];
    const map = new Map<string, number>();
    for (const m of activeMonths) for (const r of m.topDelayReasons) map.set(r.reason, (map.get(r.reason) ?? 0) + r.count);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }));
  }, [activeMonths]);

  const duration = useMemo(() => {
    if (!activeMonths.length) return [] as { bucket: string; count: number }[];
    const order = ['0 min', '1–5 min', '6–15 min', '16–30 min', '31–60 min', '60+ min'];
    const map = new Map(order.map((o) => [o, 0]));
    for (const m of activeMonths) for (const d of m.delayDurationBuckets) map.set(d.bucket, (map.get(d.bucket) ?? 0) + d.count);
    return order.map((bucket) => ({ bucket, count: map.get(bucket) ?? 0 }));
  }, [activeMonths]);

  const filteredCalendarDaySpan = useMemo(() => {
    if (effectiveDayRange && typeof effectiveDayRange === 'object') {
      return calendarDaysInclusive(effectiveDayRange.from, effectiveDayRange.to);
    }
    if (!activeMonths.length) return 1;
    const first = monthDateFrom(activeMonths[0]);
    const lastEnd = endOfMonth(monthDateFrom(activeMonths[activeMonths.length - 1]));
    return calendarDaysInclusive(first, lastEnd);
  }, [effectiveDayRange, activeMonths, monthDateFrom]);

  const showProratedMonthNote = false;

  const volumeMomInRange = useMemo(() => {
    if (activeMonths.length < 2) return null;
    const pm = activeMonths[activeMonths.length - 2];
    const lm = activeMonths[activeMonths.length - 1];
    if (!pm.totalFlights) return null;
    return Math.round(((lm.totalFlights - pm.totalFlights) / pm.totalFlights) * 1000) / 10;
  }, [activeMonths]);

  const groundTimeTotals = useMemo(() => {
    let totalAgtMinutes = 0;
    let totalSgtMinutes = 0;
    let gtAddedFlightCount = 0;
    let flightsWithAgt = 0;
    for (const m of activeMonths) {
      const g = m.groundTime;
      if (!g) continue;
      totalAgtMinutes += g.totalAgtMinutes;
      totalSgtMinutes += g.totalSgtMinutes;
      gtAddedFlightCount += g.gtAddedFlightCount;
      flightsWithAgt += g.flightsWithAgt;
    }
    return { totalAgtMinutes, totalSgtMinutes, gtAddedFlightCount, flightsWithAgt };
  }, [activeMonths]);

  /** Merge `delayCategories` across months in range (e.g. 1, 2, LAST, CANC). */
  const mergedDelayCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of activeMonths) {
      for (const d of m.delayCategories ?? []) {
        const code = String(d.code ?? '').trim();
        if (!code) continue;
        map.set(code, (map.get(code) ?? 0) + d.count);
      }
    }
    return [...map.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeMonths]);

  const ghaDelayTotalCount = useMemo(
    () => mergedDelayCategories.reduce((s, c) => s + c.count, 0),
    [mergedDelayCategories]
  );

  const ghaDashboardDelayRows = useMemo(() => {
    const describe = (code: string): string => {
      const u = code.toUpperCase();
      if (u === 'LAST') return 'Last-off block / end-of-series aggregate';
      if (u === 'CANC') return 'Cancellation-related bucket';
      if (u === '1') return 'Delay category 1 (source-defined)';
      if (u === '2') return 'Delay category 2 (source-defined)';
      const n = Number(code);
      if (Number.isInteger(n) && n >= 11 && n <= 52) {
        return `GHA delay code ${n} (ground handling attributable)`;
      }
      return `Delay category ${code}`;
    };
    return mergedDelayCategories.map((c) => ({
      code: c.code,
      count: c.count,
      description: describe(c.code),
      countLabel: c.count === 1 ? '1 flight delay' : `${c.count.toLocaleString()} flight delays`,
    }));
  }, [mergedDelayCategories]);

  const ghaDelayCountsNote = useMemo((): string | null => {
    const hasNumericGha = mergedDelayCategories.some((c) => {
      const n = Number(c.code);
      return Number.isInteger(n) && n >= 11 && n <= 52;
    });
    if (hasNumericGha) return null;
    if (!mergedDelayCategories.length) {
      return 'No delay category breakdown in the loaded data for this range.';
    }
    return 'Loaded data uses rolled-up delay buckets (for example 1, 2, LAST, CANC). Individual GHA numeric codes 11–52 are not present in this range.';
  }, [mergedDelayCategories]);

  /** Precomputed drill-down from `dashboard_summaries` (lazy-loaded after primary cards). */
  const performanceReportDrilldown = useMemo((): DashboardPerformanceDrilldownPayload | null => {
    const raw = performanceDrilldownPayload;
    if (!raw?.partitionMeta || !Array.isArray(raw.flights)) return null;
    return normalizePerformanceDrilldownPayload(raw);
  }, [performanceDrilldownPayload]);

  const resolvedPerformanceFlightsForReport = useMemo((): DashboardPerformanceDrillFlightRow[] => {
    return performanceReportDrilldown?.flights ?? [];
  }, [performanceReportDrilldown]);

  /** OTP grid from precomputed primary cards API. */
  const mergedOtpMatrixForDashboard = useMemo(
    () => primaryCards?.onTimePerformance?.matrix ?? null,
    [primaryCards],
  );

  /** Row 1 / Col 3 (`>GT & <=STD`): ATA<STA AND AGT>SGT AND ATD<=STD. */
  const otpBeforeStaGtLeStdFlights = useMemo(
    () =>
      sortPerformanceFlightsBySta(
        listOtpBeforeStaGtLeStdFlights(
          resolvedPerformanceFlightsForReport as PerformanceFlightFromDb[],
        ),
      ),
    [resolvedPerformanceFlightsForReport],
  );

  const performanceReport = useMemo((): PerformanceReportSnapshot | null => {
    if (!performanceReportCard) return null;
    return performanceReportCard as PerformanceReportSnapshot;
  }, [performanceReportCard]);

  const onTimeModalFlights = useMemo(() => {
    if (!performanceReportDrilldown) return [];
    return performanceFlightsForReportDrillKey('on-time', performanceReportDrilldown);
  }, [performanceReportDrilldown]);

  const onTimeStaAtaChartFlights = useMemo((): StaAtaChartFlightInput[] => {
    if (!performanceReportDrilldown || onTimeModalFlights.length === 0) return [];
    return onTimeModalFlights.map((leg) => ({
      sta: leg.sta,
      ata: leg.ata,
    }));
  }, [performanceReportDrilldown, onTimeModalFlights]);

  const fhrGhaDelayCodeStats = useMemo((): DashboardGhaImprovementCard => {
    if (primaryCards?.ghaImprovement) {
      return primaryCards.ghaImprovement;
    }
    return aggregateFhrGhaDelayCodesFromDashboardRows([]);
  }, [primaryCards?.ghaImprovement]);

  /** Modal chart: every station GHA whitelist code on X; counts on Y (0 when none in range). */
  const ghaImprovementModalFullChartRows = useMemo((): GhaImprovementModalBarRow[] => {
    const counts = new Map<number, number>();
    for (const { code, count } of fhrGhaDelayCodeStats.ghaOverviewCodes) {
      counts.set(code, count);
    }
    return FHR_GHA_STATION_DELAY_CODES.map((codeNum) => {
      const code = String(codeNum);
      return {
        code,
        count: counts.get(codeNum) ?? 0,
        description: getDelayReasonLabel(code),
      };
    });
  }, [fhrGhaDelayCodeStats.ghaOverviewCodes]);

  const ghaImprovementModalChartYMax = useMemo(() => {
    const m = ghaImprovementModalFullChartRows.reduce((acc, r) => Math.max(acc, r.count), 0);
    return Math.max(5, m);
  }, [ghaImprovementModalFullChartRows]);

  /** Flights for row d. Improvement for GHA: drill rows with `ghaCategory === 'improved'` (matches primary-card count after drill refresh). */
  const ghaImprovementReportPartitionFlights = useMemo((): DashboardPerformanceDrillFlightRow[] => {
    if (!performanceReportDrilldown) return [];
    return performanceFlightsForReportDrillKey('gha-improvement', performanceReportDrilldown);
  }, [performanceReportDrilldown]);

  const remarksFromSheetTotal = useMemo(() => {
    let n = 0;
    let has = false;
    for (const m of activeMonths) {
      if (m.airlineRemarksFromSheet != null) {
        has = true;
        n += m.airlineRemarksFromSheet.remarkRowCount ?? 0;
      }
    }
    return has ? n : null;
  }, [activeMonths]);

  const remarksSheetRangeLabel = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    for (const m of activeMonths) {
      const r = m.airlineRemarksFromSheet;
      if (!r) continue;
      if (r.dateMin && (!min || r.dateMin < min)) min = r.dateMin;
      if (r.dateMax && (!max || r.dateMax > max)) max = r.dateMax;
    }
    if (min && max) return `${min} → ${max}`;
    return null;
  }, [activeMonths]);

  const kpiStripFromApi = primaryCards?.kpiStrip ?? null;

  const topStripDbReady =
    dashboardCancellationApiRange != null &&
    !primaryCardsLoading &&
    kpiStripFromApi != null;
  const topStripMayFly = kpiStripFromApi?.totalFlights ?? 0;
  const topStripDidFly = kpiStripFromApi?.didFlyFlights ?? 0;
  const topStripSch = kpiStripFromApi?.scheduledFlights ?? 0;
  const topStripAddl = kpiStripFromApi?.additionalFlights ?? 0;
  const topStripXxld = kpiStripFromApi?.cancelledFlights ?? 0;

  const cancelled = topStripDbReady ? topStripXxld : 0;
  const additionalFlightsTotal = topStripDbReady ? topStripAddl : 0;
  const totalFlightsFiltered = topStripDbReady ? topStripMayFly : 0;
  const nsFlightsTotal = 0;
  const carrierCategoryTotal =
    (aircraftCategoryMix?.scheduled.total ?? 0) + (aircraftCategoryMix?.additional.total ?? 0);
  const carrierMixHasData =
    !aircraftCategoryLoading && aircraftCategoryMix != null && carrierCategoryTotal > 0;

  const carrierMixModalBreakdownRows = useMemo(() => {
    if (!aircraftCategoryMix) return [];
    const rows = AIRCRAFT_ANALYSIS_MIX_ROWS.map(({ schCode, uiLabel, title }) => {
      const scheduled = scheduledMixCountForSchCode(aircraftCategoryMix.scheduled, schCode);
      const additional = scheduledMixCountForSchCode(aircraftCategoryMix.additional, schCode);
      return { name: uiLabel, title, scheduled, additional, total: scheduled + additional };
    });
    const oSch = aircraftCategoryMix.scheduled.other ?? 0;
    const oAdd = aircraftCategoryMix.additional.other ?? 0;
    if (oSch > 0 || oAdd > 0) {
      rows.push({
        name: 'Other',
        title: 'Other / uncategorized',
        scheduled: oSch,
        additional: oAdd,
        total: oSch + oAdd,
      });
    }
    return rows;
  }, [aircraftCategoryMix]);

  const carrierMixModalIntlDomData = useMemo(() => {
    if (!aircraftCategoryMix) return [];
    const other = (aircraftCategoryMix.scheduled.other ?? 0) + (aircraftCategoryMix.additional.other ?? 0);
    const intl = sumAircraftCategorySlices(aircraftCategoryMix, (r) => r.uiLabel.startsWith('I-'));
    const dom = sumAircraftCategorySlices(aircraftCategoryMix, (r) => r.uiLabel.startsWith('D-'));
    const out: { label: string; n: number }[] = [
      { label: 'International', n: intl },
      { label: 'Domestic', n: dom },
    ];
    if (other > 0) out.push({ label: 'Other', n: other });
    return out;
  }, [aircraftCategoryMix]);

  const carrierMixModalNbWbData = useMemo(() => {
    if (!aircraftCategoryMix) return [];
    const other = (aircraftCategoryMix.scheduled.other ?? 0) + (aircraftCategoryMix.additional.other ?? 0);
    const nb = sumAircraftCategorySlices(aircraftCategoryMix, (r) => r.uiLabel.endsWith('-NB'));
    const wb = sumAircraftCategorySlices(aircraftCategoryMix, (r) => r.uiLabel.endsWith('-WB'));
    const out: { label: string; n: number }[] = [
      { label: 'Narrow body', n: nb },
      { label: 'Wide body', n: wb },
    ];
    if (other > 0) out.push({ label: 'Other', n: other });
    return out;
  }, [aircraftCategoryMix]);

  const typeCraftCardSubtitle = (() => {
    if (aircraftCategoryLoading) return 'Loading…';
    if (!aircraftCategoryMix) return DASH_DB_PLACEHOLDER;
    const sch = aircraftCategoryMix.scheduled.total;
    const add = aircraftCategoryMix.additional.total;
    if (sch + add === 0) return DASH_DB_PLACEHOLDER;
    return `Scheduled ${sch.toLocaleString()} · Additional ${add.toLocaleString()}`;
  })();
  const gtAddedRate = pct(groundTimeTotals.gtAddedFlightCount, totalFlightsFiltered);
  const turnaroundMonthlyRows = activeMonths.map((m) => {
    const gtAdded = m.groundTime?.gtAddedFlightCount ?? 0;
    const avgAgtMinutes =
      m.groundTime && m.groundTime.flightsWithAgt > 0
        ? Math.round(m.groundTime.totalAgtMinutes / m.groundTime.flightsWithAgt)
        : null;
    return {
      key: m.key,
      month: m.label.slice(0, 3),
      fullLabel: m.label,
      gtAdded,
      total: m.totalFlights,
      rate: pct(gtAdded, m.totalFlights),
      avgAgtMinutes,
    };
  });
  const worstTurnaroundMonth =
    turnaroundMonthlyRows.length > 0
      ? [...turnaroundMonthlyRows].sort((a, b) => b.rate - a.rate || b.gtAdded - a.gtAdded)[0]
      : null;

  const didFly = topStripDbReady ? topStripDidFly : 0;
  const prClassifiedTotal = performanceReport
    ? (performanceReport.onTimeCount ?? 0) +
      (performanceReport.cancelledCount ?? 0) +
      (performanceReport.offSkdCount ?? 0)
    : 0;
  const prDenominator =
    prClassifiedTotal > 0 ? prClassifiedTotal : (performanceReport?.totalFlights ?? 0);
  const onTimePct = performanceReport ? pct(performanceReport.onTimeCount, prDenominator) : 0;
  const delayPct = performanceReport ? pct(performanceReport.offSkdCount, prDenominator) : 0;
  const beforePct = performanceReport ? pct(performanceReport.bCount, prDenominator) : 0;
  const avgFlightsPerCalendarDayFiltered =
    filteredCalendarDaySpan > 0 ? Math.round((totalFlightsFiltered / filteredCalendarDaySpan) * 100) / 100 : 0;
  const topCarrier = topAirlines[0];

  const performanceReportMonthHeading = 'March 2026';

  const volumeBarData = activeMonths.map((m) => ({ month: m.label.slice(0, 3), flights: m.totalFlights }));

  const airlineRemarksBucketMap = new Map((airlineRatingsSummary?.buckets ?? []).map((b) => [b.rating, b.count]));
  const airlineRemarksFlightDenominator = airlineRatingsSummary?.total ?? 0;
  const airlineRemarksCardRows = [
    ...AIRLINE_RATING_ORDER.map((rating) => ({
      rating,
      count: airlineRemarksBucketMap.get(rating) ?? 0,
      sharePct: pct(airlineRemarksBucketMap.get(rating) ?? 0, airlineRemarksFlightDenominator),
    })),
    {
      rating: AIRLINE_REMARKS_BLANK_LABEL,
      count:
        airlineRatingsSummary?.blanks ??
        airlineRemarksBucketMap.get(AIRLINE_REMARKS_BLANK_LABEL) ??
        0,
      sharePct: pct(
        airlineRatingsSummary?.blanks ??
          airlineRemarksBucketMap.get(AIRLINE_REMARKS_BLANK_LABEL) ??
          0,
        airlineRemarksFlightDenominator,
      ),
    },
  ];
  const airlineRemarksCardTotal = airlineRemarksFlightDenominator;

  const airlineRemarksModalTabRows = useMemo(() => {
    const rows = airlineRemarksWithTextRows;
    if (!rows?.length) return [];
    return rows.filter((r) => airlineRemarkRowMatchesModalTab(r.airlineRemarksRating, airlineRemarksModalTab));
  }, [airlineRemarksWithTextRows, airlineRemarksModalTab]);

  /** Table: selected tab + non-blank airline representative remark text only. */
  const airlineRemarksWithTextFilteredRows = useMemo(() => {
    return airlineRemarksModalTabRows.filter((r) => String(r.airlineRepRem ?? '').trim().length > 0);
  }, [airlineRemarksModalTabRows]);

  /** Per-modal-tab counts — prefer drill snapshot when loaded so KPI matches table/chart. */
  const airlineRemarksModalTabCounts = useMemo((): Record<AirlineRemarksModalTab, number> => {
    const empty: Record<AirlineRemarksModalTab, number> = {
      Excellent: 0,
      Good: 0,
      Satisfactory: 0,
      'Below Average': 0,
      'Not Satisfactory': 0,
      Blanks: 0,
    };
    const src = airlineRemarksDrillMeta?.ratingsSummary ?? airlineRatingsSummary;
    if (!src?.buckets?.length) return empty;
    const m = new Map(src.buckets.map((b) => [b.rating, b.count]));
    for (const tab of AIRLINE_REMARKS_MODAL_TABS) empty[tab] = m.get(tab) ?? 0;
    return empty;
  }, [airlineRemarksDrillMeta, airlineRatingsSummary]);

  /** Per-tab count of flights that actually carry an airline representative remark. */
  const airlineRemarksModalTabRemarkCounts = useMemo((): Record<AirlineRemarksModalTab, number> => {
    const empty: Record<AirlineRemarksModalTab, number> = {
      Excellent: 0,
      Good: 0,
      Satisfactory: 0,
      'Below Average': 0,
      'Not Satisfactory': 0,
      Blanks: 0,
    };
    const rows = airlineRemarksWithTextRows;
    if (!rows?.length) return empty;
    for (const tab of AIRLINE_REMARKS_MODAL_TABS) {
      empty[tab] = rows.filter(
        (r) =>
          airlineRemarkRowMatchesModalTab(r.airlineRemarksRating, tab) &&
          String(r.airlineRepRem ?? '').trim().length > 0,
      ).length;
    }
    return empty;
  }, [airlineRemarksWithTextRows]);

  /** All remark buckets on one chart (modal): X = rating, Y = flight count. */
  const airlineRemarksRatingDistributionChartData = useMemo(() => {
    return AIRLINE_REMARKS_MODAL_TABS.map((rating) => ({
      rating,
      count: airlineRemarksModalTabCounts[rating],
      fill: AIRLINE_RATING_UI_COLORS[rating] ?? '#64748b',
    }));
  }, [airlineRemarksModalTabCounts]);

  const airlineRemarksModalChartLoading =
    (airlineRatingsLoading && airlineRatingsSummary === null) ||
    (airlineRemarksWithTextLoading &&
      airlineRemarksDrillMeta === null &&
      airlineRatingsSummary === null &&
      !airlineRemarksDrillError);

  const periodLabel =
    !fromDate && !toDate
      ? DASHBOARD_META.subtitle
      : `${fromDate ? formatDisplayDate(fromDate) : 'Start'} → ${toDate ? formatDisplayDate(toDate) : 'End'}`;

  /**
   * Both pickers accept any value the user clicks; we don't snap to data bounds at the picker
   * level. `effectiveDayRange` already clamps internally for chart math, so an out-of-data
   * pick only widens the window the cancellation / FHR API endpoints see. The only invariant
   * we enforce here is `from <= to` (swap the opposite endpoint when needed).
   */
  const handleFromDatePickerChange = (value: string) => {
    if (!value.trim()) {
      setFromDate('');
      return;
    }
    const nextFromDay = parseLocalYmd(value);
    if (toDate && nextFromDay) {
      const toDay = parseLocalYmd(toDate);
      if (toDay && startOfLocalDay(nextFromDay).getTime() > startOfLocalDay(toDay).getTime()) {
        setToDate(value);
      }
    }
    setFromDate(value);
  };

  const handleToDatePickerChange = (value: string) => {
    if (!value.trim()) {
      setToDate('');
      return;
    }
    const nextToDay = parseLocalYmd(value);
    if (fromDate && nextToDay) {
      const fromDay = parseLocalYmd(fromDate);
      if (fromDay && startOfLocalDay(nextToDay).getTime() < startOfLocalDay(fromDay).getTime()) {
        setFromDate(value);
      }
    }
    setToDate(value);
  };

  /**
   * No upfront date bounds on the picker — users can land on any month/day. `from <= to` is
   * enforced in the handlers above; `effectiveDayRange` clamps to data for downstream math.
   */
  const datePickerMin = undefined;
  const datePickerMax = undefined;

  const themeFlipReduce = prefersReducedMotion === true;

  return (
    <DashboardModalInstantOpenContext.Provider value={dashboardModalOpenInstant}>
    <DashboardScheduledAirlinesLinkContext.Provider value={scheduledAirlinesLinkContext}>
    <TooltipProvider delayDuration={250}>
      <div className="flex flex-col gap-2.5 overflow-visible rounded-2xl bg-[var(--dash-surface)] p-2 font-sans sm:gap-3 sm:p-2.5">
      <header
        className={cn(
          'w-full shrink-0 overflow-visible rounded-2xl px-2 py-0.5 sm:px-2.5 sm:py-1',
          DASH_CARD_GLOW_ANIM,
          dashboardSurfaceTransition
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between lg:gap-3">
            <div className="min-w-0 w-full flex-1 px-1 sm:px-1.5">
              <div
                aria-label="Key performance indicators"
                className={cn(
                  'grid w-full max-w-full grid-cols-1 gap-2 overflow-visible sm:gap-2.5 min-[480px]:grid-cols-2 min-[480px]:[&>*:nth-child(5)]:col-span-2 min-[900px]:grid-cols-5 min-[900px]:gap-2 min-[900px]:[&>*:nth-child(5)]:col-span-1 min-[900px]:items-stretch',
                  dashboardSurfaceTransition
                )}
              >
              <ThemeFlipCard flipSeq={themeFlipSeq} staggerIndex={0} reduceMotion={themeFlipReduce} className="h-full min-h-0 min-w-0 w-full max-w-full overflow-visible ![isolation:auto]">
                <KpiStripCell
                  dashDark={dashDark}
                  haloClass={KPI_HALO_AMBER_DARK}
                  borderWrapClass={KPI_GLOW_BORDER_WRAP_AMBER_DARK}
                  faceClass={KPI_STRIP_AMBER_FACE}
                  faceDarkClass={KPI_STRIP_AMBER_DARK_TRANSPARENT}
                >
                  <KpiStripMetricLine
                    dashDark={dashDark}
                    label="May Fly"
                    tone="amber"
                    ready={topStripDbReady}
                    end={topStripMayFly}
                  />
                </KpiStripCell>
              </ThemeFlipCard>
              <ThemeFlipCard flipSeq={themeFlipSeq} staggerIndex={1} reduceMotion={themeFlipReduce} className="h-full min-h-0 min-w-0 w-full max-w-full overflow-visible ![isolation:auto]">
                <KpiStripCell
                  dashDark={dashDark}
                  haloClass={KPI_HALO_EMERALD_DARK}
                  borderWrapClass={KPI_GLOW_BORDER_WRAP_EMERALD_DARK}
                  faceClass={KPI_STRIP_EMERALD_FACE}
                  faceDarkClass={KPI_STRIP_EMERALD_DARK_TRANSPARENT}
                >
                  <KpiStripMetricLine
                    dashDark={dashDark}
                    label="Did Fly"
                    tone="emerald"
                    ready={topStripDbReady}
                    end={topStripDidFly}
                  />
                </KpiStripCell>
              </ThemeFlipCard>
              <ThemeFlipCard flipSeq={themeFlipSeq} staggerIndex={2} reduceMotion={themeFlipReduce} className="h-full min-h-0 min-w-0 w-full max-w-full overflow-visible ![isolation:auto]">
                <KpiStripCell
                  dashDark={dashDark}
                  haloClass={KPI_HALO_EMERALD_DARK}
                  borderWrapClass={KPI_GLOW_BORDER_WRAP_EMERALD_DARK}
                  faceClass={KPI_STRIP_EMERALD_FACE}
                  faceDarkClass={KPI_STRIP_EMERALD_DARK_TRANSPARENT}
                >
                  <KpiStripMetricLine
                    dashDark={dashDark}
                    label="Addl"
                    tone="emerald"
                    ready={topStripDbReady}
                    end={topStripAddl}
                  />
                </KpiStripCell>
              </ThemeFlipCard>
              <ThemeFlipCard flipSeq={themeFlipSeq} staggerIndex={3} reduceMotion={themeFlipReduce} className="h-full min-h-0 min-w-0 w-full max-w-full overflow-visible ![isolation:auto]">
                <KpiStripCell
                  dashDark={dashDark}
                  haloClass={KPI_HALO_EMERALD_DARK}
                  borderWrapClass={KPI_GLOW_BORDER_WRAP_EMERALD_DARK}
                  faceClass={KPI_STRIP_EMERALD_FACE}
                  faceDarkClass={KPI_STRIP_EMERALD_DARK_TRANSPARENT}
                >
                  <KpiStripMetricLine
                    dashDark={dashDark}
                    label="Sch"
                    tone="emerald"
                    ready={topStripDbReady}
                    end={topStripSch}
                  />
                </KpiStripCell>
              </ThemeFlipCard>
              <ThemeFlipCard flipSeq={themeFlipSeq} staggerIndex={4} reduceMotion={themeFlipReduce} className="h-full min-h-0 min-w-0 w-full max-w-full overflow-visible ![isolation:auto]">
                <KpiStripCell
                  dashDark={dashDark}
                  haloClass={KPI_HALO_AMBER_DARK}
                  borderWrapClass={KPI_GLOW_BORDER_WRAP_AMBER_DARK}
                  faceClass={KPI_STRIP_AMBER_FACE}
                  faceDarkClass={KPI_STRIP_AMBER_DARK_TRANSPARENT}
                >
                  <KpiStripMetricLine
                    dashDark={dashDark}
                    label="XXLD"
                    tone="amber"
                    title={
                      topStripDbReady
                        ? `${topStripXxld.toLocaleString()} out of ${topStripMayFly.toLocaleString()} flights`
                        : undefined
                    }
                    ready={topStripDbReady}
                    end={topStripXxld}
                  />
                </KpiStripCell>
              </ThemeFlipCard>
              </div>
            </div>

            <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 lg:w-auto lg:items-end">
              {(!fromDate && !toDate) || showProratedMonthNote ? (
                <p className="min-w-0 max-w-none text-[12px] leading-snug text-[var(--dash-text-muted)] sm:text-[13px] lg:max-w-[min(22rem,40vw)] lg:text-right lg:leading-snug">
                  {!fromDate && !toDate ? (
                    <span className="font-medium text-[var(--dash-text)]">{DASHBOARD_META.subtitle}</span>
                  ) : null}
                  {showProratedMonthNote ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-[var(--dash-text-soft)] lg:mt-1">
                      Partial months: monthly totals are prorated to days in range; daily STA/ATA uses exact days
                      only.
                    </span>
                  ) : null}
                </p>
              ) : null}
              <div
                className="flex min-h-0 min-w-0 w-full flex-col gap-2 lg:min-h-[4.125rem] lg:justify-between"
                aria-label="Dashboard date range and theme"
              >
                <div className="flex w-full min-w-0 flex-row items-center gap-2">
                  <div
                    className="flex shrink-0 items-center justify-center touch-manipulation"
                    style={{ minHeight: 44, minWidth: 44 }}
                  >
                    <ThemeToggle
                      size="sm"
                      onToggle={() => setThemeFlipSeq((n) => n + 1)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotificationCenterOpen(true)}
                    className={cn(
                      'relative shrink-0 rounded-lg bg-transparent text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-hover-surface)] active:scale-[0.97]',
                      DASH_TOUCH_TARGET_CLASS,
                      DASH_CARD_INTERACTION_DURATION,
                      DASH_CARD_INTERACTION_EASE
                    )}
                    aria-label="Open notification center"
                  >
                    <Bell className="h-5 w-5 shrink-0 text-[var(--dash-text-strong)]" strokeWidth={1.5} aria-hidden />
                    {cancellationBellVisible ? (
                      <span
                        className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--dash-warm)] ring-2 ring-[var(--dash-card)]"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <DashboardDateRangePicker
                      compact
                      periodLabel={periodLabel}
                      fromDate={fromDate}
                      toDate={toDate}
                      onFromChange={handleFromDatePickerChange}
                      onToChange={handleToDatePickerChange}
                      minDate={datePickerMin ?? undefined}
                      maxDate={datePickerMax ?? undefined}
                      fallbackFromYmd={initialRange.from}
                      fallbackToYmd={initialRange.to}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {effectiveDayRange === 'invalid' && (
          <p className="mt-0.5 text-[12px] text-[var(--dash-warm-text)]">End date must be on or after start date.</p>
        )}
      </header>

        <div className="mt-2.5 flex min-w-0 flex-col gap-4 overflow-x-hidden lg:gap-5">
          <div className="flex min-h-0 w-full min-w-0 flex-col gap-4 lg:gap-4">
            <div className="grid min-h-0 w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch lg:gap-4">
              <ThemeFlipCard
                flipSeq={themeFlipSeq}
                staggerIndex={5}
                reduceMotion={themeFlipReduce}
                fillHeight={false}
                className={cn(
                  dashboardAnalyticsCardHover,
                  'group dash-premium-performance relative flex min-h-0 w-full min-w-0 shrink-0 flex-col overflow-auto overscroll-contain rounded-2xl border border-transparent ring-1 ring-slate-300/35 [touch-action:pan-x_pan-y_pinch-zoom] [-webkit-overflow-scrolling:touch] dark:ring-white/[0.08] lg:min-h-0'
                )}
              >
                <div
                  className={cn(
                    'pointer-events-none absolute inset-0 z-[1] rounded-2xl ring-0 ring-emerald-400/35',
                    dashboardCardRingTransition,
                    'group-hover:ring-2 group-hover:ring-emerald-400/50 group-hover:shadow-[inset_0_0_28px_rgba(16,185,129,0.09)]'
                  )}
                  aria-hidden
                />
                <div className="relative z-[2] [transform:translateZ(2px)]">
                  <button
                    type="button"
                    aria-label="Open performance report"
                    onClick={() => openModal('performanceReport')}
                    className="absolute inset-0 z-0 cursor-pointer rounded-2xl border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                  />
                  <div className="pointer-events-none relative z-10 p-1.5 sm:p-2">
                  <PerformanceReportTable
                    dashDark={dashDark}
                    compact
                    dashboardCard
                    className="!mt-0 !min-h-0 !flex-none !border-0 shadow-none"
                    monthHeading={performanceReportMonthHeading}
                    data={performanceReport}
                    reportLoading={performanceReportCardLoading}
                    reportRangeReady={
                      dashboardCancellationApiRange != null && performanceReportCard != null
                    }
                    drilldown={performanceReportDrilldown}
                    drilldownLoading={performanceDrilldownLoading}
                    drilldownError={null}
                    onOpenOnTimeDetail={() => openModal('onTimeFlights')}
                    onOpenGhaImprovementDetail={() => openModal('ghaImprovement')}
                    onOpenPerformanceDrill={openPerformanceReportDrill}
                  />
                  </div>
                </div>
              </ThemeFlipCard>
              <ThemeFlipCard
                flipSeq={themeFlipSeq}
                staggerIndex={6}
                reduceMotion={themeFlipReduce}
                fillHeight={false}
                className="dash-premium-staff flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl ring-1 ring-slate-300/35 dark:ring-white/[0.08] lg:min-h-0"
              >
                <OverviewTile
                  compact
                  dashDark={dashDark}
                  title="Staff utilization"
                  subtitle="Hours by category · Ramp &amp; Terminal (Total / Active / Idle)"
                  description="Staff hours (h) by category for Ramp and Terminal — High, Low, and Avg. Styling matches the dashboard theme; values are demo until Bird JSON supplies this matrix."
                  extra={
                    <div className={cn('min-h-0 shrink-0 overflow-visible', SCROLL_AREA_NO_BAR)}>
                      <StaffUtilizationSpreadsheetTable dashDark={dashDark} compact showSheetTitle={false} />
                    </div>
                  }
                  onClick={() => openModal('agtSgt')}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  className="!h-auto !min-h-0 shrink-0 border-0 bg-transparent shadow-none ring-0"
                />
              </ThemeFlipCard>
            </div>

            <div
              aria-label="Equipment utilization, airline remarks, and aircraft analytics"
              className="grid min-h-0 w-full grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-4"
            >
              <ThemeFlipCard
                flipSeq={themeFlipSeq}
                staggerIndex={7}
                reduceMotion={themeFlipReduce}
                fillHeight={false}
                className="dash-premium-equipment flex min-h-0 w-full min-w-0 shrink-0 flex-col self-start overflow-hidden rounded-2xl ring-1 ring-slate-300/35 dark:ring-white/[0.08]"
              >
                <OverviewTile
                  compact
                  tightChrome
                  dashDark={dashDark}
                  title="Equipment utilization"
                  titleTrailing={
                    <div
                      className={cn(
                        'pointer-events-auto inline-flex items-center rounded-md border p-0.5',
                        dashDark
                          ? 'border-emerald-700/60 bg-emerald-950/70'
                          : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/80'
                      )}
                      role="group"
                      aria-label="Equipment utilization slot duration"
                    >
                      {(['4h', '6h'] as const).map((mode) => {
                        const active = equipmentUtilSlotMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEquipmentUtilSlotMode(mode);
                            }}
                            className={cn(
                              'pointer-events-auto min-h-[36px] min-w-[2.75rem] touch-manipulation rounded px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition-colors',
                              DASH_CARD_INTERACTION_DURATION,
                              DASH_CARD_INTERACTION_EASE,
                              active
                                ? dashDark
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-emerald-500/15 text-emerald-700'
                                : dashDark
                                  ? 'text-white/75 hover:text-white'
                                  : 'text-[var(--dash-text-muted)] hover:text-[var(--dash-text)]'
                            )}
                            aria-pressed={active}
                          >
                            {mode}
                          </button>
                        );
                      })}
                    </div>
                  }
                  subtitle={
                    !dashboardCancellationApiRange ? (
                      <span className="text-[var(--dash-text-muted)]">
                        Set start and end dates to load utilization for that STA range.
                      </span>
                    ) : equipmentUtilSlotsLoading ? (
                      <span className="text-[var(--dash-text-muted)]">Loading GSE utilization…</span>
                    ) : equipmentUtilSlotsPayload ? (
                      <span>
                        Classified equipment lines: M{' '}
                        <span className={cn('tabular-nums', dashCardMetricValueClass(dashDark))}>
                          {equipmentUtilSlotsPayload.categoryTotals.motorisedCount.toLocaleString()}
                        </span>{' '}
                        · NM{' '}
                        <span className={cn('tabular-nums', dashCardMetricValueClass(dashDark))}>
                          {equipmentUtilSlotsPayload.categoryTotals.nonMotorisedCount.toLocaleString()}
                        </span>{' '}
                        · Tow{' '}
                        <span className={cn('tabular-nums', dashCardMetricValueClass(dashDark))}>
                          {equipmentUtilSlotsPayload.categoryTotals.towableCount.toLocaleString()}
                        </span>
                        {equipmentUtilSlotsPayload.unclassifiedCount > 0 ? (
                          <>
                            {' '}
                            · Unclassified{' '}
                            <span className={cn('tabular-nums', dashCardMetricValueClass(dashDark))}>
                              {equipmentUtilSlotsPayload.unclassifiedCount.toLocaleString()}
                            </span>
                          </>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-[var(--dash-text-muted)]">
                        Could not load utilization for this range.
                      </span>
                    )
                  }
                  description="Per-category counts and column-wise % within each category for four From Time slabs (22–04, 04–10, 10–16, 16–22). Flights filtered by STA date in the dashboard range; each equipmentDetails line uses from_time for the slab. Open the card to see the count per equipment_name within each slab for every category."
                  extra={
                    <div className="flex min-h-0 w-full shrink-0 flex-col">
                      <EquipmentUtilTimeSlotsTable
                        dashDark={dashDark}
                        compact
                        fillCard
                        mode={equipmentUtilSlotMode}
                        rows={equipmentUtilSlotsPayload?.slots ?? []}
                        totalRow={
                          equipmentUtilSlotsPayload?.totalRow ?? {
                            motorisedCount: 0,
                            motorisedPct: 100,
                            nonMotorisedCount: 0,
                            nonMotorisedPct: 100,
                            towableCount: 0,
                            towablePct: 100,
                          }
                        }
                        loading={equipmentUtilSlotsLoading}
                      />
                    </div>
                  }
                  onClick={() => openModal('equipmentUtilization')}
                  icon={<Plane className="h-5 w-5" />}
                  className="!h-auto !min-h-0 shrink-0 border-0 bg-transparent shadow-none ring-0"
                />
              </ThemeFlipCard>
              <div className="grid h-auto min-h-0 w-full grid-cols-1 gap-4 self-stretch sm:grid-cols-2 sm:items-start sm:gap-4 lg:w-full lg:self-start">
                <ThemeFlipCard
                  flipSeq={themeFlipSeq}
                  staggerIndex={8}
                  reduceMotion={themeFlipReduce}
                  fillHeight={false}
                  className="dash-premium-airline flex min-h-0 w-full min-w-0 shrink-0 flex-col self-start overflow-hidden rounded-2xl ring-1 ring-slate-300/35 dark:ring-white/[0.08]"
                >
                  <OverviewTile
                    compact
                    tightChrome
                    dashDark={dashDark}
                    title="Airline Remarks"
                    value={
                      airlineRatingsLoading ? (
                        <span className="text-sm font-normal text-[var(--dash-text-muted)]">…</span>
                      ) : (
                        <DashCountInt end={airlineRemarksCardTotal} />
                      )
                    }
                    subtitle="Rated remarks from fhr_collection (cancelled excluded)"
                    description="Counts from fhr_collection.remarks.airlineRemarksRating (STA in range, cancelled flights excluded). Blanks = empty rating."
                    extra={
                      <div
                        className={cn(
                          'mt-1 shrink-0 rounded-lg border border-[var(--dash-border-subtle)] bg-transparent p-1',
                          dashDark && 'border-emerald-800/50',
                          DASH_AIRLINE_REMARKS_ROW_CLAMP,
                          SCROLL_AREA_NO_BAR
                        )}
                      >
                        {airlineRatingsLoading && airlineRatingsSummary === null ? (
                          <p className={cn('px-1 py-1 text-[var(--dash-text-muted)]', AIRLINE_REMARKS_CARD_VALUE_TEXT)}>
                            Loading ratings…
                          </p>
                        ) : (
                          <AirlineRemarksRatingBars
                            rows={airlineRemarksCardRows}
                            denominator={airlineRemarksFlightDenominator}
                          />
                        )}
                      </div>
                    }
                    onClick={() => openModal('airlineRemarks')}
                    icon={<MessageSquare className="h-5 w-5" />}
                    className="flex h-auto min-h-0 flex-col border-0 bg-transparent shadow-none ring-0"
                  />
                </ThemeFlipCard>
                <ThemeFlipCard
                  flipSeq={themeFlipSeq}
                  staggerIndex={9}
                  reduceMotion={themeFlipReduce}
                  fillHeight={false}
                  className="dash-premium-aircraft flex min-h-0 w-full min-w-0 shrink-0 flex-col self-start overflow-hidden rounded-2xl ring-1 ring-slate-300/35 dark:ring-white/[0.08]"
                >
                  <TypeCraftInsightTile
                    compact
                    equipmentRowClamp
                    dashDark={dashDark}
                    totalFlights={carrierMixHasData ? totalFlightsFiltered : 0}
                    subtitle={typeCraftCardSubtitle}
                    description="Aircraft category mix from fhr_collection for the selected STA date range. Open to inspect scheduled vs additional breakdown."
                    aircraftCategoryMix={aircraftCategoryMix}
                    aircraftCategoryLoading={aircraftCategoryLoading}
                    onClick={() => openModal('carrierMix')}
                    className="flex h-auto min-h-0 shrink-0 flex-col border-0 bg-transparent shadow-none ring-0"
                  />
                </ThemeFlipCard>
              </div>
            </div>
          </div>
        </div>
      <Dialog
        open={openCard !== null}
        onOpenChange={(o) => {
          if (!o) {
            setOpenCard(null);
            setPerformanceReportDrillKey(null);
          }
        }}
      >
        {openCard !== null ? (
        <DialogContent
          instantOpen={dashboardModalOpenInstant}
          className={cn(
            DASH_MODAL_MOBILE_WIDTH_CLASS,
            DASH_MODAL_MOBILE_PADDING_CLASS,
            'max-h-[min(92dvh,90vh)] min-w-0 overflow-y-auto border-[var(--dash-border)] bg-[var(--dash-card)] text-[var(--dash-text)] shadow-[var(--dash-shadow-card)]',
            openCard === 'ghaImprovement'
              ? 'sm:max-w-6xl'
              : openCard === 'equipmentUtilization' || openCard === 'performanceReport'
                ? 'sm:max-w-5xl'
                : openCard === 'performanceReportDrill'
                  ? 'sm:max-w-6xl'
                  : openCard === 'airlineRemarks'
                    ? 'sm:max-w-5xl'
              : openCard === 'onTimeFlights'
                ? 'sm:max-w-7xl'
                : 'sm:max-w-3xl',
            SCROLL_AREA_NO_BAR
          )}
        >
          {openCard === 'volume' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">Flight volume</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">Monthly throughput comparison.</DialogDescription>
              </DialogHeader>
              <FlipOpenChart animationKey="modal-volume" className="h-[clamp(12rem,38vh,16rem)] sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeBarData} margin={{ bottom: 8, left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: chartTheme.axis, fontSize: 11 }}
                      interval={0}
                      angle={volumeBarData.length > 6 ? -35 : 0}
                      textAnchor={volumeBarData.length > 6 ? 'end' : 'middle'}
                      height={volumeBarData.length > 6 ? 52 : 28}
                    />
                    <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Bar {...BAR_SLOW_EMERGE} dataKey="flights" fill={chartTheme.barPrimary} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </FlipOpenChart>
              <div
                className={cn(
                  'mt-3 max-h-56 overflow-x-auto overflow-y-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="min-w-max w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--dash-table-header)]">
                      <th className="sticky top-0 left-0 z-30 border-b border-[var(--dash-border-subtle)] bg-[var(--dash-card)] px-2 py-1.5 shadow-sm">
                        Month
                      </th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT, 'z-20')}>Flights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMonths.map((m) => (
                      <tr key={m.key} className="border-t border-[var(--dash-border-subtle)]">
                        <td className="sticky left-0 z-[1] bg-[var(--dash-card)]/95 px-2 py-1.5">{m.label}</td>
                        <td className="px-2 py-1.5">
                          <DashCountInt end={m.totalFlights} />
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-[var(--dash-border-subtle)]">
                      <td className="sticky left-0 z-[1] bg-[var(--dash-card)]/95 px-2 py-1.5 font-medium">Last vs prev month</td>
                      <td className="px-2 py-1.5">
                        {volumeMomInRange !== null ? (
                          <span className="tabular-nums">
                            {volumeMomInRange >= 0 ? '+' : ''}
                            <DashCountFixed end={volumeMomInRange} decimals={1} />%
                          </span>
                        ) : (
                          DASH_DB_PLACEHOLDER
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-[var(--dash-text-muted)]">Insight: monthly throughput trend shows where handling capacity shifted.</p>
            </>
          )}

          {openCard === 'equipmentUtilization' && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-[var(--dash-text-strong)]">Equipment utilization</DialogTitle>
              </DialogHeader>

              <div className="mb-3 flex flex-col gap-2">
                <div
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  role="group"
                  aria-label="Equipment utilization category"
                >
                  {EQUIP_UTIL_CATEGORY_OPTIONS.map((option) => {
                    const active = equipmentUtilChartCategory === option.id;
                    const color = EQUIP_UTIL_CHART_COLORS[option.id];
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setEquipmentUtilChartCategory(option.id)}
                        className={cn(
                          'min-h-11 rounded-md px-3 py-2 text-sm font-semibold tracking-wide transition-colors',
                          active
                            ? 'text-white shadow-sm'
                            : 'border border-[var(--dash-border-subtle)] text-[var(--dash-text-muted)] hover:text-[var(--dash-text)]'
                        )}
                        style={active ? { backgroundColor: color } : undefined}
                        aria-pressed={active}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="group"
                  aria-label="Equipment utilization slot duration"
                >
                  {(['4h', '6h'] as const).map((mode) => {
                    const active = equipmentUtilSlotMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEquipmentUtilSlotMode(mode)}
                        className={cn(
                          'min-h-11 rounded-md border px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-colors',
                          active
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700'
                            : 'border-[var(--dash-border-subtle)] text-[var(--dash-text-muted)] hover:text-[var(--dash-text)]'
                        )}
                        aria-pressed={active}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!dashboardCancellationApiRange ? (
                <p className="text-sm leading-relaxed text-[var(--dash-text-muted)]">
                  Set start and end dates to load utilization for that STA range.
                </p>
              ) : (
                <>
                  <div className="relative z-0 w-full overflow-hidden">
                    <EquipmentUtilTimeSlotsChart
                      mode={equipmentUtilSlotMode}
                      rows={equipmentUtilSlotsPayload?.slots ?? []}
                      loading={equipmentUtilSlotsLoading}
                      chartTheme={chartTheme}
                      category={equipmentUtilChartCategory}
                    />
                  </div>

                  {equipmentUtilSlotsPayload && equipmentUtilSlotsPayload.unclassifiedCount > 0 ? (
                    <p className="mt-2 text-[13px] text-[var(--dash-text-muted)]">
                      Unclassified equipment lines (not in master catalog):{' '}
                      <span className={cn('font-semibold tabular-nums', dashCardMetricValueClass(dashDark))}>
                        {equipmentUtilSlotsPayload.unclassifiedCount.toLocaleString()}
                      </span>
                    </p>
                  ) : null}

                  <EquipmentUtilCategoryPerSlotBreakdown
                    category={equipmentUtilChartCategory}
                    mode={equipmentUtilSlotMode}
                    slots={equipmentUtilSlotsPayload?.slots}
                    loading={equipmentUtilSlotsLoading && !equipmentUtilSlotsPayload}
                    dashDark={dashDark}
                  />
                </>
              )}
            </>
          )}

          {openCard === 'carrierMix' && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-[var(--dash-text-strong)]">Aircraft analysis</DialogTitle>
              </DialogHeader>
              {aircraftCategoryLoading ? (
                <div className="text-sm text-[var(--dash-text-muted)]">Loading aircraft category mix…</div>
              ) : !aircraftCategoryMix || carrierCategoryTotal === 0 ? (
                <div className="text-sm leading-relaxed text-[var(--dash-text-muted)]">
                  No aircraft category data for this date range. Adjust the STA filter or check that flights exist in{' '}
                  <code className="text-[13px]">fhr_collection</code>.
                </div>
              ) : (
                <>
                  <div className="relative z-0 h-[min(26rem,58vh)] min-h-[16rem] w-full overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={carrierMixModalBreakdownRows}
                        margin={{ bottom: 4, left: 4, right: 8, top: 28 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                        <XAxis
                          dataKey="name"
                          interval={0}
                          height={36}
                          tick={(props) => {
                            const x = Number(props.x ?? 0);
                            const y = Number(props.y ?? 0);
                            const parts = String(props.payload?.value ?? '').split('-');
                            const lines = parts.length > 1 ? [parts.slice(0, -1).join('-'), parts[parts.length - 1]] : [parts[0] ?? ''];
                            return (
                              <g transform={`translate(${x},${y})`}>
                                {lines.map((line, index) => (
                                  <text
                                    key={`${line}-${index}`}
                                    dy={11 + index * 11}
                                    textAnchor="middle"
                                    fill={chartTheme.axis}
                                    fontSize={10}
                                  >
                                    {line}
                                  </text>
                                ))}
                              </g>
                            );
                          }}
                        />
                        <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} width={40} />
                        <Tooltip
                          contentStyle={chartTheme.tooltip}
                          labelFormatter={(label) => {
                            const row = carrierMixModalBreakdownRows.find((r) => r.name === label);
                            return row?.title ?? String(label);
                          }}
                        />
                        <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          {...BAR_SLOW_EMERGE}
                          dataKey="scheduled"
                          name="Scheduled"
                          fill={chartTheme.barPrimary}
                          radius={[2, 2, 0, 0]}
                          maxBarSize={28}
                        />
                        <Bar
                          {...BAR_SLOW_EMERGE}
                          dataKey="additional"
                          name="Additional"
                          fill={chartTheme.barSecondary}
                          radius={[2, 2, 0, 0]}
                          maxBarSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 grid min-h-0 w-full grid-cols-1 gap-3">
                    <div className="min-w-0">
                      <p className="mb-1.5 text-[13px] font-semibold text-[var(--dash-text-strong)]">
                        International vs domestic
                      </p>
                      <div className="relative z-0 h-48 min-h-[11rem] w-full overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={carrierMixModalIntlDomData}
                            margin={{ bottom: 28, left: 4, right: 8, top: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fill: chartTheme.axis, fontSize: 11 }}
                              interval={0}
                              angle={0}
                              textAnchor="middle"
                              tickMargin={6}
                              height={32}
                            />
                            <YAxis tick={{ fill: chartTheme.axis, fontSize: 11 }} width={36} />
                            <Tooltip contentStyle={chartTheme.tooltip} />
                            <Bar {...BAR_SLOW_EMERGE} dataKey="n" fill={chartTheme.amber} radius={[2, 2, 0, 0]} maxBarSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1.5 text-[13px] font-semibold text-[var(--dash-text-strong)]">
                        Narrow vs wide body
                      </p>
                      <div className="relative z-0 h-48 min-h-[11rem] w-full overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={carrierMixModalNbWbData}
                            margin={{ bottom: 28, left: 4, right: 8, top: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fill: chartTheme.axis, fontSize: 11 }}
                              interval={0}
                              angle={0}
                              textAnchor="middle"
                              tickMargin={6}
                              height={32}
                            />
                            <YAxis tick={{ fill: chartTheme.axis, fontSize: 11 }} width={36} />
                            <Tooltip contentStyle={chartTheme.tooltip} />
                            <Bar {...BAR_SLOW_EMERGE} dataKey="n" fill={chartTheme.barSecondary} radius={[2, 2, 0, 0]} maxBarSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'mt-4 max-h-[min(34rem,60vh)] overflow-auto',
                      SCROLL_AREA_NO_BAR,
                    )}
                  >
                    <AircraftAnalysisCategoryTables
                      mix={aircraftCategoryMix}
                      flights={aircraftAnalysisFlights}
                      flightsLoading={aircraftAnalysisFlightsLoading}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {openCard === 'airlines' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">Carriers by volume</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">Top airlines across months.</DialogDescription>
              </DialogHeader>
              <FlipOpenChart animationKey="modal-airlines" className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topAirlines.slice(0, 10).map((a) => ({ name: a.name, flights: a.count }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Bar {...BAR_SLOW_EMERGE} dataKey="flights" fill={chartTheme.barPrimary} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </FlipOpenChart>
              <div
                className={cn(
                  'mt-3 max-h-[min(24rem,55vh)] overflow-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--dash-table-header)]">
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Carrier</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Flights</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allAirlinesInRange.map((a) => (
                      <tr key={a.name} className="border-t border-[var(--dash-border-subtle)]">
                        <td className="px-2 py-1.5">{a.name}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          <DashCountInt end={a.count} />
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          <DashCountPct end={pct(a.count, totalFlightsFiltered)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-[var(--dash-text-muted)]">
                Chart still shows top 10 carriers; table lists every carrier in the selected range with flight counts.
                Share is vs total movements in range.
              </p>
            </>
          )}

          {openCard === 'reasons' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">Delay drivers</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">Top attributed delay reasons.</DialogDescription>
              </DialogHeader>
              <FlipOpenChart animationKey="modal-reasons" className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reasons.slice(0, 10).map((r) => ({ reason: r.reason.slice(0, 30), count: r.count }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <YAxis type="category" dataKey="reason" width={160} tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Bar {...BAR_SLOW_EMERGE} dataKey="count" fill={chartTheme.barSecondary} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </FlipOpenChart>
              <div
                className={cn(
                  'mt-3 max-h-60 overflow-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--dash-table-header)]">
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Reason</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Flights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reasons.slice(0, 6).map((r, ri) => (
                      <tr key={`${r.reason}-${ri}`} className="border-t border-[var(--dash-border-subtle)]">
                        <td className="px-2 py-1.5">{r.reason}</td>
                        <td className="px-2 py-1.5">
                          <DashCountInt end={r.count} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-[var(--dash-text-muted)]">Insight: prioritizing top 2 reasons gives fastest OTP gains.</p>
            </>
          )}

          {openCard === 'duration' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">Delay duration</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">Delay duration buckets.</DialogDescription>
              </DialogHeader>
              <FlipOpenChart animationKey="modal-duration" className="h-[clamp(12rem,38vh,16rem)] sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={duration}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="bucket"
                      tick={{ fill: chartTheme.axis, fontSize: 12 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={46}
                    />
                    <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Bar {...BAR_SLOW_EMERGE} dataKey="count" fill={chartTheme.barSecondary} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </FlipOpenChart>
              <div
                className={cn(
                  'mt-3 max-h-56 overflow-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--dash-table-header)]">
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Duration bucket</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Flights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duration.map((d) => (
                      <tr key={d.bucket} className="border-t border-[var(--dash-border-subtle)]">
                        <td className="px-2 py-1.5">{d.bucket}</td>
                        <td className="px-2 py-1.5">
                          <DashCountInt end={d.count} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-[var(--dash-text-muted)]">Insight: long-tail buckets reveal deeper process recovery issues.</p>
            </>
          )}

          {openCard === 'cancellations' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">Cancellations vs total flights</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">
                  Share of cancelled movements out of total flights in the selected range.
                </DialogDescription>
              </DialogHeader>
              <FlipOpenChart animationKey="modal-cancellations" className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={[
                      {
                        label: 'All flights',
                        cancelled,
                        didFly: Math.max(0, totalFlightsFiltered - cancelled),
                      },
                    ]}
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                    <XAxis type="number" domain={[0, totalFlightsFiltered || 1]} tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <YAxis type="category" dataKey="label" width={72} tick={{ fill: chartTheme.axis, fontSize: 12 }} hide />
                    <Tooltip
                      contentStyle={chartTheme.tooltip}
                      formatter={(value) => Number(value ?? 0).toLocaleString()}
                    />
                    <Legend wrapperStyle={{ fontSize: 13, color: chartTheme.axis }} />
                    <Bar {...BAR_SLOW_EMERGE} dataKey="cancelled" name="Cancelled" stackId="flights" fill={chartTheme.amber} radius={[6, 0, 0, 6]} />
                    <Bar
                      {...BAR_SLOW_EMERGE}
                      animationBegin={320}
                      dataKey="didFly"
                      name="Did fly"
                      stackId="flights"
                      fill={chartTheme.barPrimary}
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </FlipOpenChart>
              <div
                className={cn(
                  'mt-3 max-h-56 overflow-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--dash-table-header)]">
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Category</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Count</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>% of total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[var(--dash-border-subtle)]">
                      <td className="px-2 py-1.5 font-medium text-[var(--dash-text-strong)]">Cancelled</td>
                      <td className="px-2 py-1.5 text-[var(--dash-text)]">
                        <DashCountInt end={cancelled} />
                      </td>
                      <td className="px-2 py-1.5 text-[var(--dash-text)]">
                        <DashCountPct end={pct(cancelled, totalFlightsFiltered)} />
                      </td>
                    </tr>
                    <tr className="border-t border-[var(--dash-border-subtle)]">
                      <td className="px-2 py-1.5 font-medium text-[var(--dash-text-strong)]">Did fly</td>
                      <td className="px-2 py-1.5 text-[var(--dash-text)]">
                        <DashCountInt end={didFly} />
                      </td>
                      <td className="px-2 py-1.5 text-[var(--dash-text)]">
                        <DashCountPct end={pct(didFly, totalFlightsFiltered)} />
                      </td>
                    </tr>
                    <tr className="border-t border-[var(--dash-border-subtle)]">
                      <td className="px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]">Total flights</td>
                      <td className="px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]">
                        <DashCountInt end={totalFlightsFiltered} />
                      </td>
                      <td className="px-2 py-1.5 text-[var(--dash-text)]">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div
                className={cn(
                  'mt-3 max-h-48 overflow-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--dash-table-header)]">
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Month</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Cancelled</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Total</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMonths.map((m) => (
                      <tr key={m.key} className="border-t border-[var(--dash-border-subtle)]">
                        <td className="px-2 py-1.5 font-medium text-[var(--dash-text-strong)]">{m.label.slice(0, 3)}</td>
                        <td className="px-2 py-1.5 text-[var(--dash-text)]">
                          <DashCountInt end={m.cancellationCount ?? 0} />
                        </td>
                        <td className="px-2 py-1.5 text-[var(--dash-text)]">
                          <DashCountInt end={m.totalFlights} />
                        </td>
                        <td className="px-2 py-1.5 text-[var(--dash-text)]">
                          <DashCountPct end={pct(m.cancellationCount ?? 0, m.totalFlights)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-[var(--dash-text-muted)]">
                Insight: stacked bar length equals total flights; amber is cancelled share, green is operated share.
              </p>
            </>
          )}

          {openCard === 'airlineRemarks' && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="break-words text-[var(--dash-text-strong)]">
                  Airline remarks — STA window breakdown
                </DialogTitle>
              </DialogHeader>
              {airlineRemarksDrillError ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-[var(--dash-text-strong)]">
                  <span className="min-w-0 flex-1">
                    This breakdown is still updating. You can try again in a moment.
                  </span>
                  <button
                    type="button"
                    onClick={() => setAirlineRemarksDrillRetrySeq((s) => s + 1)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/80 px-2 py-1 text-xs font-semibold hover:bg-[var(--dash-card)]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Retry
                  </button>
                </div>
              ) : null}
              <div
                className="mb-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
                role="tablist"
                aria-label="Filter by airline remarks rating"
              >
                {AIRLINE_REMARKS_MODAL_TABS.map((tab) => {
                  const selected = airlineRemarksModalTab === tab;
                  const tint = airlineRatingUi(tab).color;
                  const countsLoading =
                    airlineRemarksWithTextLoading &&
                    airlineRemarksWithTextRows === null &&
                    !airlineRemarksDrillError;
                  const ratingsN = countsLoading
                    ? '…'
                    : airlineRemarksModalTabCounts[tab].toLocaleString();
                  const remarksN = countsLoading
                    ? '…'
                    : airlineRemarksModalTabRemarkCounts[tab].toLocaleString();
                  const remarksTabsBusy = airlineRemarksModalChartLoading;
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      disabled={remarksTabsBusy}
                      onClick={() => !remarksTabsBusy && setAirlineRemarksModalTab(tab)}
                      className={cn(
                        'flex min-h-[4.5rem] w-full flex-col items-center justify-center rounded-xl border px-3 py-2 text-center text-xs font-semibold leading-snug shadow-sm transition-colors touch-manipulation',
                        remarksTabsBusy ? 'cursor-not-allowed opacity-45' : '',
                        selected
                          ? 'border-[var(--dash-border-subtle)] bg-[var(--dash-card-elevated)] text-[var(--dash-text-strong)]'
                          : cn(
                              'border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/55 text-[var(--dash-text-muted)]',
                              !remarksTabsBusy &&
                                'hover:border-[var(--dash-border-subtle)] hover:bg-[var(--dash-card)]/80 hover:text-[var(--dash-text-strong)]',
                            ),
                      )}
                      style={
                        selected
                          ? {
                              boxShadow: `inset 0 -3px 0 0 ${tint}, 0 1px 2px rgb(0 0 0 / 0.06)`,
                            }
                          : undefined
                      }
                    >
                      <span className="block">{tab}</span>
                      <span className="mt-1 flex flex-col items-center gap-0.5 text-[11px] font-medium leading-tight opacity-80">
                        <span className="tabular-nums">Ratings: {ratingsN}</span>
                        <span className="tabular-nums">Remarks: {remarksN}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {!airlineRemarksDrillError ? (
                <div className="relative z-0 mx-auto mb-3 h-[clamp(14rem,34vh,22rem)] min-h-[13rem] w-full max-w-full overflow-hidden">
                  {airlineRemarksModalChartLoading ? (
                    <div className="flex h-full min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-[var(--dash-border-subtle)] px-4 text-center text-sm text-[var(--dash-text-muted)]">
                      Loading remark counts…
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={airlineRemarksRatingDistributionChartData}
                        margin={{ top: 12, right: 8, left: 0, bottom: 28 }}
                        barCategoryGap="16%"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                        <XAxis
                          dataKey="rating"
                          type="category"
                          interval={0}
                          angle={0}
                          textAnchor="middle"
                          height={44}
                          tick={(props) => {
                            const x = Number(props.x ?? 0);
                            const y = Number(props.y ?? 0);
                            const words = String(props.payload?.value ?? '').split(' ');
                            return (
                              <g transform={`translate(${x},${y})`}>
                                {words.map((word, index) => (
                                  <text
                                    key={`${word}-${index}`}
                                    dy={12 + index * 12}
                                    textAnchor="middle"
                                    fill={chartTheme.axis}
                                    fontSize={10}
                                    fontWeight={700}
                                  >
                                    {word}
                                  </text>
                                ))}
                              </g>
                            );
                          }}
                        />
                        <YAxis
                          type="number"
                          allowDecimals={false}
                          tick={{ fill: chartTheme.axis, fontSize: 11 }}
                          width={36}
                        />
                        <Tooltip
                          cursor={{
                            fill: dashDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)',
                          }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0]?.payload as {
                              rating: string;
                              count: number;
                            };
                            if (!row) return null;
                            const totalDidFly = didFly;
                            const sharePct =
                              totalDidFly > 0 ? (100 * row.count) / totalDidFly : null;
                            return (
                              <div
                                className="rounded-md border px-3 py-2 text-xs shadow-md"
                                style={{
                                  backgroundColor: 'var(--dash-card)',
                                  borderColor: 'var(--dash-border-subtle)',
                                  color: 'var(--dash-text-strong)',
                                }}
                              >
                                <div className="font-semibold">{row.rating}</div>
                                <div className="mt-1 tabular-nums">
                                  <span className="font-semibold">{row.count.toLocaleString()}</span>
                                  {' '}
                                  flight{row.count === 1 ? '' : 's'} with this remark
                                </div>
                                {sharePct !== null ? (
                                  <div className="mt-1.5 border-t border-[var(--dash-border-subtle)] pt-1.5 text-[11px] text-[var(--dash-text-muted)]">
                                    <span className="font-medium tabular-nums text-[var(--dash-text)]">
                                      {sharePct.toFixed(1)}%
                                    </span>
                                    {' '}
                                    of total flights
                                  </div>
                                ) : null}
                              </div>
                            );
                          }}
                        />
                        <Bar {...BAR_SLOW_EMERGE} dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={52}>
                          {airlineRemarksRatingDistributionChartData.map((entry, i) => (
                            <Cell key={`ar-dist-${entry.rating}-${i}`} fill={entry.fill} fillOpacity={0.9} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ) : null}

              <div
                className={cn(
                  'relative mx-auto min-h-0 w-full max-w-full shrink-0 rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR,
                  'touch-pan-y',
                  !airlineRemarksWithTextLoading && airlineRemarksWithTextRows !== null
                    ? 'h-[min(28rem,52vh)] overflow-x-auto overflow-y-auto [overscroll-behavior:contain]'
                    : 'max-h-[min(28rem,52vh)] overflow-auto'
                )}
              >
                {airlineRemarksWithTextLoading ? (
                  <div className="px-2 py-3 text-sm text-[var(--dash-text-muted)]">Loading flight list…</div>
                ) : airlineRemarksDrillError ? (
                  <div className="px-2 py-3 text-sm text-[var(--dash-text-muted)]">
                    Still preparing this list.
                  </div>
                ) : airlineRemarksWithTextRows === null ? (
                  <div className="px-2 py-3 text-sm text-[var(--dash-text-muted)]">Preparing breakdown…</div>
                ) : airlineRemarksWithTextRows.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-[var(--dash-text-muted)]">
                    No qualifying flights found for airline remark ratings during this STA period.
                  </div>
                ) : airlineRemarksModalTabRows.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-[var(--dash-text-muted)]">
                    No flights in this category.
                  </div>
                ) : airlineRemarksWithTextFilteredRows.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-[var(--dash-text-muted)]">
                    No flights with airline representative remarks in this category.
                  </div>
                ) : (
                  <>
                    <ul className={cn('flex flex-col gap-2 p-2', DASH_MOBILE_LIST_CLASS)}>
                      {(airlineRemarksWithTextFilteredRows ?? []).map((r, idx) => {
                        const raw = String(r.airlineRemarksRating ?? '').trim();
                        const canonical = canonicalAirlineRemarksRatingKey(raw);
                        const ratingKeyForColor = canonical ? canonical : AIRLINE_REMARKS_BLANK_LABEL;
                        const ui = airlineRatingUi(ratingKeyForColor);
                        const ratingLabel = canonical || raw || DASH_DB_PLACEHOLDER;
                        return (
                          <li
                            key={`${r.serialNo}-${idx}-m`}
                            className="rounded-xl border border-[var(--dash-border-subtle)] bg-[var(--dash-card)]/90 p-3 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="break-words font-semibold leading-snug text-[var(--dash-text-strong)]">{r.airline || DASH_DB_PLACEHOLDER}</p>
                              <p className="mt-0.5 text-xs leading-snug text-[var(--dash-text-muted)]">
                                <AircraftAnalysisFlightSerialCell serialNo={r.serialNo} ataDate={r.ataDate} />
                              </p>
                              <p className="mt-1 text-xs font-medium leading-snug" style={{ color: ui.color }}>
                                {ratingLabel}
                              </p>
                            </div>
                            <dl className="mt-2 flex flex-col gap-1.5 text-xs">
                              <div className="flex items-baseline justify-between gap-3">
                                <dt className="shrink-0 text-[var(--dash-text-muted)]">ATA date</dt>
                                <dd className="min-w-0 text-right tabular-nums text-[var(--dash-text)]">{r.ataDate || DASH_DB_PLACEHOLDER}</dd>
                              </div>
                              <div className="flex items-baseline justify-between gap-3">
                                <dt className="shrink-0 text-[var(--dash-text-muted)]">ATA time</dt>
                                <dd className="min-w-0 text-right tabular-nums text-[var(--dash-text)]">{r.ataTime || DASH_DB_PLACEHOLDER}</dd>
                              </div>
                            </dl>
                            {r.airlineRepRem ? (
                              <p className="mt-2 border-t border-[var(--dash-border-subtle)] pt-2 text-xs leading-relaxed text-[var(--dash-text-muted)] [overflow-wrap:anywhere] whitespace-pre-wrap">
                                {r.airlineRepRem}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    <table className={cn(DASH_TABLE_DESKTOP_CLASS, 'w-full min-w-0 max-w-full table-fixed border-collapse text-left text-[13px] leading-tight')}>
                          <colgroup>
                            <col style={{ width: '3.25rem' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '4.25rem' }} />
                            <col style={{ width: '3rem' }} />
                            <col />
                            <col style={{ width: '9.5%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th
                                className={cn(
                                  'px-[1%] py-0.5 font-semibold text-[var(--dash-text-strong)]',
                                  STICKY_TH_TOP_LIGHT
                                )}
                              >
                                Serial
                              </th>
                              <th
                                className={cn(
                                  'px-[1%] py-0.5 font-semibold text-[var(--dash-text-strong)]',
                                  STICKY_TH_TOP_LIGHT
                                )}
                              >
                                Airline
                              </th>
                              <th
                                className={cn(
                                  'px-[1%] py-0.5 font-semibold text-[var(--dash-text-strong)]',
                                  STICKY_TH_TOP_LIGHT
                                )}
                              >
                                ATA date
                              </th>
                              <th
                                className={cn(
                                  'px-[1%] py-0.5 font-semibold text-[var(--dash-text-strong)]',
                                  STICKY_TH_TOP_LIGHT
                                )}
                              >
                                ATA time
                              </th>
                              <th
                                className={cn(
                                  'px-[1%] py-0.5 font-semibold text-[var(--dash-text-strong)]',
                                  STICKY_TH_TOP_LIGHT
                                )}
                              >
                                Airline rep rem
                              </th>
                              <th
                                className={cn(
                                  'px-[1%] py-0.5 font-semibold text-[var(--dash-text-strong)]',
                                  STICKY_TH_TOP_LIGHT
                                )}
                              >
                                Rating
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(airlineRemarksWithTextFilteredRows ?? []).map((r, idx) => {
                              const raw = String(r.airlineRemarksRating ?? '').trim();
                              const canonical = canonicalAirlineRemarksRatingKey(raw);
                              const ratingKeyForColor = canonical ? canonical : AIRLINE_REMARKS_BLANK_LABEL;
                              const ui = airlineRatingUi(ratingKeyForColor);
                              const ratingLabel =
                                canonical || raw || DASH_DB_PLACEHOLDER;
                              return (
                                <tr key={`${r.serialNo}-${idx}`} className="border-t border-[var(--dash-border-subtle)] align-top">
                                  <td className="px-[1%] py-0.5 tabular-nums font-medium">
                                    <AircraftAnalysisFlightSerialCell
                                      serialNo={r.serialNo}
                                      ataDate={r.ataDate}
                                    />
                                  </td>
                                  <td className="break-words px-[1%] py-0.5 text-[var(--dash-text)]">{r.airline || DASH_DB_PLACEHOLDER}</td>
                                  <td className="px-[1%] py-0.5 tabular-nums text-[var(--dash-text)]">{r.ataDate || DASH_DB_PLACEHOLDER}</td>
                                  <td className="px-[1%] py-0.5 tabular-nums text-[var(--dash-text)]">{r.ataTime || DASH_DB_PLACEHOLDER}</td>
                                  <td className="break-words px-[1%] py-0.5 align-top text-[var(--dash-text-muted)] [overflow-wrap:anywhere] whitespace-pre-wrap">
                                    {r.airlineRepRem}
                                  </td>
                                  <td className="px-[1%] py-0.5">
                                    <span
                                      className="inline-block max-w-full font-medium tabular-nums"
                                      style={{ color: ui.color }}
                                    >
                                      {ratingLabel}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                  </table>
                  </>
                )}
              </div>
            </>
          )}

          {openCard === 'ghaImprovement' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">Improvement for GHA</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]" />
              </DialogHeader>
              {!performanceReportDrilldown ? (
                <p className="text-sm text-[var(--dash-text-muted)]">
                  {performanceDrilldownLoading
                    ? 'Loading flight list from precomputed drill-down…'
                    : PERFORMANCE_REPORT_NO_DATA_MSG}
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  {(performanceReport?.ghaImprovement ?? 0) > 0 &&
                  ghaImprovementReportPartitionFlights.length === 0 &&
                  !performanceDrilldownLoading ? (
                    <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-[var(--dash-text-strong)]">
                      The report shows{' '}
                      <span className="font-semibold tabular-nums">
                        {(performanceReport?.ghaImprovement ?? 0).toLocaleString()}
                      </span>{' '}
                      flight
                      {(performanceReport?.ghaImprovement ?? 0) === 1 ? '' : 's'} for row d, but this list is empty or
                      still on older drill data. Re-run the dashboard drill/summary job for this date range so flight rows
                      include row&nbsp;d flags (drill schema v2), then open this dialog again.
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-[var(--dash-text-strong)]">
                      d. Improvement for GHA
                    </p>
                    <p className="text-sm text-[var(--dash-text-muted)]">
                      Only flights counted in <span className="font-semibold text-[var(--dash-text)]">d. Improvement for GHA</span> on
                      the performance report (station GHA delay code and AGT {'>'} SGT in that row&apos;s rules — not the full
                      AGT {'>'} SGT bucket).
                    </p>
                    {ghaImprovementReportPartitionFlights.length > 0 ? (
                      <p className="text-[13px] text-[var(--dash-text-muted)]">
                        {ghaImprovementReportPartitionFlights.length.toLocaleString()} flight
                        {ghaImprovementReportPartitionFlights.length === 1 ? '' : 's'}
                      </p>
                    ) : null}
                    {ghaImprovementReportPartitionFlights.length === 0 ? (
                      <p className="text-sm text-[var(--dash-text-muted)]">No flights in this bucket.</p>
                    ) : (
                      <div
                        className={cn(
                          'max-h-[min(50vh,24rem)] overflow-auto rounded-lg border border-[var(--dash-border-subtle)]',
                          SCROLL_AREA_NO_BAR,
                        )}
                      >
                        <table className="w-full min-w-[40rem] border-collapse text-left">
                          <thead>
                            <tr className="border-b border-[var(--dash-border-subtle)]">
                              {['Sl.', 'Airline', 'AGT', 'SGT', 'STA', 'ATA', 'STD', 'ATD'].map((h) => (
                                <th
                                  key={h}
                                  scope="col"
                                  className={cn(
                                    'px-2 py-1.5 font-semibold uppercase tracking-wide',
                                    dashDark ? STICKY_TH_TOP_EMERALD : STICKY_TH_TOP_CARD,
                                    dashDark ? 'text-amber-400/95' : 'text-[var(--dash-warm-caption)]',
                                    'text-[12px]',
                                  )}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ghaImprovementReportPartitionFlights.map((f, i) => {
                              const d = performanceDrillRowToDisplayDetail(f);
                              return (
                                <tr key={`${d.sta}-${d.serial}-${i}`} className="border-t border-[var(--dash-border-subtle)]">
                                  <td
                                    className={cn(
                                      'px-2 py-1.5 text-left text-sm tabular-nums text-[var(--dash-text-muted)]',
                                    )}
                                  >
                                    <PerformanceReportSerialCell drillRow={f} displaySerial={d.serial} />
                                  </td>
                                  <td className="px-2 py-1.5 text-left text-sm text-[var(--dash-text)]">
                                    {d.airline}
                                  </td>
                                  <td
                                    className={cn(
                                      'px-2 py-1.5 text-left text-sm tabular-nums text-[var(--dash-text-strong)]',
                                    )}
                                  >
                                    {formatGroundDurationMinutesAsHhMm(d.agtMinutes)}
                                  </td>
                                  <td className="px-2 py-1.5 text-left text-sm tabular-nums text-[var(--dash-text-muted)]">
                                    {formatGroundDurationMinutesAsHhMm(d.sgtMinutes)}
                                  </td>
                                  <td className="px-2 py-1.5 whitespace-nowrap text-left text-sm tabular-nums text-[var(--dash-text-muted)]">
                                    {formatPerformanceIsoBrief(d.sta)}
                                  </td>
                                  <td className="px-2 py-1.5 whitespace-nowrap text-left text-sm tabular-nums text-[var(--dash-text-muted)]">
                                    {formatPerformanceIsoBrief(d.ata)}
                                  </td>
                                  <td className="px-2 py-1.5 whitespace-nowrap text-left text-sm tabular-nums text-[var(--dash-text-muted)]">
                                    {formatPerformanceIsoBrief(d.std)}
                                  </td>
                                  <td className="px-2 py-1.5 whitespace-nowrap text-left text-sm tabular-nums text-[var(--dash-text-muted)]">
                                    {formatPerformanceIsoBrief(d.atd)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-[var(--dash-text-strong)]">
                      GHA related delays
                    </p>
                    <p className="text-sm text-[var(--dash-text-muted)]">
                      Station-approved GHA delay codes (leading digits on Reason of Delay) — same breakdown as the code
                      chart below.
                    </p>
                    <GhaRelatedDelayCodesSnippet dashDark={dashDark} codes={fhrGhaDelayCodeStats.ghaOverviewCodes} />
                  </div>
                  <div className="space-y-2">
                    {fhrGhaDelayCodeStats.flightsWithAnyGhaCode === 0 ? (
                      <p className="text-sm text-[var(--dash-text-muted)]">
                        No delayed flights with station GHA codes in arrival or departure reasons for this range. All
                        codes below show a flight count of 0.
                      </p>
                    ) : null}
                    <FlipOpenChart
                      animationKey={`modal-gha-improvement-codes-${fhrGhaDelayCodeStats.totalAttributedIncrements}`}
                      className="h-[min(48vh,22rem)] w-full min-h-[14rem]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={ghaImprovementModalFullChartRows}
                          margin={{ top: 8, right: 12, left: 4, bottom: 52 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                          <XAxis
                            type="category"
                            dataKey="code"
                            tick={{ fill: chartTheme.axis, fontSize: 12 }}
                            interval={0}
                            angle={-38}
                            textAnchor="end"
                            height={48}
                            label={{
                              value: 'GHA delay code',
                              position: 'insideBottom',
                              offset: -2,
                              fill: '#10b981',
                              fontSize: 19,
                            }}
                          />
                          <YAxis
                            type="number"
                            allowDecimals={false}
                            domain={[0, ghaImprovementModalChartYMax]}
                            tick={{ fill: chartTheme.axis, fontSize: 12 }}
                            label={{
                              value: 'Flights (count)',
                              angle: -90,
                              position: 'insideLeft',
                              fill: '#10b981',
                              fontSize: 19,
                            }}
                          />
                          <Tooltip
                            content={(props) => (
                              <GhaImprovementModalBarTooltip
                                active={props.active}
                                payload={
                                  props.payload as unknown as Parameters<
                                    typeof GhaImprovementModalBarTooltip
                                  >[0]['payload']
                                }
                                chartTooltipStyle={chartTheme.tooltip}
                              />
                            )}
                          />
                          <Bar
                            {...BAR_SLOW_EMERGE}
                            dataKey="count"
                            fill={chartTheme.barSecondary}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={36}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </FlipOpenChart>
                    {fhrGhaDelayCodeStats.flightsMissingDelayDescription.length > 0 ? (
                      <div className="mt-2 rounded-md border border-amber-500/35 bg-amber-500/[0.07] px-2 py-1.5">
                        <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--dash-text-strong)]">
                          GHA code — missing reason description
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-[13px] leading-snug text-[var(--dash-text-muted)]">
                          {fhrGhaDelayCodeStats.flightsMissingDelayDescription.map((f) => (
                            <li key={`modal-${f.serial || 'x'}-${f.flightNo}-${f.codes.join(',')}`}>
                              <span className="font-medium text-[var(--dash-text)]">{f.flightNo}</span>
                              {f.serial ? <> (sl. {displayFlightInstanceSerial(f.serial) || f.serial})</> : null}
                              {' — '}
                              code{f.codes.length > 1 ? 's' : ''} {f.codes.join(', ')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}

          {openCard === 'ghaDelays' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">GHA delay codes (11–52)</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">
                  <span className="font-semibold text-[var(--dash-text)]">
                    Total: <DashCountInt end={ghaDelayTotalCount} /> flight delays
                  </span>
                  {ghaDelayCountsNote ? (
                    <span className="mt-1 block text-[var(--dash-text-soft)]/95">{ghaDelayCountsNote}</span>
                  ) : null}
                </DialogDescription>
              </DialogHeader>
              <FlipOpenChart animationKey="modal-gha-delays" className="h-72 w-full min-h-[16rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ghaDashboardDelayRows} margin={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="code"
                      tick={{ fill: chartTheme.axis, fontSize: 12 }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} width={36} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as (typeof ghaDashboardDelayRows)[number];
                        return (
                          <div className="rounded-lg border px-2 py-1.5 text-sm shadow-md" style={chartTheme.tooltip}>
                            <p className="font-semibold text-[var(--dash-text-strong)]">
                              Code {row.code} — {row.description}
                            </p>
                            <p className="mt-0.5 text-[var(--dash-text)]">{row.countLabel}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar {...BAR_SLOW_EMERGE} dataKey="count" fill={chartTheme.barSecondary} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </FlipOpenChart>
              <div
                className={cn(
                  'mt-3 max-h-52 overflow-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th
                        className={cn(
                          'px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]',
                          STICKY_TH_TOP_LIGHT
                        )}
                      >
                        Code
                      </th>
                      <th
                        className={cn(
                          'px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]',
                          STICKY_TH_TOP_LIGHT
                        )}
                      >
                        Count
                      </th>
                      <th
                        className={cn(
                          'px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]',
                          STICKY_TH_TOP_LIGHT
                        )}
                      >
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ghaDashboardDelayRows.map((row) => (
                      <tr key={row.code} className="border-t border-[var(--dash-border-subtle)]">
                        <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]">{row.code}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-[var(--dash-text)]">
                          {row.count === 1 ? (
                            '1 flight delay'
                          ) : (
                            <>
                              <DashCountInt end={row.count} /> flight delays
                            </>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--dash-text)]">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-[var(--dash-text-muted)]">
                Graph opens first; scroll the table for all codes. Use the overview tile for a compact view.
              </p>
              <button
                type="button"
                onClick={() => setOpenCard('categories')}
                className="mt-2 text-left text-[13px] font-medium text-[var(--dash-text-soft)] underline-offset-2 hover:text-[var(--dash-text)] hover:underline"
              >
                View aggregate delay categories (1, 2, LAST, CANC)
              </button>
            </>
          )}

          {openCard === 'categories' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">Delay category codes</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">Combined delay code distribution (graph first).</DialogDescription>
              </DialogHeader>
              <FlipOpenChart animationKey="modal-categories" className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={mergedDelayCategories.slice(0, 12).map((c) => ({ code: c.code, count: c.count }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <YAxis type="category" dataKey="code" width={72} tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Bar {...BAR_SLOW_EMERGE} dataKey="count" fill={chartTheme.barSecondary} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </FlipOpenChart>
              <div
                className={cn(
                  'mt-3 max-h-56 overflow-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--dash-table-header)]">
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Code</th>
                      <th className={cn('px-2 py-1.5', STICKY_TH_TOP_LIGHT)}>Combined flights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedDelayCategories.slice(0, 8).map((c) => (
                      <tr key={c.code} className="border-t border-[var(--dash-border-subtle)]">
                        <td className="px-2 py-1.5">{c.code}</td>
                        <td className="px-2 py-1.5">
                          <DashCountInt end={c.count} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-[var(--dash-text-muted)]">Insight: graph-first view highlights top delay codes immediately for faster action.</p>
            </>
          )}

          {openCard === 'performanceReportDrill' && performanceReportDrillKey && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">
                  {performanceReportDrillTitle(performanceReportDrillKey)}
                </DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">
                  {performanceDrilldownLoading && !performanceReportDrilldown
                    ? 'Loading flight list from precomputed drill-down…'
                    : performanceReportDrilldown
                      ? performanceReportDrillMetaLine(
                          performanceReportDrillKey,
                          performanceFlightsForReportDrillKey(
                            performanceReportDrillKey,
                            performanceReportDrilldown,
                          ).length,
                          performanceReport?.cancelledCount ?? 0,
                        )
                      : PERFORMANCE_REPORT_NO_DATA_MSG}
                </DialogDescription>
              </DialogHeader>
              {performanceDrilldownLoading && !performanceReportDrilldown ? (
                <p className="px-1 py-4 text-sm text-[var(--dash-text-muted)]">Loading flights…</p>
              ) : performanceReportDrilldown ? (
                <div
                  className={cn(
                    'flex min-h-[12rem] flex-col sm:h-[min(72vh,40rem)]',
                  )}
                >
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <PerformanceReportDrillFlightTable
                      drillKey={performanceReportDrillKey}
                      flights={performanceFlightsForReportDrillKey(
                        performanceReportDrillKey,
                        performanceReportDrilldown,
                      )}
                      dashDark={dashDark}
                      compact={false}
                    />
                  </div>
                </div>
              ) : null}
            </>
          )}

          {openCard === 'onTimeFlights' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">1. Flight Operated on time</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">
                  {performanceDrilldownLoading &&
                  (performanceReport?.onTimeCount ?? 0) > 0 &&
                  onTimeModalFlights.length === 0
                    ? 'Loading flight list from precomputed drill-down…'
                    : `${onTimeModalFlights.length.toLocaleString()} flight${onTimeModalFlights.length === 1 ? '' : 's'} · STA date/time = ATA date/time${performanceReport != null ? ` · report total ${performanceReport.onTimeCount.toLocaleString()}` : ''}`}
                </DialogDescription>
              </DialogHeader>
              <FlipOpenChart
                animationKey="modal-on-time-flights"
                className="w-full min-h-0 max-h-[min(78vh,calc(100dvh-11rem))] overflow-hidden"
              >
                <div className="grid h-[min(78vh,calc(100dvh-11rem))] min-h-[22rem] grid-cols-1 gap-4 lg:grid-cols-[35fr_65fr] lg:grid-rows-1 lg:gap-5">
                  <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden lg:max-h-full">
                    <section className="flex min-h-[12rem] min-w-0 shrink-0 flex-col overflow-hidden lg:min-h-[14rem] lg:flex-[0_1_42%]">
                      <p className="mb-1.5 shrink-0 text-[13px] font-bold uppercase tracking-wide text-[var(--dash-warm-caption)]">
                        STA vs ATA (weekday avg.)
                      </p>
                      <div className="min-h-0 min-w-0 flex-1">
                        <StaAtaLineChartCard
                          className={cn(
                            'h-full min-h-[12rem] border-[var(--dash-border-subtle)] bg-[var(--dash-card)] shadow-[var(--dash-shadow-card)]',
                            dashDark &&
                              '[&_.text-emerald-800]:text-emerald-300 [&_h3]:text-[var(--dash-text-strong)] [&_.text-gray-500]:text-[var(--dash-text-muted)]',
                          )}
                          flights={onTimeStaAtaChartFlights}
                        />
                      </div>
                    </section>
                    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden lg:min-h-0">
                      <p className="mb-1.5 shrink-0 text-[13px] font-bold uppercase tracking-wide text-[var(--dash-warm-caption)]">
                        On time performance
                      </p>
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        <OtpGtStdMatrixTable
                          dashDark={dashDark}
                          compact
                          dashboardCard
                          matrix={mergedOtpMatrixForDashboard}
                        />
                      </div>
                    </section>
                  </div>
                  <div className="flex min-h-[min(50vh,20rem)] min-w-0 flex-col overflow-hidden lg:min-h-0 lg:max-h-full">
                    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--dash-border-subtle)]">
                      <div className="flex shrink-0 items-center justify-between border-b border-[var(--dash-border-subtle)] bg-[var(--dash-table-header)] px-2 py-1.5">
                        <p className="text-[13px] font-semibold text-[var(--dash-text-strong)]">On-time flights</p>
                        <span className="text-[12px] tabular-nums text-[var(--dash-text-muted)]">
                          {onTimeModalFlights.length.toLocaleString()} flights
                        </span>
                      </div>
                      <div className={cn('min-h-0 min-w-0 flex-1 overflow-auto', SCROLL_AREA_NO_BAR)}>
                        {performanceDrilldownLoading &&
                        (performanceReport?.onTimeCount ?? 0) > 0 &&
                        onTimeModalFlights.length === 0 ? (
                          <p className="px-2 py-3 text-sm text-[var(--dash-text-muted)]">Loading flights…</p>
                        ) : onTimeModalFlights.length === 0 ? (
                          <p className="px-2 py-3 text-sm text-[var(--dash-text-muted)]">No flights in this bucket.</p>
                        ) : (
                          <table className="w-full min-w-0 table-fixed border-collapse text-left text-sm">
                            <colgroup>
                              <col className="w-[3rem]" />
                              <col className="w-[min(14%,8rem)]" />
                              <col className="w-[min(9%,4.5rem)]" />
                              <col className="w-[min(9%,4.5rem)]" />
                              <col />
                              <col />
                              <col />
                              <col />
                            </colgroup>
                            <thead>
                              <tr className="border-b border-[var(--dash-border-subtle)] bg-[var(--dash-table-header)]">
                                {['Sl.', 'Airline', 'AGT', 'SGT', 'STA', 'ATA', 'STD', 'ATD'].map((h) => (
                                  <th
                                    key={h}
                                    scope="col"
                                    className={cn(
                                      'px-1.5 py-1 font-semibold uppercase tracking-wide',
                                      STICKY_TH_TOP_LIGHT,
                                    )}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {onTimeModalFlights.map((f, i) => {
                                const d = performanceDrillRowToDisplayDetail(f);
                                return (
                                  <tr
                                    key={`${d.sta}-${d.serial}-${i}`}
                                    className="border-t border-[var(--dash-border-subtle)]"
                                  >
                                    <td className="px-1.5 py-1 tabular-nums text-[var(--dash-text-muted)]">
                                      <PerformanceReportSerialCell drillRow={f} displaySerial={d.serial} />
                                    </td>
                                    <td className="truncate px-1.5 py-1 text-[var(--dash-text)]" title={d.airline}>
                                      {d.airline}
                                    </td>
                                    <td className="px-1.5 py-1 tabular-nums text-[var(--dash-text-strong)]">
                                      {formatGroundDurationMinutesAsHhMm(d.agtMinutes)}
                                    </td>
                                    <td className="px-1.5 py-1 tabular-nums text-[var(--dash-text-muted)]">
                                      {formatGroundDurationMinutesAsHhMm(d.sgtMinutes)}
                                    </td>
                                    <td className="break-all px-1.5 py-1 tabular-nums text-[var(--dash-text-muted)]">
                                      {formatPerformanceIsoBrief(d.sta)}
                                    </td>
                                    <td className="break-all px-1.5 py-1 tabular-nums text-[var(--dash-text-muted)]">
                                      {formatPerformanceIsoBrief(d.ata)}
                                    </td>
                                    <td className="break-all px-1.5 py-1 tabular-nums text-[var(--dash-text-muted)]">
                                      {formatPerformanceIsoBrief(d.std)}
                                    </td>
                                    <td className="break-all px-1.5 py-1 tabular-nums text-[var(--dash-text-muted)]">
                                      {formatPerformanceIsoBrief(d.atd)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </FlipOpenChart>
            </>
          )}

          {openCard === 'punctuality' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">OTP detailed summary</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">Month-wise OTP chart and detailed table.</DialogDescription>
              </DialogHeader>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dash-border-subtle)] pb-2">
                <div>
                  <p className="text-[14px] font-semibold text-[var(--dash-text-strong)]">STA vs ATA on-time flights</p>
                  <p className="mt-0.5 text-[12px] text-[var(--dash-text-muted)]">Net STA Minutes (ATA − STA)</p>
                </div>
                <div className="inline-flex items-center gap-0.5 rounded border border-[var(--dash-border)] bg-[var(--dash-chart-well)] pl-1.5 pr-1 py-0.5 text-[12px] font-medium text-[var(--dash-text)]">
                  March 2026
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </div>
              </div>
              <div className="h-[min(42vh,22rem)] w-full min-h-0 shrink-0 sm:h-[min(38vh,20rem)]">
                <FlipOpenChart animationKey="modal-punctuality-march-net" className="h-full min-h-0 w-full">
                  <MarchNetDeviationComposedChart
                    data={march2026NetDeviationLineData}
                    yDomain={march2026NetYDomain}
                    yTicks={march2026NetYTicks}
                    chartTheme={chartTheme}
                    reduceMotion={prefersReducedMotion === true}
                  />
                </FlipOpenChart>
              </div>
              <div
                className={cn(
                  'mt-2 max-h-56 overflow-x-auto overflow-y-auto rounded-lg border border-[var(--dash-border-subtle)]',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="min-w-max w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[var(--dash-table-header)]">
                      <th className="sticky top-0 left-0 z-30 border-b border-[var(--dash-border-subtle)] bg-[var(--dash-card)] px-2 py-1.5 shadow-sm">
                        Metric
                      </th>
                      {activeMonths.map((m) => (
                        <th
                          key={m.key}
                          className={cn('whitespace-nowrap px-2 py-1.5', STICKY_TH_TOP_LIGHT, 'z-20')}
                        >
                          {m.label.slice(0, 3)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[var(--dash-border-subtle)]">
                      <td className="sticky left-0 z-[1] bg-[var(--dash-card)]/95 px-2 py-1.5">On time %</td>
                      {activeMonths.map((m) => (
                        <td key={m.key} className="whitespace-nowrap px-2 py-1.5">
                          <DashCountPct end={pct(m.delayBreakdown.onTime, m.totalFlights)} />
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t border-[var(--dash-border-subtle)]">
                      <td className="sticky left-0 z-[1] bg-[var(--dash-card)]/95 px-2 py-1.5">Delayed %</td>
                      {activeMonths.map((m) => (
                        <td key={m.key} className="whitespace-nowrap px-2 py-1.5">
                          <DashCountPct end={pct(m.delayBreakdown.delayed, m.totalFlights)} />
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t border-[var(--dash-border-subtle)]">
                      <td className="sticky left-0 z-[1] bg-[var(--dash-card)]/95 px-2 py-1.5">Before time %</td>
                      {activeMonths.map((m) => (
                        <td key={m.key} className="whitespace-nowrap px-2 py-1.5">
                          <DashCountPct end={pct(m.delayBreakdown.beforeTime, m.totalFlights)} />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-3 rounded-lg border border-[var(--dash-border-subtle)]">
                <div className="flex items-center justify-between border-b border-[var(--dash-border-subtle)] bg-[var(--dash-table-header)] px-2 py-1.5">
                  <p className="text-[13px] font-semibold text-[var(--dash-text-strong)]">
                    Row 1, Col 3 flights ({'>'}GT & {'<='}STD with ATA {'<'} STA)
                  </p>
                  <span className="text-[12px] text-[var(--dash-text-muted)] tabular-nums">
                    {otpBeforeStaGtLeStdFlights.length.toLocaleString()} flights
                  </span>
                </div>
                <div className={cn('max-h-56 overflow-auto', SCROLL_AREA_NO_BAR)}>
                  <table className="min-w-max w-full text-left text-sm">
                    <thead>
                      <tr className="bg-[var(--dash-card-elevated)]">
                        {['Airline', 'STA', 'ATA', 'STD', 'ATD', 'AGT', 'SGT'].map((h) => (
                          <th
                            key={h}
                            className={cn('whitespace-nowrap px-2 py-1.5', STICKY_TH_TOP_LIGHT, 'z-20')}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {otpBeforeStaGtLeStdFlights.length === 0 ? (
                        <tr className="border-t border-[var(--dash-border-subtle)]">
                          <td colSpan={7} className="px-2 py-2 text-[var(--dash-text-muted)]">
                            No flights satisfy ATA&lt;STA, AGT&gt;SGT, and ATD&lt;=STD in this range.
                          </td>
                        </tr>
                      ) : (
                        otpBeforeStaGtLeStdFlights.map((f, idx) => {
                          const gt = getGroundTimes(f);
                          return (
                            <tr key={`${f.sta}-${idx}`} className="border-t border-[var(--dash-border-subtle)]">
                              <td className="px-2 py-1.5">{f.airline || DASH_DB_PLACEHOLDER}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{formatPerformanceIsoBrief(f.sta)}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{formatPerformanceIsoBrief(f.ata)}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{formatPerformanceIsoBrief(f.std)}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">{formatPerformanceIsoBrief(f.atd)}</td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {gt
                                  ? formatGroundDurationMinutesAsHhMm(gt.AGT / 60000)
                                  : DASH_DB_PLACEHOLDER}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {gt
                                  ? formatGroundDurationMinutesAsHhMm(gt.SGT / 60000)
                                  : DASH_DB_PLACEHOLDER}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-sm text-[var(--dash-text-muted)]">
                Insight: compare STA vs ATA series with monthly OTP % to see punctuality drivers in the selected range.
              </p>
            </>
          )}

          {openCard === 'performanceReport' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--dash-text-strong)]">Performance report</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">
                  On-time, off-schedule, ground time, and cancellation counts for the selected date range.
                </DialogDescription>
              </DialogHeader>
              <div className={cn('max-h-[min(70vh,40rem)] overflow-auto', SCROLL_AREA_NO_BAR)}>
                <PerformanceReportTable
                  dashDark={dashDark}
                  monthHeading={performanceReportMonthHeading}
                  data={performanceReport}
                  reportLoading={performanceReportCardLoading}
                  reportRangeReady={
                    dashboardCancellationApiRange != null && performanceReportCard != null
                  }
                  drilldown={performanceReportDrilldown}
                  drilldownLoading={performanceDrilldownLoading}
                  drilldownError={null}
                  onOpenOnTimeDetail={() => openModal('onTimeFlights')}
                  onOpenGhaImprovementDetail={() => openModal('ghaImprovement')}
                  onOpenPerformanceDrill={openPerformanceReportDrill}
                />
              </div>
            </>
          )}

          {openCard === 'agtSgt' && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-[var(--dash-text-strong)]">Staff utilization</DialogTitle>
                <DialogDescription className="text-[var(--dash-text-muted)]">
                  Hours by category for Ramp and Terminal. Each row is Total, Active, and Idle.
                </DialogDescription>
              </DialogHeader>
              <div className={cn('mb-3 max-h-[min(50vh,28rem)] overflow-y-auto lg:hidden', SCROLL_AREA_NO_BAR)}>
                <StaffUtilizationMobileList dashDark={dashDark} />
              </div>
              <div className={cn('mb-3 hidden max-h-[min(50vh,28rem)] overflow-auto lg:block', SCROLL_AREA_NO_BAR)}>
                <StaffUtilizationSpreadsheetTable dashDark={dashDark} />
              </div>
              <FlipOpenChart animationKey="modal-turnaround-risk" className="h-[clamp(14rem,42vh,18rem)] overflow-hidden sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={turnaroundMonthlyRows} margin={{ top: 8, bottom: 4, left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="month"
                      interval={0}
                      angle={0}
                      textAnchor="middle"
                      height={32}
                      tick={{ fill: chartTheme.axis, fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: chartTheme.axis, fontSize: 12 }} />
                    <Tooltip
                      contentStyle={chartTheme.tooltip}
                      formatter={(v, n) => (n === 'gtAdded' ? [Number(v).toLocaleString(), 'GT added flights'] : [v, String(n)])}
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload as (typeof turnaroundMonthlyRows)[number] | undefined;
                        return row?.fullLabel ?? label;
                      }}
                    />
                    <Bar {...BAR_SLOW_EMERGE} dataKey="gtAdded" name="GT added flights" fill={chartTheme.barSecondary} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </FlipOpenChart>
              <ul className="mt-3 flex flex-col gap-2 lg:hidden">
                {turnaroundMonthlyRows.map((m) => (
                  <li
                    key={m.key}
                    className="rounded-lg border border-[var(--dash-border-subtle)] px-3 py-2.5"
                  >
                    <p className="text-sm font-semibold text-[var(--dash-text-strong)]">{m.month}</p>
                    <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                      {(
                        [
                          ['GT added', m.gtAdded.toLocaleString()],
                          ['Total flights', m.total.toLocaleString()],
                          ['Overrun %', `${m.rate}%`],
                          [
                            'Avg AGT / flight',
                            m.avgAgtMinutes !== null ? `${m.avgAgtMinutes} min` : DASH_DB_PLACEHOLDER,
                          ],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-[var(--dash-text-muted)]">{label}</dt>
                          <dd className="min-w-0 text-right font-medium tabular-nums text-[var(--dash-text)]">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
              <div
                className={cn(
                  'mt-3 hidden max-h-64 overflow-auto rounded-lg border border-[var(--dash-border-subtle)] lg:block',
                  SCROLL_AREA_NO_BAR
                )}
              >
                <table className="w-full min-w-[36rem] whitespace-nowrap text-left text-sm">
                  <thead>
                    <tr>
                      <th
                        className={cn(
                          'px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]',
                          STICKY_TH_TOP_LIGHT
                        )}
                      >
                        Month
                      </th>
                      <th
                        className={cn(
                          'px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]',
                          STICKY_TH_TOP_LIGHT
                        )}
                      >
                        GT added
                      </th>
                      <th
                        className={cn(
                          'px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]',
                          STICKY_TH_TOP_LIGHT
                        )}
                      >
                        Total flights
                      </th>
                      <th
                        className={cn(
                          'px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]',
                          STICKY_TH_TOP_LIGHT
                        )}
                      >
                        Overrun %
                      </th>
                      <th
                        className={cn(
                          'px-2 py-1.5 font-semibold text-[var(--dash-text-strong)]',
                          STICKY_TH_TOP_LIGHT
                        )}
                      >
                        Avg AGT / flight
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {turnaroundMonthlyRows.map((m) => {
                      return (
                        <tr key={m.key} className="border-t border-[var(--dash-border-subtle)]">
                          <td className="px-2 py-1.5 font-medium text-[var(--dash-text-strong)]">{m.month}</td>
                          <td className="px-2 py-1.5 tabular-nums text-[var(--dash-text)]">
                            <DashCountInt end={m.gtAdded} />
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-[var(--dash-text)]">
                            <DashCountInt end={m.total} />
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-[var(--dash-text)]">
                            <DashCountPct end={m.rate} />
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-[var(--dash-text)]">
                            {m.avgAgtMinutes !== null ? (
                              <>
                                <DashCountInt end={m.avgAgtMinutes} /> min
                              </>
                            ) : (
                              DASH_DB_PLACEHOLDER
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => setOpenCard('punctuality')}
                className="mt-2 text-left text-[13px] font-medium text-[var(--dash-text-soft)] underline-offset-2 hover:text-[var(--dash-text)] hover:underline"
              >
                Open OTP summary (STA/ATA chart and monthly OTP %)
              </button>
            </>
          )}
        </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={notificationCenterOpen} onOpenChange={handleNotificationCenterOpenChange}>
        <DialogContent
          className={cn(
            DASH_MODAL_MOBILE_WIDTH_CLASS,
            'flex max-h-[min(94dvh,58rem)] w-[min(100%,72rem)] flex-col gap-0 overflow-hidden border-[var(--dash-border)] bg-[var(--dash-card)] p-0 text-[var(--dash-text)] shadow-xl shadow-[var(--dash-shadow-overlay)] sm:max-w-6xl sm:rounded-2xl',
            SCROLL_AREA_NO_BAR
          )}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-[var(--dash-border-subtle)] bg-[var(--dash-card-elevated)] px-4 py-3.5 pr-12 text-left sm:px-5">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--dash-accent)_12%,var(--dash-chart-well))] text-[var(--dash-accent)] ring-1 ring-[color-mix(in_srgb,var(--dash-accent)_18%,transparent)]"
                aria-hidden
              >
                <Bell className="h-4 w-4" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[15px] font-semibold tracking-tight text-[var(--dash-text-strong)]">
                  Notification center
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[12px] leading-snug text-[var(--dash-text-muted)]">
                  Cancellations, raised tickets, new airlines, aircraft, and admin messages for your selected period.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <NotificationCenterCard
            open={notificationCenterOpen}
            dashboardCancellationApiRange={dashboardCancellationApiRange}
            refreshSeq={fhrCollectionRefreshSeq}
          />
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
    </DashboardScheduledAirlinesLinkContext.Provider>
    </DashboardModalInstantOpenContext.Provider>
  );
}

