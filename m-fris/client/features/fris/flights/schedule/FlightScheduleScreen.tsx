'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Calendar, Download, Filter, LayoutList, RefreshCw, XCircle } from 'lucide-react';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  FLIGHT_FILTER_ACTIONS_CLASS,
  FLIGHT_FILTER_CONTROL_CLASS,
  FLIGHT_FILTER_PRIMARY_BTN_CLASS,
  FLIGHT_FILTER_SECONDARY_BTN_CLASS,
} from '@/components/fris/flights/flightFilterBarLayout';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { toast } from 'sonner';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';
import {
  advanceDocId,
  fetchFlightsReferenceAirlines,
  fetchDailyScheduledFromAdvance,
} from '@/services/api';
import {
  processFlightData,
  resolveScheduledAirlinesFlightStatus,
  shouldHideScheduledAirlinesTableRow,
  type FlightData,
} from '@/utils/dataProcessor';

type AdvanceAirlineOption = { id: string; name: string; code: string };
type CategoryMode = 'allActive' | 'passenger' | 'freighter';

const MAYFLY_DATE_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type MayFlyDateField = (typeof MAYFLY_DATE_FIELD_ORDER)[number];

/** Display shape for Did–Fly analyzer (Gantt / CSV). Built from Closed scheduled May–Fly rows. */
export interface MainDetailsFlightRow {
  flightSerialNumber: number;
  airlineName: string;
  flightCode: string;
  staDate?: string;
  ataDate?: string;
  ataTime?: string;
  atdDate?: string;
  atdTime?: string;
  route?: string;
  aircraftType?: string;
  flightCategory?: string;
  flightCancelled?: boolean;
  rampLocked?: string;
  paxLocked?: string;
  gsdLocked?: string;
}

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

/**
 * Default schedule range for May–Fly / Did–Fly: current calendar month (1st → last day of month),
 * end date capped at today (cannot pick future days).
 */
function scheduleDefaultFromToYmd(at = new Date()): { from: string; to: string } {
  const cap = localCalendarYmd(at);
  const y = at.getFullYear();
  const mo = at.getMonth();
  const from = localCalendarYmd(new Date(y, mo, 1));
  const lastDay = new Date(y, mo + 1, 0);
  const lastYmd = localCalendarYmd(lastDay);
  const to = lastYmd > cap ? cap : lastYmd;
  return { from, to };
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
  /** Advance / Mongo often send `yyyy-MM-ddTHH:mm:ss` — windowing must still see the calendar day. */
  const head10 = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head10)) {
    const [y, m, d] = head10.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const normalized = raw.replace(/\./g, '/');
  const parts = normalized.split(/[/-]/).map((p) => p.trim());
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

function normalizeToYmd(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10))) return scheduleLabelToYmd(s);
  return scheduleLabelToYmd(s);
}

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

async function loadScheduledFlightsForDateRange(
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
  fromYmd: string,
  toYmd: string,
): Promise<FlightData[]> {
  const data = await fetchDailyScheduledFromAdvance(fromDdMmYyyy, toDdMmYyyy);
  const rows = processFlightData(Array.isArray(data) ? data : []);
  return filterFlightsToDateWindow(rows, fromYmd, toYmd);
}

function isFreighterFlightType(ft: string): boolean {
  const s = ft.toLowerCase();
  return (
    s.includes('freight') ||
    s.includes('cargo') ||
    s.includes('mail') ||
    s === 'f' ||
    s.includes('bcf')
  );
}

function matchesScheduleCategory(f: FlightData, mode: CategoryMode): boolean {
  if (f.isCancelled) return false;
  if (shouldHideScheduledAirlinesTableRow(f)) return false;
  const ft = String(f.flightType ?? '');
  if (mode === 'allActive') return true;
  if (mode === 'passenger') return !isFreighterFlightType(ft);
  return isFreighterFlightType(ft);
}

function filterMayFlyRows(
  rows: FlightData[],
  airline: string,
  mode: CategoryMode,
): FlightData[] {
  const air = airline.trim().toLowerCase();
  return rows.filter((f) => {
    if (!matchesScheduleCategory(f, mode)) return false;
    if (!air) return true;
    return String(f.airline ?? '')
      .toLowerCase()
      .includes(air);
  });
}

/**
 * Did Fly = May Fly scheduled flight that is Closed (handled complete).
 * Open / Pending / In Progress / Cancelled never qualify.
 */
function isDidFlyClosedScheduledFlight(f: FlightData): boolean {
  if (f.isCancelled) return false;
  if (shouldHideScheduledAirlinesTableRow(f)) return false;
  return resolveScheduledAirlinesFlightStatus(f) === 'Closed';
}

/** Prefer actual ATA/ATD when present on the daily row; else STA/STD for timeline display. */
function scheduledClosedToDidFlyRow(f: FlightData): MainDetailsFlightRow {
  const ext = f as FlightData & {
    ataDate?: string;
    ataTime?: string;
    atdDate?: string;
    atdTime?: string;
  };
  const ataDate = String(ext.ataDate ?? '').trim() || f.staDate;
  const ataTime = String(ext.ataTime ?? '').trim() || f.staTime;
  const atdDate = String(ext.atdDate ?? '').trim() || f.stdDate;
  const atdTime = String(ext.atdTime ?? '').trim() || f.stdTime;
  const serialDigits = String(f.slNo ?? '').replace(/\D/g, '');
  return {
    flightSerialNumber: Number(serialDigits) || 0,
    airlineName: f.airline,
    flightCode: f.flightNo,
    staDate: f.staDate,
    ataDate,
    ataTime,
    atdDate,
    atdTime,
    route: f.route,
    aircraftType: f.aircraft,
    flightCategory: f.cateOfFlight || f.flightType,
    flightCancelled: f.isCancelled,
    rampLocked: f.rampLocked,
    paxLocked: f.paxLocked,
    gsdLocked: f.gsdLocked,
  };
}

function filterDidFlyClosedScheduledRows(
  rows: FlightData[],
  airline: string,
  mode: CategoryMode,
): MainDetailsFlightRow[] {
  return filterMayFlyRows(rows, airline, mode)
    .filter(isDidFlyClosedScheduledFlight)
    .map(scheduledClosedToDidFlyRow);
}

function staHourBucket(staTime: string): string {
  const t = String(staTime ?? '').trim();
  const m = /^(\d{1,2})/.exec(t.replace(/\./g, ':'));
  if (!m) return '—';
  const h = Math.min(23, Math.max(0, parseInt(m[1]!, 10)));
  return `${String(h).padStart(2, '0')}:00`;
}

/** JS weekday: 0 Sun … 6 Sat — matches `Date#getDay()` */
const PEAK_WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
/** Mon → Sun, then All (weekday from STA date) */
const PEAK_WEEKDAY_BUTTONS: { label: string; value: 'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6 }[] = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
  { label: 'All', value: 'all' },
];

function weekdayFromFlightSta(f: FlightData): number | null {
  const raw = String(f.staDate ?? '').trim();
  const ymd =
    scheduleLabelToYmd(raw) ?? (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null);
  if (!ymd) return null;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y!, m! - 1, d!);
  if (dt.getFullYear() !== y || dt.getMonth() !== m! - 1 || dt.getDate() !== d!) return null;
  return dt.getDay();
}

function isWidebodyAircraftType(ac: string): boolean {
  const s = String(ac ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!s) return false;
  if (/\bWB\b|WIDE|JUMBO/.test(s)) return true;
  return /A3(30|50|80|8)|B(74|76|77|78)7|\b744\b|\b773\b|\b772\b|\b789\b|\b788\b|\b781\b|\b359\b|\b338\b|\b339\b/.test(s);
}

/** Distinct fills for stacked airline segments (cycled). */
const AIRLINE_STACK_CHART_COLORS = [
  '#059669',
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
  '#ef4444',
  '#84cc16',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#eab308',
  '#64748b',
] as const;

function stackChartAirlineLabel(f: FlightData): string {
  let s = String(f.airline ?? '').trim();
  if (!s) s = 'Unknown';
  if (s === 'time' || s === 'total') s = `${s} ·`;
  return s;
}

/** One row per hour; each airline is a stacked segment (flight counts by STA hour). */
function buildMayFlyHourlyAirlineStackChartData(
  flights: FlightData[],
  weekdayFilter: 'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6,
): { chartRows: Record<string, string | number>[]; airlines: string[] } {
  const slice =
    weekdayFilter === 'all'
      ? flights.filter((f) => weekdayFromFlightSta(f) != null)
      : flights.filter((f) => weekdayFromFlightSta(f) === weekdayFilter);

  const airlineTotals = new Map<string, number>();
  const perHour: Map<string, number>[] = Array.from({ length: 24 }, () => new Map());

  for (const f of slice) {
    const mins = parseScheduleTimeToMinutes(String(f.staTime ?? ''));
    if (mins === null) continue;
    const hour = Math.min(23, Math.max(0, Math.floor(mins / 60)));
    const label = stackChartAirlineLabel(f);
    const hm = perHour[hour]!;
    hm.set(label, (hm.get(label) ?? 0) + 1);
    airlineTotals.set(label, (airlineTotals.get(label) ?? 0) + 1);
  }

  const airlines = [...airlineTotals.keys()].sort(
    (a, b) => (airlineTotals.get(b) ?? 0) - (airlineTotals.get(a) ?? 0),
  );

  const chartRows = Array.from({ length: 24 }, (_, hour) => {
    const row: Record<string, string | number> = {
      time: `${String(hour).padStart(2, '0')}:00`,
    };
    let total = 0;
    const hm = perHour[hour]!;
    for (const air of airlines) {
      const c = hm.get(air) ?? 0;
      row[air] = c;
      total += c;
    }
    row.total = total;
    return row;
  });

  return { chartRows, airlines };
}

/** Timeline grid: 15-minute slots across one calendar day 00:00–24:00 (local). */
const OPS_TIMELINE_SLOT_MIN = 15;
const OPS_TIMELINE_SLOTS = (24 * 60) / OPS_TIMELINE_SLOT_MIN; // 96
const OPS_TIMELINE_SLOT_PX = 32;
const OPS_TIMELINE_WIDTH_PX = OPS_TIMELINE_SLOTS * OPS_TIMELINE_SLOT_PX;
/** Fixed width for Flights + A/C + STA + STD + Days columns */
const MAY_FLY_GANTT_LEFT_PX = 312;

function parseScheduleTimeToMinutes(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\./g, ':');
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const hh = Math.min(23, Math.max(0, parseInt(m[1]!, 10)));
    const mm = Math.min(59, Math.max(0, parseInt(m[2]!, 10)));
    return hh * 60 + mm;
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length === 3) {
    const h = Math.min(23, Math.max(0, parseInt(digits[0]!, 10)));
    const min = Math.min(59, Math.max(0, parseInt(digits.slice(1), 10)));
    return h * 60 + min;
  }
  if (digits.length >= 4) {
    const h = Math.min(23, Math.max(0, parseInt(digits.slice(0, 2), 10)));
    const min = Math.min(59, Math.max(0, parseInt(digits.slice(2, 4), 10)));
    return h * 60 + min;
  }
  return null;
}

function formatMinutesAsHHmm(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ymdPartsValid(y: number, mo: number, d: number): boolean {
  return ![y, mo, d].some((n) => Number.isNaN(n));
}

function localDateAtYmdMinutes(ymdRaw: string, minutesFromMidnight: number): Date | null {
  const ymd =
    scheduleLabelToYmd(String(ymdRaw ?? '').trim()) ??
    (/^\d{4}-\d{2}-\d{2}$/.test(String(ymdRaw ?? '').trim()) ? String(ymdRaw).trim() : null);
  if (!ymd || minutesFromMidnight < 0 || minutesFromMidnight > 24 * 60 - 1) return null;
  const [y, mo, d] = ymd.split('-').map(Number);
  if (!ymdPartsValid(y!, mo!, d!)) return null;
  const h = Math.floor(minutesFromMidnight / 60);
  const mi = minutesFromMidnight % 60;
  return new Date(y!, mo! - 1, d!, h, mi, 0, 0);
}

function flightStaStdInstants(f: FlightData): { sta: Date; std: Date } | null {
  const rawSta = String(f.staDate ?? '').trim();
  const staYmd =
    scheduleLabelToYmd(rawSta) ?? (/^\d{4}-\d{2}-\d{2}$/.test(rawSta) ? rawSta : null);
  if (!staYmd) return null;
  const staMin = parseScheduleTimeToMinutes(String(f.staTime ?? ''));
  if (staMin === null) return null;
  const sta = localDateAtYmdMinutes(staYmd, staMin);
  if (!sta) return null;

  const rawStd = String(f.stdDate ?? '').trim();
  const stdYmd =
    scheduleLabelToYmd(rawStd) ??
    (/^\d{4}-\d{2}-\d{2}$/.test(rawStd) ? rawStd : null) ??
    staYmd;
  const rawStdTime = String(f.stdTime ?? '').trim();
  const rawStaTime = String(f.staTime ?? '').trim();
  let stdMin = parseScheduleTimeToMinutes(rawStdTime);
  if (stdMin === null) stdMin = parseScheduleTimeToMinutes(rawStaTime);
  if (stdMin === null) return null;
  let std = localDateAtYmdMinutes(stdYmd, stdMin);
  if (!std) return null;
  if (std.getTime() <= sta.getTime()) {
    std = new Date(std.getTime() + 24 * 60 * 60 * 1000);
  }
  if (std.getTime() - sta.getTime() < 60 * 1000) {
    std = new Date(sta.getTime() + 30 * 60 * 1000);
  }
  return { sta, std };
}

type MayFlyGanttRow = {
  key: string;
  flightLabel: string;
  aircraft: string;
  staLabel: string;
  stdLabel: string;
  dayShort: string;
  leftPx: number;
  widthPx: number;
  showBar: boolean;
  staSortMs: number;
};

/** Minutes since local midnight on the same calendar day as `d`. */
function minutesFromLocalMidnight(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const midnight = new Date(y, m, day, 0, 0, 0, 0);
  return (d.getTime() - midnight.getTime()) / 60000;
}

/** Visible bar on one 00:00→24:00 day (1440 min) from STA→STD. */
function ganttBarPixelsFromStaStd(
  sta: Date,
  std: Date,
  totalW: number,
): { leftPx: number; widthPx: number; showBar: boolean } {
  const totalMin = 24 * 60;
  const mSta = minutesFromLocalMidnight(sta);
  const durMin = (std.getTime() - sta.getTime()) / 60000;
  if (durMin <= 0) return { leftPx: 0, widthPx: 0, showBar: false };
  const mEnd = mSta + durMin;
  const clipL = Math.max(0, mSta);
  const clipR = Math.min(totalMin, mEnd);
  if (clipR <= clipL) return { leftPx: 0, widthPx: 0, showBar: false };
  return {
    leftPx: (clipL / totalMin) * totalW,
    widthPx: Math.max(((clipR - clipL) / totalMin) * totalW, 6),
    showBar: true,
  };
}

function buildMayFlyGanttRows(
  flights: FlightData[],
  weekdayFilter: 'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6,
): MayFlyGanttRow[] {
  const totalW = OPS_TIMELINE_WIDTH_PX;

  const rows: MayFlyGanttRow[] = [];

  for (const f of flights) {
    const range = flightStaStdInstants(f);
    if (!range) continue;
    if (weekdayFilter !== 'all') {
      const wd = weekdayFromFlightSta(f);
      if (wd !== weekdayFilter) continue;
    }
    const staMin = parseScheduleTimeToMinutes(String(f.staTime ?? ''));
    const stdMin = parseScheduleTimeToMinutes(String(f.stdTime ?? ''));
    const staYmd =
      scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
      (/^\d{4}-\d{2}-\d{2}$/.test(String(f.staDate ?? '').trim()) ? String(f.staDate).trim() : null);

    const flightLabel = [String(f.airline ?? '').trim(), String(f.flightNo ?? '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim();
    const aircraft = String(f.aircraft ?? '—').trim() || '—';
    const staLabel = staMin != null ? formatMinutesAsHHmm(staMin) : '—';
    const stdLabel = stdMin != null ? formatMinutesAsHHmm(stdMin) : '—';
    let dayShort = '—';
    if (staYmd) {
      const wd = weekdayFromFlightSta(f);
      if (wd != null) dayShort = PEAK_WEEKDAY_SHORT[wd];
    }

    const key = `${f.slNo}-${String(f.staDate)}-${String(f.staTime)}`;
    const { leftPx, widthPx, showBar } = ganttBarPixelsFromStaStd(range.sta, range.std, totalW);

    rows.push({
      key,
      flightLabel: flightLabel || '—',
      aircraft,
      staLabel,
      stdLabel,
      dayShort,
      leftPx,
      widthPx,
      showBar,
      staSortMs: range.sta.getTime(),
    });
  }

  rows.sort((r, q) => r.staSortMs - q.staSortMs || r.flightLabel.localeCompare(q.flightLabel));
  return rows;
}

function weekdayFromFlightAta(r: MainDetailsFlightRow): number | null {
  const raw = String(r.ataDate ?? '').trim();
  const ymd =
    scheduleLabelToYmd(raw) ?? (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null);
  if (!ymd) return null;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y!, m! - 1, d!);
  if (dt.getFullYear() !== y || dt.getMonth() !== m! - 1 || dt.getDate() !== d!) return null;
  return dt.getDay();
}

function flightAtaAtdInstants(r: MainDetailsFlightRow): { ata: Date; atd: Date } | null {
  const rawAtaD = String(r.ataDate ?? '').trim();
  const ataYmd =
    scheduleLabelToYmd(rawAtaD) ?? (/^\d{4}-\d{2}-\d{2}$/.test(rawAtaD) ? rawAtaD : null);
  if (!ataYmd) return null;
  const ataMin = parseScheduleTimeToMinutes(String(r.ataTime ?? ''));
  if (ataMin === null) return null;
  const ata = localDateAtYmdMinutes(ataYmd, ataMin);
  if (!ata) return null;

  const rawAtdD = String(r.atdDate ?? '').trim();
  const atdYmd =
    scheduleLabelToYmd(rawAtdD) ??
    (/^\d{4}-\d{2}-\d{2}$/.test(rawAtdD) ? rawAtdD : null) ??
    ataYmd;
  const atdMin = parseScheduleTimeToMinutes(String(r.atdTime ?? ''));
  if (atdMin === null) return null;
  let atd = localDateAtYmdMinutes(atdYmd, atdMin);
  if (!atd) return null;
  if (atd.getTime() <= ata.getTime()) {
    atd = new Date(atd.getTime() + 24 * 60 * 60 * 1000);
  }
  if (atd.getTime() - ata.getTime() < 60 * 1000) {
    atd = new Date(ata.getTime() + 30 * 60 * 1000);
  }
  return { ata, atd };
}

type DidFlyGanttRow = {
  key: string;
  flightLabel: string;
  aircraft: string;
  ataLabel: string;
  atdLabel: string;
  dayShort: string;
  leftPx: number;
  widthPx: number;
  showBar: boolean;
  ataSortMs: number;
};

function buildDidFlyGanttRows(
  rows: MainDetailsFlightRow[],
  weekdayFilter: 'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6,
): DidFlyGanttRow[] {
  const totalW = OPS_TIMELINE_WIDTH_PX;
  const out: DidFlyGanttRow[] = [];

  for (const r of rows) {
    const range = flightAtaAtdInstants(r);
    if (!range) continue;
    if (weekdayFilter !== 'all') {
      const wd = weekdayFromFlightAta(r);
      if (wd !== weekdayFilter) continue;
    }
    const ataMin = parseScheduleTimeToMinutes(String(r.ataTime ?? ''));
    const atdMin = parseScheduleTimeToMinutes(String(r.atdTime ?? ''));
    const ataYmd =
      scheduleLabelToYmd(String(r.ataDate ?? '').trim()) ??
      (/^\d{4}-\d{2}-\d{2}$/.test(String(r.ataDate ?? '').trim())
        ? String(r.ataDate).trim()
        : null);
    const flightLabel = [String(r.airlineName ?? '').trim(), String(r.flightCode ?? '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim();
    const aircraft = String(r.aircraftType ?? '—').trim() || '—';
    const ataLabel = ataMin != null ? formatMinutesAsHHmm(ataMin) : '—';
    const atdLabel = atdMin != null ? formatMinutesAsHHmm(atdMin) : '—';
    let dayShort = '—';
    if (ataYmd) {
      const wd = weekdayFromFlightAta(r);
      if (wd != null) dayShort = PEAK_WEEKDAY_SHORT[wd];
    }
    const key = `${r.flightSerialNumber}-${String(r.ataDate)}-${String(r.ataTime)}`;
    const { leftPx, widthPx, showBar } = ganttBarPixelsFromStaStd(range.ata, range.atd, totalW);
    out.push({
      key,
      flightLabel: flightLabel || '—',
      aircraft,
      ataLabel,
      atdLabel,
      dayShort,
      leftPx,
      widthPx,
      showBar,
      ataSortMs: range.ata.getTime(),
    });
  }

  out.sort((a, b) => a.ataSortMs - b.ataSortMs || a.flightLabel.localeCompare(b.flightLabel));
  return out;
}

/** Header times for one calendar day 00:00 → 24:00 (labels only; no date anchor). */
function opsTimelineStaticSlotLabels(): string[] {
  const labels: string[] = [];
  const start = new Date(2000, 0, 1, 0, 0, 0, 0);
  for (let i = 0; i < OPS_TIMELINE_SLOTS; i++) {
    const t = new Date(start.getTime() + i * OPS_TIMELINE_SLOT_MIN * 60 * 1000);
    labels.push(
      `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
    );
  }
  return labels;
}

function csvEscape(cell: string): string {
  const s = String(cell ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toAirlineOption(doc: Record<string, unknown>): AdvanceAirlineOption {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    name: String(d.name ?? '').trim(),
    code: String(d.code ?? '').trim(),
  };
}

const CATEGORY_OPTIONS: { id: CategoryMode; label: string; hint: string }[] = [
  { id: 'allActive', label: 'All / Active', hint: 'Non-cancelled, all types' },
  { id: 'passenger', label: 'Passenger', hint: 'Passenger flights' },
  { id: 'freighter', label: 'Freighter', hint: 'Cargo / freighter' },
];

export function FlightScheduleContent() {
  const [airlineOptions, setAirlineOptions] = useState<AdvanceAirlineOption[]>([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);

  const [draftFrom, setDraftFrom] = useState(() => scheduleDefaultFromToYmd().from);
  const [draftTo, setDraftTo] = useState(() => scheduleDefaultFromToYmd().to);
  const [draftAirlineId, setDraftAirlineId] = useState('');
  const [draftCategory, setDraftCategory] = useState<CategoryMode>('allActive');
  const { errors: dateErrors, clearAll: clearDateErrors, clearField: clearDateField, applyAndFocus: applyDateErrors } =
    useFieldErrors<MayFlyDateField>(MAYFLY_DATE_FIELD_ORDER);

  const [appliedFrom, setAppliedFrom] = useState(() => scheduleDefaultFromToYmd().from);
  const [appliedTo, setAppliedTo] = useState(() => scheduleDefaultFromToYmd().to);
  const [appliedAirlineName, setAppliedAirlineName] = useState('');
  const [appliedCategory, setAppliedCategory] = useState<CategoryMode>('allActive');

  const [mayFlyRows, setMayFlyRows] = useState<FlightData[]>([]);
  const [loadingMay, setLoadingMay] = useState(false);

  /** Schedule rows for the analyzer timeline + summary only (current calendar month, all airlines/categories). */
  const [timelineMayFlyRows, setTimelineMayFlyRows] = useState<FlightData[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [moveFrom, setMoveFrom] = useState(() => scheduleDefaultFromToYmd().from);
  const [moveTo, setMoveTo] = useState(() => scheduleDefaultFromToYmd().to);
  const [movementRows, setMovementRows] = useState<MainDetailsFlightRow[]>([]);
  const [loadingMove, setLoadingMove] = useState(false);
  const [mayAnalyzerOpen, setMayAnalyzerOpen] = useState(false);
  const [didAnalyzerOpen, setDidAnalyzerOpen] = useState(false);
  const [peakWeekFilter, setPeakWeekFilter] = useState<'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6>('all');
  const [didPeakWeekFilter, setDidPeakWeekFilter] = useState<'all' | 0 | 1 | 2 | 3 | 4 | 5 | 6>('all');
  const [mayFlyAnalyzerTimelineView, setMayFlyAnalyzerTimelineView] = useState<'gantt' | 'stack'>('gantt');

  const scheduleFilterMaxDate = scheduleFilterCapDate();
  const scheduleFilterMaxYyyyMmDd = localCalendarYmd();

  const draftAirlineDisplayName = useMemo(() => {
    if (!draftAirlineId) return '';
    const opt = airlineOptions.find((a) => a.id === draftAirlineId);
    return opt?.name ?? '';
  }, [draftAirlineId, airlineOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAirlinesLoading(true);
      try {
        const raw = await fetchFlightsReferenceAirlines();
        const mapped = (raw as Record<string, unknown>[])
          .map(toAirlineOption)
          .filter((a) => a.name || a.code)
          .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
        if (!cancelled) setAirlineOptions(mapped);
      } catch {
        if (!cancelled) {
          setAirlineOptions([]);
          toast.error('Could not load airline list.');
        }
      } finally {
        if (!cancelled) setAirlinesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runMayFlyLoad = useCallback(
    async (fromYmd: string, toYmd: string, airlineName: string, mode: CategoryMode) => {
      setLoadingMay(true);
      try {
        const fromDd = yyyyMmDdToDdMmYyyy(fromYmd);
        const toDd = yyyyMmDdToDdMmYyyy(toYmd);
        if (!fromDd || !toDd) {
          toast.error('Invalid date range.');
          setMayFlyRows([]);
          return;
        }
        const raw = await loadScheduledFlightsForDateRange(fromDd, toDd, fromYmd, toYmd);
        setMayFlyRows(filterMayFlyRows(raw, airlineName, mode));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load schedule.');
        setMayFlyRows([]);
      } finally {
        setLoadingMay(false);
      }
    },
    [],
  );

  /** Loads May–Fly rows for the analyzer Gantt / stack chart — same range, airline, and category as the table. */
  const runTimelineLoad = useCallback(
    async (fromYmd: string, toYmd: string, airlineName: string, mode: CategoryMode) => {
      setLoadingTimeline(true);
      try {
        const fromDd = yyyyMmDdToDdMmYyyy(fromYmd);
        const toDd = yyyyMmDdToDdMmYyyy(toYmd);
        if (!fromDd || !toDd) {
          setTimelineMayFlyRows([]);
          return;
        }
        const raw = await loadScheduledFlightsForDateRange(fromDd, toDd, fromYmd, toYmd);
        setTimelineMayFlyRows(filterMayFlyRows(raw, airlineName, mode));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load timeline.');
        setTimelineMayFlyRows([]);
      } finally {
        setLoadingTimeline(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!mayAnalyzerOpen) return;
    void runTimelineLoad(appliedFrom, appliedTo, appliedAirlineName, appliedCategory);
  }, [
    mayAnalyzerOpen,
    appliedFrom,
    appliedTo,
    appliedAirlineName,
    appliedCategory,
    runTimelineLoad,
  ]);

  const handleFilter = useCallback(() => {
    const next = validateYmdDateRange(draftFrom, draftTo, {
      fromLabel: 'From date',
      toLabel: 'To date',
      toNotAfterToday: true,
      fromNotAfterToday: true,
    });
    if (applyDateErrors(next)) {
      toast.warning(next.toDate || next.fromDate || 'Fix the date range.');
      return;
    }
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setAppliedAirlineName(draftAirlineDisplayName);
    setAppliedCategory(draftCategory);
    void runMayFlyLoad(draftFrom, draftTo, draftAirlineDisplayName, draftCategory);
  }, [applyDateErrors, draftFrom, draftTo, draftAirlineDisplayName, draftCategory, runMayFlyLoad]);

  const handleClear = useCallback(() => {
    const { from, to } = scheduleDefaultFromToYmd();
    clearDateErrors();
    setDraftFrom(from);
    setDraftTo(to);
    setDraftAirlineId('');
    setDraftCategory('allActive');
    setAppliedFrom(from);
    setAppliedTo(to);
    setAppliedAirlineName('');
    setAppliedCategory('allActive');
    setMovementRows([]);
    setMoveFrom(from);
    setMoveTo(to);
    setPeakWeekFilter('all');
    setDidPeakWeekFilter('all');
    setMayFlyAnalyzerTimelineView('gantt');
    void runMayFlyLoad(from, to, '', 'allActive');
  }, [clearDateErrors, runMayFlyLoad]);

  useEffect(() => {
    const { from, to } = scheduleDefaultFromToYmd();
    void runMayFlyLoad(from, to, '', 'allActive');
  }, [runMayFlyLoad]);

  const peakOfWeekSummary = useMemo(() => {
    if (timelineMayFlyRows.length === 0) return null;
    let slice: FlightData[];
    if (peakWeekFilter === 'all') {
      slice = timelineMayFlyRows.filter((f) => weekdayFromFlightSta(f) != null);
    } else {
      slice = timelineMayFlyRows.filter((f) => weekdayFromFlightSta(f) === peakWeekFilter);
    }
    if (slice.length === 0) return null;

    const hourCounts: Record<string, number> = {};
    for (const f of slice) {
      const h = staHourBucket(f.staTime);
      if (h === '—') continue;
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    }
    let peakHour = '—';
    let peakCount = 0;
    for (const [h, c] of Object.entries(hourCounts)) {
      if (c > peakCount || (c === peakCount && h.localeCompare(peakHour) < 0)) {
        peakCount = c;
        peakHour = h;
      }
    }

    let nb = 0;
    let wb = 0;
    for (const f of slice) {
      if (isWidebodyAircraftType(String(f.aircraft ?? ''))) wb += 1;
      else nb += 1;
    }

    const title =
      peakWeekFilter === 'all' ? 'Week overview' : `${PEAK_WEEKDAY_SHORT[peakWeekFilter]} overview`;

    return {
      title,
      total: slice.length,
      peakHour,
      nb,
      wb,
    };
  }, [timelineMayFlyRows, peakWeekFilter]);

  const mayFlyGanttRows = useMemo(
    () => buildMayFlyGanttRows(timelineMayFlyRows, peakWeekFilter),
    [timelineMayFlyRows, peakWeekFilter],
  );

  const didFlyGanttRows = useMemo(
    () => buildDidFlyGanttRows(movementRows, didPeakWeekFilter),
    [movementRows, didPeakWeekFilter],
  );

  const { chartRows: mayFlyStackChartData, airlines: mayFlyStackChartAirlines } = useMemo(
    () => buildMayFlyHourlyAirlineStackChartData(timelineMayFlyRows, peakWeekFilter),
    [timelineMayFlyRows, peakWeekFilter],
  );

  const mayFlyStackChartHasCounts = useMemo(
    () => mayFlyStackChartData.some((d) => Number(d.total) > 0),
    [mayFlyStackChartData],
  );

  const opsSlotLabels = useMemo(() => opsTimelineStaticSlotLabels(), []);

  const timelineRangeLabel = useMemo(
    () => `${appliedFrom} → ${appliedTo}`,
    [appliedFrom, appliedTo],
  );

  const handleExportMayFly = useCallback(async () => {
    if (mayFlyRows.length === 0) {
      toast.message('No rows to export. Apply filters first.');
      return;
    }
    const headers = [
      'Sl No',
      'Airline',
      'Flight No',
      'STA Date',
      'STA Time',
      'STD Date',
      'STD Time',
      'Route',
      'Aircraft',
      'Flight type',
      'Cancelled',
    ];
    const lines = [
      headers.join(','),
      ...mayFlyRows.map((f) =>
        [
          csvEscape(f.slNo),
          csvEscape(f.airline),
          csvEscape(f.flightNo),
          csvEscape(f.staDate),
          csvEscape(f.staTime),
          csvEscape(f.stdDate),
          csvEscape(f.stdTime),
          csvEscape(f.route ?? ''),
          csvEscape(f.aircraft),
          csvEscape(f.flightType),
          csvEscape(f.isCancelled ? 'Yes' : 'No'),
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const saveAs = await loadFileSaverSaveAs();
    saveAs(blob, `may-fly-schedule-${appliedFrom}_${appliedTo}.csv`);
    toast.success('Exported may-fly CSV.');
  }, [mayFlyRows, appliedFrom, appliedTo]);

  const fetchAndFilterMovement = useCallback(async (): Promise<MainDetailsFlightRow[]> => {
    const fromDd = yyyyMmDdToDdMmYyyy(moveFrom);
    const toDd = yyyyMmDdToDdMmYyyy(moveTo);
    if (!fromDd || !toDd) return [];
    // Same scheduled source as May Fly — never include non-scheduled main-details rows.
    const raw = await loadScheduledFlightsForDateRange(fromDd, toDd, moveFrom, moveTo);
    return filterDidFlyClosedScheduledRows(raw, appliedAirlineName, appliedCategory);
  }, [moveFrom, moveTo, appliedAirlineName, appliedCategory]);

  const runMovementAnalyze = useCallback(async () => {
    if (!moveFrom || !moveTo || moveFrom > moveTo) {
      toast.error('Choose a valid Did–Fly date range.');
      return;
    }
    setLoadingMove(true);
    try {
      const refined = await fetchAndFilterMovement();
      setMovementRows(refined);
      toast.success(
        refined.length === 0
          ? 'No Closed scheduled flights (Did–Fly) in this range.'
          : `Loaded ${refined.length} Closed scheduled flight(s) (Did–Fly).`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load Did–Fly data.');
      setMovementRows([]);
    } finally {
      setLoadingMove(false);
    }
  }, [fetchAndFilterMovement]);

  const toggleDidAnalyzer = useCallback(() => {
    setDidAnalyzerOpen((wasOpen) => {
      if (!wasOpen) {
        setDidPeakWeekFilter('all');
        void runMovementAnalyze();
      }
      return !wasOpen;
    });
  }, [runMovementAnalyze]);

  const moveStats = useMemo(() => {
    let withAta = 0;
    let withAtd = 0;
    for (const r of movementRows) {
      if (String(r.ataDate ?? '').trim()) withAta += 1;
      if (String(r.atdDate ?? '').trim()) withAtd += 1;
    }
    return {
      total: movementRows.length,
      withAta,
      withAtd,
    };
  }, [movementRows]);

  const didFlyDailyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of movementRows) {
      const ymd = normalizeToYmd(r.ataDate) ?? normalizeToYmd(r.staDate);
      if (!ymd) continue;
      m.set(ymd, (m.get(ymd) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateYmd, count]) => ({ dateYmd, count }));
  }, [movementRows]);

  const didFlyMonthlyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of movementRows) {
      const ymd = normalizeToYmd(r.ataDate) ?? normalizeToYmd(r.staDate);
      if (!ymd || ymd.length < 7) continue;
      const ym = ymd.slice(0, 7);
      m.set(ym, (m.get(ym) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthYm, count]) => ({ monthYm, count }));
  }, [movementRows]);

  const handleExportDidFly = useCallback(async () => {
    if (!moveFrom || !moveTo || moveFrom > moveTo) {
      toast.error('Choose a valid Did–Fly date range.');
      return;
    }
    setLoadingMove(true);
    try {
      let rows = movementRows;
      if (rows.length === 0) {
        rows = await fetchAndFilterMovement();
        setMovementRows(rows);
      }
      if (rows.length === 0) {
        toast.message('No Closed scheduled flights to export for this range.');
        return;
      }
      const headers = [
        'Serial',
        'Airline',
        'Flight',
        'STA Date',
        'STA Time',
        'STD Date',
        'STD Time',
        'Route',
        'Aircraft',
        'Category',
        'Status',
      ];
      const lines = [
        headers.join(','),
        ...rows.map((r) =>
          [
            csvEscape(String(r.flightSerialNumber)),
            csvEscape(r.airlineName),
            csvEscape(r.flightCode),
            csvEscape(r.staDate ?? r.ataDate ?? ''),
            csvEscape(r.ataTime ?? ''),
            csvEscape(r.atdDate ?? ''),
            csvEscape(r.atdTime ?? ''),
            csvEscape(r.route ?? ''),
            csvEscape(r.aircraftType ?? ''),
            csvEscape(r.flightCategory ?? ''),
            csvEscape('Closed'),
          ].join(','),
        ),
      ];
      const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const saveAs = await loadFileSaverSaveAs();
      saveAs(blob, `did-fly-scheduled-${moveFrom}_${moveTo}.csv`);
      toast.success('Exported did-fly CSV.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setLoadingMove(false);
    }
  }, [movementRows, moveFrom, moveTo, fetchAndFilterMovement]);

  const scheduleFilterStartMaxDate = useMemo(() => {
    if (!draftTo?.trim()) return scheduleFilterMaxDate;
    const parts = draftTo.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return scheduleFilterMaxDate;
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    return end.getTime() <= scheduleFilterMaxDate.getTime() ? end : scheduleFilterMaxDate;
  }, [draftTo, scheduleFilterMaxDate]);

  const scheduleFilterEndMinDate = useMemo(() => {
    if (!draftFrom?.trim()) return undefined;
    const parts = draftFrom.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [y, m, day] = parts;
    return new Date(y!, m! - 1, day!);
  }, [draftFrom]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-50 p-4 md:p-6"
    >
      <FrisPageHeader title="Flight Schedule" icon={Calendar} />

      {/* Top filter bar — drives May-Fly load + airline/category for Did-Fly */}
      <div className="mb-8 rounded-xl border border-emerald-100/80 bg-white/90 p-4 shadow-md shadow-emerald-900/[0.06] ring-1 ring-emerald-50 backdrop-blur-sm md:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Filter className="h-4 w-4" />
          </span>
          Schedule filters (May–Fly — monthly setup)
        </div>
        <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end">
          <div className="flex flex-wrap gap-4">
            <div className={cn(dateErrors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
              <label htmlFor="field-fromDate" className="mb-1.5 block text-xs font-medium text-gray-600">From</label>
              <DatePicker
                id="field-fromDate"
                value={draftFrom}
                onChange={(v) => {
                  setDraftFrom(v);
                  clearDateField('fromDate');
                  clearDateField('toDate');
                }}
                valueFormat="yyyy-MM-dd"
                maxDate={scheduleFilterStartMaxDate}
                ariaLabel="From date"
              />
              <FormFieldError id="field-fromDate-error" message={dateErrors.fromDate} />
            </div>
            <div className={cn(dateErrors.toDate && FRIS_INVALID_PICKER_WRAP)}>
              <label htmlFor="field-toDate" className="mb-1.5 block text-xs font-medium text-gray-600">To</label>
              <DatePicker
                id="field-toDate"
                value={draftTo}
                onChange={(v) => {
                  setDraftTo(v);
                  clearDateField('toDate');
                  clearDateField('fromDate');
                }}
                valueFormat="yyyy-MM-dd"
                minDate={scheduleFilterEndMinDate}
                maxDate={scheduleFilterMaxDate}
                ariaLabel="To date"
              />
              <FormFieldError id="field-toDate-error" message={dateErrors.toDate} />
            </div>
            <div className="min-w-[200px]">
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Airline</label>
              <AdminRadioDropdown
                value={draftAirlineId}
                onChange={(v) => setDraftAirlineId(v)}
                options={[
                  { value: '', label: airlinesLoading ? 'Loading…' : 'All airlines' },
                  ...airlineOptions.map((a) => ({ value: a.id, label: a.name || a.code })),
                ]}
                disabled={airlinesLoading}
                className={cn(FLIGHT_FILTER_CONTROL_CLASS, 'disabled:cursor-not-allowed disabled:bg-gray-50')}
              />
              <FormFieldError />
            </div>
          </div>

          <fieldset className="min-w-0 flex-1">
            <legend className="mb-2 block text-xs font-medium text-gray-600">
              Flight category (one at a time)
            </legend>
            <div className="flex flex-wrap gap-3">
              {CATEGORY_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={`
                    flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors
                    ${
                      draftCategory === opt.id
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 bg-gray-50/80 text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={draftCategory === opt.id}
                    onChange={() => setDraftCategory(opt.id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    <span className="font-medium">{opt.label}</span>
                 
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={FLIGHT_FILTER_ACTIONS_CLASS}>
            <button
              type="button"
              onClick={handleFilter}
              disabled={loadingMay}
              className={cn(FLIGHT_FILTER_PRIMARY_BTN_CLASS, 'bg-emerald-600 hover:bg-emerald-700')}
            >
              {loadingMay ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
              Filter
            </button>
            <button
              type="button"
              onClick={handleClear}
              className={FLIGHT_FILTER_SECONDARY_BTN_CLASS}
            >
              <XCircle className="h-4 w-4 text-gray-500" />
              Clear
            </button>
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900/80">
          <span className="font-medium text-emerald-800">Did–Fly</span> uses the same airline and category as
          the last successful filter above, plus the Did–Fly date range below. It lists only{' '}
          <span className="font-medium">Closed scheduled</span> flights (May–Fly rows with status Closed —
          never non-scheduled).
        </p>
      </div>

      {/* May–Fly (left) + Did–Fly (right) on lg+; stacked on small screens */}
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:items-stretch lg:gap-6">
        {/* Section 1 — May-Fly — left column */}
        <div className="flex min-h-0 min-w-0 flex-col lg:col-start-1 lg:row-start-1">
          <div className="flex h-full min-h-0 flex-col overflow-x-hidden rounded-xl border border-emerald-200/70 bg-white shadow-lg shadow-emerald-900/[0.07]">
            <div className="flex flex-col gap-3 bg-emerald-600 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-white drop-shadow-sm">
                  Flight Schedule Analyzer — STA / STD (May–Fly)
                </h2>
                <p className="mt-0.5 text-xs text-emerald-50">
                  Planned schedule (advance / schedule setup) — use From/Till for a full month or any range
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportMayFly}
                disabled={mayFlyRows.length === 0 || loadingMay}
                className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-white/40 bg-white/15 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
              >
                <Download className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4" />
                Export CSV
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-3 bg-emerald-50/50 p-4">
              <div className="flex flex-col gap-4 rounded-lg border border-emerald-100/60 bg-white/80 p-3 shadow-sm xl:flex-row xl:flex-wrap xl:items-end xl:justify-between">
                <div className="flex flex-wrap items-end gap-4 sm:gap-6">
                  <div className={cn(dateErrors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                    <label htmlFor="field-fromDate-may" className="mb-1 block text-xs font-medium text-emerald-900/80">From date</label>
                    <DatePicker
                      id="field-fromDate-may"
                      value={draftFrom}
                      onChange={(v) => {
                        setDraftFrom(v);
                        clearDateField('fromDate');
                        clearDateField('toDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      maxDate={scheduleFilterStartMaxDate}
                      className="w-[min(100%,11rem)]"
                      ariaLabel="From date"
                    />
                    <FormFieldError id="field-fromDate-may-error" message={dateErrors.fromDate} />
                  </div>
                  <div className={cn(dateErrors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                    <label htmlFor="field-toDate-may" className="mb-1 block text-xs font-medium text-emerald-900/80">Till date</label>
                    <DatePicker
                      id="field-toDate-may"
                      value={draftTo}
                      onChange={(v) => {
                        setDraftTo(v);
                        clearDateField('toDate');
                        clearDateField('fromDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      minDate={scheduleFilterEndMinDate}
                      maxDate={scheduleFilterMaxDate}
                      className="w-[min(100%,11rem)]"
                      ariaLabel="Till date"
                    />
                    <FormFieldError id="field-toDate-may-error" message={dateErrors.toDate} />
                  </div>
                </div>
                <div className={cn(FLIGHT_FILTER_ACTIONS_CLASS, 'text-sm text-gray-700')}>
                  <span>View the schedule analyzer</span>
                  <button
                    type="button"
                    onClick={() => setMayAnalyzerOpen((v) => !v)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700"
                  >
                    {mayAnalyzerOpen ? 'Close' : 'Open'}
                  </button>
                </div>
              </div>
              <p className="rounded-lg border border-emerald-100/80 bg-white px-3 py-2 text-xs text-emerald-950/90">
                {loadingMay ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                    Loading schedule for {appliedFrom} → {appliedTo}…
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-emerald-900">{mayFlyRows.length}</span> flight
                    {mayFlyRows.length === 1 ? '' : 's'} in this range after filters (table + CSV). Charts and
                    Gantt live in the panel below — press <span className="font-semibold">Open</span> to load the
                    timeline for your filtered range.
                    {mayFlyRows.length === 0 && (
                      <span className="mt-1 block text-amber-900/95">
                        If this stays at 0: check API/network (toast on error), widen dates, or confirm advance
                        daily schedule data exists for the range.
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile-only separator between stacked sections */}
        <div className="relative py-5 lg:hidden">
          <div className="absolute inset-0 flex items-center px-6" aria-hidden>
            <div className="h-px w-full bg-gray-200" />
          </div>
          <p className="relative mx-auto w-fit rounded-full border border-gray-200/90 bg-white px-4 py-1 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 shadow-sm">
            or
          </p>
        </div>

        {/* Section 2 — Did-Fly — right column on lg+ */}
        <div className="flex min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-start-1">
          <div className="flex h-full min-h-0 flex-col overflow-x-hidden rounded-xl border border-amber-200/80 bg-white shadow-lg shadow-amber-900/[0.08]">
            <div className="flex flex-col gap-3 bg-amber-500 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-white drop-shadow-sm">
                  Flight Movement Data — Closed scheduled (Did–Fly)
                </h2>
                <p className="mt-0.5 text-xs text-amber-50">
                  Scheduled May–Fly flights with status Closed (not non-scheduled)
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleExportDidFly()}
                disabled={loadingMove}
                className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-white/40 bg-white/15 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
              >
                <Download className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4" />
                Export CSV
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="flex flex-col gap-4 rounded-lg border border-amber-100/50 bg-amber-50/70 p-3 xl:flex-row xl:flex-wrap xl:items-end xl:justify-between">
                <div className="flex flex-wrap items-end gap-4 sm:gap-6">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-amber-900/85">From date</label>
                    <DatePicker
                      value={moveFrom}
                      onChange={setMoveFrom}
                      valueFormat="yyyy-MM-dd"
                      maxDate={scheduleFilterMaxDate}
                      className="w-[min(100%,11rem)]"
                    />
                    <FormFieldError />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-amber-900/85">Till date</label>
                    <DatePicker
                      value={moveTo}
                      onChange={setMoveTo}
                      valueFormat="yyyy-MM-dd"
                      minDate={
                        moveFrom
                          ? (() => {
                              const p = moveFrom.split('-').map(Number);
                              if (p.length !== 3 || p.some(Number.isNaN)) return undefined;
                              return new Date(p[0]!, p[1]! - 1, p[2]!);
                            })()
                          : undefined
                      }
                      maxDate={scheduleFilterMaxDate}
                      className="w-[min(100%,11rem)]"
                    />
                    <FormFieldError />
                  </div>
                </div>
                <div className={cn(FLIGHT_FILTER_ACTIONS_CLASS, 'text-sm text-gray-700')}>
                  <span>View the movement analyzer</span>
                  <button
                    type="button"
                    onClick={toggleDidAnalyzer}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-white shadow-md shadow-amber-600/30 transition hover:bg-amber-700"
                  >
                    {didAnalyzerOpen ? 'Close' : 'Open'}
                  </button>
                </div>
              </div>
              <p className="rounded-lg border border-amber-100/80 bg-white px-3 py-2 text-xs text-amber-950/90">
                {loadingMove && didAnalyzerOpen ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                    Loading Did–Fly for {moveFrom} → {moveTo}…
                  </span>
                ) : didAnalyzerOpen ? (
                  <>
                    <span className="font-semibold text-amber-900">{movementRows.length}</span> Closed scheduled
                    flight{movementRows.length === 1 ? '' : 's'} (Did–Fly). Gantt and counts are in the open
                    panel below.
                    {movementRows.length === 0 && (
                      <span className="mt-1 block text-amber-900/95">
                        If this stays at 0: widen dates, set airline to All at the top and press Filter, then
                        Open again — or confirm scheduled flights are Closed for that range.
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    Press <span className="font-semibold">Open</span> to load Closed scheduled flights for{' '}
                    <span className="font-mono">{moveFrom}</span> → <span className="font-mono">{moveTo}</span> using
                    the airline and category from the top filter bar.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width analyzer panels below the May–Fly / Did–Fly cards */}
      <div className="mt-6 space-y-6">
        {mayAnalyzerOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-xl border border-emerald-200/70 bg-white shadow-lg shadow-emerald-900/[0.07]"
          >
            <div className="flex flex-col gap-1 border-b border-emerald-200/80 bg-emerald-600 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">May–Fly schedule analyzer</h3>
                <p className="text-xs text-emerald-100">
                  Timeline matches the schedule filters above (dates, airline, category); weekday chips refine
                  the view
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMayAnalyzerOpen(false)}
                className="shrink-0 self-start rounded-lg border border-white/35 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 sm:self-auto"
              >
                Close panel
              </button>
            </div>
            <div className="bg-emerald-50/40 p-4">
              {loadingTimeline ? (
                <div className="flex items-center justify-center py-12 text-emerald-800/70">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin text-emerald-600" />
                  Loading timeline…
                </div>
              ) : timelineMayFlyRows.length === 0 ? (
                <p className="rounded-lg bg-amber-50 px-4 py-5 text-center text-sm text-amber-900/90">
                  No flights in range <span className="font-mono">{timelineRangeLabel}</span> for the timeline
                  with the current filters. Widen dates, set airline to All, or change category — then press
                  Filter.
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-emerald-900/90">
                      Filter timeline by STA weekday (Mon–Sun) or All. Data uses the same range and filters as
                      the May–Fly table: <span className="font-mono text-emerald-950/90">{timelineRangeLabel}</span>
                      {appliedAirlineName ? (
                        <>
                          {' '}
                          · airline <span className="font-medium">{appliedAirlineName}</span>
                        </>
                      ) : null}
                      .
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {PEAK_WEEKDAY_BUTTONS.map((b) => (
                        <button
                          key={String(b.value)}
                          type="button"
                          onClick={() => setPeakWeekFilter(b.value)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            peakWeekFilter === b.value
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {peakOfWeekSummary ? (
                    <div className="rounded-lg border border-sky-100 border-l-4 border-l-blue-600 bg-sky-50/90 shadow-sm ring-1 ring-sky-100/80">
                      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-2">
                        <h4 className="shrink-0 text-base font-bold text-blue-900">
                          {peakOfWeekSummary.title}
                        </h4>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-900">
                          <span>
                            <span className="font-medium text-gray-800">Total flights:</span>{' '}
                            {peakOfWeekSummary.total}
                          </span>
                          <span>
                            <span className="font-medium text-gray-800">Time:</span>{' '}
                            {peakOfWeekSummary.peakHour}
                          </span>
                          <span>
                            <span className="font-medium text-gray-800">A/C Type:</span> NB{' '}
                            {peakOfWeekSummary.nb} · WB {peakOfWeekSummary.wb}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm text-blue-900/85">
                      No flights with a valid STA date for this weekday selection.
                    </p>
                  )}

                  <div className="overflow-hidden rounded-xl border border-sky-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-2 border-b border-sky-100 bg-sky-50/90 px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-blue-900">
                          {mayFlyAnalyzerTimelineView === 'stack' ? 'Stack chart (by hour)' : 'Schedule timeline'}
                        </h4>
                        <p className="mt-0.5 text-[11px] text-sky-950/80">
                          {mayFlyAnalyzerTimelineView === 'stack' ? (
                            <>
                              STA time of day <span className="whitespace-nowrap">00:00–23:00</span> on the X
                              axis; flight count on the Y axis, stacked by airline. Same weekday filter as
                              above.
                            </>
                          ) : (
                            <>
                              One day strip <span className="whitespace-nowrap">00:00–24:00</span> local (STA
                              calendar day). Weekday chips narrow which STA days appear; rows match the filters
                              above.
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setMayFlyAnalyzerTimelineView('gantt')}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                            mayFlyAnalyzerTimelineView === 'gantt'
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
                          }`}
                        >
                          <LayoutList className="h-3.5 w-3.5" />
                          Gantt
                        </button>
                        <button
                          type="button"
                          onClick={() => setMayFlyAnalyzerTimelineView('stack')}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                            mayFlyAnalyzerTimelineView === 'stack'
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
                          }`}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          Stack chart
                        </button>
                      </div>
                    </div>
                    {mayFlyAnalyzerTimelineView === 'gantt' ? (
                      mayFlyGanttRows.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-gray-600">
                          No flights for this weekday with usable STA/STD times. Choose{' '}
                          <span className="font-medium">All</span> or another Mon–Sun.
                        </p>
                      ) : (
                        <div className="max-h-[min(520px,72vh)] overflow-auto">
                          <TooltipProvider delayDuration={0} skipDelayDuration={0}>
                          <div className="flex w-max min-w-full flex-col">
                            <div className="sticky top-0 z-30 flex w-max min-w-full bg-white">
                              <div
                                className="sticky left-0 z-40 flex h-9 shrink-0 items-stretch border-b border-r border-sky-300 bg-sky-100 text-[11px] font-semibold text-blue-950"
                                style={{ width: MAY_FLY_GANTT_LEFT_PX }}
                              >
                                <div className="flex w-[112px] min-w-0 items-center border-r border-sky-200 px-2">
                                  Flights
                                </div>
                                <div className="flex w-20 min-w-0 items-center border-r border-sky-200 px-2">
                                  A/C Type
                                </div>
                                <div className="flex w-11 shrink-0 items-center justify-center border-r border-sky-200 px-1">
                                  STA
                                </div>
                                <div className="flex w-11 shrink-0 items-center justify-center border-r border-sky-200 px-1">
                                  STD
                                </div>
                                <div className="flex w-8 shrink-0 items-center justify-center px-0.5">
                                  Days
                                </div>
                              </div>
                              <div
                                className="flex h-9 shrink-0 border-b border-blue-950 bg-blue-900 text-[9px] font-medium leading-tight text-white sm:text-[10px]"
                                style={{ width: OPS_TIMELINE_WIDTH_PX }}
                              >
                                {opsSlotLabels.map((lab, idx) => (
                                  <div
                                    key={idx}
                                    className="flex shrink-0 items-center justify-center border-r border-blue-800/70 px-0.5"
                                    style={{ width: OPS_TIMELINE_SLOT_PX, minWidth: OPS_TIMELINE_SLOT_PX }}
                                  >
                                    <span className="max-w-[30px] truncate text-center">{lab}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {mayFlyGanttRows.map((row, i) => (
                              <div key={row.key} className="flex w-max min-w-full">
                                <div
                                  className={`sticky left-0 z-20 flex h-10 shrink-0 items-stretch border-b border-r border-gray-200 text-[11px] ${
                                    i % 2 === 0 ? 'bg-white' : 'bg-sky-50/60'
                                  }`}
                                  style={{ width: MAY_FLY_GANTT_LEFT_PX }}
                                >
                                  <div className="flex w-[112px] min-w-0 items-center border-r border-gray-100 px-2 font-medium text-gray-900">
                                    <span className="truncate" title={row.flightLabel}>
                                      {row.flightLabel}
                                    </span>
                                  </div>
                                  <div className="flex w-20 min-w-0 items-center border-r border-gray-100 px-2 text-gray-800">
                                    <span className="truncate" title={row.aircraft}>
                                      {row.aircraft}
                                    </span>
                                  </div>
                                  <div className="flex w-11 shrink-0 items-center justify-center border-r border-gray-100 font-mono text-[10px] text-gray-800">
                                    {row.staLabel}
                                  </div>
                                  <div className="flex w-11 shrink-0 items-center justify-center border-r border-gray-100 font-mono text-[10px] text-gray-800">
                                    {row.stdLabel}
                                  </div>
                                  <div className="flex w-8 shrink-0 items-center justify-center text-gray-700">
                                    {row.dayShort}
                                  </div>
                                </div>
                                <div
                                  className={`relative h-10 shrink-0 border-b border-gray-200 ${
                                    i % 2 === 0 ? 'bg-white' : 'bg-sky-50/60'
                                  }`}
                                  style={{ width: OPS_TIMELINE_WIDTH_PX }}
                                >
                                  <div
                                    className="pointer-events-none absolute inset-0 opacity-90"
                                    style={{
                                      backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${OPS_TIMELINE_SLOT_PX - 1}px, rgba(148,163,184,0.28) ${OPS_TIMELINE_SLOT_PX - 1}px, rgba(148,163,184,0.28) ${OPS_TIMELINE_SLOT_PX}px)`,
                                    }}
                                  />
                                  {row.showBar && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="absolute top-1.5 bottom-1.5 flex max-w-full cursor-default select-none items-center overflow-hidden rounded-md border-0 bg-emerald-400/90 px-1 text-left text-[10px] font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-700/25 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
                                          style={{ left: row.leftPx, width: row.widthPx }}
                                        >
                                          <span className="min-w-0 truncate">{row.flightLabel}</span>
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="z-[60] max-w-xs border border-slate-200 bg-white px-2.5 py-2 text-left text-xs text-slate-900 shadow-lg !animate-none !duration-0"
                                      >
                                        <p className="font-semibold leading-snug">{row.flightLabel}</p>
                                        <p className="mt-1 font-mono text-[11px] text-slate-600">
                                          STA {row.staLabel}
                                          <span className="mx-1.5 text-slate-300">·</span>
                                          STD {row.stdLabel}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          </TooltipProvider>
                        </div>
                      )
                    ) : mayFlyStackChartHasCounts ? (
                      <div className="h-[min(380px,55vh)] w-full min-w-0 p-3 sm:p-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={mayFlyStackChartData}
                            margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200" />
                            <XAxis
                              dataKey="time"
                              tick={{ fontSize: 10, fill: '#334155' }}
                              tickLine={{ stroke: '#94a3b8' }}
                              axisLine={{ stroke: '#94a3b8' }}
                              interval={0}
                              angle={-40}
                              textAnchor="end"
                              height={52}
                              label={{
                                value: 'Time (STA, local)',
                                position: 'insideBottom',
                                offset: -2,
                                style: { fontSize: 11, fill: '#0f172a' },
                              }}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 10, fill: '#334155' }}
                              tickLine={{ stroke: '#94a3b8' }}
                              axisLine={{ stroke: '#94a3b8' }}
                              label={{
                                value: 'Count',
                                angle: -90,
                                position: 'insideLeft',
                                style: { fontSize: 11, fill: '#0f172a' },
                              }}
                            />
                            <RechartsTooltip
                              contentStyle={{
                                fontSize: 12,
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                              }}
                              formatter={(value, name) => [
                                typeof value === 'number' ? value : 0,
                                String(name),
                              ]}
                              labelFormatter={(label) => `Hour starting ${label}`}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: 11, maxHeight: 96, overflowY: 'auto' }}
                              formatter={(value) => value}
                            />
                            {mayFlyStackChartAirlines.map((air, idx) => (
                              <Bar
                                key={air}
                                dataKey={air}
                                name={air}
                                stackId="airline"
                                fill={AIRLINE_STACK_CHART_COLORS[idx % AIRLINE_STACK_CHART_COLORS.length]}
                                stroke="#ffffff"
                                strokeWidth={0.5}
                                radius={
                                  idx === mayFlyStackChartAirlines.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]
                                }
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="px-4 py-8 text-center text-sm text-gray-600">
                        No flights with a parsable STA time for this weekday. Choose{' '}
                        <span className="font-medium">All</span> or another day.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {didAnalyzerOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-xl border border-amber-200/80 bg-white shadow-lg shadow-amber-900/[0.08]"
          >
            <div className="flex flex-col gap-1 border-b border-amber-200/90 bg-amber-500 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Did–Fly analyzer</h3>
                <p className="text-xs text-amber-50">
                  Closed scheduled flights — timeline + daily & monthly counts in range
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDidAnalyzerOpen(false)}
                className="shrink-0 self-start rounded-lg border border-white/35 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 sm:self-auto"
              >
                Close panel
              </button>
            </div>
            <div className="bg-amber-50/50 p-4">
              <p className="mb-3 text-xs font-medium text-amber-950">
                Did–Fly = May–Fly scheduled flights with status Closed. Range {moveFrom} → {moveTo} (airline
                & category from top filters). Non-scheduled rows are excluded.
              </p>
              {loadingMove ? (
                <div className="flex items-center justify-center py-12 text-amber-900/70">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin text-amber-600" />
                  Loading Did–Fly data…
                </div>
              ) : movementRows.length === 0 ? (
                <p className="rounded-lg bg-amber-50 px-4 py-5 text-center text-sm text-amber-900/90">
                  No Closed scheduled flights in this range. Widen dates or adjust filters, then load again from
                  the Did–Fly card.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800/90">
                        Did–Fly (Closed)
                      </div>
                      <div className="text-2xl font-bold text-amber-950">{moveStats.total}</div>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-900/85">With ATA</div>
                      <div className="text-2xl font-bold text-amber-950">{moveStats.withAta}</div>
                    </div>
                    <div className="rounded-xl border border-yellow-200 bg-yellow-50/80 p-3 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-yellow-900/85">With ATD</div>
                      <div className="text-2xl font-bold text-yellow-950">{moveStats.withAtd}</div>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800/90">Range</div>
                      <div className="text-xs font-semibold text-amber-950">
                        {moveFrom} → {moveTo}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-amber-950/90">
                      Movement timeline: filter by ATA weekday (Mon–Sun) or All. One-day strip is local time on
                      the ATA calendar day (00:00–24:00); bar spans ATA→ATD (clipped to that day).
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {PEAK_WEEKDAY_BUTTONS.map((b) => (
                        <button
                          key={`did-${String(b.value)}`}
                          type="button"
                          onClick={() => setDidPeakWeekFilter(b.value)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            didPeakWeekFilter === b.value
                              ? 'border-amber-700 bg-amber-600 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
                    <div className="border-b border-amber-100 bg-amber-50/90 px-3 py-2">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-amber-950">
                        Movement Gantt (ATA → ATD)
                      </h4>
                      <p className="mt-0.5 text-[11px] text-amber-950/80">
                        Same time scale as May–Fly schedule timeline; uses actual arrival/departure times.
                      </p>
                    </div>
                    {didFlyGanttRows.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-gray-600">
                        No flights for this weekday with usable ATA/ATD times. Choose{' '}
                        <span className="font-medium">All</span> or another Mon–Sun.
                      </p>
                    ) : (
                      <div className="max-h-[min(520px,72vh)] overflow-auto">
                        <TooltipProvider delayDuration={0} skipDelayDuration={0}>
                          <div className="flex w-max min-w-full flex-col">
                            <div className="sticky top-0 z-30 flex w-max min-w-full bg-white">
                              <div
                                className="sticky left-0 z-40 flex h-9 shrink-0 items-stretch border-b border-r border-amber-200 bg-amber-100 text-[11px] font-semibold text-amber-950"
                                style={{ width: MAY_FLY_GANTT_LEFT_PX }}
                              >
                                <div className="flex w-[112px] min-w-0 items-center border-r border-amber-200/80 px-2">
                                  Flights
                                </div>
                                <div className="flex w-20 min-w-0 items-center border-r border-amber-200/80 px-2">
                                  A/C Type
                                </div>
                                <div className="flex w-11 shrink-0 items-center justify-center border-r border-amber-200/80 px-1">
                                  ATA
                                </div>
                                <div className="flex w-11 shrink-0 items-center justify-center border-r border-amber-200/80 px-1">
                                  ATD
                                </div>
                                <div className="flex w-8 shrink-0 items-center justify-center px-0.5">
                                  Days
                                </div>
                              </div>
                              <div
                                className="flex h-9 shrink-0 border-b border-amber-900 bg-amber-800 text-[9px] font-medium leading-tight text-white sm:text-[10px]"
                                style={{ width: OPS_TIMELINE_WIDTH_PX }}
                              >
                                {opsSlotLabels.map((lab, idx) => (
                                  <div
                                    key={`did-slot-${idx}`}
                                    className="flex shrink-0 items-center justify-center border-r border-amber-950/40 px-0.5"
                                    style={{ width: OPS_TIMELINE_SLOT_PX, minWidth: OPS_TIMELINE_SLOT_PX }}
                                  >
                                    <span className="max-w-[30px] truncate text-center">{lab}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {didFlyGanttRows.map((row, i) => (
                              <div key={row.key} className="flex w-max min-w-full">
                                <div
                                  className={`sticky left-0 z-20 flex h-10 shrink-0 items-stretch border-b border-r border-gray-200 text-[11px] ${
                                    i % 2 === 0 ? 'bg-white' : 'bg-amber-50/50'
                                  }`}
                                  style={{ width: MAY_FLY_GANTT_LEFT_PX }}
                                >
                                  <div className="flex w-[112px] min-w-0 items-center border-r border-gray-100 px-2 font-medium text-gray-900">
                                    <span className="truncate" title={row.flightLabel}>
                                      {row.flightLabel}
                                    </span>
                                  </div>
                                  <div className="flex w-20 min-w-0 items-center border-r border-gray-100 px-2 text-gray-800">
                                    <span className="truncate" title={row.aircraft}>
                                      {row.aircraft}
                                    </span>
                                  </div>
                                  <div className="flex w-11 shrink-0 items-center justify-center border-r border-gray-100 font-mono text-[10px] text-gray-800">
                                    {row.ataLabel}
                                  </div>
                                  <div className="flex w-11 shrink-0 items-center justify-center border-r border-gray-100 font-mono text-[10px] text-gray-800">
                                    {row.atdLabel}
                                  </div>
                                  <div className="flex w-8 shrink-0 items-center justify-center text-gray-700">
                                    {row.dayShort}
                                  </div>
                                </div>
                                <div
                                  className={`relative h-10 shrink-0 border-b border-gray-200 ${
                                    i % 2 === 0 ? 'bg-white' : 'bg-amber-50/50'
                                  }`}
                                  style={{ width: OPS_TIMELINE_WIDTH_PX }}
                                >
                                  <div
                                    className="pointer-events-none absolute inset-0 opacity-90"
                                    style={{
                                      backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${OPS_TIMELINE_SLOT_PX - 1}px, rgba(180,83,9,0.22) ${OPS_TIMELINE_SLOT_PX - 1}px, rgba(180,83,9,0.22) ${OPS_TIMELINE_SLOT_PX}px)`,
                                    }}
                                  />
                                  {row.showBar && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="absolute top-1.5 bottom-1.5 flex max-w-full cursor-default select-none items-center overflow-hidden rounded-md border-0 bg-amber-400/95 px-1 text-left text-[10px] font-semibold text-amber-950 shadow-sm ring-1 ring-amber-800/25 outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-1"
                                          style={{ left: row.leftPx, width: row.widthPx }}
                                        >
                                          <span className="min-w-0 truncate">{row.flightLabel}</span>
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="z-[60] max-w-xs border border-slate-200 bg-white px-2.5 py-2 text-left text-xs text-slate-900 shadow-lg !animate-none !duration-0"
                                      >
                                        <p className="font-semibold leading-snug">{row.flightLabel}</p>
                                        <p className="mt-1 font-mono text-[11px] text-slate-600">
                                          ATA {row.ataLabel}
                                          <span className="mx-1.5 text-slate-300">·</span>
                                          ATD {row.atdLabel}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-900">
                        Daily (by STA/ATA date)
                      </h4>
                      <div className="max-h-40 overflow-auto text-sm">
                        {didFlyDailyCounts.length === 0 ? (
                          <p className="text-xs text-gray-500">No dated rows to aggregate.</p>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 bg-amber-50 text-amber-950">
                              <tr>
                                <th className="px-2 py-1 font-semibold">Date</th>
                                <th className="px-2 py-1 font-semibold text-right">Flights</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {didFlyDailyCounts.map((d) => (
                                <tr key={d.dateYmd}>
                                  <td className="px-2 py-1 font-mono">{d.dateYmd}</td>
                                  <td className="px-2 py-1 text-right font-semibold text-amber-950">
                                    {d.count}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-900">
                        Monthly (by STA/ATA month)
                      </h4>
                      <div className="max-h-40 overflow-auto text-sm">
                        {didFlyMonthlyCounts.length === 0 ? (
                          <p className="text-xs text-gray-500">No dated rows to aggregate.</p>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 bg-amber-50 text-amber-950">
                              <tr>
                                <th className="px-2 py-1 font-semibold">Month</th>
                                <th className="px-2 py-1 font-semibold text-right">Flights</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {didFlyMonthlyCounts.map((d) => (
                                <tr key={d.monthYm}>
                                  <td className="px-2 py-1 font-mono">{d.monthYm}</td>
                                  <td className="px-2 py-1 text-right font-semibold text-amber-950">
                                    {d.count}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-auto rounded-xl border border-amber-100 shadow-sm">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-amber-100 text-xs font-semibold uppercase text-amber-950/95">
                        <tr>
                          <th className="px-2 py-1.5">Serial</th>
                          <th className="px-2 py-1.5">Airline</th>
                          <th className="px-2 py-1.5">Flight</th>
                          <th className="px-2 py-1.5">ATA</th>
                          <th className="px-2 py-1.5">ATD</th>
                          <th className="px-2 py-1.5">Route</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {movementRows.slice(0, 80).map((r) => (
                          <tr key={`${r.flightSerialNumber}-${r.ataDate}-${r.atdDate}`} className="hover:bg-gray-50/80">
                            <td className="px-2 py-1.5 font-mono text-xs">{r.flightSerialNumber}</td>
                            <td className="px-2 py-1.5">{r.airlineName}</td>
                            <td className="px-2 py-1.5">{r.flightCode}</td>
                            <td className="px-2 py-1.5 text-xs">
                              {[r.ataDate, r.ataTime].filter(Boolean).join(' ') || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-xs">
                              {[r.atdDate, r.atdTime].filter(Boolean).join(' ') || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-gray-600">{r.route ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {movementRows.length > 80 && (
                      <p className="border-t border-gray-100 bg-gray-50 px-2 py-1.5 text-xs text-gray-500">
                        Showing 80 of {movementRows.length}. Use export for the full list.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

    </motion.div>
  );
}
