'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import {
  AlertTriangle,
  Building2,
  Clock,
  Clock3,
  Download,
  MapPinned,
  Plane,
  Sparkles,
  TimerReset,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/error-utils';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  fetchDelayReportTopCards,
  fetchDelayAnalyticsDrilldown,
  type DelayReportTopCardsPayload,
  type DelayDrilldownPayload,
} from '@/lib/api';
import { formatMinutesAsDisplay } from './delayReportUtils';
import {
  buildScheduledAirlinesHrefFromDelayReport,
  parseDelayReportReturnFromUrl,
} from '@/lib/delayReportScheduledAirlinesNav';
type Severity = 'High' | 'Watch' | 'Alert';
type DelayCategory = 'Aircraft Rotation' | 'ATFM' | 'Operational';
type DelayOwner = 'gha' | 'non-gha';
type SortKey = 'code' | 'description' | 'flightCount' | 'totalMinutes' | 'avgMinutes' | 'pctOfDelay' | 'severity';
type SortDirection = 'asc' | 'desc';

type DelayCodeRow = {
  code: string;
  description: string;
  category: DelayCategory;
  flightCount: number;
  totalMinutes: number;
  avgMinutes: number;
  pctOfDelay: number;
  severity: Severity;
  owner: DelayOwner;
};

type InsightSummaryStats = {
  fromYmd: string;
  toYmd: string;
  airline: string;
  station: string;
  delayedFlights: number;
  totalDelayMinutes: number;
  avgDelayPerFlight: number;
  topDelayCode: { code: string; flightCount: number } | null;
  worstStation: { name: string; flightCount: number } | null;
  worstAirline: { name: string; flightCount: number } | null;
};

type InsightDelayTableRows = {
  gha: DelayCodeRow[];
  nonGha: DelayCodeRow[];
};

type GenerateInsightsResponse = {
  insights?: unknown;
  insightCount?: unknown;
  error?: unknown;
};

type DelayCodePanelRow =
  | DelayReportTopCardsPayload['panels']['allCodes'][number]
  | DelayReportTopCardsPayload['panels']['topCodes'][number];

type MonthTrendPoint = {
  month: string;
  delayedFlights: number;
  avgDuration: number;
  trendFlights: number;
};

type HourPoint = {
  hour: string;
  delays: number;
};

type WeeklyPoint = {
  week: string;
  rotation: number;
  atfm: number;
  operational: number;
};

type SharePoint = {
  name: string;
  flights: number;
};

type DashboardFilters = {
  fromYmd: string;
  toYmd: string;
  airline: string;
  station: string;
};

type KpiCard = {
  title: string;
  value: string;
  subtitle: string;
  badge: Severity;
  icon: LucideIcon;
};

type AirlineDelayDetail = {
  name: string;
  flights: number;
  delayMinutes: number;
  avgMinutes: number;
  sharePct: number;
};

const ALL = '';
const EMERALD = '#10B981';
const EMERALD_DARK = '#059669';
const TEAL = '#0F766E';
const AMBER = '#F59E0B';
const AMBER_SOFT = '#FCD34D';
const AMBER_DARKEST = '#B45309';
const RED = '#EF4444';
const BORDER = '#D1FAE5';
const MUTED = '#64748B';

const panelClass =
  'rounded-2xl border border-emerald-100/90 bg-white/90 p-4 shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04] backdrop-blur-sm transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-emerald-200/90 hover:shadow-md hover:shadow-emerald-900/[0.06] sm:p-6';
const subPanelClass =
  'rounded-2xl border border-emerald-100/90 bg-white/95 p-4 shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.03] transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-emerald-200/90 hover:shadow-md hover:shadow-emerald-900/[0.06]';
const datePickerClass =
  'min-w-0 [&>button]:h-11 [&>button]:rounded-lg [&>button]:border [&>button]:border-emerald-100/90 [&>button]:bg-white [&>button]:px-3 [&>button]:text-sm [&>button]:font-normal [&>button]:text-emerald-950 [&>button]:shadow-sm [&>button]:transition-[border-color,box-shadow,background-color] [&>button]:duration-150 [&>button]:hover:border-emerald-300/90 [&>button]:hover:bg-emerald-50/30 [&>button]:focus-visible:border-emerald-500 [&>button]:focus-visible:shadow-[0_0_0_3px_rgba(16,185,129,0.12)] [&>button_svg]:text-emerald-500';
const primaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-lg border border-slate-200/80 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-200/80 hover:bg-emerald-50/40 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60';
const subtleScrollClass =
  'overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';
const amberPanelClass =
  'rounded-2xl border border-amber-200/90 bg-amber-50/70 p-4 shadow-sm shadow-amber-900/[0.04] ring-1 ring-amber-900/[0.05] backdrop-blur-sm transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-amber-300/90 hover:shadow-md hover:shadow-amber-900/[0.08] sm:p-6';
const emeraldItemHoverClass =
  'transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-emerald-200/90 hover:bg-emerald-50/70 hover:shadow-sm hover:shadow-emerald-900/[0.06]';
const amberItemHoverClass =
  'transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-amber-300/80 hover:bg-amber-50 hover:shadow-sm hover:shadow-amber-900/[0.08]';

const BASE_DELAY_CODES: Array<
  Omit<DelayCodeRow, 'avgMinutes' | 'pctOfDelay' | 'severity'>
> = [
  { code: '93', description: 'Aircraft rotation', category: 'Aircraft Rotation', flightCount: 90, totalMinutes: 5190, owner: 'non-gha' },
  { code: '89', description: 'Departure restrictions', category: 'Operational', flightCount: 12, totalMinutes: 62, owner: 'non-gha' },
  { code: '81', description: 'ATFM en-route', category: 'ATFM', flightCount: 7, totalMinutes: 134, owner: 'non-gha' },
  { code: '83', description: 'ATFM destination', category: 'ATFM', flightCount: 3, totalMinutes: 78, owner: 'non-gha' },
  { code: '99', description: 'Other', category: 'Operational', flightCount: 2, totalMinutes: 52, owner: 'gha' },
  { code: '57', description: 'Flight plans', category: 'Operational', flightCount: 2, totalMinutes: 44, owner: 'gha' },
  { code: '84', description: 'ATFM weather', category: 'ATFM', flightCount: 1, totalMinutes: 32, owner: 'non-gha' },
  { code: '32', description: 'Loading', category: 'Operational', flightCount: 1, totalMinutes: 24, owner: 'gha' },
  { code: '55', description: 'Departure control', category: 'Operational', flightCount: 1, totalMinutes: 44, owner: 'gha' },
];

const DELAY_CODE_METADATA = new Map(
  BASE_DELAY_CODES.map((row) => [
    row.code,
    {
      description: row.description,
      category: row.category,
      owner: row.owner,
    },
  ]),
);

const BASE_MONTHLY_TREND = [
  { month: 'Nov', delayedFlights: 68, avgDuration: 38 },
  { month: 'Dec', delayedFlights: 82, avgDuration: 42 },
  { month: 'Jan', delayedFlights: 91, avgDuration: 45 },
  { month: 'Feb', delayedFlights: 79, avgDuration: 43 },
  { month: 'Mar', delayedFlights: 110, avgDuration: 49 },
  { month: 'Apr', delayedFlights: 125, avgDuration: 53 },
] as const;

const BASE_HOURLY_DISTRIBUTION: HourPoint[] = [
  { hour: '00:00', delays: 4 },
  { hour: '01:00', delays: 6 },
  { hour: '02:00', delays: 18 },
  { hour: '03:00', delays: 12 },
  { hour: '04:00', delays: 8 },
  { hour: '05:00', delays: 4 },
  { hour: '06:00', delays: 2 },
  { hour: '07:00', delays: 2 },
  { hour: '08:00', delays: 3 },
  { hour: '09:00', delays: 5 },
  { hour: '10:00', delays: 6 },
  { hour: '11:00', delays: 5 },
  { hour: '12:00', delays: 4 },
  { hour: '13:00', delays: 4 },
  { hour: '14:00', delays: 5 },
  { hour: '15:00', delays: 6 },
  { hour: '16:00', delays: 7 },
  { hour: '17:00', delays: 5 },
  { hour: '18:00', delays: 4 },
  { hour: '19:00', delays: 3 },
  { hour: '20:00', delays: 2 },
  { hour: '21:00', delays: 1 },
  { hour: '22:00', delays: 1 },
  { hour: '23:00', delays: 2 },
];

const BASE_WEEKLY_STACK: WeeklyPoint[] = [
  { week: 'W1', rotation: 8, atfm: 3, operational: 2 },
  { week: 'W2', rotation: 9, atfm: 4, operational: 3 },
  { week: 'W3', rotation: 10, atfm: 4, operational: 4 },
  { week: 'W4', rotation: 8, atfm: 5, operational: 3 },
  { week: 'W5', rotation: 11, atfm: 4, operational: 5 },
  { week: 'W6', rotation: 12, atfm: 5, operational: 4 },
  { week: 'W7', rotation: 13, atfm: 6, operational: 5 },
  { week: 'W8', rotation: 14, atfm: 5, operational: 6 },
];

const BASE_AIRLINES: SharePoint[] = [
  { name: 'Sri Lankan', flights: 51 },
  { name: 'IndiGo', flights: 29 },
  { name: 'Larnaca', flights: 19 },
  { name: 'Lufthansa', flights: 15 },
  { name: 'SpiceJet', flights: 15 },
];

const BASE_STATIONS = [
  { name: 'T-2', delays: 104 },
  { name: 'T-1', delays: 85 },
  { name: 'T-3', delays: 46 },
  { name: 'T-4', delays: 4 },
] as const;

const DEFAULT_FILTERS: DashboardFilters = {
  fromYmd: '2026-02-28',
  toYmd: '2026-03-31',
  airline: ALL,
  station: ALL,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function daysBetweenInclusive(fromYmd: string, toYmd: string): number {
  const from = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 181;
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
}

function computeOperationalInsightCount(
  filters: DashboardFilters,
  delayTableRows: InsightDelayTableRows,
): number {
  const rangeDays = daysBetweenInclusive(filters.fromYmd, filters.toYmd);
  const significantDelayCodes = [...delayTableRows.gha, ...delayTableRows.nonGha].filter(
    (row) => row.flightCount > 0 && (row.pctOfDelay >= 3 || row.flightCount >= 2 || row.totalMinutes >= 45),
  ).length;

  const rangeDrivenCount =
    rangeDays >= 180
      ? 10
      : rangeDays >= 150
        ? 9
        : rangeDays >= 120
          ? 8
          : rangeDays >= 90
            ? 7
            : rangeDays >= 60
              ? 6
              : rangeDays >= 30
                ? 5
                : rangeDays >= 14
                  ? 4
                  : 3;

  return clamp(Math.max(rangeDrivenCount, significantDelayCodes), 3, 10);
}

function ymdToDate(value: string): Date | undefined {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((item) => Number.isNaN(item))) return undefined;
  const [year, month, day] = parts;
  return new Date(year!, month! - 1, day!);
}

function movingAverage(values: number[], windowSize = 3): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    return Math.round(slice.reduce((sum, value) => sum + value, 0) / slice.length);
  });
}

function distributeTotal(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  if (total <= 0) return weights.map(() => 0);

  const weightSum = weights.reduce((sum, value) => sum + Math.max(value, 0), 0);
  if (weightSum <= 0) return weights.map(() => 0);

  const raw = weights.map((value) => (total * Math.max(value, 0)) / weightSum);
  const parts = raw.map((value) => Math.floor(value));
  let remainder = total - parts.reduce((sum, value) => sum + value, 0);

  const byRemainder = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);

  let cursor = 0;
  while (remainder > 0 && byRemainder.length > 0) {
    const target = byRemainder[cursor % byRemainder.length];
    parts[target.index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  return parts;
}

function buildAirlineDelayDetails(
  row: DelayCodeRow,
  filters: DashboardFilters,
): AirlineDelayDetail[] {
  const sourceAirlines = filters.airline
    ? BASE_AIRLINES.filter((airline) => airline.name === filters.airline)
    : BASE_AIRLINES;
  const airlines = sourceAirlines.length > 0 ? sourceAirlines : BASE_AIRLINES;
  const seed = row.code.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const weights = airlines.map((airline, index) => {
    const base = Math.max(airline.flights, 1);
    const positionBias = ((seed + index * 5) % 7) + 1;
    const categoryBias =
      row.category === 'Aircraft Rotation'
        ? index === 0
          ? 1.18
          : 1
        : row.category === 'ATFM'
          ? index % 2 === 0
            ? 1.08
            : 0.96
          : index === airlines.length - 1
            ? 1.1
            : 1;
    return base * positionBias * categoryBias;
  });

  const flightSlices = distributeTotal(row.flightCount, weights);
  const minuteSlices = distributeTotal(row.totalMinutes, weights);

  return airlines
    .map((airline, index) => {
      const flights = flightSlices[index] ?? 0;
      const delayMinutes = minuteSlices[index] ?? 0;
      return {
        name: airline.name,
        flights,
        delayMinutes,
        avgMinutes: flights > 0 ? delayMinutes / flights : 0,
        sharePct: row.totalMinutes > 0 ? (delayMinutes / row.totalMinutes) * 100 : 0,
      };
    })
    .filter((item) => item.flights > 0 || item.delayMinutes > 0)
    .sort((left, right) => right.delayMinutes - left.delayMinutes);
}

function stackedSegmentRadius(
  row: WeeklyPoint,
  key: 'rotation' | 'atfm' | 'operational',
): [number, number, number, number] {
  const orderedSegments: Array<{ key: 'rotation' | 'atfm' | 'operational'; value: number }> = [
    { key: 'rotation', value: row.rotation },
    { key: 'atfm', value: row.atfm },
    { key: 'operational', value: row.operational },
  ];

  const visibleSegments = orderedSegments.filter((segment) => segment.value > 0);
  const index = visibleSegments.findIndex((segment) => segment.key === key);
  if (index === -1) return [0, 0, 0, 0];

  const isBottom = index === 0;
  const isTop = index === visibleSegments.length - 1;

  if (isBottom && isTop) return [8, 8, 8, 8];
  if (isTop) return [8, 8, 0, 0];
  if (isBottom) return [0, 0, 8, 8];
  return [0, 0, 0, 0];
}

function formatHoursMinutes(totalMinutes: number): string {
  return `${formatMinutesAsDisplay(totalMinutes)}h`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatTableCount(value: number): string {
  return value === 0 ? '-' : String(value);
}

function formatTableDuration(value: number): string {
  return value === 0 ? '-' : formatHoursMinutes(value);
}

function formatTableAverage(value: number): string {
  return value === 0 ? '-' : `${value.toFixed(1)} min`;
}

function formatTablePercent(value: number): string {
  return value === 0 ? '-' : formatPercent(value);
}

function severityForRow(row: Pick<DelayCodeRow, 'flightCount' | 'avgMinutes' | 'pctOfDelay'>): Severity {
  if (row.pctOfDelay >= 45 || row.flightCount >= 30 || row.avgMinutes >= 55) return 'Alert';
  if (row.pctOfDelay >= 8 || row.flightCount >= 5 || row.avgMinutes >= 25) return 'Watch';
  return 'High';
}

function severityRank(severity: Severity): number {
  if (severity === 'Alert') return 3;
  if (severity === 'Watch') return 2;
  return 1;
}

function badgeClasses(severity: Severity): string {
  if (severity === 'Alert') return 'border-red-200/80 bg-red-50/90 text-red-700';
  if (severity === 'Watch') return 'border-amber-200/80 bg-amber-50/90 text-amber-800';
  return 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700';
}

function barFillByIntensity(value: number, max: number, hue: 'emerald' | 'teal' | 'amber' | 'red' = 'emerald'): string {
  if (max <= 0) return '#A7F3D0';
  const t = clamp(value / max, 0.12, 1);
  if (hue === 'teal') {
    return t > 0.75 ? TEAL : t > 0.45 ? '#14B8A6' : '#99F6E4';
  }
  if (hue === 'amber') {
    return t > 0.75 ? '#D97706' : t > 0.45 ? AMBER : '#FDE68A';
  }
  if (hue === 'red') {
    return t > 0.75 ? '#DC2626' : t > 0.45 ? RED : '#FECACA';
  }
  return t > 0.75 ? EMERALD_DARK : t > 0.45 ? EMERALD : '#A7F3D0';
}

function selectionFactor(filters: DashboardFilters): number {
  const rangeFactor = clamp(daysBetweenInclusive(filters.fromYmd, filters.toYmd) / 181, 0.55, 1.35);
  const maxAirline = Math.max(...BASE_AIRLINES.map((item) => item.flights));
  const maxStation = Math.max(...BASE_STATIONS.map((item) => item.delays));
  const airlineFactor = filters.airline
    ? clamp((BASE_AIRLINES.find((item) => item.name === filters.airline)?.flights ?? maxAirline) / maxAirline, 0.28, 1)
    : 1;
  const stationFactor = filters.station
    ? clamp((BASE_STATIONS.find((item) => item.name === filters.station)?.delays ?? maxStation) / maxStation, 0.12, 1)
    : 1;
  const combinedFocus =
    filters.airline && filters.station ? Math.sqrt(airlineFactor * stationFactor) : airlineFactor * stationFactor;
  return clamp(rangeFactor * combinedFocus, 0.18, 1.45);
}

function buildDashboardData(filters: DashboardFilters) {
  const factor = selectionFactor(filters);
  const rotationBias = filters.airline === 'Sri Lankan' || filters.station === 'T-2' ? 1.08 : 1;
  const atfmBias = filters.station === 'T-3' || filters.airline === 'Lufthansa' ? 1.12 : 1;
  const operationalBias = filters.station === 'T-1' || filters.airline === 'SpiceJet' ? 1.1 : 1;

  const delayCodesRaw = BASE_DELAY_CODES.map((row) => {
    const categoryBias =
      row.category === 'Aircraft Rotation'
        ? rotationBias
        : row.category === 'ATFM'
          ? atfmBias
          : operationalBias;
    return {
      ...row,
      flightCount: Math.max(1, Math.round(row.flightCount * factor * categoryBias)),
      totalMinutes: Math.max(8, Math.round(row.totalMinutes * factor * categoryBias)),
    };
  });

  const totalDelayMinutes = delayCodesRaw.reduce((sum, row) => sum + row.totalMinutes, 0);
  const delayCodes: DelayCodeRow[] = delayCodesRaw
    .map((row) => {
      const avgMinutes = row.flightCount > 0 ? row.totalMinutes / row.flightCount : 0;
      const pctOfDelay = totalDelayMinutes > 0 ? (row.totalMinutes / totalDelayMinutes) * 100 : 0;
      return {
        ...row,
        avgMinutes,
        pctOfDelay,
        severity: severityForRow({ flightCount: row.flightCount, avgMinutes, pctOfDelay }),
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const delayedFlights = delayCodes.reduce((sum, row) => sum + row.flightCount, 0);
  const avgDelayPerFlight = delayedFlights > 0 ? totalDelayMinutes / delayedFlights : 0;

  const monthlyTrendBase = BASE_MONTHLY_TREND.map((row) => ({
    month: row.month,
    delayedFlights: Math.max(1, Math.round(row.delayedFlights * factor)),
    avgDuration: Math.max(12, Math.round(row.avgDuration * clamp(0.86 + factor * 0.18, 0.78, 1.18))),
  }));
  const trendFlights = movingAverage(monthlyTrendBase.map((row) => row.delayedFlights));
  const monthlyTrend: MonthTrendPoint[] = monthlyTrendBase.map((row, index) => ({
    ...row,
    trendFlights: trendFlights[index] ?? row.delayedFlights,
  }));

  const hourlyDistribution = BASE_HOURLY_DISTRIBUTION.map((row) => ({
    hour: row.hour,
    delays: Math.max(0, Math.round(row.delays * clamp(0.9 + factor * 0.16, 0.7, 1.25))),
  }));

  const weeklyDistribution = BASE_WEEKLY_STACK.map((row) => ({
    week: row.week,
    rotation: Math.max(0, Math.round(row.rotation * factor * rotationBias)),
    atfm: Math.max(0, Math.round(row.atfm * factor * atfmBias)),
    operational: Math.max(0, Math.round(row.operational * factor * operationalBias)),
  }));

  const severitySplit = delayCodes.reduce(
    (acc, row) => {
      if (severityRank(row.severity) >= 2) acc.high += row.flightCount;
      else acc.low += row.flightCount;
      return acc;
    },
    { high: 0, low: 0 },
  );

  const worstStation = filters.station
    ? {
        name: filters.station,
        delays: Math.max(
          1,
          Math.round((BASE_STATIONS.find((item) => item.name === filters.station)?.delays ?? BASE_STATIONS[0].delays) * factor),
        ),
      }
    : {
        ...BASE_STATIONS[0],
        delays: Math.round(BASE_STATIONS[0].delays * factor),
      };

  const worstAirline = filters.airline
    ? {
        name: filters.airline,
        flights: Math.max(
          1,
          Math.round((BASE_AIRLINES.find((item) => item.name === filters.airline)?.flights ?? BASE_AIRLINES[0].flights) * factor),
        ),
      }
    : {
        ...BASE_AIRLINES[0],
        flights: Math.round(BASE_AIRLINES[0].flights * factor),
      };

  return {
    filters,
    delayCodes,
    delayedFlights,
    totalDelayMinutes,
    avgDelayPerFlight,
    monthlyTrend,
    hourlyDistribution,
    weeklyDistribution,
    airlineShare: BASE_AIRLINES,
    stationBreakdown: BASE_STATIONS,
    severitySplit,
    topDelayCode: delayCodes[0] ?? null,
    worstStation,
    worstAirline,
  };
}

function withDelayCodeMetadata(row: DelayCodePanelRow): DelayCodeRow {
  const meta = DELAY_CODE_METADATA.get(row.code);
  return {
    ...row,
    description: meta?.description ?? `Delay code ${row.code}`,
    category: meta?.category ?? 'Operational',
    owner: meta?.owner ?? 'non-gha',
  };
}

function metricBadge(severity: Severity) {
  return (
    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold', badgeClasses(severity))}>
      {severity}
    </span>
  );
}

function sectionTitle(title: string, subtitle?: string) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h3 className="text-base font-semibold text-emerald-700">{title}</h3>
      {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function DelayMetricCard({ card }: { card: KpiCard }) {
  const Icon = card.icon;
  const shouldReduceMotion = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const springRotateX = useSpring(rotateX, { stiffness: 180, damping: 18, mass: 0.9 });
  const springRotateY = useSpring(rotateY, { stiffness: 180, damping: 18, mass: 0.9 });
  const springPointerX = useSpring(pointerX, { stiffness: 160, damping: 20, mass: 0.8 });
  const springPointerY = useSpring(pointerY, { stiffness: 160, damping: 20, mass: 0.8 });
  const sheen = useMotionTemplate`radial-gradient(circle at ${springPointerX}% ${springPointerY}%, rgba(255,255,255,0.8), rgba(255,255,255,0.28) 18%, transparent 54%)`;

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;

    pointerX.set(relativeX * 100);
    pointerY.set(relativeY * 100);
    rotateY.set((relativeX - 0.5) * 12);
    rotateX.set((0.5 - relativeY) * 12);
  };

  const handlePointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    pointerX.set(50);
    pointerY.set(50);
  };

  return (
    <div className="[perspective:1200px]">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.25 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        className={cn(
          subPanelClass,
          'relative overflow-hidden p-3 [transform-style:preserve-3d] sm:p-3.5',
        )}
        style={
          shouldReduceMotion
            ? undefined
            : {
                rotateX: springRotateX,
                rotateY: springRotateY,
              }
        }
      >
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(135deg,rgba(255,255,255,0.75),transparent_42%,rgba(16,185,129,0.08)_100%)]" />
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-80"
          style={shouldReduceMotion ? undefined : { backgroundImage: sheen }}
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-0 h-12 rounded-full bg-emerald-950/8 blur-2xl" />

        <div className="relative z-10 mb-2.5 flex items-center gap-2.5 [transform:translateZ(24px)]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-md shadow-emerald-900/20 ring-1 ring-white/35">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-900">{card.title}</p>
        </div>
        <div className="relative z-10 [transform:translateZ(18px)]">
          <p className="text-[1.2rem] font-semibold leading-none tracking-tight text-emerald-950 sm:text-[1.35rem]">
            {card.value}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  direction,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: SortDirection;
  onToggle: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 transition-colors hover:text-emerald-700"
      onClick={() => onToggle(sortKey)}
    >
      <span>{label}</span>
      <span className={cn('text-[10px]', active ? 'text-emerald-600' : 'text-slate-400')}>
        {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );
}

function DelayAnalyticsOwnerTable({
  title,
  rows,
  selectedDelayCode,
  onSelect,
  sortKey,
  sortDirection,
  onToggleSort,
}: {
  title: string;
  rows: DelayCodeRow[];
  selectedDelayCode: string | null;
  onSelect: (code: string) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onToggleSort: (key: SortKey) => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100/90 bg-white/90 shadow-sm shadow-emerald-900/[0.03]">
      <div className="border-b border-emerald-100/90 px-4 py-3">
        <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
          {title}
        </h4>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-emerald-100/90 bg-emerald-50/40">
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Code"
                  sortKey="code"
                  currentKey={sortKey}
                  direction={sortDirection}
                  onToggle={onToggleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Description"
                  sortKey="description"
                  currentKey={sortKey}
                  direction={sortDirection}
                  onToggle={onToggleSort}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Flights"
                  sortKey="flightCount"
                  currentKey={sortKey}
                  direction={sortDirection}
                  onToggle={onToggleSort}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Total Time"
                  sortKey="totalMinutes"
                  currentKey={sortKey}
                  direction={sortDirection}
                  onToggle={onToggleSort}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="Avg"
                  sortKey="avgMinutes"
                  currentKey={sortKey}
                  direction={sortDirection}
                  onToggle={onToggleSort}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  label="% of Delay"
                  sortKey="pctOfDelay"
                  currentKey={sortKey}
                  direction={sortDirection}
                  onToggle={onToggleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Severity"
                  sortKey="severity"
                  currentKey={sortKey}
                  direction={sortDirection}
                  onToggle={onToggleSort}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                  No delay codes available in this group.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const selected = selectedDelayCode === row.code;
                const rowCellClass = cn(
                  'px-4 py-3 transition-colors duration-200',
                  selected ? 'bg-emerald-100/90' : 'group-hover:bg-emerald-50/90',
                );

                return (
                  <tr
                    key={`${title}-${row.code}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={selected}
                    onClick={() => onSelect(row.code)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(row.code);
                      }
                    }}
                    className={cn(
                      'group cursor-pointer border-b border-emerald-100/80 outline-none transition-[background-color,box-shadow] duration-200',
                      selected
                        ? 'bg-emerald-50/80 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]'
                        : index % 2 === 0
                          ? 'bg-white/90'
                          : 'bg-emerald-50/[0.22]',
                    )}
                  >
                    <td className={cn(rowCellClass, 'text-sm font-semibold text-emerald-950')}>
                      {row.code}
                    </td>
                    <td className={cn(rowCellClass, 'text-sm text-slate-700')}>
                      <div className="flex flex-col">
                        <span>{row.description}</span>
                        <span className="text-xs text-slate-500">{row.category}</span>
                      </div>
                    </td>
                    <td className={cn(rowCellClass, 'text-right text-sm font-medium text-emerald-950')}>
                      {formatTableCount(row.flightCount)}
                    </td>
                    <td className={cn(rowCellClass, 'text-right text-sm text-slate-700')}>
                      {formatTableDuration(row.totalMinutes)}
                    </td>
                    <td className={cn(rowCellClass, 'text-right text-sm text-slate-700')}>
                      {formatTableAverage(row.avgMinutes)}
                    </td>
                    <td className={cn(rowCellClass, 'text-right text-sm text-slate-700')}>
                      {formatTablePercent(row.pctOfDelay)}
                    </td>
                    <td className={cn(rowCellClass, 'text-sm')}>{metricBadge(row.severity)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DelayReportDashboard() {
  const lastInsightsTriggerRef = useRef<number | null>(null);
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [selectedDelayCode, setSelectedDelayCode] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('totalMinutes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [exporting, setExporting] = useState(false);
  const [topCards, setTopCards] = useState<Awaited<
    ReturnType<typeof fetchDelayReportTopCards>
  > | null>(null);
  const [topCardsLoading, setTopCardsLoading] = useState(false);
  const [topCardsError, setTopCardsError] = useState<string | null>(null);
  const [topCardsSettled, setTopCardsSettled] = useState(false);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(true);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);
  const [insightsTrigger, setInsightsTrigger] = useState(1);
  const { errors, clearField, applyAndFocus } = useFieldErrors(['fromYmd', 'toYmd'] as const);

  // Per-flight drilldown (with serial numbers) for the opened delay-code popup.
  const [drilldown, setDrilldown] = useState<DelayDrilldownPayload | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // Restore filters + re-open the delay-code popup when returning from the
  // Scheduled Airlines deep link ("Back to delay report").
  const searchParams = useSearchParams();
  const returnHandledRef = useRef(false);
  useEffect(() => {
    if (returnHandledRef.current) return;
    const restore = parseDelayReportReturnFromUrl(searchParams);
    if (!restore) return;
    returnHandledRef.current = true;
    setAppliedFilters((current) => {
      const next: DashboardFilters = {
        ...current,
        fromYmd: restore.fromYmd || current.fromYmd,
        toYmd: restore.toYmd || current.toYmd,
        airline: restore.airline ?? current.airline,
        station: restore.station ?? current.station,
      };
      setDraftFilters(next);
      return next;
    });
    if (restore.code) setSelectedDelayCode(restore.code);
  }, [searchParams]);

  const dashboardData = useMemo(() => buildDashboardData(appliedFilters), [appliedFilters]);

  useEffect(() => {
    const ac = new AbortController();
    setTopCardsLoading(true);
    setTopCardsError(null);
    setTopCardsSettled(false);

    void fetchDelayReportTopCards(
      appliedFilters.fromYmd,
      appliedFilters.toYmd,
      appliedFilters.airline,
      appliedFilters.station,
      { signal: ac.signal },
    )
      .then((payload) => {
        if (ac.signal.aborted) return;
        setTopCards(payload);
      })
      .catch((error: unknown) => {
        if (ac.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Delay report top cards could not be loaded';
        setTopCards(null);
        setTopCardsError(message);
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setTopCardsLoading(false);
        setTopCardsSettled(true);
      });

    return () => ac.abort();
  }, [appliedFilters]);

  const materializedKpis = topCards?.kpis ?? null;
  const delayedFlightsValue = materializedKpis?.totalDelayedFlights ?? dashboardData.delayedFlights;
  const totalDelayMinutesValue =
    materializedKpis?.totalDelayMinutes ?? dashboardData.totalDelayMinutes;
  const avgDelayPerFlightValue =
    materializedKpis?.avgDelayPerFlight ?? dashboardData.avgDelayPerFlight;
  const topCodeValue = materializedKpis?.topCodeByFlights?.code ?? dashboardData.topDelayCode?.code ?? '—';
  const topCodeFlights =
    materializedKpis?.topCodeByFlights?.flightCount ??
    dashboardData.topDelayCode?.flightCount ??
    0;
  const worstStationName =
    materializedKpis?.worstStation?.name ?? dashboardData.worstStation.name;
  const worstStationFlights =
    materializedKpis?.worstStation?.flightCount ?? dashboardData.worstStation.delays;
  const worstAirlineName =
    materializedKpis?.worstAirline?.name ?? dashboardData.worstAirline.name;
  const worstAirlineFlights =
    materializedKpis?.worstAirline?.flightCount ?? dashboardData.worstAirline.flights;
  const displayMonthlyTrend = useMemo(
    () =>
      topCards?.panels?.monthlyTrend?.map((row) => ({
        ...row,
        month: row.label,
      })) ??
      dashboardData.monthlyTrend.map((row) => ({
        ...row,
        label: row.month,
      })),
    [dashboardData.monthlyTrend, topCards?.panels?.monthlyTrend],
  );
  const displaySeveritySplit =
    topCards?.panels?.severitySplit ?? dashboardData.severitySplit;
  const displayAllCodeRows = useMemo(
    () =>
      topCards?.panels?.allCodes?.map(withDelayCodeMetadata) ?? dashboardData.delayCodes,
    [dashboardData.delayCodes, topCards?.panels?.allCodes],
  );
  const displayTopCodeRows = useMemo(
    () =>
      topCards?.panels?.topCodes?.map(withDelayCodeMetadata) ??
      [...displayAllCodeRows]
        .sort((a, b) => b.flightCount - a.flightCount)
        .slice(0, 10),
    [displayAllCodeRows, topCards?.panels?.topCodes],
  );
  const sortedRows = useMemo(() => {
    const rows = [...displayAllCodeRows];
    rows.sort((left, right) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'description' || sortKey === 'code') {
        return left[sortKey].localeCompare(right[sortKey]) * direction;
      }
      if (sortKey === 'severity') {
        return (severityRank(left.severity) - severityRank(right.severity)) * direction;
      }
      return ((left[sortKey] as number) - (right[sortKey] as number)) * direction;
    });
    return rows;
  }, [displayAllCodeRows, sortDirection, sortKey]);
  const ghaRows = useMemo(
    () => sortedRows.filter((row) => row.owner === 'gha'),
    [sortedRows],
  );
  const nonGhaRows = useMemo(
    () => sortedRows.filter((row) => row.owner === 'non-gha'),
    [sortedRows],
  );
  const insightDelayTableRows = useMemo<InsightDelayTableRows>(
    () => ({
      gha: ghaRows,
      nonGha: nonGhaRows,
    }),
    [ghaRows, nonGhaRows],
  );
  const requestedInsightCount = useMemo(
    () => computeOperationalInsightCount(appliedFilters, insightDelayTableRows),
    [appliedFilters, insightDelayTableRows],
  );
  const insightsSummaryStats = useMemo<InsightSummaryStats>(
    () => ({
      fromYmd: appliedFilters.fromYmd,
      toYmd: appliedFilters.toYmd,
      airline: appliedFilters.airline || 'All airlines',
      station: appliedFilters.station || 'All stations',
      delayedFlights: delayedFlightsValue,
      totalDelayMinutes: totalDelayMinutesValue,
      avgDelayPerFlight: Number(avgDelayPerFlightValue.toFixed(1)),
      topDelayCode: topCodeValue !== '—' ? { code: topCodeValue, flightCount: topCodeFlights } : null,
      worstStation: worstStationName ? { name: worstStationName, flightCount: worstStationFlights } : null,
      worstAirline: worstAirlineName ? { name: worstAirlineName, flightCount: worstAirlineFlights } : null,
    }),
    [
      appliedFilters.airline,
      appliedFilters.fromYmd,
      appliedFilters.station,
      appliedFilters.toYmd,
      avgDelayPerFlightValue,
      delayedFlightsValue,
      topCodeFlights,
      topCodeValue,
      totalDelayMinutesValue,
      worstAirlineFlights,
      worstAirlineName,
      worstStationFlights,
      worstStationName,
    ],
  );
  const requestOperationalInsights = useCallback(
    async (signal: AbortSignal) => {
      const response = await fetch('/api/generate-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          summaryStats: insightsSummaryStats,
          delayTableRows: insightDelayTableRows,
          requestedInsightCount,
        }),
        signal,
      });

      let payload: GenerateInsightsResponse | null = null;
      try {
        payload = (await response.json()) as GenerateInsightsResponse;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Could not generate insights. Please try again.',
        );
      }

      const insights = payload?.insights;
      if (
        !Array.isArray(insights) ||
        insights.length < 3 ||
        insights.some((item) => typeof item !== 'string' || !item.trim())
      ) {
        throw new Error('Could not generate insights. Please try again.');
      }

      return insights
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, requestedInsightCount);
    },
    [insightDelayTableRows, insightsSummaryStats, requestedInsightCount],
  );
  useEffect(() => {
    if (!topCardsSettled) return;
    if (lastInsightsTriggerRef.current === insightsTrigger) return;

    lastInsightsTriggerRef.current = insightsTrigger;
    const ac = new AbortController();
    setAiInsightsLoading(true);
    setAiInsightsError(null);

    void requestOperationalInsights(ac.signal)
      .then((nextInsights) => {
        if (ac.signal.aborted) return;
        setAiInsights(nextInsights);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setAiInsights([]);
        setAiInsightsError(
          getErrorMessage(err, 'Could not generate insights. Please try again.'),
        );
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setAiInsightsLoading(false);
      });

    return () => ac.abort();
  }, [insightsTrigger, requestOperationalInsights, topCardsSettled]);
  const selectedDelayRow = useMemo(
    () => sortedRows.find((row) => row.code === selectedDelayCode) ?? null,
    [selectedDelayCode, sortedRows],
  );
  const selectedAirlineDetails = useMemo(
    () => (selectedDelayRow ? buildAirlineDelayDetails(selectedDelayRow, appliedFilters) : []),
    [appliedFilters, selectedDelayRow],
  );

  // Load the real per-flight list (with serial numbers) for the opened code.
  useEffect(() => {
    if (!selectedDelayCode) {
      setDrilldown(null);
      setDrilldownLoading(false);
      return;
    }
    const ac = new AbortController();
    setDrilldownLoading(true);
    setDrilldown(null);
    void fetchDelayAnalyticsDrilldown(
      appliedFilters.fromYmd,
      appliedFilters.toYmd,
      selectedDelayCode,
      appliedFilters.airline,
      appliedFilters.station,
    )
      .then((payload) => {
        if (ac.signal.aborted) return;
        setDrilldown(payload);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setDrilldown(null);
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setDrilldownLoading(false);
      });
    return () => ac.abort();
  }, [selectedDelayCode, appliedFilters]);

  // Deep-link context so each flight serial can return to this exact popup.
  const delayReturnContext = useMemo(
    () => ({
      fromYmd: appliedFilters.fromYmd,
      toYmd: appliedFilters.toYmd,
      airline: appliedFilters.airline,
      station: appliedFilters.station,
      code: selectedDelayCode ?? '',
    }),
    [appliedFilters, selectedDelayCode],
  );

  const airlineMax = Math.max(...dashboardData.airlineShare.map((item) => item.flights), 1);
  const displayHourlyDistribution =
    topCards?.panels?.hourlyDistribution ?? dashboardData.hourlyDistribution;
  const displayWeeklyDistribution =
    topCards?.panels?.weeklyDistribution ?? dashboardData.weeklyDistribution;
  const delayByCodeMax = Math.max(
    ...displayTopCodeRows.map((item) => item.flightCount),
    1,
  );
  const hourlyDisplayMax = Math.max(
    ...displayHourlyDistribution.map((item) => item.delays),
    1,
  );

  const kpis: KpiCard[] = [
    {
      title: 'Delayed Flights',
      value: delayedFlightsValue.toLocaleString(),
      subtitle: 'Flights carrying at least one active delay code',
      badge: delayedFlightsValue >= 120 ? 'Alert' : delayedFlightsValue >= 80 ? 'Watch' : 'High',
      icon: Plane,
    },
    {
      title: 'Total Delay Time',
      value: formatHoursMinutes(totalDelayMinutesValue),
      subtitle: 'Combined duration across all delayed flights',
      badge:
        totalDelayMinutesValue >= 5000
          ? 'Alert'
          : totalDelayMinutesValue >= 1500
            ? 'Watch'
            : 'High',
      icon: Clock3,
    },
    {
      title: 'Avg Delay / Flight',
      value: `${avgDelayPerFlightValue.toFixed(1)} min`,
      subtitle: 'Mean delay duration per impacted movement',
      badge:
        avgDelayPerFlightValue >= 45
          ? 'Alert'
          : avgDelayPerFlightValue >= 25
            ? 'Watch'
            : 'High',
      icon: TimerReset,
    },
    {
      title: 'Top Delay Code',
      value: topCodeValue,
      subtitle:
        topCodeValue !== '—'
          ? `Code ${topCodeValue} · ${topCodeFlights} flights`
          : 'No dominant code in current scope',
      badge: topCodeFlights >= 30 ? 'Alert' : topCodeFlights >= 5 ? 'Watch' : 'High',
      icon: AlertTriangle,
    },
    {
      title: 'Worst Station',
      value: worstStationName,
      subtitle: `${worstStationFlights} delayed flights concentrated at station level`,
      badge:
        worstStationFlights >= 90
          ? 'Alert'
          : worstStationFlights >= 45
            ? 'Watch'
            : 'High',
      icon: MapPinned,
    },
    {
      title: 'Worst Airline',
      value: worstAirlineName,
      subtitle: `${worstAirlineFlights} delayed sectors in current view`,
      badge:
        worstAirlineFlights >= 45
          ? 'Alert'
          : worstAirlineFlights >= 22
            ? 'Watch'
            : 'High',
      icon: Building2,
    },
  ];

  const retryAiInsights = useCallback(() => {
    setAiInsightsError(null);
    setAiInsightsLoading(true);
    setInsightsTrigger((current) => current + 1);
  }, []);

  const handleApplyFilters = () => {
    const next = validateYmdDateRange(draftFilters.fromYmd, draftFilters.toYmd, {
      fromKey: 'fromYmd',
      toKey: 'toYmd',
      fromLabel: 'From date',
      toLabel: 'To date',
    });
    if (applyAndFocus(next)) return;
    setTopCardsSettled(false);
    setAiInsightsError(null);
    setAiInsightsLoading(true);
    setAppliedFilters(draftFilters);
    setInsightsTrigger((current) => current + 1);
  };

  const handleExportPdf = async () => {
    try {
      setExporting(true);
      const { exportDelayReportPdf } = await import('./exportPDF');
      await exportDelayReportPdf(
        {
          filters: appliedFilters,
          kpis: kpis.map(({ title, value }) => ({ title, value })),
          insights: aiInsights,
          topCodes: displayTopCodeRows,
          ghaRows,
          nonGhaRows,
          monthlyTrend: displayMonthlyTrend.map((row) => ({
            month: row.month,
            label: row.label ?? row.month,
            delayedFlights: row.delayedFlights,
            avgDuration: row.avgDuration,
            trendFlights: row.trendFlights,
          })),
          severitySplit: displaySeveritySplit,
          hourlyDistribution: displayHourlyDistribution,
          weeklyDistribution: displayWeeklyDistribution,
          airlineShare: dashboardData.airlineShare,
          stationBreakdown: dashboardData.stationBreakdown,
        },
        `delay-report-${appliedFilters.fromYmd}-${appliedFilters.toYmd}.pdf`,
      );
      toast.success('Delay report PDF exported');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export the delay report');
    } finally {
      setExporting(false);
    }
  };

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'code' || nextKey === 'description' ? 'asc' : 'desc');
  };

  const toggleDelayRowDetails = (code: string) => {
    setSelectedDelayCode((current) => (current === code ? null : code));
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:items-start">
        <FrisPageHeader title="Delay Report" icon={Clock} className="mb-0 xl:pt-1" />

        <div className="rounded-2xl border border-emerald-100/90 bg-white/90 p-4 shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04] backdrop-blur-sm sm:p-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_auto_auto]">
            <div className={cn('min-w-0', errors.fromYmd && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-1.5 block text-sm font-medium text-emerald-950/85" htmlFor="field-fromYmd">
                From date
              </label>
              <DatePicker
                id="field-fromYmd"
                value={draftFilters.fromYmd}
                onChange={(value) => {
                  setDraftFilters((current) => ({ ...current, fromYmd: value }));
                  clearField('fromYmd');
                }}
                valueFormat="yyyy-MM-dd"
                maxDate={ymdToDate(draftFilters.toYmd)}
                rangeFrom={ymdToDate(draftFilters.fromYmd)}
                rangeTo={ymdToDate(draftFilters.toYmd)}
                className={datePickerClass}
              />
              <FormFieldError id="field-fromYmd-error" message={errors.fromYmd} />
            </div>

            <div className={cn('min-w-0', errors.toYmd && FRIS_INVALID_PICKER_WRAP)}>
              <label className="mb-1.5 block text-sm font-medium text-emerald-950/85" htmlFor="field-toYmd">
                To date
              </label>
              <DatePicker
                id="field-toYmd"
                value={draftFilters.toYmd}
                onChange={(value) => {
                  setDraftFilters((current) => ({ ...current, toYmd: value }));
                  clearField('toYmd');
                }}
                valueFormat="yyyy-MM-dd"
                minDate={ymdToDate(draftFilters.fromYmd)}
                rangeFrom={ymdToDate(draftFilters.fromYmd)}
                rangeTo={ymdToDate(draftFilters.toYmd)}
                className={datePickerClass}
              />
              <FormFieldError id="field-toYmd-error" message={errors.toYmd} />
            </div>

            <div className="min-w-0">
              <label className="mb-1.5 block text-sm font-medium text-emerald-950/85">Airline</label>
              <AdminRadioDropdown
                id="delay-airline-filter"
                value={draftFilters.airline}
                onChange={(value) => setDraftFilters((current) => ({ ...current, airline: value }))}
                options={[
                  { value: ALL, label: 'All airlines' },
                  ...BASE_AIRLINES.map((airline) => ({ value: airline.name, label: airline.name })),
                ]}
                className="h-11 shadow-sm"
                aria-label="Filter delay report by airline"
              />
              <FormFieldError />
            </div>

            <div className="min-w-0">
              <label className="mb-1.5 block text-sm font-medium text-emerald-950/85">Station</label>
              <AdminRadioDropdown
                id="delay-station-filter"
                value={draftFilters.station}
                onChange={(value) => setDraftFilters((current) => ({ ...current, station: value }))}
                options={[
                  { value: ALL, label: 'All stations' },
                  ...BASE_STATIONS.map((station) => ({ value: station.name, label: station.name })),
                ]}
                className="h-11 shadow-sm"
                aria-label="Filter delay report by station"
              />
              <FormFieldError />
            </div>

            <div className={cn('flex flex-col justify-end xl:min-w-[110px]', FLIGHT_FILTER_ACTIONS_PB)}>
              <button
                type="button"
                className={primaryButtonClass}
                onClick={handleApplyFilters}
                disabled={topCardsLoading}
              >
                {topCardsLoading ? 'Applying…' : 'Apply'}
              </button>
            </div>

            <div className={cn('flex flex-col justify-end xl:min-w-[150px]', FLIGHT_FILTER_ACTIONS_PB)}>
              <button type="button" className={secondaryButtonClass} onClick={() => void handleExportPdf()} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" aria-hidden />
                {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {topCardsError ? (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Showing the seeded view for now because the materialized delay report data could not be loaded.
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((card) => (
          <DelayMetricCard key={card.title} card={card} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <motion.article
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className={cn(panelClass, 'xl:col-span-3 xl:order-3')}
        >
          {sectionTitle('Severity split', 'High vs low severity delay share')}
          <div className="flex h-[300px] flex-col items-center justify-center gap-5">
            <div className="relative h-[180px] w-full max-w-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'High', value: displaySeveritySplit.high },
                      { name: 'Low', value: displaySeveritySplit.low },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={82}
                    paddingAngle={3}
                    stroke="none"
                    isAnimationActive
                    animationDuration={700}
                  >
                    <Cell fill={AMBER} />
                    <Cell fill={EMERALD} />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      border: '1px solid #A7F3D0',
                      borderRadius: 14,
                      boxShadow: '0 8px 24px rgba(6, 78, 59, 0.08)',
                      background: '#FFFFFF',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">High severity</span>
                <span className="text-2xl font-semibold text-emerald-950">
                  {formatPercent(
                    delayedFlightsValue > 0
                      ? (displaySeveritySplit.high / delayedFlightsValue) * 100
                      : 0,
                  )}
                </span>
              </div>
            </div>
            <div className="flex w-full max-w-[220px] items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                High
              </div>
              <span className="font-semibold text-emerald-950">{displaySeveritySplit.high}</span>
            </div>
            <div className="flex w-full max-w-[220px] items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Low
              </div>
              <span className="font-semibold text-emerald-950">{displaySeveritySplit.low}</span>
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className={cn(panelClass, 'xl:col-span-6 xl:order-1')}
        >
          {sectionTitle('6-month trend', 'Delayed flight count vs average duration per movement')}
          <div className="rounded-xl border border-emerald-100/80 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30 p-3">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={displayMonthlyTrend} margin={{ top: 8, right: 10, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="delayTrendBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.78} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={BORDER} strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: '#ECFDF5' }}
                    contentStyle={{
                      border: '1px solid #A7F3D0',
                      borderRadius: 14,
                      boxShadow: '0 8px 24px rgba(6, 78, 59, 0.08)',
                      background: '#FFFFFF',
                    }}
                  />
                  <Bar yAxisId="left" dataKey="delayedFlights" fill="url(#delayTrendBar)" radius={[8, 8, 0, 0]} barSize={28} isAnimationActive animationDuration={700} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgDuration"
                    stroke={AMBER}
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    dot={{ r: 3, fill: AMBER, strokeWidth: 0 }}
                    activeDot={{ r: 4, fill: AMBER, strokeWidth: 0 }}
                    isAnimationActive
                    animationDuration={700}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="trendFlights"
                    stroke={TEAL}
                    strokeWidth={2.5}
                    dot={{ r: 0 }}
                    activeDot={{ r: 4, fill: TEAL, strokeWidth: 0 }}
                    isAnimationActive
                    animationDuration={700}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className={cn(amberPanelClass, 'xl:col-span-3 xl:order-2')}
        >
          <div className="mb-4 flex flex-col gap-1">
            <h3 className="text-base font-semibold text-amber-700">Delay by code</h3>
            <p className="text-xs text-amber-900/70">Highest-volume IATA delay drivers</p>
          </div>
          <div className={cn('max-h-[316px] space-y-3', subtleScrollClass)}>
            {displayTopCodeRows.map((row) => (
              <div key={row.code} className={cn('rounded-xl border border-amber-200/80 bg-white/90 p-3', amberItemHoverClass)}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-950">
                      {row.code} <span className="font-normal text-slate-600">{row.description}</span>
                    </p>
                    <p className="text-xs text-slate-500">{row.category}</p>
                  </div>
                  <span className="text-sm font-semibold text-amber-950">{row.flightCount}</span>
                </div>
                <div className="h-2.5 rounded-full bg-amber-50">
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: `${(row.flightCount / delayByCodeMax) * 100}%`,
                      background: barFillByIntensity(row.flightCount, delayByCodeMax, 'amber'),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className={cn(panelClass, 'xl:col-span-5 xl:order-4')}
        >
          {sectionTitle('Hourly distribution', '24-hour spread with darker peaks on the night bank')}
          <div className="rounded-xl border border-emerald-100/80 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/25 p-3">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayHourlyDistribution} margin={{ top: 8, right: 6, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={BORDER} strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 11 }} interval={2} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#ECFDF5' }}
                    contentStyle={{
                      border: '1px solid #A7F3D0',
                      borderRadius: 14,
                      boxShadow: '0 8px 24px rgba(6, 78, 59, 0.08)',
                      background: '#FFFFFF',
                    }}
                  />
                  <Bar dataKey="delays" radius={[8, 8, 0, 0]} barSize={16} isAnimationActive animationDuration={700}>
                    {displayHourlyDistribution.map((row) => (
                      <Cell key={row.hour} fill={barFillByIntensity(row.delays, hourlyDisplayMax, 'teal')} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className={cn(amberPanelClass, 'xl:col-span-7 xl:order-5')}
        >
          <div className="mb-4 flex flex-col gap-1">
            <h3 className="text-base font-semibold text-amber-700">Stacked weekly view</h3>
            <p className="text-xs text-amber-900/70">
              Eight-week split by Aircraft Rotation, ATFM, and Operational causes
            </p>
          </div>
          <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-100/40 p-3">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayWeeklyDistribution} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#FDE68A" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#FFFBEB' }}
                    contentStyle={{
                      border: '1px solid #FCD34D',
                      borderRadius: 14,
                      boxShadow: '0 8px 24px rgba(146, 64, 14, 0.12)',
                      background: '#FFFFFF',
                    }}
                  />
                  <Bar dataKey="rotation" stackId="delay" fill={AMBER_SOFT} isAnimationActive animationDuration={700}>
                    {displayWeeklyDistribution.map((row) => (
                      <Cell
                        key={`${row.week}-rotation`}
                        {...({
                          radius: stackedSegmentRadius(row, 'rotation'),
                        } as unknown as Record<string, unknown>)}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="atfm" stackId="delay" fill={AMBER} isAnimationActive animationDuration={700}>
                    {displayWeeklyDistribution.map((row) => (
                      <Cell
                        key={`${row.week}-atfm`}
                        {...({
                          radius: stackedSegmentRadius(row, 'atfm'),
                        } as unknown as Record<string, unknown>)}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="operational" stackId="delay" fill={AMBER_DARKEST} isAnimationActive animationDuration={700}>
                    {displayWeeklyDistribution.map((row) => (
                      <Cell
                        key={`${row.week}-operational`}
                        {...({
                          radius: stackedSegmentRadius(row, 'operational'),
                        } as unknown as Record<string, unknown>)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className={cn(amberPanelClass, 'self-start xl:col-span-8 xl:order-7')}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-amber-700">Operational insights</h3>
              <p className="text-xs text-amber-900/70">Auto-generated summary for handoff or review</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
              <Sparkles className="h-3 w-3" aria-hidden />
              AI-generated
            </span>
          </div>
          <div className={cn('max-h-[252px] space-y-3 text-sm leading-6 text-slate-600', subtleScrollClass)} aria-live="polite">
            {aiInsightsLoading ? (
              Array.from({ length: requestedInsightCount }).map((_, index) => (
                <div
                  key={`insight-skeleton-${index}`}
                  className="rounded-xl border border-amber-200/80 bg-white/95 p-3"
                >
                  <div className="animate-pulse space-y-2">
                    <div
                      className="h-4 rounded-full bg-amber-100/90"
                      style={{ width: `${88 - index * 12}%` }}
                    />
                  </div>
                </div>
              ))
            ) : aiInsightsError ? (
              <div className="rounded-xl border border-amber-200/80 bg-white/95 p-3">
                <p className="text-amber-950/85">Could not generate insights. Please try again.</p>
                <button
                  type="button"
                  onClick={retryAiInsights}
                  className="mt-3 inline-flex items-center rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-amber-400/40"
                >
                  Retry
                </button>
              </div>
            ) : (
              aiInsights.map((line, index) => (
                <div
                  key={`${index}-${line}`}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border border-amber-200/80 bg-white/95 p-3 text-amber-950/85',
                    amberItemHoverClass,
                  )}
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
                  <p>{line}</p>
                </div>
              ))
            )}
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.25 }}
          className={cn(panelClass, 'self-start xl:col-span-4 xl:order-8')}
        >
          {sectionTitle('Airline share', 'Delay concentration by operating carrier')}
          <div className={cn('max-h-[252px] space-y-3', subtleScrollClass)}>
            {dashboardData.airlineShare.map((airline) => {
              const selected = appliedFilters.airline === airline.name;
              return (
                <div
                  key={airline.name}
                  className={cn(
                    'rounded-xl border p-3',
                    emeraldItemHoverClass,
                    selected ? 'border-emerald-200/90 bg-emerald-50/70' : 'border-emerald-100/80 bg-white/95',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className={cn('text-sm text-emerald-950', selected && 'font-semibold text-emerald-700')}>
                      {airline.name}
                    </p>
                    <span className="text-sm font-semibold text-emerald-950">{airline.flights}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-emerald-50">
                    <div
                      className="h-2.5 rounded-full"
                      style={{
                        width: `${(airline.flights / airlineMax) * 100}%`,
                        background: selected ? TEAL : barFillByIntensity(airline.flights, airlineMax),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.article>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.25 }}
        className={panelClass}
      >
        <div className="mb-4 flex flex-col gap-1">
          <h3 className="text-base font-semibold text-emerald-700">Delay analytics table</h3>
          <p className="text-xs text-slate-500">
            Separate sortable tables for GHA and Non GHA code-level breakdowns.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <DelayAnalyticsOwnerTable
            title="GHA"
            rows={ghaRows}
            selectedDelayCode={selectedDelayCode}
            onSelect={toggleDelayRowDetails}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onToggleSort={toggleSort}
          />
          <DelayAnalyticsOwnerTable
            title="Non GHA"
            rows={nonGhaRows}
            selectedDelayCode={selectedDelayCode}
            onSelect={toggleDelayRowDetails}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onToggleSort={toggleSort}
          />
        </div>

      </motion.section>

      <AnimatePresence>
        {selectedDelayRow ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-slate-950/35 p-4 backdrop-blur-sm"
            onClick={() => setSelectedDelayCode(null)}
          >
            <div className="flex min-h-full items-center justify-center">
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                onClick={(event) => event.stopPropagation()}
                className="max-h-[min(86vh,52rem)] w-full max-w-5xl overflow-hidden rounded-3xl border border-emerald-200/90 bg-white shadow-2xl shadow-emerald-950/20"
                role="dialog"
                aria-modal="true"
                aria-label={`Airline details for delay code ${selectedDelayRow.code}`}
              >
                <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-white sm:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100/90">
                        Airline details
                      </p>
                      <h4 className="mt-1 text-lg font-semibold sm:text-xl">
                        Code {selectedDelayRow.code} — {selectedDelayRow.description}
                      </h4>
                      <p className="mt-1 text-sm text-emerald-50/90">
                        {selectedDelayRow.flightCount} delayed flights · {formatHoursMinutes(selectedDelayRow.totalMinutes)} total
                        · avg {selectedDelayRow.avgMinutes.toFixed(1)} min per movement
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedDelayCode(null)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                      aria-label="Close airline details popup"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className={cn('max-h-[calc(min(86vh,52rem)-6.5rem)] overflow-y-auto p-5 sm:p-6', subtleScrollClass)}>
                  <div className="overflow-x-auto rounded-2xl border border-emerald-200/80 bg-white/95">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="bg-emerald-50/90">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                            Airline
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                            Flights
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                            Share
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                            Delay Time
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                            Avg / Flight
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAirlineDetails.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-4 py-12 text-center text-sm text-slate-500"
                            >
                              No airline details available for this delay code.
                            </td>
                          </tr>
                        ) : (
                          selectedAirlineDetails.map((detail, index) => (
                            <tr
                              key={`${selectedDelayRow.code}-${detail.name}`}
                              className={cn(
                                'border-t border-emerald-100/80 transition-colors duration-200 hover:bg-emerald-50/80',
                                index % 2 === 0 ? 'bg-white' : 'bg-emerald-50/[0.18]',
                              )}
                            >
                              <td className="px-4 py-3 text-sm font-semibold text-emerald-950">
                                {detail.name}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-slate-700">
                                {formatTableCount(detail.flights)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-medium text-emerald-700">
                                {formatTablePercent(detail.sharePct)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-slate-700">
                                {formatTableDuration(detail.delayMinutes)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-slate-700">
                                {formatTableAverage(detail.avgMinutes)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-emerald-800">
                        Delayed flights
                      </h5>
                      <p className="text-xs text-slate-500">
                        Click a serial number to open the flight in Scheduled Airlines.
                      </p>
                    </div>
                    <div
                      className={cn(
                        'max-h-[18rem] overflow-y-auto rounded-2xl border border-emerald-200/80 bg-white/95',
                        subtleScrollClass,
                      )}
                    >
                      <table className="min-w-full border-collapse">
                        <thead className="sticky top-0 z-[1]">
                          <tr className="bg-emerald-50">
                            {['Serial No', 'Flight', 'Airline', 'Station', 'Delay', 'Date'].map(
                              (heading, idx) => (
                                <th
                                  key={heading}
                                  className={cn(
                                    'border-b border-emerald-200/80 bg-emerald-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600',
                                    idx >= 4 ? 'text-right' : 'text-left',
                                  )}
                                >
                                  {heading}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {drilldownLoading ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                                Loading flights…
                              </td>
                            </tr>
                          ) : !drilldown?.flights?.length ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                                No individual flight records available for this delay code in the
                                selected range.
                              </td>
                            </tr>
                          ) : (
                            drilldown.flights.map((flight, index) => (
                              <tr
                                key={`${flight.serialNo}-${index}`}
                                className={cn(
                                  'border-t border-emerald-100/80 transition-colors duration-200 hover:bg-emerald-50/80',
                                  index % 2 === 0 ? 'bg-white' : 'bg-emerald-50/[0.18]',
                                )}
                              >
                                <td className="px-4 py-2.5 text-sm">
                                  <Link
                                    href={buildScheduledAirlinesHrefFromDelayReport(
                                      flight.serialNo,
                                      delayReturnContext,
                                    )}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-emerald-700 underline-offset-2 transition hover:bg-emerald-100/70 hover:text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                                  >
                                    <Plane className="h-3.5 w-3.5" aria-hidden />
                                    {flight.serialNo}
                                  </Link>
                                </td>
                                <td className="px-4 py-2.5 text-sm font-medium text-emerald-950">
                                  {flight.flightNo || '—'}
                                </td>
                                <td className="px-4 py-2.5 text-sm text-slate-700">
                                  {flight.airline || '—'}
                                </td>
                                <td className="px-4 py-2.5 text-sm text-slate-700">
                                  {flight.station || '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm font-semibold text-emerald-800">
                                  {formatTableDuration(flight.delayMinutes)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm text-slate-700 whitespace-nowrap">
                                  {flight.date || '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
