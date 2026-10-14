'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  QualityReportResultsHandle,
} from '@/components/fris/reports/QualityReportResultsTables';
import dynamic from 'next/dynamic';

const QualityReportResultsTables = dynamic(
  () => import('@/components/fris/reports/QualityReportResultsTables'),
  { ssr: false }
);
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import {
  fetchContactReferenceAirlines,
  updateQualityReportFbLbHold,
} from '@/lib/api';
import { cn } from '@/lib/utils';

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

function daysAgoYmd(days: number, d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate() - days);
  return localCalendarYmd(cal);
}

function firstDayOfMonthYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ymdToDate(value: string): Date | undefined {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((item) => Number.isNaN(item))) return undefined;
  const [year, month, day] = parts;
  return new Date(year!, month! - 1, day!);
}

function readSessionStationCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    const fromKey = String(localStorage.getItem('userStationCode') ?? '')
      .trim()
      .toUpperCase();
    if (fromKey) return fromKey;
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { stationCode?: string };
    return String(parsed.stationCode ?? '')
      .trim()
      .toUpperCase();
  } catch {
    return '';
  }
}

const ALL_AIRLINES = '';

const QUALITY_BTN_TRANSITION =
  'transition-[transform,opacity,background-color,border-color,box-shadow] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]';

const DATE_PRESETS = [
  { key: '7', label: 'Last 7 Days', from: () => daysAgoYmd(7), to: () => localCalendarYmd() },
  { key: '30', label: 'Last 30 Days', from: () => daysAgoYmd(30), to: () => localCalendarYmd() },
  {
    key: 'month',
    label: 'Current Month',
    from: () => firstDayOfMonthYmd(),
    to: () => localCalendarYmd(),
  },
] as const;

const datePickerClass =
  'min-w-0 [&>button]:h-11 [&>button]:rounded-xl [&>button]:border [&>button]:border-emerald-100/90 [&>button]:bg-white/95 [&>button]:px-3 [&>button]:text-sm [&>button]:text-emerald-950 [&>button]:shadow-sm [&>button]:hover:bg-emerald-50/40 [&>button]:focus-visible:border-emerald-500 [&>button]:focus-visible:shadow-[0_0_0_3px_rgba(16,185,129,0.18)]';

const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterField = (typeof FILTER_FIELD_ORDER)[number];

const INITIAL_FROM_DATE = daysAgoYmd(30);
const INITIAL_TO_DATE = localCalendarYmd();

function advanceDocId(doc: Record<string, unknown>): Record<string, unknown> {
  if (doc && typeof doc === 'object' && doc.data && typeof doc.data === 'object') {
    return doc.data as Record<string, unknown>;
  }
  return doc;
}

export default function QualityReportContent() {
  const [fromDate, setFromDate] = useState(INITIAL_FROM_DATE);
  const [toDate, setToDate] = useState(INITIAL_TO_DATE);
  const [airline, setAirline] = useState(ALL_AIRLINES);
  const [stationCode] = useState(() => readSessionStationCode());
  const [airlineOptions, setAirlineOptions] = useState<Array<{ value: string; label: string }>>([
    { value: ALL_AIRLINES, label: 'All airlines' },
  ]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>('30');
  const [lastViewed, setLastViewed] = useState<{
    from: string;
    to: string;
    airlineValue: string;
    airlineLabel: string;
  } | null>({
    from: INITIAL_FROM_DATE,
    to: INITIAL_TO_DATE,
    airlineValue: ALL_AIRLINES,
    airlineLabel: 'All airlines',
  });
  const [exporting, setExporting] = useState(false);
  const [updatingKpis, setUpdatingKpis] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const resultsRef = useRef<QualityReportResultsHandle>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors<FilterField>(FILTER_FIELD_ORDER);

  useEffect(() => {
    let cancelled = false;
    setAirlinesLoading(true);
    void fetchContactReferenceAirlines()
      .then((list) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const options: Array<{ value: string; label: string }> = [
          { value: ALL_AIRLINES, label: 'All airlines' },
        ];
        for (const raw of list as Record<string, unknown>[]) {
          const d = advanceDocId(raw);
          const name = String(d.airlineName ?? d.airline ?? d.name ?? d.airlines ?? '')
            .trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const code = String(d.airlineCode ?? d.code ?? d.Arline_Code ?? '')
            .trim()
            .toUpperCase();
          options.push({
            value: name,
            label: code ? `${name} (${code})` : name,
          });
        }
        options.sort((a, b) => {
          if (!a.value) return -1;
          if (!b.value) return 1;
          return a.label.localeCompare(b.label);
        });
        setAirlineOptions(options);
      })
      .catch(() => {
        if (!cancelled) {
          setAirlineOptions([{ value: ALL_AIRLINES, label: 'All airlines' }]);
        }
      })
      .finally(() => {
        if (!cancelled) setAirlinesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const todayDate = useMemo(() => ymdToDate(localCalendarYmd()), []);
  const fromDateMax = useMemo(() => ymdToDate(toDate) ?? todayDate, [toDate, todayDate]);
  const toDateMin = useMemo(() => ymdToDate(fromDate), [fromDate]);

  const applyPreset = useCallback((key: string) => {
    const preset = DATE_PRESETS.find((item) => item.key === key);
    if (!preset) return;
    setFromDate(preset.from());
    setToDate(preset.to());
    setActivePreset(key);
    clearField('fromDate');
    clearField('toDate');
  }, [clearField]);

  const viewQualityReport = useCallback(() => {
    const next = validateYmdDateRange(fromDate, toDate, { toNotAfterToday: true });
    if (applyAndFocus(next)) return;

    setLastViewed({
      from: fromDate,
      to: toDate,
      airlineValue: airline,
      airlineLabel:
        airlineOptions.find((option) => option.value === airline)?.label ?? 'All airlines',
    });
  }, [airline, airlineOptions, fromDate, toDate, applyAndFocus]);

  const exportPdf = useCallback(async () => {
    if (!lastViewed) {
      toast.warning('Apply a date range to generate the report first.');
      return;
    }
    if (!resultsRef.current) return;
    setExporting(true);
    try {
      await resultsRef.current.exportPdf();
      toast.success('Quality report PDF downloaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export the PDF.');
    } finally {
      setExporting(false);
    }
  }, [lastViewed]);

  const updateFbLbHoldClose = useCallback(async () => {
    if (!lastViewed) {
      toast.warning('Apply a date range before updating FB / LB / Hold.');
      return;
    }
    setUpdatingKpis(true);
    try {
      const result = await updateQualityReportFbLbHold(lastViewed.from, lastViewed.to);
      toast.success(
        `Updated FB/LB/Hold for ${result.updated} flight${result.updated === 1 ? '' : 's'}.`,
        {
          description: `On-time — First bag: ${result.firstBagOnTime}, Last bag: ${result.lastBagOnTime}, Hold: ${result.holdClosedOnTime}`,
        },
      );
      setRefreshNonce((n) => n + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update FB / LB / Hold.');
    } finally {
      setUpdatingKpis(false);
    }
  }, [lastViewed]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} w-full bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/35`}
    >
      <div className="mx-auto w-full max-w-[1600px] pt-6 md:pt-8">
        <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)] xl:items-start">
          <div className="space-y-2 xl:pt-1">
            <FrisPageHeader title="Quality Report" icon={BadgeCheck} className="mb-0" />
            {stationCode ? (
              <p className="text-sm text-emerald-900/70">
                Showing FHR for station{' '}
                <span className="font-semibold text-emerald-900">{stationCode}</span> only.
              </p>
            ) : (
              <p className="text-sm text-amber-800">
                No station on this session — sign in again with a station selected.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-100/90 bg-white/90 p-4 shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04] backdrop-blur-sm sm:p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset.key)}
                  className={cn(
                    'inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold',
                    QUALITY_BTN_TRANSITION,
                    activePreset === preset.key
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)_auto_auto]">
              <label className={cn('block min-w-0', errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900/70">
                  From
                </span>
                <DatePicker
                  id="field-fromDate"
                  value={fromDate}
                  onChange={(v) => {
                    setFromDate(v);
                    setActivePreset(null);
                    clearField('fromDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  maxDate={fromDateMax}
                  rangeFrom={ymdToDate(fromDate)}
                  rangeTo={ymdToDate(toDate)}
                  className={datePickerClass}
                />
                <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
              </label>

              <label className={cn('block min-w-0', errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900/70">
                  To
                </span>
                <DatePicker
                  id="field-toDate"
                  value={toDate}
                  onChange={(v) => {
                    setToDate(v);
                    setActivePreset(null);
                    clearField('toDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  minDate={toDateMin}
                  maxDate={todayDate}
                  rangeFrom={ymdToDate(fromDate)}
                  rangeTo={ymdToDate(toDate)}
                  className={datePickerClass}
                />
                <FormFieldError id="field-toDate-error" message={errors.toDate} />
              </label>

              <label className="block min-w-0">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900/70">
                  Airline
                </span>
                <AdminRadioDropdown
                  id="quality-airline"
                  value={airline}
                  onChange={setAirline}
                  options={airlineOptions}
                  disabled={airlinesLoading}
                  className="h-11 shadow-sm"
                  aria-label="Filter quality report by airline"
                  searchPlaceholder="Search airline…"
                />
                <FormFieldError />
              </label>

              <div className={cn('flex flex-col justify-end xl:min-w-[110px]', FLIGHT_FILTER_ACTIONS_PB)}>
                <button
                  type="button"
                  onClick={viewQualityReport}
                  className={cn(
                    'inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600',
                    QUALITY_BTN_TRANSITION,
                  )}
                >
                  Apply
                </button>
              </div>

              <div className={cn('flex flex-col justify-end xl:min-w-[180px]', FLIGHT_FILTER_ACTIONS_PB)}>
                <button
                  type="button"
                  onClick={() => void updateFbLbHoldClose()}
                  disabled={updatingKpis || !lastViewed}
                  aria-busy={updatingKpis}
                  className={cn(
                    'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:border-emerald-200/80 hover:bg-emerald-50/40 disabled:cursor-not-allowed disabled:opacity-60',
                    QUALITY_BTN_TRANSITION,
                  )}
                >
                  {updatingKpis ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  {updatingKpis ? 'Updating…' : 'Update FB LB Hold'}
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-end border-t border-emerald-100/70 pt-4">
              <button
                type="button"
                onClick={() => void exportPdf()}
                disabled={exporting || !lastViewed}
                className={cn(
                  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60',
                  QUALITY_BTN_TRANSITION,
                )}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                {exporting ? 'Generating…' : 'Export PDF'}
              </button>
            </div>
          </div>
        </section>

        {lastViewed ? (
          <QualityReportResultsTables
            ref={resultsRef}
            fromYmd={lastViewed.from}
            toYmd={lastViewed.to}
            airlineValue={lastViewed.airlineValue}
            airlineLabel={lastViewed.airlineLabel}
            stationCode={stationCode}
            refreshNonce={refreshNonce}
          />
        ) : null}
      </div>
    </motion.div>
  );
}
