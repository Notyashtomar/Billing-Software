'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { Badge } from '@/components/ui/badge';
import {
  getCurrentMonthDateRange,
  getPreviousMonthDateRange,
  toYearMonth,
} from '@/components/billing/output/misCheckerDateRange';
import {
  downloadMisRemarksExcel,
  friendlyStationWiseError,
  getMisRemarksStatus,
  isTransientApiDown,
} from './misRemarksApi';
import type {
  RemarksAirlineSummary,
  RemarksMonthBlock,
  RemarksPreviewFlight,
  RemarksStatusPayload,
} from './misRemarksTypes';

const FLIGHT_FILTER_COLS = [
  { key: 'serialNo', label: 'SerialNo', kind: 'text' },
  { key: 'airline', label: 'Airline', kind: 'select' },
  { key: 'flightNo', label: 'FlightNo', kind: 'text' },
  { key: 'typeCraft', label: 'TypeCraft', kind: 'select' },
  { key: 'ataTime', label: 'ATATime', kind: 'text' },
  { key: 'ataDate', label: 'ATADate', kind: 'text' },
  { key: 'airRep', label: 'AirRep', kind: 'select' },
  { key: 'airRepRem', label: 'AirRepRem', kind: 'text' },
  { key: 'ratingValue', label: 'RateingValue', kind: 'select' },
] as const;

type FlightFilterKey = (typeof FLIGHT_FILTER_COLS)[number]['key'];
type FlightColFilters = Record<FlightFilterKey, string>;

const EMPTY_COL_FILTERS: FlightColFilters = {
  serialNo: '',
  airline: '',
  flightNo: '',
  typeCraft: '',
  ataTime: '',
  ataDate: '',
  airRep: '',
  airRepRem: '',
  ratingValue: '',
};

function flightField(flight: RemarksPreviewFlight, key: FlightFilterKey): string {
  return String(flight[key] ?? '').trim();
}

function uniqueColValues(rows: RemarksPreviewFlight[], key: FlightFilterKey): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const value = flightField(row, key);
    set.add(value || 'Blanks');
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

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
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" fill="#107C41" />
      <path d="M14 2V8H20L14 2Z" fill="#33C481" />
      <path d="M7.5 11.5L9.8 15L7.3 18.5H9L10.6 16.1L12.2 18.5H13.9L11.4 15L13.7 11.5H12L10.6 13.8L9.2 11.5H7.5Z" fill="white" />
    </svg>
  );
}

function formatPct(value: number): string {
  if (!value) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

/** Month-sheet / Excel rule: zero count → dash. */
function dashZero(n: number | undefined): string {
  if (!n) return '—';
  return String(n);
}

function hexCss(argb?: string): string | undefined {
  if (!argb || argb.length < 8) return undefined;
  return `#${argb.slice(2)}`;
}

function statusIcon(status: RemarksMonthBlock['status']) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
    case 'partial':
      return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />;
    default:
      return <XCircle className="h-4 w-4 text-rose-500" aria-hidden />;
  }
}

const RATING_BAR_KEYS = [
  'notSatisfactory',
  'belowAverage',
  'satisfactory',
  'good',
  'excellent',
  'blanks',
] as const;

function ratingTone(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('not satisfactory')) return 'bg-rose-100 text-rose-900 border-rose-200';
  if (lower.includes('below')) return 'bg-amber-100 text-amber-950 border-amber-200';
  if (lower.includes('excellent')) return 'bg-emerald-100 text-emerald-900 border-emerald-200';
  if (lower === 'good') return 'bg-lime-100 text-lime-900 border-lime-200';
  if (lower.includes('satisfactory')) return 'bg-yellow-50 text-yellow-950 border-yellow-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

export function MisRemarksPage() {
  const initialRange = useMemo(() => getPreviousMonthDateRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [monthValue, setMonthValue] = useState(() => toYearMonth(initialRange.from));
  const [stationCode, setStationCode] = useState('STN');
  const [status, setStatus] = useState<RemarksStatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [selectedMonthId, setSelectedMonthId] = useState<string>('ALL');
  const [flightSearch, setFlightSearch] = useState('');
  const [colFilters, setColFilters] = useState<FlightColFilters>(EMPTY_COL_FILTERS);

  useEffect(() => {
    setStationCode(readStationCode());
  }, []);

  const applyRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setMonthValue(toYearMonth(nextFrom));
  };

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      if (!from || !to || from > to) {
        setError('Select a valid calendar range. From date must be on or before To.');
        setStatus(null);
        return;
      }
      setLoading(true);
      setReconnecting(false);
      setError('');
      try {
        const payload = await getMisRemarksStatus({ from, to }, { signal });
        if (signal?.aborted) return;
        setStatus(payload);
        setSelectedMonthId((prev) => {
          if (prev === 'ALL') return prev;
          return payload.months.some((m) => m.id === prev) ? prev : 'ALL';
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : String(e);
        if (isTransientApiDown(msg)) {
          setReconnecting(true);
          setError(friendlyStationWiseError(msg));
        } else {
          setError(friendlyStationWiseError(msg));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [from, to],
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadStatus(ac.signal);
    return () => ac.abort();
  }, [loadStatus]);

  const runDownload = async () => {
    setExporting(true);
    setError('');
    try {
      await downloadMisRemarksExcel({ from, to });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(friendlyStationWiseError(msg));
    } finally {
      setExporting(false);
    }
  };

  const activeMonth: RemarksMonthBlock | null =
    status && selectedMonthId !== 'ALL'
      ? (status.months.find((m) => m.id === selectedMonthId) ?? null)
      : null;

  const airlineRows: RemarksAirlineSummary[] = activeMonth
    ? activeMonth.airlines
    : (status?.airlines ?? []);

  const airlineTotals: RemarksAirlineSummary | null = activeMonth
    ? activeMonth.totals
    : (status?.totals ?? null);

  const monthFlights = useMemo(() => {
    if (!status) return [];
    return selectedMonthId === 'ALL'
      ? status.sampleFlights
      : status.sampleFlights.filter((f) => f.staYmd.startsWith(selectedMonthId));
  }, [status, selectedMonthId]);

  const previewFlights = useMemo(() => {
    const q = flightSearch.trim().toLowerCase();
    return monthFlights.filter((flight) => {
      if (q) {
        const hay = FLIGHT_FILTER_COLS.map((col) => flightField(flight, col.key))
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const col of FLIGHT_FILTER_COLS) {
        const raw = colFilters[col.key].trim();
        if (!raw) continue;
        const value = flightField(flight, col.key);
        if (col.kind === 'select') {
          if (raw === 'Blanks') {
            if (value) return false;
          } else if (value !== raw) {
            return false;
          }
        } else if (!value.toLowerCase().includes(raw.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [monthFlights, flightSearch, colFilters]);

  const filtersActive =
    flightSearch.trim() !== '' ||
    FLIGHT_FILTER_COLS.some((col) => colFilters[col.key].trim() !== '');

  useEffect(() => {
    setFlightSearch('');
    setColFilters(EMPTY_COL_FILTERS);
  }, [selectedMonthId, status?.from, status?.to]);

  const title = `${status?.stationLabel || stationCode} — MIS Remarks`;

  return (
    <div className="min-w-0 max-w-full bg-emerald-50 pb-24">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-4 pb-20 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader title={title} icon={MessageSquareText} />

        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[9.5rem] flex-1 flex-col gap-1 text-sm font-medium text-slate-700 sm:max-w-[11rem]">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => applyRange(e.target.value, to)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </label>
              <label className="flex min-w-[9.5rem] flex-1 flex-col gap-1 text-sm font-medium text-slate-700 sm:max-w-[11rem]">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => applyRange(from, e.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </label>
              <label className="flex min-w-[9.5rem] flex-1 flex-col gap-1 text-sm font-medium text-slate-700 sm:max-w-[11rem]">
                Month jump
                <input
                  type="month"
                  value={monthValue}
                  onChange={(e) => {
                    const ym = e.target.value;
                    if (!ym) return;
                    setMonthValue(ym);
                    const [y, m] = ym.split('-').map(Number);
                    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
                    applyRange(
                      `${ym}-01`,
                      `${ym}-${String(last).padStart(2, '0')}`,
                    );
                  }}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </label>
              <div className="flex flex-wrap gap-2 pb-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const r = getPreviousMonthDateRange();
                    applyRange(r.from, r.to);
                  }}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Last month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const r = getCurrentMonthDateRange();
                    applyRange(r.from, r.to);
                  }}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  This month
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadStatus()}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void runDownload()}
                disabled={exporting || loading || !status}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ExcelLogoIcon />
                    <Download className="h-4 w-4" />
                  </>
                )}
                Download Excel
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Station-scoped to your login ({status?.stationCode || stationCode}). Flight list and
            airline summary match MIS_REMARKS month sheets (A–H + J–S).
          </p>

          {error ? (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            >
              {error}
              {reconnecting ? ' Retrying…' : null}
            </div>
          ) : null}
        </div>

        {loading && !status ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-200 bg-white/80 py-16 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            Loading remarks for your station…
          </div>
        ) : null}

        {status ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Flights', value: status.summary.flights },
                { label: 'Airlines', value: status.summary.airlines },
                { label: 'Comments', value: status.summary.comments },
                { label: 'Months', value: status.summary.months },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-sm"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            <section className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Rating summary</h2>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  {status.rangeLabel}
                </Badge>
              </div>

              {(() => {
                const mix = status.ratingPreview.filter((row) =>
                  (RATING_BAR_KEYS as readonly string[]).includes(row.key),
                );
                const mixTotal = mix.reduce((sum, row) => sum + row.count, 0);
                return (
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Rating mix
                      </p>
                      <p className="text-[11px] tabular-nums text-slate-500">
                        {mixTotal ? `${mixTotal} flights` : 'No ratings'}
                      </p>
                    </div>
                    <div
                      className="flex h-3.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80"
                      role="img"
                      aria-label={
                        mixTotal
                          ? mix
                              .filter((row) => row.count > 0)
                              .map((row) => `${row.label} ${formatPct(row.percent)}`)
                              .join(', ')
                          : 'No rating mix'
                      }
                    >
                      {mixTotal === 0 ? (
                        <span className="sr-only">Empty</span>
                      ) : (
                        mix.map((row) => {
                          if (!row.count) return null;
                          const widthPct = Math.max(row.percent * 100, 1.25);
                          return (
                            <span
                              key={row.key}
                              title={`${row.label}: ${row.count} (${formatPct(row.percent)})`}
                              className="h-full min-w-[3px] transition-[width] duration-300 ease-out"
                              style={{
                                width: `${widthPct}%`,
                                backgroundColor: hexCss(row.fillArgb) ?? '#94a3b8',
                              }}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {status.ratingPreview.map((row) => {
                  const barPct = Math.min(100, Math.max(0, row.percent * 100));
                  const barColor = hexCss(row.fillArgb) ?? '#10b981';
                  return (
                    <div
                      key={row.key}
                      className="rounded-xl border border-slate-100 px-3 py-2.5"
                      style={{
                        backgroundColor: hexCss(row.fillArgb)
                          ? `${hexCss(row.fillArgb)}22`
                          : undefined,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium leading-5 text-slate-800">
                          {row.label}
                        </span>
                        <span className="text-right">
                          <span className="block text-base font-semibold tabular-nums text-slate-900">
                            {dashZero(row.count)}
                          </span>
                          <span className="text-xs tabular-nums text-slate-500">
                            {formatPct(row.percent)}
                          </span>
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80 ring-1 ring-black/5"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(barPct)}
                        aria-label={`${row.label} share`}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-300 ease-out"
                          style={{
                            width: row.count ? `${Math.max(barPct, 4)}%` : '0%',
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-sm font-semibold text-slate-900">Month sheets</h2>
                <button
                  type="button"
                  onClick={() => setSelectedMonthId('ALL')}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    selectedMonthId === 'ALL'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All months
                </button>
                {status.months.map((month) => (
                  <button
                    key={month.id}
                    type="button"
                    onClick={() => setSelectedMonthId(month.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                      selectedMonthId === month.id
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {statusIcon(month.status)}
                    {month.sheetName}
                    <span className="opacity-80">({month.flightCount})</span>
                  </button>
                ))}
              </div>
              {activeMonth ? (
                <p className="mb-3 text-xs text-slate-500">{activeMonth.message}</p>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-amber-50 text-xs uppercase tracking-wide text-slate-600">
                      {(status.summaryColumns ?? []).map((col) => (
                        <th
                          key={col.key}
                          className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold"
                          style={{ backgroundColor: hexCss(col.fillArgb) }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {airlineRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={status.summaryColumns.length || 1}
                          className="px-3 py-8 text-center text-slate-500"
                        >
                          No airline rows for this window.
                        </td>
                      </tr>
                    ) : (
                      airlineRows.map((row) => (
                        <tr key={row.airline} className="odd:bg-white even:bg-slate-50/60">
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                            {row.airline}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{dashZero(row.fltCount)}</td>
                          <td className="px-3 py-2 tabular-nums">{dashZero(row.arlComnt)}</td>
                          <td className="px-3 py-2 tabular-nums">{formatPct(row.comntPct)}</td>
                          <td className="px-3 py-2 tabular-nums">{dashZero(row.notSatisfactory)}</td>
                          <td className="px-3 py-2 tabular-nums">{dashZero(row.belowAverage)}</td>
                          <td className="px-3 py-2 tabular-nums">{dashZero(row.satisfactory)}</td>
                          <td className="px-3 py-2 tabular-nums">{dashZero(row.good)}</td>
                          <td className="px-3 py-2 tabular-nums">{dashZero(row.excellent)}</td>
                          <td className="px-3 py-2 tabular-nums">{dashZero(row.blanks)}</td>
                        </tr>
                      ))
                    )}
                    {airlineTotals ? (
                      <tr className="border-t border-slate-200 bg-emerald-50/80 font-semibold">
                        <td className="px-3 py-2">{airlineTotals.airline}</td>
                        <td className="px-3 py-2 tabular-nums">{dashZero(airlineTotals.fltCount)}</td>
                        <td className="px-3 py-2 tabular-nums">{dashZero(airlineTotals.arlComnt)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatPct(airlineTotals.comntPct)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{dashZero(airlineTotals.notSatisfactory)}</td>
                        <td className="px-3 py-2 tabular-nums">{dashZero(airlineTotals.belowAverage)}</td>
                        <td className="px-3 py-2 tabular-nums">{dashZero(airlineTotals.satisfactory)}</td>
                        <td className="px-3 py-2 tabular-nums">{dashZero(airlineTotals.good)}</td>
                        <td className="px-3 py-2 tabular-nums">{dashZero(airlineTotals.excellent)}</td>
                        <td className="px-3 py-2 tabular-nums">{dashZero(airlineTotals.blanks)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-8 flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Flight preview</h2>
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-xl">
                  <label className="relative min-w-[12rem] flex-1">
                    <span className="sr-only">Search flights</span>
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={flightSearch}
                      onChange={(e) => setFlightSearch(e.target.value)}
                      placeholder="Search serial, airline, AirRep, remarks…"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </label>
                  {filtersActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFlightSearch('');
                        setColFilters(EMPTY_COL_FILTERS);
                      }}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                Showing {previewFlights.length} of {monthFlights.length}
                {status.summary.flights > monthFlights.length ? ' · rest in Excel' : ''}
                · filter each column below
              </p>
              <div
                className="min-w-0 overflow-y-scroll overflow-x-hidden rounded-lg border border-slate-200"
                style={{
                  height: 'min(70vh, calc(100dvh - 16rem))',
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                }}
                tabIndex={0}
                aria-label="Flight preview table. Scroll up and down for all rows."
              >
                <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
                  <colgroup>
                    <col className="w-[8%]" />
                    <col className="w-[12%]" />
                    <col className="w-[11%]" />
                    <col className="w-[10%]" />
                    <col className="w-[7%]" />
                    <col className="w-[8%]" />
                    <col className="w-[12%]" />
                    <col className="w-[18%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-amber-50 text-[10px] uppercase tracking-wide text-slate-600 sm:text-xs">
                      {FLIGHT_FILTER_COLS.map((col) => (
                        <th key={col.key} className="px-1.5 py-1.5 align-bottom font-semibold sm:px-2">
                          <span className="mb-1 block">{col.label}</span>
                          {col.kind === 'select' ? (
                            <select
                              aria-label={`Filter ${col.label}`}
                              value={colFilters[col.key]}
                              onChange={(e) =>
                                setColFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                              }
                              className="h-7 w-full rounded border border-slate-200 bg-white px-1 text-[10px] font-normal normal-case tracking-normal text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                            >
                              <option value="">All</option>
                              {uniqueColValues(monthFlights, col.key).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="search"
                              aria-label={`Filter ${col.label}`}
                              value={colFilters[col.key]}
                              onChange={(e) =>
                                setColFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                              }
                              placeholder="Filter"
                              className="h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-[10px] font-normal normal-case tracking-normal text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewFlights.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                          {monthFlights.length === 0
                            ? 'No flights with STA in this range for your station.'
                            : 'No rows match search or column filters.'}
                        </td>
                      </tr>
                    ) : (
                      previewFlights.map((flight, idx) => (
                        <tr
                          key={`${flight.serialNo}-${flight.flightNo}-${idx}`}
                          className="odd:bg-white even:bg-slate-50/60 align-top"
                        >
                          <td className="break-all px-1.5 py-2 tabular-nums text-slate-700 sm:px-2">
                            {flight.serialNo || '—'}
                          </td>
                          <td className="break-words px-1.5 py-2 font-medium text-slate-900 sm:px-2">
                            {flight.airline || '—'}
                          </td>
                          <td className="break-all px-1.5 py-2 sm:px-2">{flight.flightNo || '—'}</td>
                          <td className="break-words px-1.5 py-2 sm:px-2">
                            {flight.typeCraft || '—'}
                          </td>
                          <td className="break-all px-1.5 py-2 tabular-nums sm:px-2">
                            {flight.ataTime || '—'}
                          </td>
                          <td className="break-all px-1.5 py-2 tabular-nums sm:px-2">
                            {flight.ataDate || '—'}
                          </td>
                          <td className="break-words px-1.5 py-2 font-medium text-slate-800 sm:px-2">
                            {flight.airRep?.trim() ? (
                              flight.airRep
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="break-words px-1.5 py-2 text-slate-800 sm:px-2">
                            {flight.airRepRem?.trim() ? (
                              flight.airRepRem
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-1.5 py-2 sm:px-2">
                            {flight.ratingValue ? (
                              <span
                                className={`inline-flex max-w-full whitespace-normal rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4 sm:text-xs ${ratingTone(flight.ratingValue)}`}
                              >
                                {flight.ratingValue}
                              </span>
                            ) : (
                              <span className="text-slate-400">Blanks</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
