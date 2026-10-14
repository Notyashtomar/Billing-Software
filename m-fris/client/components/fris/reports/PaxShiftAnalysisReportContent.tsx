'use client';

import React, { useCallback, useMemo, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PieChart } from 'lucide-react';
import { processFlightData, FlightData } from '@/utils/dataProcessor';
import { getApiBase } from '@/lib/api';
import { dailyScheduledFlightsQueryOptions } from '@/hooks/fris/useDailyScheduledFlightsQuery';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { FRIS_REPORTS_PAGE_SHELL_CLASS, FRIS_REPORTS_PRIMARY_BTN_CLASS } from '@/lib/fris-reports-responsive';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterField = (typeof FILTER_FIELD_ORDER)[number];

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
      scheduleLabelToYmd(String(f.staDate ?? '').trim()) ?? scheduleLabelToYmd(String(f.stdDate ?? '').trim());
    if (!ymd) return false;
    return ymd >= fromYmd && ymd <= toYmd;
  });
}

function formatYmdToDMonYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '—';
  const [y, m, d] = parts;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d).padStart(2, '0')} ${months[(m ?? 1) - 1]!} ${y}`;
}

function formatLoadError(error: unknown, fallback: string): string {
  const errMsg = error instanceof Error ? error.message : '';
  if (errMsg.trim().toLowerCase() === 'internal server error') {
    return 'The backend returned Internal Server Error. Check server logs and the selected date range.';
  }
  const isNetworkError = error instanceof TypeError && (errMsg === 'Failed to fetch' || errMsg.includes('fetch'));
  if (isNetworkError) {
    const base = getApiBase().replace(/\/$/, '');
    const target =
      base.startsWith('/') ? `${base} (dev proxy → Nest on 127.0.0.1:8080)` : base || 'http://127.0.0.1:8080';
    return 'Cannot reach the API. Ensure the backend is running at ' + target + '.';
  }
  return error instanceof Error ? error.message : fallback;
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

function dedupeBySlNo(flights: FlightData[]): FlightData[] {
  const seen = new Set<string>();
  const out: FlightData[] = [];
  for (const f of flights) {
    const key = String(f.slNo ?? '').trim();
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(f);
  }
  return out;
}

const ALL = '';

export default function PaxShiftAnalysisReportContent() {
  const queryClient = useQueryClient();
  const todayYmd = localCalendarYmd();
  const [fromDate, setFromDate] = useState(() => firstDayOfMonthYmd());
  const [toDate, setToDate] = useState(() => todayYmd);
  const [flightNo, setFlightNo] = useState(ALL);
  const [airline, setAirline] = useState(ALL);
  const [employee, setEmployee] = useState('');
  const [rosterApplicable, setRosterApplicable] = useState(false);
  const [allFlights, setAllFlights] = useState<FlightData[]>([]);
  const [lastFetched, setLastFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors<FilterField>(FILTER_FIELD_ORDER);

  const capDate = scheduleFilterCapDate();
  const toDateForPickerMax = (() => {
    if (!toDate?.trim()) return capDate;
    const p = toDate.split('-').map(Number);
    if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return capDate;
    const [y, m, d] = p;
    const end = new Date(y!, m! - 1, d!);
    return end.getTime() <= capDate.getTime() ? end : capDate;
  })();
  const fromDateMax = (() => {
    if (!toDate?.trim()) return capDate;
    const p = toDate.split('-').map(Number);
    if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return capDate;
    const [y, m, d] = p;
    return new Date(y!, m! - 1, d!);
  })();

  const flightNoOptions = useMemo(() => {
    const set = new Set(
      allFlights.map((f) => String(f.flightNo ?? '').trim()).filter((s) => s.length > 0),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [allFlights]);

  const airlineOptions = useMemo(() => {
    const set = new Set(
      allFlights.map((f) => String(f.airline ?? '').trim()).filter((s) => s.length > 0),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [allFlights]);

  const airlineDropdownOptions = useMemo(
    () => [{ value: ALL, label: 'All' }, ...airlineOptions.map((a) => ({ value: a, label: a }))],
    [airlineOptions],
  );

  const flightNoDropdownOptions = useMemo(
    () => [{ value: ALL, label: 'All' }, ...flightNoOptions.map((f) => ({ value: f, label: f }))],
    [flightNoOptions],
  );

  const filteredForSummary = useMemo(() => {
    let rows = allFlights;
    if (flightNo) {
      rows = rows.filter((f) => String(f.flightNo ?? '').trim() === flightNo);
    }
    if (airline) {
      rows = rows.filter((f) => String(f.airline ?? '').trim() === airline);
    }
    return dedupeBySlNo(rows);
  }, [allFlights, flightNo, airline]);

  const totalFlights = lastFetched ? filteredForSummary.length : 0;
  const trainingAsOnDateLabel = lastFetched ? formatYmdToDMonYyyy(toDate) : '—';

  const handleGet = useCallback(async () => {
    const next = validateYmdDateRange(fromDate, toDate, { toNotAfterToday: true });
    if (applyAndFocus(next)) return;
    setLoading(true);
    setLoadError(null);
    try {
      const fromDd = yyyyMmDdToDdMmYyyy(fromDate);
      const toDd = yyyyMmDdToDdMmYyyy(toDate);
      if (!fromDd || !toDd) {
        applyAndFocus({
          fromDate: 'From date must be a valid date.',
          toDate: 'To date must be a valid date.',
        });
        return;
      }
      const rows = await loadScheduledFlightsForDateRange(
        queryClient,
        fromDd,
        toDd,
        fromDate,
        toDate,
      );
      setAllFlights(rows);
      setFlightNo(ALL);
      setAirline(ALL);
      setLastFetched(true);
    } catch (e) {
      setAllFlights([]);
      setLastFetched(false);
      setLoadError(formatLoadError(e, 'Could not load schedule data.'));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, applyAndFocus, queryClient]);

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition-all hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/60';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} w-full bg-emerald-50`}
    >
      <div className="w-full pt-6 md:pt-8">
        <FrisPageHeader title="Pax Shift Analysis Report" icon={PieChart} />

        <div className="rounded-2xl border border-emerald-100/80 bg-white p-4 shadow-sm sm:p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={cn(errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="field-fromDate">
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
                  maxDate={fromDateMax}
                />
                <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
              </div>
              <div className={cn(errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="field-toDate">
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
                  minDate={(() => {
                    if (!fromDate) return undefined;
                    const p = fromDate.split('-').map(Number);
                    if (p.length !== 3) return undefined;
                    const [y, m, d] = p;
                    return new Date(y!, m! - 1, d!);
                  })()}
                  maxDate={toDateForPickerMax}
                />
                <FormFieldError id="field-toDate-error" message={errors.toDate} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="pax-an-airline">
                  Airline
                </label>
                <AdminRadioDropdown
                  id="pax-an-airline"
                  className={inputClass}
                  value={airline}
                  onChange={setAirline}
                  options={airlineDropdownOptions}
                />
                <FormFieldError />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="pax-an-flight">
                  Flight No
                </label>
                <AdminRadioDropdown
                  id="pax-an-flight"
                  className={inputClass}
                  value={flightNo}
                  onChange={setFlightNo}
                  options={flightNoDropdownOptions}
                />
                <FormFieldError />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="pax-an-emp">
                  Employee
                </label>
                <input
                  id="pax-an-emp"
                  type="text"
                  autoComplete="off"
                  placeholder="Name or code (optional)"
                  value={employee}
                  onChange={(e) => setEmployee(e.target.value)}
                  className={inputClass}
                />
                <FormFieldError />
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Roster Applicable</span>
                <label className="flex h-10 cursor-pointer select-none items-center rounded-lg border border-slate-200/80 bg-white px-3 shadow-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                    checked={rosterApplicable}
                    onChange={(e) => setRosterApplicable(e.target.checked)}
                    aria-label="Roster applicable"
                  />
                </label>
                <FormFieldError />
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Total Flights</span>
                <div
                  className="flex h-10 items-center rounded-lg border border-slate-200/80 bg-white/80 px-3 text-sm tabular-nums text-sky-600"
                  role="status"
                >
                  <span className="font-semibold">{lastFetched ? totalFlights : 0}</span>
                </div>
                <FormFieldError />
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Training as On Date</span>
                <div
                  className="flex h-10 items-center rounded-lg border border-slate-200/80 bg-white/80 px-3 text-sm font-medium text-slate-800"
                  role="status"
                >
                  {trainingAsOnDateLabel}
                </div>
                <FormFieldError />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => void handleGet()}
                disabled={loading}
                className="inline-flex h-10 min-w-[6.5rem] items-center justify-center rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Loading…' : 'Get'}
              </button>
            </div>
          </div>

          {loadError && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {loadError}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-emerald-200/90 bg-emerald-50/40 p-6 text-center text-sm text-slate-600">
          {lastFetched
            ? 'Analysis table and export can be connected here using the loaded schedule slice and staff/roster data.'
            : 'Set dates and press Get to load schedule data, then narrow by flight, airline, employee, and roster where applicable.'}
        </div>
      </div>
    </motion.div>
  );
}
