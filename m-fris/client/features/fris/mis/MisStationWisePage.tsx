'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { Badge } from '@/components/ui/badge';
import {
  getCurrentMonthDateRange,
  getMonthDateRange,
  getPreviousMonthDateRange,
  toYearMonth,
} from '@/components/billing/output/misCheckerDateRange';
import {
  STATION_WISE_SCOPE_OPTIONS,
  type StationWiseFlightScope,
} from '@/features/fris/mis/mis-pages';
import {
  downloadMisStationWiseExcel,
  friendlyStationWiseError,
  getMisStationWiseStatus,
  isTransientApiDown,
} from './misStationWiseApi';
import type {
  StationWiseMonthStatus,
  StationWisePreviewFlight,
  StationWiseSheetColumn,
  StationWiseStatusPayload,
} from './misStationWiseTypes';
import { PREVIEW_INPUT_KEYS } from './misStationWiseTypes';

function readStationCode(): string {
  if (typeof window === 'undefined') return 'STN';
  return (
    localStorage.getItem('userStationCode')?.trim().toUpperCase() ||
    localStorage.getItem('stationCode')?.trim().toUpperCase() ||
    'STN'
  );
}

function ExcelLogoIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" fill="#107C41" />
      <path d="M14 2V8H20L14 2Z" fill="#33C481" />
      <path d="M7.5 11.5L9.8 15L7.3 18.5H9L10.6 16.1L12.2 18.5H13.9L11.4 15L13.7 11.5H12L10.6 13.8L9.2 11.5H7.5Z" fill="white" />
    </svg>
  );
}

function statusIcon(status: StationWiseMonthStatus['status']) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
    case 'partial':
      return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />;
    default:
      return <XCircle className="h-4 w-4 text-rose-500" aria-hidden />;
  }
}

function statusBadgeClass(status: StationWiseMonthStatus['status']): string {
  switch (status) {
    case 'complete':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'partial':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    default:
      return 'border-rose-200 bg-rose-50 text-rose-800';
  }
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** AUG26 → AUG-26 for the month chips above FLIGHT REPORT. */
function monthChipLabel(sheetName: string): string {
  const m = /^([A-Za-z]{3})(\d{2})$/.exec(sheetName.trim());
  return m ? `${m[1].toUpperCase()}-${m[2]}` : sheetName;
}

function cellText(value: string | undefined): string {
  const t = String(value ?? '').trim();
  if (!t) return '—';
  if (t === '0' || /^0(?:\.0+)?$/.test(t)) return '-';
  return t;
}

/** Pane width = page card. Body scrolls; header row stays pinned. */
function StickyPreviewTable({
  columns,
  rows,
  emptyLabel,
  fit = false,
}: {
  columns: Array<{ id: string; label: string; sub?: string; formula?: boolean }>;
  rows: Array<
    Record<string, string> & {
      __styles?: Record<string, { backgroundColor: string; color: string }>;
    }
  >;
  emptyLabel: string;
  /** Stretch columns to pane width (formula catalog). Wide sheet preview stays max-content. */
  fit?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-600">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div
      className="rounded-xl border border-slate-200"
      style={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        maxHeight: 'min(28rem, 60vh)',
        overflow: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <table
        className="text-left text-xs sm:text-sm"
        style={{
          width: fit ? '100%' : 'max-content',
          minWidth: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          tableLayout: fit ? 'fixed' : 'auto',
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={`whitespace-nowrap px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-white sm:text-[11px] ${
                  col.formula ? 'bg-emerald-900' : 'bg-emerald-800'
                }`}
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 30,
                  backgroundColor: col.formula ? '#064e3b' : '#065f46',
                  boxShadow: 'inset 0 -1px 0 rgba(6,78,59,0.45)',
                }}
              >
                <span className="block">{col.label}</span>
                {col.sub ? (
                  <span className="mt-0.5 block font-normal normal-case tracking-normal text-emerald-100/90">
                    {col.sub}
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.__key ?? String(i)}
              className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}
            >
              {columns.map((col) => {
                const cf = row.__styles?.[col.id];
                return (
                  <td
                    key={col.id}
                    className={`truncate border-b border-slate-100 px-2.5 py-2 ${
                      cf
                        ? 'font-semibold tabular-nums'
                        : col.formula
                          ? 'bg-[#f7fbe9] font-mono text-[11px] text-slate-800'
                          : 'tabular-nums text-slate-700'
                    }`}
                    style={{
                      maxWidth: fit ? undefined : '14rem',
                      ...(cf
                        ? {
                            backgroundColor: cf.backgroundColor,
                            color: cf.color,
                          }
                        : null),
                    }}
                    title={row[col.id] || undefined}
                  >
                    {cellText(row[col.id])}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildSampleRows(
  flights: StationWisePreviewFlight[],
  formulaColumns: StationWiseSheetColumn[],
): Array<
  Record<string, string> & {
    __styles?: Record<string, { backgroundColor: string; color: string }>;
  }
> {
  return flights.map((flight, i) => {
    const cells = flight.cells ?? {};
    const styles = flight.cellStyles ?? {};
    const row: Record<string, string> & {
      __styles?: Record<string, { backgroundColor: string; color: string }>;
    } = {
      __key: `${flight.serialNo}-${flight.flightNo}-${i}`,
    };
    const styleMap: Record<string, { backgroundColor: string; color: string }> =
      {};
    for (const col of PREVIEW_INPUT_KEYS) {
      row[col.key] = cells[col.letter] ?? flight[col.key] ?? '';
      const hit = styles[col.letter];
      if (hit) styleMap[col.key] = hit;
    }
    for (const col of formulaColumns) {
      row[col.letter] = cells[col.letter] ?? '';
      const hit = styles[col.letter];
      if (hit) styleMap[col.letter] = hit;
    }
    if (Object.keys(styleMap).length > 0) row.__styles = styleMap;
    return row;
  });
}

/**
 * MIS Station Wise — calendar range builds PREVIEW + one formula sheet per month.
 * Same UI for Scheduled (`fhr_collection`) and Non Schedule (`ns_fhr_collection`).
 */
export function MisStationWisePage({
  flightScope = 'scheduled',
}: {
  flightScope?: StationWiseFlightScope;
}) {
  const initialRange = useMemo(() => getPreviousMonthDateRange(), []);
  const defaultRangeRef = useRef(initialRange);
  const autoJumpedNs = useRef(false);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [monthValue, setMonthValue] = useState(() => toYearMonth(initialRange.from));
  const [stationCode, setStationCode] = useState('STN');
  const [status, setStatus] = useState<StationWiseStatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [selectedMonthId, setSelectedMonthId] = useState('all');
  const flightReportRef = useRef<HTMLElement | null>(null);
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  const scopeMeta = useMemo(
    () =>
      STATION_WISE_SCOPE_OPTIONS.find((o) => o.flightScope === flightScope) ??
      STATION_WISE_SCOPE_OPTIONS[0]!,
    [flightScope],
  );

  useEffect(() => {
    setStationCode(readStationCode());
  }, []);

  // Switching Scheduled ↔ NS must drop cached rows so counts never club together.
  useEffect(() => {
    setStatus(null);
    setError('');
    autoJumpedNs.current = false;
  }, [flightScope]);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    if (!from || !to || from > to) {
      setError('Select a valid calendar range. From date must be on or before To.');
      setStatus(null);
      return;
    }
    setLoading(true);
    setReconnecting(false);
    setError('');
    try {
      const payload = await getMisStationWiseStatus(
        { from, to, flightScope },
        {
          signal,
          onRetrying: () => {
            if (!signal?.aborted) setReconnecting(true);
          },
        },
      );
      if (signal?.aborted) return;
      setStatus(payload);
      setReconnecting(false);
      setError('');
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof Error && e.name === 'AbortError') return;
      const raw = e instanceof Error ? e.message : 'Failed to load MIS Station Wise preview.';
      setReconnecting(false);
      setError(friendlyStationWiseError(raw));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [from, to, flightScope]);

  useEffect(() => {
    const ac = new AbortController();
    void loadStatus(ac.signal);
    return () => ac.abort();
  }, [loadStatus]);

  useEffect(() => {
    if (!status) return;
    if (
      selectedMonthId !== 'all' &&
      !status.months.some((month) => month.id === selectedMonthId)
    ) {
      setSelectedMonthId('all');
    }
  }, [status, selectedMonthId]);

  // Quiet background recovery after Nest watch comes back.
  useEffect(() => {
    if (!error || !isTransientApiDown(error)) return;
    const ac = new AbortController();
    const timer = window.setInterval(() => {
      if (loadingRef.current) return;
      void loadStatus(ac.signal);
    }, 15_000);
    return () => {
      ac.abort();
      window.clearInterval(timer);
    };
  }, [error, loadStatus]);

  const applyRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setMonthValue(toYearMonth(nextFrom));
  };

  useEffect(() => {
    if (flightScope !== 'nonScheduled') return;
    if (autoJumpedNs.current) return;
    if (!status || status.summary.flights > 0) return;
    const cov = status.coverage;
    if (!cov?.latestMonthFrom || !cov.latestMonthTo) return;
    const isDefaultPrevMonth =
      from === defaultRangeRef.current.from && to === defaultRangeRef.current.to;
    if (!isDefaultPrevMonth) return;
    autoJumpedNs.current = true;
    if (from === cov.latestMonthFrom && to === cov.latestMonthTo) return;
    applyRange(cov.latestMonthFrom, cov.latestMonthTo);
  }, [status, flightScope, from, to]);

  const onMonthChange = (value: string) => {
    setMonthValue(value);
    const range = getMonthDateRange(value);
    if (!range) return;
    applyRange(range.from, range.to);
  };

  const runDownload = async () => {
    setExporting(true);
    setError('');
    setReconnecting(false);
    try {
      await downloadMisStationWiseExcel(
        { from, to, flightScope },
        {
          onRetrying: () => setReconnecting(true),
        },
      );
      setReconnecting(false);
    } catch (e) {
      setReconnecting(false);
      const raw = e instanceof Error ? e.message : 'MIS Station Wise export failed.';
      setError(friendlyStationWiseError(raw));
    } finally {
      setExporting(false);
    }
  };

  const displayStation = status?.stationLabel || stationCode;
  const title = `${displayStation} — ${scopeMeta.label}`;
  const emptyPreview = status != null && status.summary.flights === 0;
  const selectedMonth =
    status && selectedMonthId !== 'all'
      ? status.months.find((month) => month.id === selectedMonthId)
      : undefined;
  const reportAirlines = selectedMonth
    ? (selectedMonth.airlines ?? [])
    : (status?.airlines ?? []);
  const reportFlights = selectedMonth
    ? (status?.sampleFlights ?? []).filter((flight) => {
        const ymd = flight.staYmd;
        if (!ymd) return false;
        return ymd >= selectedMonth.from && ymd <= selectedMonth.to;
      })
    : (status?.sampleFlights ?? []);
  const reportAirlineCount = Math.max(0, reportAirlines.length - 1);
  const reportFlightTotal =
    selectedMonth?.flightCount ?? status?.summary.flights ?? 0;

  const selectMonthSheet = (monthId: string) => {
    setSelectedMonthId(monthId);
    window.requestAnimationFrame(() => {
      flightReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div
      className="min-h-[calc(100vh-5rem)] min-w-0 bg-emerald-50"
      style={{ maxWidth: '100%', overflowX: 'clip' }}
    >
      <div className="mx-auto w-full min-w-0 max-w-6xl overflow-x-clip px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader title={title} icon={Building2} />

        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[9.5rem] flex-1 flex-col gap-1 text-sm font-medium text-slate-700 sm:max-w-[11rem]">
                From
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setMonthValue(toYearMonth(e.target.value));
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex min-w-[9.5rem] flex-1 flex-col gap-1 text-sm font-medium text-slate-700 sm:max-w-[11rem]">
                To
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex min-w-[10rem] flex-col gap-1 text-sm font-medium text-slate-700">
                Jump to month
                <input
                  type="month"
                  value={monthValue}
                  onChange={(e) => onMonthChange(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    const range = getPreviousMonthDateRange();
                    applyRange(range.from, range.to);
                  }}
                >
                  Previous month
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    const range = getCurrentMonthDateRange();
                    applyRange(range.from, range.to);
                  }}
                >
                  Current month
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => void loadStatus()}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  )}
                  Refresh
                </button>
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void runDownload()}
              disabled={exporting || loading}
              aria-label="Download MIS Station Wise Excel workbook"
            >
              {exporting ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <ExcelLogoIcon className="h-5 w-5" />
              )}
              <Download className="h-4 w-4" aria-hidden />
              Download workbook
            </button>
          </div>

          {status ? (
            <p className="mt-3 text-sm text-slate-600">
              {status.flightScopeLabel ?? scopeMeta.label} · {status.stationLabel} ·{' '}
              {status.rangeLabel} · {status.summary.flights} flights ·{' '}
              {status.summary.months} month sheet{status.summary.months === 1 ? '' : 's'} ·{' '}
              {status.summary.airlines} airlines
              {status.summary.formulaColumns != null
                ? ` · ${status.summary.formulaColumns} formula cols`
                : ''}
            </p>
          ) : null}
          {reconnecting ? (
            <p className="mt-3 text-sm font-medium text-amber-800" role="status">
              Connecting to API… Nest may be restarting. Preview will load automatically.
            </p>
          ) : null}
          {error && !reconnecting ? (
            <p className="mt-3 text-sm font-medium text-rose-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {loading && !status ? (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-8 text-sm text-slate-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" aria-hidden />
            Building calendar preview…
          </div>
        ) : null}

        {status ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-4">
            <section
              className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
              aria-label="Preview performance report"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Preview sheet</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Whole-range performance. Excel PREVIEW sheet sums the same metrics from each month tab.
                  </p>
                </div>
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  <CalendarRange className="mr-1 h-3 w-3" aria-hidden />
                  {status.rangeLabel}
                </Badge>
              </div>

              {emptyPreview ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                  <p>
                    {flightScope === 'nonScheduled'
                      ? 'No non-scheduled FHR flights on STA dates in this window (ns_fhr_collection).'
                      : 'No FHR flights in this STA window.'}{' '}
                    Workbook still downloads with PREVIEW plus empty month sheets and live formulas.
                  </p>
                  {flightScope === 'nonScheduled' &&
                  status.coverage?.latestMonthFrom &&
                  status.coverage.latestMonthTo ? (
                    <button
                      type="button"
                      className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
                      onClick={() =>
                        applyRange(
                          status.coverage!.latestMonthFrom!,
                          status.coverage!.latestMonthTo!,
                        )
                      }
                    >
                      Open {status.coverage.latestMonthLabel ?? 'latest NS month'}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col />
                      <col className="w-24" />
                      <col className="w-24" />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-emerald-900/30 bg-emerald-800 text-left text-xs uppercase tracking-wide text-white">
                        <th className="bg-emerald-800 px-3 py-2.5 font-semibold">Metric</th>
                        <th className="bg-emerald-800 px-3 py-2.5 text-right font-semibold">Flt</th>
                        <th className="bg-emerald-800 px-3 py-2.5 text-right font-semibold">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.preview.map((row) => (
                        <tr
                          key={row.key}
                          className={
                            row.key === 'total'
                              ? 'border-t border-slate-200 bg-slate-50 font-semibold text-slate-900'
                              : 'border-b border-slate-100 text-slate-700'
                          }
                        >
                          <td className="truncate px-3 py-2">{row.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.count === 0 ? '-' : row.count.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.count === 0 ? '-' : formatPct(row.percent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
              aria-label="Month-wise sheets"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">Month-wise sheets</h2>
                <p className="text-xs text-slate-500">
                  One tab per calendar month. Partial months follow the From / To clip.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {status.months.map((sheet) => (
                  <article
                    key={sheet.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      selectedMonthId === sheet.id
                        ? 'border-emerald-300 bg-emerald-50/80 ring-1 ring-emerald-200'
                        : 'border-slate-100 bg-slate-50/60'
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {statusIcon(sheet.status)}
                        <button
                          type="button"
                          onClick={() => selectMonthSheet(sheet.id)}
                          className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                        >
                          {monthChipLabel(sheet.sheetName)}
                        </button>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(sheet.status)}`}
                      >
                        {sheet.status}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-700">{sheet.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{sheet.message}</p>
                    <p className="mt-2 text-xs tabular-nums text-slate-500">
                      {sheet.from} → {sheet.to} · {sheet.flightCount} rows
                    </p>
                  </article>
                ))}
              </div>
            </section>

            {status.airlines.length > 0 || status.months.length > 0 ? (
              <section
                ref={flightReportRef}
                id="mis-flight-report"
                className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
                aria-label="Airline preview"
              >
                <div
                  className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1"
                  role="tablist"
                  aria-label="Month-wise flight report"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedMonthId === 'all'}
                    onClick={() => setSelectedMonthId('all')}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                      selectedMonthId === 'all'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    All
                  </button>
                  {status.months.map((sheet) => {
                    const active = selectedMonthId === sheet.id;
                    return (
                      <button
                        key={sheet.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => selectMonthSheet(sheet.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                          active
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                        }`}
                      >
                        {monthChipLabel(sheet.sheetName)}
                        <span className={active ? 'ml-1.5 font-medium opacity-80' : 'ml-1.5 font-medium text-slate-500'}>
                          {sheet.flightCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {selectedMonth
                      ? `${selectedMonth.label} sheet — same EM–FA block as Excel.`
                      : 'Same airline block as Excel EM–FA for the full From / To range.'}{' '}
                    Zeros show as -. Scroll horizontally; header stays fixed.
                  </p>
                  <Badge className="border-sky-200 bg-sky-50 text-sky-900">
                    {reportAirlineCount} airlines
                  </Badge>
                </div>
                <div
                  className="rounded-xl border border-slate-200"
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    maxHeight: 'min(28rem, 60vh)',
                    overflow: 'auto',
                    overscrollBehavior: 'contain',
                  }}
                >
                  <table
                    className="text-left text-xs sm:text-sm"
                    style={{
                      width: 'max-content',
                      minWidth: '100%',
                      borderCollapse: 'separate',
                      borderSpacing: 0,
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          colSpan={(status.airlineReportColumns?.length ?? 0) + 1}
                          className="px-2 py-2.5 text-center text-lg font-normal tracking-wide text-[#002060]"
                          style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 41,
                            backgroundColor: '#CDF2FF',
                            fontFamily: '"Times New Roman", Times, serif',
                          }}
                        >
                          FLIGHT REPORT
                        </th>
                      </tr>
                      <tr>
                        <th
                          className="px-2.5 py-2.5 text-center text-[10px] font-semibold leading-tight text-[#002060] sm:text-[11px]"
                          style={{
                            position: 'sticky',
                            top: '2.75rem',
                            left: 0,
                            zIndex: 40,
                            backgroundColor: '#CDF2FF',
                            boxShadow: 'inset -1px -1px 0 rgba(148,163,184,0.5)',
                          }}
                        >
                          Flight category and airline
                        </th>
                        {(status.airlineReportColumns ?? []).map((col) => (
                          <th
                            key={col.key}
                            className="max-w-[8.5rem] whitespace-normal px-2 py-2 text-center text-[10px] font-semibold leading-tight sm:text-[11px]"
                            style={{
                              position: 'sticky',
                              top: '2.75rem',
                              zIndex: 30,
                              backgroundColor:
                                col.tone === 'timing'
                                  ? '#F8CBAD'
                                  : col.tone === 'gha'
                                    ? '#F4CCCC'
                                    : '#FFFFFF',
                              color:
                                col.tone === 'xxld'
                                  ? '#FF0000'
                                  : col.tone === 'otp'
                                    ? '#0070C0'
                                    : '#002060',
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportAirlines.map((row, i) => {
                        const isCombined = row.name === 'COMBINED';
                        return (
                          <tr
                            key={row.name}
                            className={
                              isCombined
                                ? 'bg-sky-50/80 font-semibold'
                                : i % 2 === 0
                                  ? 'bg-white'
                                  : 'bg-slate-50/80'
                            }
                          >
                            <td
                              className={`sticky left-0 z-10 whitespace-nowrap border-b border-slate-100 px-2.5 py-2 text-slate-900 ${
                                isCombined ? 'bg-sky-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                              }`}
                            >
                              {row.name}
                            </td>
                            {(status.airlineReportColumns ?? []).map((col) => {
                              const value = row.metrics?.[col.key] ?? 0;
                              return (
                                <td
                                  key={col.key}
                                  className={`border-b border-slate-100 px-2 py-2 text-center tabular-nums ${
                                    col.tone === 'xxld' && value > 0
                                      ? 'font-semibold text-rose-600'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {value === 0 ? '-' : value.toLocaleString()}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {status.formulaColumns?.length ? (
              <details className="group min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50/80 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-emerald-700 transition-transform duration-200 group-open:rotate-180"
                        aria-hidden
                      />
                      <h2 className="text-base font-semibold text-slate-900">
                        Formula columns on each month sheet
                      </h2>
                    </span>
                    <span className="mt-1 block pl-6 text-xs text-slate-500">
                      <span className="group-open:hidden">
                        Reference list of Excel columns. Open to inspect headers and formulas.
                      </span>
                      <span className="hidden group-open:inline">
                        {status.summary.formulaColumns} live Excel formulas on every data row (same
                        pattern as the MAA bird report).
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge className="border-teal-200 bg-teal-50 text-teal-900">
                      {status.summary.inputColumns} input + {status.summary.formulaColumns} formula
                    </Badge>
                    <span className="text-xs font-medium text-emerald-700">
                      <span className="group-open:hidden">Show</span>
                      <span className="hidden group-open:inline">Hide</span>
                    </span>
                  </span>
                </summary>
                <div
                  id="mis-formula-columns-panel"
                  className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-6 sm:pb-6"
                >
                  <StickyPreviewTable
                    fit
                    columns={[
                      { id: 'letter', label: 'Col' },
                      { id: 'label', label: 'Header' },
                      { id: 'group', label: 'Group' },
                      { id: 'formulaSample', label: 'Formula (row 4)', formula: true },
                    ]}
                    rows={status.formulaColumns.map((c) => ({
                      __key: c.letter,
                      letter: c.letter,
                      label: c.label,
                      group: c.group,
                      formulaSample: c.formulaSample ?? '—',
                    }))}
                    emptyLabel="No formula columns registered."
                  />
                </div>
              </details>
            ) : null}

            {reportFlights.length > 0 ? (
              <section
                className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
                aria-label="Sheet preview rows"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700" aria-hidden />
                  <h2 className="text-base font-semibold text-slate-900">Sheet preview</h2>
                </div>
                <p className="mb-3 text-xs text-slate-500">
                  Same schema as MAA bird report: A–T from FHR, U→ formula results evaluated for preview
                  and cached on download. Conditional formatting matches Excel (flags / buckets / GT ADDED).
                  Sticky header matches Excel freeze (scroll any direction). Showing{' '}
                  {reportFlights.length} of {reportFlightTotal} flight rows
                  {selectedMonth ? ` in ${monthChipLabel(selectedMonth.sheetName)}` : ''}.
                </p>
                {status.conditionalFormats?.length ? (
                  <ul
                    className="mb-3 flex flex-wrap gap-2"
                    aria-label="Conditional formatting legend"
                  >
                    {status.conditionalFormats.map((rule) => (
                      <li
                        key={rule.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium"
                        style={{ backgroundColor: rule.fill, color: rule.color }}
                        title={`${rule.fromCol}:${rule.toCol} ${rule.operator} ${rule.value}`}
                      >
                        <span className="font-mono opacity-80">
                          {rule.fromCol}
                          {rule.fromCol === rule.toCol ? '' : `–${rule.toCol}`}
                        </span>
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <StickyPreviewTable
                  columns={[
                    ...PREVIEW_INPUT_KEYS.map((c) => ({
                      id: c.key,
                      label: c.label,
                      sub: c.letter,
                    })),
                    ...(status.formulaColumns ?? []).map((c) => ({
                      id: c.letter,
                      label: c.label,
                      sub: c.letter,
                      formula: true,
                    })),
                  ]}
                  rows={buildSampleRows(reportFlights, status.formulaColumns ?? [])}
                  emptyLabel="No flights in this range."
                />
              </section>
            ) : null}

            {loading ? (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Refreshing preview…
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
