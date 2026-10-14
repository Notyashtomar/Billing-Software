'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Plane, RefreshCw, Search, X } from 'lucide-react';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { Badge } from '@/components/ui/badge';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getCurrentMonthDateRange,
  getPreviousMonthDateRange,
  toYearMonth,
} from '@/components/billing/output/misCheckerDateRange';
import type { StationWiseFlightScope } from '@/features/fris/mis/mis-pages';
import {
  downloadMisAirlineWiseExcel,
  friendlyStationWiseError,
  getMisAirlineWiseStatus,
  isTransientApiDown,
} from './misAirlineWiseApi';
import type {
  AirlineWiseAirlineBlock,
  AirlineWisePerformance,
  AirlineWisePreviewFlight,
  AirlineWiseStationBlock,
  AirlineWiseStatusPayload,
} from './misAirlineWiseTypes';

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

const FLIGHT_FILTER_COLS = [
  { key: 'station', label: 'Stn', kind: 'select' },
  { key: 'flightNo', label: 'Flight', kind: 'text' },
  { key: 'typeCraft', label: 'Ac', kind: 'select' },
  { key: 'sta', label: 'STA', kind: 'text' },
  { key: 'std', label: 'STD', kind: 'text' },
  { key: 'ata', label: 'ATA', kind: 'text' },
  { key: 'atd', label: 'ATD', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'select' },
] as const;

type FlightFilterKey = (typeof FLIGHT_FILTER_COLS)[number]['key'];
type FlightColFilters = Record<FlightFilterKey, string>;

const EMPTY_COL_FILTERS: FlightColFilters = {
  station: '',
  flightNo: '',
  typeCraft: '',
  sta: '',
  std: '',
  ata: '',
  atd: '',
  status: '',
};

function flightField(flight: AirlineWisePreviewFlight, key: FlightFilterKey): string {
  switch (key) {
    case 'station':
      return (flight.stationCode || '').trim();
    case 'flightNo':
      return (flight.flightNo || '').trim();
    case 'typeCraft':
      return (flight.typeCraft || '').trim();
    case 'sta':
      return `${flight.staDate || ''} ${flight.staTime || ''}`.trim();
    case 'std':
      return `${flight.stdDate || ''} ${flight.stdTime || ''}`.trim();
    case 'ata':
      return `${flight.ataDate || ''} ${flight.ataTime || ''}`.trim();
    case 'atd':
      return `${flight.atdDate || ''} ${flight.atdTime || ''}`.trim();
    case 'status':
      return (flight.delay || '').trim();
    default:
      return '';
  }
}

function uniqueColValues(rows: AirlineWisePreviewFlight[], key: FlightFilterKey): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const value = flightField(row, key);
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

const SUMMARY_COLS = [
  { key: 'onTime', label: 'Flights Operated On Time', fill: 'bg-emerald-100' },
  { key: 'cancelled', label: 'Cancelled Flights', fill: 'bg-orange-100' },
  { key: 'offSked', label: 'Flights Operated Off-Sked', fill: 'bg-lime-100' },
  { key: 'gtSaved', label: 'Ground Time Saved', fill: 'bg-emerald-100' },
  { key: 'beforeStd', label: 'Departed Or Before STD', fill: 'bg-emerald-100' },
  { key: 'nonGha', label: 'AGT > SGT (Not GHA)', fill: 'bg-lime-100' },
  { key: 'gha', label: 'Improvement For GHA', fill: 'bg-orange-100' },
  { key: 'total', label: 'Total Flights', fill: 'bg-sky-100' },
] as const;

function SummaryYearGrid({
  year,
  stations,
  totals,
  selectedStation,
  onSelectStation,
}: {
  year: string;
  stations: AirlineWiseStationBlock[];
  totals: AirlineWisePerformance;
  selectedStation: string;
  onSelectStation: (code: string) => void;
}) {
  const rows: Array<{ code: string; perf: AirlineWisePerformance; isTotal: boolean }> = [
    ...stations.map((stn) => ({ code: stn.stationCode, perf: stn.performance, isTotal: false })),
    { code: 'TOTAL', perf: totals, isTotal: true },
  ];

  const empty = rows.length === 1;

  const renderTable = (mode: 'nos' | 'pct') => (
    <table className="w-full table-fixed border-collapse text-xs">
      <colgroup>
        <col className="w-[11%]" />
        {SUMMARY_COLS.map((col) => (
          <col key={`${mode}-${col.key}`} className="w-[11.125%]" />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th
            colSpan={SUMMARY_COLS.length + 1}
            className="border border-slate-200 bg-emerald-800 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white"
          >
            {mode === 'nos' ? 'Performance report in nos.' : 'Performance report in %'}
          </th>
        </tr>
        <tr>
          <th className="border border-slate-200 bg-emerald-800 px-2 py-2 text-left text-[11px] font-semibold uppercase text-white">
            Stations {year}
          </th>
          {SUMMARY_COLS.map((col) => (
            <th
              key={`${mode}-h-${col.key}`}
              className={`border border-slate-200 px-1.5 py-2 text-center text-[11px] font-semibold leading-snug text-slate-800 ${col.fill}`}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {empty ? (
          <tr>
            <td colSpan={SUMMARY_COLS.length + 1} className="border border-slate-200 px-3 py-3 text-slate-500">
              No FHR rows for this airline in the selected dates.
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const active = row.isTotal ? selectedStation === 'ALL' : selectedStation === row.code;
            return (
              <tr
                key={`${mode}-${row.code}`}
                className={`cursor-pointer ${
                  row.isTotal
                    ? 'bg-slate-50 font-semibold'
                    : active
                      ? 'bg-emerald-50'
                      : 'hover:bg-emerald-50/60'
                }`}
                onClick={() => onSelectStation(row.isTotal ? 'ALL' : row.code)}
              >
                <td className="border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-800">{row.code}</td>
                {SUMMARY_COLS.map((col) => (
                  <td
                    key={`${mode}-v-${row.code}-${col.key}`}
                    className="border border-slate-200 px-1.5 py-2 text-center text-sm tabular-nums text-slate-800"
                  >
                    {mode === 'nos'
                      ? dashZero(row.perf[col.key])
                      : formatPct(
                          col.key === 'total'
                            ? row.perf.total > 0
                              ? 1
                              : 0
                            : row.perf.total <= 0
                              ? 0
                              : row.perf[col.key] / row.perf.total,
                        )}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-3">
      {renderTable('nos')}
      {renderTable('pct')}
    </div>
  );
}

export function MisAirlineWisePage({
  flightScope = 'scheduled',
}: {
  flightScope?: StationWiseFlightScope;
}) {
  const initialRange = useMemo(() => getPreviousMonthDateRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [monthValue, setMonthValue] = useState(() => toYearMonth(initialRange.from));
  const [status, setStatus] = useState<AirlineWiseStatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [selectedAirline, setSelectedAirline] = useState('6E');
  const [selectedStation, setSelectedStation] = useState('ALL');
  const [flightSearch, setFlightSearch] = useState('');
  const [colFilters, setColFilters] = useState<FlightColFilters>(EMPTY_COL_FILTERS);

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
        const payload = await getMisAirlineWiseStatus({ from, to, flightScope }, { signal });
        if (signal?.aborted) return;
        setStatus(payload);
        setSelectedAirline((prev) => {
          const keep = payload.airlines.find((a) => a.code === prev && a.flights > 0);
          if (keep) return keep.code;
          const atHome = payload.airlines.find((a) => a.flights > 0 && a.atHomeStation);
          return (
            atHome?.code ??
            payload.airlines.find((a) => a.flights > 0)?.code ??
            payload.airlines[0]?.code ??
            '6E'
          );
        });
        setSelectedStation('ALL');
        setColFilters(EMPTY_COL_FILTERS);
        setFlightSearch('');
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : String(e);
        setReconnecting(isTransientApiDown(msg));
        setError(friendlyStationWiseError(msg));
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

  const pickerAirlines = useMemo(() => {
    if (!status) return [];
    return status.airlines.filter((a) => a.fromCatalog || a.atHomeStation);
  }, [status]);

  const selectedBlock: AirlineWiseAirlineBlock | null =
    status?.airlines.find((a) => a.code === selectedAirline) ??
    pickerAirlines[0] ??
    status?.airlines[0] ??
    null;

  const selectedStationBlock =
    selectedStation === 'ALL'
      ? null
      : (selectedBlock?.stations.find((s) => s.stationCode === selectedStation) ?? null);

  const monthSheets = selectedStationBlock
    ? [selectedStationBlock]
    : (selectedBlock?.stations ?? []);

  const airlineFlights = useMemo(() => {
    if (!status || !selectedBlock) return [];
    return status.flights.filter((f) => f.airlineCode === selectedBlock.code);
  }, [status, selectedBlock]);

  const flights = useMemo(() => {
    const q = flightSearch.trim().toLowerCase();
    return airlineFlights.filter((f) => {
      if (selectedStation !== 'ALL' && f.stationCode !== selectedStation) return false;
      if (q) {
        const hay = FLIGHT_FILTER_COLS.map((col) => flightField(f, col.key)).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const col of FLIGHT_FILTER_COLS) {
        const raw = colFilters[col.key].trim().toLowerCase();
        if (!raw) continue;
        if (col.key === 'station' && selectedStation !== 'ALL') continue;
        const value = flightField(f, col.key).toLowerCase();
        if (col.kind === 'select') {
          if (value !== raw) return false;
        } else if (!value.includes(raw)) {
          return false;
        }
      }
      return true;
    });
  }, [airlineFlights, selectedStation, flightSearch, colFilters]);

  const flightsByStation = useMemo(() => {
    const groups: Array<{ station: string; rows: typeof flights }> = [];
    const index = new Map<string, number>();
    for (const f of flights) {
      const code = f.stationCode || '—';
      const existing = index.get(code);
      if (existing === undefined) {
        index.set(code, groups.length);
        groups.push({ station: code, rows: [f] });
      } else {
        groups[existing].rows.push(f);
      }
    }
    return groups;
  }, [flights]);

  const filtersActive =
    flightSearch.trim() !== '' ||
    selectedStation !== 'ALL' ||
    FLIGHT_FILTER_COLS.some((col) => colFilters[col.key].trim() !== '');

  const clearFlightFilters = () => {
    setFlightSearch('');
    setSelectedStation('ALL');
    setColFilters(EMPTY_COL_FILTERS);
  };

  const runDownload = async () => {
    if (!selectedBlock) return;
    setExporting(true);
    setError('');
    try {
      await downloadMisAirlineWiseExcel({
        from,
        to,
        flightScope,
        airlineCode: selectedBlock.code,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(friendlyStationWiseError(msg));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] min-w-0 bg-emerald-50" style={{ maxWidth: '100%', overflowX: 'clip' }}>
      <div className="mx-auto w-full min-w-0 max-w-6xl overflow-x-clip px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader
          title={`${status?.stationLabel || 'Station'} — ${
            flightScope === 'nonScheduled'
              ? 'MIS Airline Wise Non Schedule'
              : 'MIS Airline Wise Schedule'
          }`}
          icon={Plane}
        />

        <div className="mb-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex w-[9.25rem] flex-col gap-0.5 text-xs font-medium text-slate-700">
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setMonthValue(toYearMonth(e.target.value));
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </label>
            <label className="flex w-[9.25rem] flex-col gap-0.5 text-xs font-medium text-slate-700">
              To
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </label>
            <label className="flex w-[10rem] flex-col gap-0.5 text-xs font-medium text-slate-700">
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
                className="h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </label>
            <div className="flex h-10 items-center gap-1.5">
              <button
                type="button"
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const range = getPreviousMonthDateRange();
                  applyRange(range.from, range.to);
                }}
              >
                Previous month
              </button>
              <button
                type="button"
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const range = getCurrentMonthDateRange();
                  applyRange(range.from, range.to);
                }}
              >
                Current month
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => void loadStatus()}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                Refresh
              </button>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void runDownload()}
              disabled={exporting || loading || !selectedBlock}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ExcelLogoIcon className="h-4 w-4" />}
              <Download className="h-4 w-4" aria-hidden />
              Download {selectedBlock ? `${selectedBlock.code}_MONTHWISE` : 'workbook'}
            </button>
          </div>
          {status ? (
            <p className="mt-2 text-xs text-slate-600">
              {status.flightScopeLabel} · all stations · home {status.stationLabel} ({status.stationCode}) ·{' '}
              {status.rangeLabel} · {status.summary.airlines} airlines · {status.summary.stations}{' '}
              station sheets · {status.summary.flights} flights
            </p>
          ) : null}
          {reconnecting ? (
            <p className="mt-2 text-xs font-medium text-amber-800" role="status">
              Connecting to API… Nest may be restarting.
            </p>
          ) : null}
          {error && !reconnecting ? (
            <p className="mt-2 text-xs font-medium text-rose-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {loading && !status ? (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-8 text-sm text-slate-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" aria-hidden />
            Building airline preview from all stations…
          </div>
        ) : null}

        {status ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-4">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-slate-900">Airlines</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Folder airlines stay listed. Extra `+` chips are carriers that fly{' '}
                {status.stationCode}. Sheets and flights cover every station.
              </p>
              <TooltipProvider delayDuration={200}>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pickerAirlines.map((airline) => {
                    const stationCount = airline.stations.length;
                    const stationBits = airline.stations
                      .map((stn) => `${stn.stationCode} (${stn.flights})`)
                      .join(' · ');
                    return (
                      <Tooltip key={airline.code}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                      setSelectedAirline(airline.code);
                      setSelectedStation('ALL');
                      setColFilters(EMPTY_COL_FILTERS);
                      setFlightSearch('');
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                              selectedAirline === airline.code
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-sm'
                            }`}
                          >
                            {airline.code}
                            {airline.flights ? ` · ${airline.flights}` : ''}
                            {!airline.fromCatalog ? ' +' : ''}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="start"
                          className="max-w-xs border-emerald-200 bg-white p-3 text-slate-800 shadow-lg"
                        >
                          <p className="text-sm font-semibold text-emerald-900">
                            {airline.code} · {airline.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {stationCount} {stationCount === 1 ? 'station' : 'stations'}
                            {stationBits ? ` — ${stationBits}` : ' — no FHR in range'}
                          </p>
                          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-700">
                            <div>
                              <dt className="text-slate-500">Flights</dt>
                              <dd className="font-semibold tabular-nums">{airline.flights}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">On time</dt>
                              <dd className="font-semibold tabular-nums">{dashZero(airline.performance.onTime)}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">Cancelled</dt>
                              <dd className="font-semibold tabular-nums">{dashZero(airline.performance.cancelled)}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">Off-sked</dt>
                              <dd className="font-semibold tabular-nums">{dashZero(airline.performance.offSked)}</dd>
                            </div>
                          </dl>
                          <p className="mt-2 text-[11px] text-slate-500">
                            {airline.fromCatalog ? 'Folder airline' : 'Extra carrier at home station'}
                            {airline.atHomeStation ? ' · flies login station' : ''}
                            {airline.priorYear && airline.priorYear.flights > 0
                              ? ` · last year ${airline.priorYear.flights} flights`
                              : ''}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </section>

            {selectedBlock ? (
              <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {selectedBlock.code} · {selectedBlock.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      SUMMARY sheet · stations × NOS + %. Click a row or sheet chip.
                    </p>
                  </div>
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">{status.rangeLabel}</Badge>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStation('ALL')}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      selectedStation === 'ALL'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    All stations · {selectedBlock.flights}
                  </button>
                  {selectedBlock.stations.map((stn) => (
                    <button
                      key={stn.stationCode}
                      type="button"
                      onClick={() => setSelectedStation(stn.stationCode)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        selectedStation === stn.stationCode
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                      }`}
                    >
                      {stn.sheetName} · {stn.flights}
                    </button>
                  ))}
                </div>
                <SummaryYearGrid
                  year={status.from.slice(0, 4)}
                  stations={selectedBlock.stations}
                  totals={selectedBlock.performance}
                  selectedStation={selectedStation}
                  onSelectStation={setSelectedStation}
                />
                {selectedBlock.priorYear && selectedBlock.priorYear.flights > 0 ? (
                  <div className="mt-3">
                    <SummaryYearGrid
                      year={String(Number(status.from.slice(0, 4)) - 1)}
                      stations={selectedBlock.priorYear.stations}
                      totals={selectedBlock.priorYear.performance}
                      selectedStation={selectedStation}
                      onSelectStation={setSelectedStation}
                    />
                  </div>
                ) : null}
              </section>
            ) : null}

            {status && monthSheets.length > 0 ? (
              <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-base font-semibold text-slate-900">
                  {selectedStation === 'ALL' ? 'Station month sheets' : `${selectedStation} month sheet`}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Same B–P columns as station tabs. Every sheet for this airline stays visible.
                </p>
                <div className="mt-3 space-y-3">
                  {monthSheets.map((sheet) => (
                    <div key={sheet.stationCode} className="rounded-xl border border-slate-200">
                      <table className="w-full table-fixed border-collapse text-[10px] leading-snug">
                        <colgroup>
                          <col className="w-[7.5%]" />
                          {status.columns.map((col) => (
                            <col key={`${sheet.stationCode}-col-${col.key}`} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            <th
                              colSpan={status.columns.length + 1}
                              className="bg-emerald-800 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white"
                            >
                              {sheet.sheetName} · {sheet.stationCode} · {sheet.flights} flights
                            </th>
                          </tr>
                          <tr>
                            <th className="border border-slate-200 bg-emerald-800 px-1 py-2 text-center align-middle font-semibold text-white">
                              Month
                            </th>
                            {status.columns.map((col) => (
                              <th
                                key={`${sheet.stationCode}-${col.key}`}
                                className="break-words border border-slate-200 px-1 py-2 text-center align-middle font-semibold"
                                style={{
                                  backgroundColor: hexCss(col.fillArgb) ?? '#f8fafc',
                                  color: hexCss(col.fontArgb) ?? '#0f172a',
                                }}
                              >
                                {col.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sheet.months.map((month) => (
                            <tr key={`${sheet.stationCode}-${month.key}`} className="border-t border-slate-100">
                              <td className="border border-slate-200 px-1 py-2 text-center font-medium text-slate-800">
                                {month.label}
                              </td>
                              {status.columns.map((col) => (
                                <td
                                  key={`${sheet.stationCode}-${month.key}-${col.key}`}
                                  className="border border-slate-200 px-1 py-2 text-center tabular-nums text-slate-700"
                                >
                                  {dashZero(month.metrics[col.key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">Flight preview</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Showing {flights.length} of {airlineFlights.length}
                    {selectedStation !== 'ALL' ? ` · ${selectedStation}` : ''}
                    · first 30 in view · filter columns below
                    {status.flightsTruncated ? ' · preview capped at 8,000' : ''}
                  </p>
                </div>
                <div className="flex h-10 w-full shrink-0 items-center gap-2 sm:max-w-md">
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">Search flights</span>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                    <input
                      type="search"
                      value={flightSearch}
                      onChange={(e) => setFlightSearch(e.target.value)}
                      placeholder="Search all columns…"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      aria-label="Search flights"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={clearFlightFilters}
                    disabled={!filtersActive}
                    className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-emerald-50 disabled:cursor-default disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Clear
                  </button>
                </div>
              </div>
              <div
                className="min-w-0 overflow-y-scroll overflow-x-hidden rounded-xl border border-slate-200"
                style={{
                  height: 'calc(4.75rem + 30 * 2rem)',
                  maxHeight: 'min(42rem, calc(100dvh - 12rem))',
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                }}
                tabIndex={0}
                aria-label="Flight preview. 30 rows visible, scroll for the rest."
              >
                <table className="min-w-full table-fixed border-collapse text-left text-xs">
                  <colgroup>
                    <col className="w-[8%]" />
                    <col className="w-[16%]" />
                    <col className="w-[10%]" />
                    <col className="w-[16%]" />
                    <col className="w-[16%]" />
                    <col className="w-[16%]" />
                    <col className="w-[16%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-emerald-800 text-left text-[10px] uppercase tracking-wide text-white sm:text-xs">
                      {FLIGHT_FILTER_COLS.map((col) => (
                        <th key={col.key} className="px-1.5 py-1.5 align-bottom font-semibold sm:px-2">
                          <span className="mb-1 block h-4 leading-4">{col.label}</span>
                          {col.kind === 'select' ? (
                            <AdminRadioDropdown
                              aria-label={`Filter ${col.label}`}
                              size="sm"
                              value={
                                col.key === 'station'
                                  ? selectedStation === 'ALL'
                                    ? ''
                                    : selectedStation
                                  : colFilters[col.key]
                              }
                              onChange={(next) => {
                                if (col.key === 'station') {
                                  setSelectedStation(next || 'ALL');
                                }
                                setColFilters((prev) => ({ ...prev, [col.key]: next }));
                              }}
                              placeholder="All"
                              searchable
                              searchPlaceholder={`Search ${col.label.toLowerCase()}…`}
                              className="font-normal normal-case tracking-normal"
                              options={[
                                { value: '', label: 'All' },
                                ...uniqueColValues(airlineFlights, col.key).map((opt) => ({
                                  value: opt,
                                  label: opt,
                                })),
                              ]}
                            />
                          ) : (
                            <input
                              type="search"
                              aria-label={`Filter ${col.label}`}
                              value={colFilters[col.key]}
                              onChange={(e) =>
                                setColFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                              }
                              placeholder="Filter"
                              className="h-7 w-full rounded-md border border-emerald-200 bg-white px-1.5 text-[10px] font-normal normal-case tracking-normal leading-7 text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flights.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-6 text-slate-500">
                          No flights match search or filters.
                        </td>
                      </tr>
                    ) : (
                      flightsByStation.flatMap((group) => [
                        <tr key={`stn-${group.station}`} className="bg-emerald-50">
                          <td colSpan={8} className="sticky top-[3.75rem] z-10 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
                            {group.station} · {group.rows.length} flights
                          </td>
                        </tr>,
                        ...group.rows.map((f, i) => (
                          <tr key={`${f.stationCode}-${f.flightNo}-${f.staYmd}-${i}`} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 font-medium">{f.stationCode}</td>
                            <td className="px-2 py-1.5 font-mono">{f.flightNo}</td>
                            <td className="px-2 py-1.5">{f.typeCraft || '—'}</td>
                            <td className="px-2 py-1.5 tabular-nums">{f.staDate} {f.staTime}</td>
                            <td className="px-2 py-1.5 tabular-nums">{f.stdDate} {f.stdTime}</td>
                            <td className="px-2 py-1.5 tabular-nums">{f.ataDate || '—'} {f.ataTime}</td>
                            <td className="px-2 py-1.5 tabular-nums">{f.atdDate || '—'} {f.atdTime}</td>
                            <td className="px-2 py-1.5">{f.delay || '—'}</td>
                          </tr>
                        )),
                      ])
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
