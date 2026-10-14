'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { Badge } from '@/components/ui/badge';
import {
  getCurrentMonthDateRange,
  getPreviousMonthDateRange,
  toYearMonth,
} from '@/components/billing/output/misCheckerDateRange';
import type { StationWiseFlightScope } from '@/features/fris/mis/mis-pages';
import {
  downloadMisMonthWiseExcel,
  friendlyStationWiseError,
  getMisMonthWiseStatus,
  isTransientApiDown,
} from './misMonthWiseApi';
import type { MonthWiseAirlineBlock, MonthWiseStatusPayload } from './misMonthWiseTypes';

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
  return `${(value * 100).toFixed(1)}%`;
}

function dashZero(n: number | undefined): string {
  if (!n) return '—';
  return String(n);
}

function hexCss(argb?: string): string | undefined {
  if (!argb || argb.length < 8) return undefined;
  return `#${argb.slice(2)}`;
}

export function MisMonthWisePage({
  flightScope = 'scheduled',
}: {
  flightScope?: StationWiseFlightScope;
}) {
  const initialRange = useMemo(() => getPreviousMonthDateRange(), []);
  const autoJumpedNs = useRef(false);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [monthValue, setMonthValue] = useState(() => toYearMonth(initialRange.from));
  const [stationCode, setStationCode] = useState('STN');
  const [status, setStatus] = useState<MonthWiseStatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [selectedAirline, setSelectedAirline] = useState('COMBINED');

  useEffect(() => {
    setStationCode(readStationCode());
  }, []);

  useEffect(() => {
    setStatus(null);
    setError('');
    autoJumpedNs.current = false;
    setSelectedAirline('COMBINED');
  }, [flightScope]);

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
        const payload = await getMisMonthWiseStatus(
          { from, to, flightScope },
          { signal },
        );
        if (signal?.aborted) return;
        setStatus(payload);
        setSelectedAirline((prev) => {
          if (prev === 'COMBINED') return prev;
          return payload.airlines.some((a) => a.name === prev) ? prev : 'COMBINED';
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
    [from, to, flightScope],
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadStatus(ac.signal);
    return () => ac.abort();
  }, [loadStatus]);

  useEffect(() => {
    if (
      flightScope !== 'nonScheduled' ||
      autoJumpedNs.current ||
      !status ||
      status.summary.flights > 0
    ) {
      return;
    }
    const jumpFrom = status.coverage?.latestMonthFrom;
    const jumpTo = status.coverage?.latestMonthTo;
    if (!jumpFrom || !jumpTo) return;
    autoJumpedNs.current = true;
    applyRange(jumpFrom, jumpTo);
  }, [flightScope, status]);

  const runDownload = async () => {
    setExporting(true);
    setError('');
    try {
      await downloadMisMonthWiseExcel({ from, to, flightScope });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(friendlyStationWiseError(msg));
    } finally {
      setExporting(false);
    }
  };

  const title = `${status?.stationLabel || stationCode} — ${
    flightScope === 'nonScheduled'
      ? 'MIS - Non Schedule Month Wise'
      : 'MIS - Scheduled Month Wise'
  }`;

  const selectedBlock: MonthWiseAirlineBlock | null = status
    ? selectedAirline === 'COMBINED'
      ? status.combined
      : (status.airlines.find((a) => a.name === selectedAirline) ?? status.combined)
    : null;

  const previewRows = selectedBlock
    ? status!.preview.map((row) => {
        const count = selectedBlock.performance[row.key as keyof MonthWiseAirlineBlock['performance']] ?? 0;
        const denom = selectedBlock.performance.total;
        return {
          ...row,
          count,
          percent: row.key === 'total' ? (denom <= 0 ? 0 : 1) : denom <= 0 ? 0 : count / denom,
        };
      })
    : [];

  return (
    <div className="min-h-[calc(100vh-5rem)] min-w-0 bg-emerald-50" style={{ maxWidth: '100%', overflowX: 'clip' }}>
      <div className="mx-auto w-full min-w-0 max-w-6xl overflow-x-clip px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader title={title} icon={CalendarRange} />

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
                  onChange={(e) => {
                    const ym = e.target.value;
                    setMonthValue(ym);
                    const [y, m] = ym.split('-').map(Number);
                    if (!y || !m) return;
                    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
                    applyRange(`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`);
                  }}
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
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                  Refresh
                </button>
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void runDownload()}
              disabled={exporting || loading}
            >
              {exporting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ExcelLogoIcon className="h-5 w-5" />}
              <Download className="h-4 w-4" aria-hidden />
              Download workbook
            </button>
          </div>
          {status ? (
            <p className="mt-3 text-sm text-slate-600">
              {status.flightScopeLabel} · {status.stationLabel} · {status.rangeLabel} ·{' '}
              {status.summary.airlines} airlines · {status.summary.months} months · TOTAL = cancelled + late STA + arrived before STA
            </p>
          ) : null}
          {reconnecting ? (
            <p className="mt-3 text-sm font-medium text-amber-800" role="status">
              Connecting to API… Nest may be restarting.
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
            Building airline month-wise preview…
          </div>
        ) : null}

        {status ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-4">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Performance report</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Same identities as Station Wise FG / LH V7–V14 for {selectedBlock?.name ?? 'COMBINED'}.
                  </p>
                </div>
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  {status.rangeLabel}
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4">Metric</th>
                      <th className="py-2 pr-4">Flt</th>
                      <th className="py-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.key} className="border-b border-slate-100">
                        <td className={`py-2 pr-4 ${row.key === 'total' ? 'font-semibold' : ''}`}>{row.label}</td>
                        <td className="py-2 pr-4 tabular-nums">{dashZero(row.count)}</td>
                        <td className="py-2 tabular-nums">{formatPct(row.percent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-slate-900">Airlines at this station</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Only airlines with flights in this station&apos;s FHR for the
                selected dates (same filter as Station Wise). Sheet tabs use codes.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAirline('COMBINED')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    selectedAirline === 'COMBINED'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  COMBINED
                </button>
                {status.airlines.map((airline) => (
                  <button
                    key={airline.name}
                    type="button"
                    onClick={() => setSelectedAirline(airline.name)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      selectedAirline === airline.name
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {airline.code ? `${airline.code} · ${airline.name}` : airline.name}
                  </button>
                ))}
              </div>
            </section>

            {selectedBlock ? (
              <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-base font-semibold text-slate-900">
                  {selectedBlock.name} · month sheet preview
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Excel tab `{selectedBlock.sheetName}`. TOTAL column is B+C+H (cancelled + late STA + arrived before STA).
                </p>
                <div className="mt-3 max-h-[min(32rem,65vh)] overflow-auto rounded-xl border border-slate-200">
                  <table className="text-left text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        <th className="sticky top-0 z-10 bg-sky-600 px-2 py-2 font-semibold text-white">MONTH</th>
                        {status.columns.map((col) => (
                          <th
                            key={col.key}
                            className="sticky top-0 z-10 max-w-[7.5rem] px-2 py-2 font-semibold"
                            style={{
                              backgroundColor: hexCss(col.fillArgb) ?? (col.tone === 'xxld' ? '#fff' : '#f8fafc'),
                              color: hexCss(col.fontArgb) ?? '#0f172a',
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBlock.months.map((month) => (
                        <tr key={month.key} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-2 py-2 font-medium text-slate-800">{month.label}</td>
                          {status.columns.map((col) => (
                            <td key={col.key} className="px-2 py-2 tabular-nums text-slate-700">
                              {dashZero(month.metrics[col.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-300 bg-amber-50 font-semibold">
                        <td className="px-2 py-2">TOTAL IN NOS.</td>
                        {status.columns.map((col) => (
                          <td key={col.key} className="px-2 py-2 tabular-nums">
                            {dashZero(selectedBlock.totals[col.key])}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
