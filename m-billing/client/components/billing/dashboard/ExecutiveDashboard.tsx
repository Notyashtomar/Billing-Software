'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Info, Plus } from 'lucide-react';
import { billingApi } from '@/lib/billing-api';

const PERIOD_KEY: Record<string, string> = {
  'This month': 'this_month',
  'Last month': 'last_month',
  'This quarter': 'this_quarter',
};

type ExecutiveMetrics = {
  periodLabel: string;
  compareLabel: string;
  grossExclTax: number;
  previousGrossExclTax: number;
  grossChangeAmount: number;
  grossChangePercent: number | null;
  flights: number;
  previousFlights: number;
  eligibleFlights: number;
  invoicedFlights: number;
  completionPercent: number;
  additionalExclTax: number;
  invoicedInclTax: number;
};

function currentMonthValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthValue(value: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return currentMonthValue();
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
  return currentMonthValue(date);
}

function formatMonthValue(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function formatInr(amount: number, signed = false): string {
  const sign = amount < 0 ? '-' : signed ? '+' : '';
  const abs = Math.abs(amount);
  const body =
    abs >= 1_00_00_000
      ? `₹${(abs / 1_00_00_000).toFixed(2)} Cr`
      : abs >= 1_00_000
        ? `₹${(abs / 1_00_000).toFixed(2)} L`
        : `₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return `${sign}${body}`;
}

function formatPercent(value: number | null, compareLabel: string): string {
  if (value == null) return `No ${compareLabel} baseline`;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}% vs ${compareLabel}`;
}

function yieldPerFlight(gross: number, flights: number): number | null {
  if (!flights) return null;
  return gross / flights;
}

function formatYieldChange(metrics: ExecutiveMetrics): string {
  const current = yieldPerFlight(metrics.grossExclTax, metrics.flights);
  const previous = yieldPerFlight(metrics.previousGrossExclTax, metrics.previousFlights);
  if (current == null || previous == null) return '—';
  return formatInr(current - previous, true);
}

function yieldTone(metrics: ExecutiveMetrics | null): 'positive' | 'negative' | undefined {
  if (!metrics) return undefined;
  const current = yieldPerFlight(metrics.grossExclTax, metrics.flights);
  const previous = yieldPerFlight(metrics.previousGrossExclTax, metrics.previousFlights);
  if (current == null || previous == null) return undefined;
  return current - previous < 0 ? 'negative' : 'positive';
}

const TREND = [
  { month: 'May', current: 42, prior: 28 },
  { month: 'Jun', current: 58, prior: 40 },
  { month: 'Jul', current: 64, prior: 36 },
  { month: 'Aug', current: 60, prior: 32 },
  { month: 'Sep', current: 72, prior: 48 },
  { month: 'Oct', current: 68, prior: 50 },
];

const SERVICE_MIX = [
  { name: 'BHS', share: 72, amount: '₹3.47 Cr' },
  { name: 'ADS', share: 19, amount: '₹0.92 Cr' },
  { name: 'RAF', share: 9, amount: '₹0.43 Cr' },
];

const AIRLINE_SHARE = [
  { name: 'IndiGo', share: 34, amount: '₹1.64 Cr' },
  { name: 'Air India Express', share: 22, amount: '₹1.06 Cr' },
  { name: 'SpiceJet', share: 14, amount: '₹0.67 Cr' },
  { name: 'Others', share: 30, amount: '₹1.45 Cr' },
];

const ATTENTION = [
  { tone: 'High' as const, title: 'Unbilled flights at DEL', detail: '₹12.4 L' },
  { tone: 'Medium' as const, title: 'Contract expiring SpiceJet 18 days', detail: '18 days' },
  { tone: 'Medium' as const, title: 'USD bill missing rate 2 invoices', detail: '2 invoices' },
];

function Sparkline({ up }: { up: boolean }) {
  const d = up ? 'M2 18 L14 14 L26 16 L40 8 L54 10 L68 4' : 'M2 8 L16 10 L28 9 L42 12 L56 11 L68 14';
  return (
    <svg viewBox="0 0 70 22" className="h-8 w-20" aria-hidden>
      <path d={d} fill="none" stroke={up ? '#16803c' : '#b91c1c'} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function linePath(values: number[]) {
  const w = 520;
  const h = 160;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * w;
      const y = h - (value / 100) * (h - 16) - 8;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function ExecutiveDashboard() {
  const [period, setPeriod] = useState('This month');
  const [pickedMonth, setPickedMonth] = useState('');
  const [airline, setAirline] = useState('All airlines');
  const [service, setService] = useState('All');
  const [grain, setGrain] = useState<'Month' | 'Week' | 'Day'>('Month');
  const [showFlights, setShowFlights] = useState(false);
  const [airlines, setAirlines] = useState<Array<{ code: string; name: string }>>([]);
  const [airlinesNote, setAirlinesNote] = useState('');
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [metricsError, setMetricsError] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void billingApi
      .listCustomers({ limit: 500, active: 'true' })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data ?? []) as Array<{ customerCode?: string; name?: string }>;
        const seen = new Set<string>();
        const next = rows
          .map((row) => ({
            code: String(row.customerCode ?? '').trim().toUpperCase(),
            name: String(row.name ?? '').trim(),
          }))
          .filter((row) => {
            if (!row.code || seen.has(row.code)) return false;
            seen.add(row.code);
            return true;
          })
          .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
        setAirlines(next);
        setAirlinesNote(next.length === 0 ? 'No airlines are set up for this station yet.' : '');
      })
      .catch(() => {
        if (!cancelled) setAirlinesNote('Could not load this station’s airlines.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (airline === 'All airlines') return;
    if (!airlines.some((row) => row.code === airline)) setAirline('All airlines');
  }, [airline, airlines]);

  useEffect(() => {
    let cancelled = false;
    setMetricsLoading(true);
    setMetricsError('');
    void billingApi
      .getExecutiveDashboard({
        period: pickedMonth || PERIOD_KEY[period] || 'this_month',
        airline,
        service,
      })
      .then((res) => {
        if (!cancelled) setMetrics(res.data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMetrics(null);
          setMetricsError(error instanceof Error ? error.message : 'Could not load billing totals');
        }
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, pickedMonth, airline, service]);

  const airlineOptions = useMemo(
    () => ['All airlines', ...airlines.map((row) => row.code)],
    [airlines],
  );
  const selectedAirline = airlines.find((row) => row.code === airline);
  const visibleServices =
    service === 'All' ? SERVICE_MIX : SERVICE_MIX.filter((row) => row.name === service);

  const clearFilters = () => {
    setPeriod('This month');
    setPickedMonth('');
    setAirline('All airlines');
    setService('All');
  };

  const selectedMonthValue =
    pickedMonth ||
    (period === 'Last month' ? shiftMonthValue(currentMonthValue(), -1) : currentMonthValue());
  const selectedMonthLabel = pickedMonth
    ? formatMonthValue(pickedMonth)
    : period === 'This quarter'
      ? 'This quarter'
      : formatMonthValue(selectedMonthValue);
  const periodOptions = pickedMonth
    ? [formatMonthValue(pickedMonth), 'This month', 'Last month', 'This quarter']
    : ['This month', 'Last month', 'This quarter'];

  return (
    <div className="-m-3 min-h-[calc(100dvh-4.5rem)] bg-[#f4f6f3] px-4 py-4 text-[#1c2430] sm:-m-6 sm:px-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Executive</h1>
            <p className="text-sm text-[#667066]">Billing performance for station leadership</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#e1e4de] bg-white px-3 py-2 text-sm text-[#3d463f] shadow-sm transition hover:-translate-y-0.5 hover:border-[#1f8a3b] hover:shadow-md">
            <span>{selectedMonthLabel}</span>
            <Calendar className="h-4 w-4" />
            <input
              type="month"
              aria-label="Select month"
              min="2000-01"
              max="2100-12"
              value={selectedMonthValue}
              onChange={(event) => {
                const value = event.target.value;
                if (/^\d{4}-\d{2}$/.test(value)) setPickedMonth(value);
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </header>

        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#e6e8e3] bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
          <Filter
            label="Period"
            value={pickedMonth ? formatMonthValue(pickedMonth) : period}
            options={periodOptions}
            onChange={(value) => {
              if (pickedMonth && value === formatMonthValue(pickedMonth)) return;
              setPickedMonth('');
              setPeriod(value);
            }}
          />
          <Filter
            label="Airline"
            value={airline}
            options={airlineOptions}
            labels={Object.fromEntries(airlines.map((row) => [row.code, row.name ? `${row.code} — ${row.name}` : row.code]))}
            onChange={setAirline}
          />
          <Filter label="Service" value={service} options={['All', 'BHS', 'ADS', 'RAF']} onChange={setService} />
          <button
            type="button"
            onClick={clearFilters}
            className="mb-0.5 rounded-md px-2 py-1 text-sm text-[#3d6b46] transition hover:bg-[#e7f6ea]"
          >
            Clear filters
          </button>
        </div>
        {airlinesNote ? <p className="mb-3 text-sm text-[#9a5b12]">{airlinesNote}</p> : null}
        {selectedAirline ? (
          <p className="mb-3 text-sm text-[#146c2e]">
            Showing {selectedAirline.name || selectedAirline.code} for this station.
          </p>
        ) : null}

        <p className="mb-3 text-sm text-[#667066]">
          {metricsLoading
            ? `Loading totals for ${selectedMonthLabel}.`
            : metrics
              ? `${metrics.periodLabel} compared with ${metrics.compareLabel}. Gross revenue excludes GST.`
              : 'Station billing totals are unavailable.'}
        </p>
        {metricsError ? <p className="mb-3 text-sm text-[#9a5b12]">{metricsError}</p> : null}

        <div key={`${pickedMonth || period}-${airline}-${service}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Kpi
            title="Gross revenue"
            value={metricsLoading || !metrics ? '—' : formatInr(metrics.grossExclTax)}
            delta={metrics ? formatPercent(metrics.grossChangePercent, metrics.compareLabel) : 'Excludes GST'}
            positive={(metrics?.grossChangePercent ?? 0) >= 0}
          />
          <Kpi
            title="Revenue change"
            value={metricsLoading || !metrics ? '—' : formatInr(metrics.grossChangeAmount, true)}
            delta={metrics ? `Versus ${metrics.compareLabel}, excluding GST` : 'Excludes GST'}
            positive={(metrics?.grossChangeAmount ?? 0) >= 0}
          />
          <Kpi
            title="Flights handled"
            value={metricsLoading || !metrics ? '—' : Number(metrics.flights ?? 0).toLocaleString('en-IN')}
            delta={
              metrics
                ? `${(metrics.flights ?? 0) - (metrics.previousFlights ?? 0) >= 0 ? '+' : ''}${((metrics.flights ?? 0) - (metrics.previousFlights ?? 0)).toLocaleString('en-IN')} vs ${metrics.compareLabel}`
                : 'Station flights'
            }
            positive={(metrics?.flights ?? 0) - (metrics?.previousFlights ?? 0) >= 0}
          />
          <article className="flex min-h-[7.5rem] flex-col justify-between rounded-xl border border-[#e6e8e3] bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-medium tracking-wide text-[#667066]">BILLING COMPLETION</p>
            <div>
              <p className="text-2xl font-semibold">{metrics ? `${metrics.completionPercent}%` : '—'}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e7f6ea]">
                <div
                  className="h-full rounded-full bg-[#1f8a3b] transition-all duration-700"
                  style={{ width: `${metrics?.completionPercent ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[#8b9388]">
                {metrics
                  ? `${metrics.invoicedFlights.toLocaleString('en-IN')} invoiced of ${metrics.eligibleFlights.toLocaleString('en-IN')} eligible flights`
                  : 'Eligible flights only'}
              </p>
            </div>
          </article>
          <article className="flex min-h-[7.5rem] flex-col justify-between rounded-xl border border-[#e6e8e3] bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-medium tracking-wide text-[#667066]">ADDITIONAL SERVICES</p>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-semibold">
                {metrics ? formatInr(service === 'BHS' || service === 'RAF' ? 0 : metrics.additionalExclTax) : '—'}
              </p>
              <span className="grid h-7 w-7 place-items-center rounded-full border border-[#d7ddd4] text-[#1f8a3b]">
                <Plus className="h-4 w-4" />
              </span>
            </div>
          </article>
          <article className="flex min-h-[7.5rem] flex-col justify-between rounded-xl border border-[#e6e8e3] bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tracking-wide text-[#667066]">INVOICED INCL. GST</p>
              <Info className="h-4 w-4 text-[#8b9388]" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{metrics ? formatInr(metrics.invoicedInclTax) : '—'}</p>
              <p className="mt-1 text-xs text-[#8b9388]">Amount on generated bills</p>
            </div>
          </article>
        </div>

        <div className="mt-3 grid items-stretch gap-3 lg:grid-cols-2">
          <article className="flex h-full flex-col rounded-xl border border-[#e6e8e3] bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Revenue trend</h2>
              <div className="flex items-center gap-3">
                <div className="inline-flex rounded-lg bg-[#f3f5f2] p-0.5 text-sm">
                  {(['Month', 'Week', 'Day'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setGrain(item)}
            className={`rounded-md px-2.5 py-1 transition ${grain === item ? 'bg-white shadow-sm' : 'text-[#667066] hover:text-[#1c2430]'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-[#3d463f]">
                  <input
                    type="checkbox"
                    checked={showFlights}
                    onChange={(event) => setShowFlights(event.target.checked)}
                  />
                  Flights
                </label>
              </div>
            </div>
            <div className="mb-2 flex gap-4 text-xs text-[#667066]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-[#1f8a3b]" /> This year
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t border-dashed border-[#9aa396]" /> Last year
              </span>
              {showFlights ? <span>Flight counts stay on the card above until the series is connected.</span> : null}
            </div>
            <svg viewBox="0 0 520 180" className="h-48 w-full">
              <path d={linePath(TREND.map((point) => point.current))} fill="none" stroke="#1f8a3b" strokeWidth="2.5" />
              <path
                d={linePath(TREND.map((point) => point.prior))}
                fill="none"
                stroke="#9aa396"
                strokeWidth="2"
                strokeDasharray="5 4"
              />
            </svg>
            <div className="grid grid-cols-6 text-center text-xs text-[#8b9388]">
              {TREND.map((point) => (
                <span key={point.month}>{point.month}</span>
              ))}
            </div>
          </article>

          <article className="flex h-full flex-col rounded-xl border border-[#e6e8e3] bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="text-base font-semibold">Versus {metrics?.compareLabel ?? 'previous month'}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="This period" value={metrics ? formatInr(metrics.grossExclTax) : '—'} />
              <Row label="Previous" value={metrics ? formatInr(metrics.previousGrossExclTax) : '—'} />
              <Row
                label="Change"
                value={metrics ? formatInr(metrics.grossChangeAmount, true) : '—'}
                tone={metrics && metrics.grossChangeAmount < 0 ? 'negative' : 'positive'}
              />
              <Row
                label="Flights"
                value={
                  metrics
                    ? `${(metrics.flights ?? 0) - (metrics.previousFlights ?? 0) >= 0 ? '+' : ''}${((metrics.flights ?? 0) - (metrics.previousFlights ?? 0)).toLocaleString('en-IN')}`
                    : '—'
                }
                tone={metrics && metrics.flights - metrics.previousFlights < 0 ? 'negative' : 'positive'}
              />
              <Row
                label="Yield"
                value={metrics ? formatYieldChange(metrics) : '—'}
                tone={yieldTone(metrics)}
              />
            </dl>
            <p className="mt-6 text-sm text-[#667066]">
              Yield is gross revenue excluding GST divided by flights handled.
            </p>
          </article>

          <article className="flex h-full flex-col rounded-xl border border-[#e6e8e3] bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="text-base font-semibold">Service mix</h2>
            <p className="mt-1 text-sm text-[#667066]">Share of gross revenue by billed service.</p>
            <ul className="mt-4 space-y-3">
              {visibleServices.map((row) => (
                <li key={row.name} className="transition-opacity">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-[#3d463f]">
                      {row.amount} · {row.share}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eef0ec]">
                    <div
                      className="h-full rounded-full bg-[#1f8a3b] transition-all duration-700"
                      style={{ width: `${service === 'All' ? row.share : 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-4 text-sm text-[#667066]">
              BHS is still most of the bill. ADS and RAF are the add-on margin to watch.
            </p>
          </article>

          <article className="flex h-full flex-col rounded-xl border border-[#e6e8e3] bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="text-base font-semibold">Airline concentration</h2>
            <p className="mt-1 text-sm text-[#667066]">How much of gross revenue sits with the largest airlines.</p>
            <ul className="mt-4 space-y-3">
              {AIRLINE_SHARE.map((row) => {
                const selected =
                  selectedAirline != null &&
                  row.name.toLowerCase() === selectedAirline.name.toLowerCase();
                return (
                <li key={row.name} className={selected ? 'rounded-lg bg-[#e7f6ea] px-2 py-1' : undefined}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-[#3d463f]">
                      {row.amount} · {row.share}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eef0ec]">
                    <div className="h-full rounded-full bg-[#146c2e] transition-all duration-700" style={{ width: `${row.share}%` }} />
                  </div>
                </li>
                );
              })}
            </ul>
            <p className="mt-auto pt-4 text-sm text-[#667066]">
              The top two airlines are 56% of gross revenue. A rate or volume change there moves the station total.
            </p>
          </article>
        </div>

        <article className="mt-3 rounded-xl border border-[#e6e8e3] bg-white shadow-sm transition duration-200 hover:shadow-md">
          <h2 className="border-b border-[#eef0ec] px-4 py-3 text-base font-semibold">Attention</h2>
          <ul>
            {ATTENTION.map((item) => (
              <li
                key={item.title}
                className="flex items-center justify-between gap-3 border-b border-[#eef0ec] px-4 py-3 transition-colors last:border-b-0 hover:bg-[#f7faf7]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      item.tone === 'High' ? 'bg-[#fde8c8] text-[#9a5b12]' : 'bg-[#f3f0e4] text-[#6b6248]'
                    }`}
                  >
                    {item.tone}
                  </span>
                  <span className="truncate text-sm">{item.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-sm">
                  <span className="text-[#3d463f]">{item.detail}</span>
                  <span className="text-[#667066]">View &gt;</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
    </div>
  );
}

function Filter({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-[8.5rem] flex-col gap-1 text-xs text-[#667066]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-[#e1e4de] bg-white px-2 py-1.5 text-sm text-[#1c2430] transition focus:border-[#1f8a3b] focus:outline-none focus:ring-2 focus:ring-[#1f8a3b]/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({
  title,
  value,
  delta,
  positive,
}: {
  title: string;
  value: string;
  delta: string;
  positive: boolean;
}) {
  return (
    <article className="flex min-h-[7.5rem] flex-col justify-between rounded-xl border border-[#e6e8e3] bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs font-medium tracking-wide text-[#667066]">{title.toUpperCase()}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className={`mt-1 text-sm ${positive ? 'text-[#16803c]' : 'text-[#b91c1c]'}`}>{delta}</p>
        </div>
        <Sparkline up={positive} />
      </div>
    </article>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  const color = tone === 'positive' ? 'text-[#16803c]' : tone === 'negative' ? 'text-[#b91c1c]' : 'text-[#1c2430]';
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[#667066]">{label}</dt>
      <dd className={`font-medium ${color}`}>{value}</dd>
    </div>
  );
}
