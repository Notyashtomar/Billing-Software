'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, RefreshCw, TrendingUp } from 'lucide-react';
import { getXLSXModule } from '@/lib/dynamic-imports';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  FLIGHT_FILTER_ACTIONS_CLASS,
  FLIGHT_FILTER_PRIMARY_BTN_CLASS,
  FLIGHT_FILTER_SECONDARY_BTN_CLASS,
} from '@/components/fris/flights/flightFilterBarLayout';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
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
import { processFlightData, type FlightData } from '@/utils/dataProcessor';

type AdvanceAirlineOption = { id: string; name: string; code: string };
type CategoryMode = 'allActive' | 'passenger' | 'freighter';

const PEAK_DATE_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type PeakDateField = (typeof PEAK_DATE_FIELD_ORDER)[number];

const PEAK_WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

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

function isWidebodyAircraftType(ac: string): boolean {
  const s = String(ac ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!s) return false;
  if (/\bWB\b|WIDE|JUMBO/.test(s)) return true;
  return /A3(30|50|80|8)|B(74|76|77|78)7|\b744\b|\b773\b|\b772\b|\b789\b|\b788\b|\b781\b|\b359\b|\b338\b|\b339\b/.test(s);
}

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

/** Monday 00:00 local for the calendar week containing `ymd`. */
function mondayYmdForDateYmd(ymd: string): string | null {
  const base = scheduleLabelToYmd(ymd) ?? (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null);
  if (!base) return null;
  const [y, mo, d] = base.split('-').map(Number);
  const dt = new Date(y!, mo! - 1, d!);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo! - 1 || dt.getDate() !== d!) return null;
  const day = dt.getDay();
  const daysFromMonday = (day + 6) % 7;
  dt.setDate(dt.getDate() - daysFromMonday);
  return localCalendarYmd(dt);
}

function formatDdMon(ymd: string): string {
  const p = ymd.split('-').map(Number);
  if (p.length !== 3) return ymd;
  const [y, m, d] = p;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[(m ?? 1) - 1] ?? ''} ${y}`;
}

function addDaysYmd(ymd: string, delta: number): string | null {
  const base = scheduleLabelToYmd(ymd) ?? (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null);
  if (!base) return null;
  const [y, mo, d] = base.split('-').map(Number);
  const dt = new Date(y!, mo! - 1, d! + delta);
  return localCalendarYmd(dt);
}

export type PeakWeekTableRow = {
  weekStartYmd: string;
  weekEndYmd: string;
  dayOfWeek: string;
  dayOfWeekDetail: string;
  timeRange: string;
  totalFlight: number;
  totalNb: number;
  totalWb: number;
  totalFreighter: number;
  airline: string;
};

function classifyFlight(f: FlightData): 'nb' | 'wb' | 'fr' {
  const ft = String(f.flightType ?? '');
  if (isFreighterFlightType(ft)) return 'fr';
  if (isWidebodyAircraftType(String(f.aircraft ?? ''))) return 'wb';
  return 'nb';
}

function peakHourRangeLabel(flights: FlightData[]): string {
  const hourCounts: Record<number, number> = {};
  for (const f of flights) {
    const mins = parseScheduleTimeToMinutes(String(f.staTime ?? ''));
    if (mins === null) continue;
    const h = Math.floor(mins / 60);
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const keys = Object.keys(hourCounts).map(Number);
  if (keys.length === 0) return '—';
  let bestH = keys[0]!;
  let bestC = hourCounts[bestH] ?? 0;
  for (const h of keys) {
    const c = hourCounts[h] ?? 0;
    if (c > bestC || (c === bestC && h < bestH)) {
      bestC = c;
      bestH = h;
    }
  }
  const nextH = (bestH + 1) % 24;
  const a = `${String(bestH).padStart(2, '0')}:00`;
  const b = `${String(nextH).padStart(2, '0')}:00`;
  return `${a}–${b}`;
}

function topAirlineForFlights(flights: FlightData[]): string {
  const tally = new Map<string, number>();
  for (const f of flights) {
    const name = String(f.airline ?? '').trim() || 'Unknown';
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  let best = '';
  let bestN = -1;
  for (const [name, n] of tally) {
    if (n > bestN || (n === bestN && name.localeCompare(best) < 0)) {
      bestN = n;
      best = name;
    }
  }
  return best || '—';
}

function buildPeakWeekRows(flights: FlightData[]): PeakWeekTableRow[] {
  const active = flights.filter((f) => !f.isCancelled);
  const byWeek = new Map<string, FlightData[]>();
  for (const f of active) {
    const rawSta = String(f.staDate ?? '').trim();
    const ymd =
      scheduleLabelToYmd(rawSta) ?? (/^\d{4}-\d{2}-\d{2}$/.test(rawSta) ? rawSta : null);
    if (!ymd) continue;
    const wk = mondayYmdForDateYmd(ymd);
    if (!wk) continue;
    const list = byWeek.get(wk) ?? [];
    list.push(f);
    byWeek.set(wk, list);
  }

  const rows: PeakWeekTableRow[] = [];
  const sortedWeeks = [...byWeek.keys()].sort((a, b) => a.localeCompare(b));

  for (const weekStart of sortedWeeks) {
    const bucket = byWeek.get(weekStart) ?? [];
    const byWeekday: FlightData[][] = Array.from({ length: 7 }, () => []);

    for (const f of bucket) {
      const wd = weekdayFromFlightSta(f);
      if (wd == null) continue;
      byWeekday[wd]!.push(f);
    }

    let bestWd = 0;
    let bestLen = byWeekday[0]!.length;
    for (let d = 1; d < 7; d += 1) {
      const len = byWeekday[d]!.length;
      if (len > bestLen) {
        bestLen = len;
        bestWd = d;
      }
    }

    if (bestLen === 0) continue;

    const dayFlights = byWeekday[bestWd]!;
    let nb = 0;
    let wb = 0;
    let fr = 0;
    for (const f of dayFlights) {
      const k = classifyFlight(f);
      if (k === 'nb') nb += 1;
      else if (k === 'wb') wb += 1;
      else fr += 1;
    }

    const weekEnd = addDaysYmd(weekStart, 6);
    const endDisp = weekEnd ? formatDdMon(weekEnd) : '';
    const startDisp = formatDdMon(weekStart);

    rows.push({
      weekStartYmd: weekStart,
      weekEndYmd: weekEnd ?? weekStart,
      dayOfWeek: PEAK_WEEKDAY_LONG[bestWd],
      dayOfWeekDetail: `Week ${startDisp} – ${endDisp}`,
      timeRange: peakHourRangeLabel(dayFlights),
      totalFlight: dayFlights.length,
      totalNb: nb,
      totalWb: wb,
      totalFreighter: fr,
      airline: topAirlineForFlights(dayFlights),
    });
  }

  return rows;
}

function toAirlineOption(doc: Record<string, unknown>): AdvanceAirlineOption {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    name: String(doc.name ?? '').trim(),
    code: String(doc.code ?? '').trim(),
  };
}

function matchesScheduleCategory(f: FlightData, mode: CategoryMode): boolean {
  const ft = String(f.flightType ?? '');
  if (mode === 'allActive') return true;
  if (mode === 'passenger') return !isFreighterFlightType(ft);
  return isFreighterFlightType(ft);
}

function filterPeakFlights(
  rows: FlightData[],
  airlineName: string,
  mode: CategoryMode,
): FlightData[] {
  const air = airlineName.trim().toLowerCase();
  return rows.filter((f) => {
    if (!matchesScheduleCategory(f, mode)) return false;
    if (!air) return true;
    return String(f.airline ?? '')
      .toLowerCase()
      .includes(air);
  });
}

const CATEGORY_OPTIONS: { id: CategoryMode; label: string }[] = [
  { id: 'allActive', label: 'All active' },
  { id: 'passenger', label: 'Passenger' },
  { id: 'freighter', label: 'Freighter' },
];

/** Same control chrome as schedule setup / other FRIS filter rows (h-10, emerald focus). */
const FILTER_DROPDOWN_CLASS =
  'box-border h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export function PeakFlightsContent() {
  const [airlineOptions, setAirlineOptions] = useState<AdvanceAirlineOption[]>([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);

  const [draftFrom, setDraftFrom] = useState(() => scheduleDefaultFromToYmd().from);
  const [draftTo, setDraftTo] = useState(() => scheduleDefaultFromToYmd().to);
  const [draftAirlineId, setDraftAirlineId] = useState('');
  const [draftCategory, setDraftCategory] = useState<CategoryMode>('allActive');
  const { errors: dateErrors, clearAll: clearDateErrors, clearField: clearDateField, applyAndFocus: applyDateErrors } =
    useFieldErrors<PeakDateField>(PEAK_DATE_FIELD_ORDER);

  const [appliedFrom, setAppliedFrom] = useState(() => scheduleDefaultFromToYmd().from);
  const [appliedTo, setAppliedTo] = useState(() => scheduleDefaultFromToYmd().to);
  const [appliedAirlineName, setAppliedAirlineName] = useState('');
  const [appliedCategory, setAppliedCategory] = useState<CategoryMode>('allActive');

  const [flights, setFlights] = useState<FlightData[]>([]);
  const [loading, setLoading] = useState(false);

  const scheduleFilterMaxDate = scheduleFilterCapDate();

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

  const runLoad = useCallback(
    async (fromYmd: string, toYmd: string, airlineName: string, mode: CategoryMode) => {
      setLoading(true);
      try {
        const fromDd = yyyyMmDdToDdMmYyyy(fromYmd);
        const toDd = yyyyMmDdToDdMmYyyy(toYmd);
        if (!fromDd || !toDd) {
          toast.error('Invalid date range.');
          setFlights([]);
          return;
        }
        const raw = await loadScheduledFlightsForDateRange(fromDd, toDd, fromYmd, toYmd);
        setFlights(filterPeakFlights(raw, airlineName, mode));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load schedule.');
        setFlights([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleApply = useCallback(() => {
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
    void runLoad(draftFrom, draftTo, draftAirlineDisplayName, draftCategory);
  }, [applyDateErrors, draftFrom, draftTo, draftAirlineDisplayName, draftCategory, runLoad]);

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
    void runLoad(from, to, '', 'allActive');
  }, [clearDateErrors, runLoad]);

  useEffect(() => {
    const { from, to } = scheduleDefaultFromToYmd();
    void runLoad(from, to, '', 'allActive');
  }, [runLoad]);

  const tableRows = useMemo(() => buildPeakWeekRows(flights), [flights]);

  const exportExcel = useCallback(async () => {
    if (tableRows.length === 0) {
      toast.message('No data to export. Adjust filters and apply.');
      return;
    }
    const XLSX = await getXLSXModule();
    const exportData = tableRows.map((r) => ({
      'Day Of Week': `${r.dayOfWeek} (${r.dayOfWeekDetail})`,
      'Time Range': r.timeRange,
      'Total Flight': r.totalFlight,
      'Total NB': r.totalNb,
      'Total WB': r.totalWb,
      'Total Freighter': r.totalFreighter,
      Airline: r.airline,
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Peak flights');

    worksheet['!cols'] = [
      { wch: 36 },
      { wch: 14 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 24 },
    ];

    const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const saveAs = await loadFileSaverSaveAs();
    saveAs(blob, `peak-flights-${appliedFrom}_${appliedTo}.xlsx`);
    toast.success('Exported Excel.');
  }, [tableRows, appliedFrom, appliedTo]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-50 p-6"
    >
      <FrisPageHeader
        title="Peak flights"
        icon={TrendingUp}
        actions={
          <button
            type="button"
            onClick={exportExcel}
            disabled={tableRows.length === 0 || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Excel
          </button>
        }
      />

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="grid gap-4 sm:grid-cols-2 lg:flex lg:flex-1 lg:flex-wrap">
            <div className={cn(dateErrors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
              <label htmlFor="field-fromDate" className="mb-1 block text-xs font-medium text-gray-500">From</label>
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
              <label htmlFor="field-toDate" className="mb-1 block text-xs font-medium text-gray-500">To</label>
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
              <label className="mb-1 block text-xs font-medium text-gray-500">Airline</label>
              <AdminRadioDropdown
                value={draftAirlineId}
                onChange={setDraftAirlineId}
                disabled={airlinesLoading}
                options={[
                  {
                    value: '',
                    label: airlinesLoading ? 'Loading airlines…' : 'All airlines',
                  },
                  ...airlineOptions.map((a) => ({
                    value: a.id,
                    label: (a.name || a.code).trim() || 'Unnamed airline',
                  })),
                ]}
                className={`${FILTER_DROPDOWN_CLASS} disabled:cursor-not-allowed disabled:bg-gray-50`}
              />
              <FormFieldError />
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
              <AdminRadioDropdown
                value={draftCategory}
                onChange={(v) => setDraftCategory(v as CategoryMode)}
                options={CATEGORY_OPTIONS.map((c) => ({ value: c.id, label: c.label }))}
                className={FILTER_DROPDOWN_CLASS}
              />
              <FormFieldError />
            </div>
          </div>
          <div className={FLIGHT_FILTER_ACTIONS_CLASS}>
            <button
              type="button"
              onClick={handleApply}
              disabled={loading}
              className={FLIGHT_FILTER_PRIMARY_BTN_CLASS}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Apply
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className={cn(
                FLIGHT_FILTER_SECONDARY_BTN_CLASS,
                'border-emerald-500 text-emerald-500 hover:bg-emerald-500/10',
              )}
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Applied range: {appliedFrom} → {appliedTo}
          {appliedAirlineName ? ` · Airline: ${appliedAirlineName}` : ''} ·{' '}
          {CATEGORY_OPTIONS.find((c) => c.id === appliedCategory)?.label}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-emerald-500 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Peak weekday by week</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <th className="px-4 py-3 font-semibold">Day Of Week</th>
                <th className="px-4 py-3 font-semibold">Time Range</th>
                <th className="px-4 py-3 font-semibold text-right">Total Flight</th>
                <th className="px-4 py-3 font-semibold text-right">Total NB</th>
                <th className="px-4 py-3 font-semibold text-right">Total WB</th>
                <th className="px-4 py-3 font-semibold text-right">Total Freighter</th>
                <th className="px-4 py-3 font-semibold">Airline</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    Loading schedule…
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    No weeks with flights in this range. Widen the dates or clear the airline filter.
                  </td>
                </tr>
              ) : (
                tableRows.map((r) => (
                  <tr key={r.weekStartYmd} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-gray-900">{r.dayOfWeek}</div>
                      <div className="text-xs text-gray-500">{r.dayOfWeekDetail}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-800">{r.timeRange}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {r.totalFlight}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                      {r.totalNb}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                      {r.totalWb}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                      {r.totalFreighter}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{r.airline}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
