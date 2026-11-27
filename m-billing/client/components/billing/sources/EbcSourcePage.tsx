'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, Upload, Wallet } from 'lucide-react';
import { billingApi } from '@/lib/billing-api';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';

type EbcRow = {
  date: string;
  flightNo: string;
  passengerName: string;
  pnr: string;
  receiptNo: string;
  chargeType: string;
  quantity: string;
  rate: number | null;
  amount: number | null;
  tax: number | null;
  total: number | null;
  paymentMode: string;
  paymentNote: string;
};

type EbcSplit = {
  upi: number | null;
  cash: number | null;
  card: number | null;
  total: number | null;
};

type EbcSheet = {
  airline: string;
  layout: 'qp' | 'vj';
  rows: EbcRow[];
  dailyTotals: Array<EbcSplit & { date: string }>;
  monthSplit: EbcSplit | null;
};

type EbcPayload = {
  months: Array<{ month: string; label: string; airlines: number; rows: number }>;
  month: string | null;
  airlines: string[];
  sheet: EbcSheet | null;
};

/** EBC figures are INR: whole rupees, no paise. */
const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function inr(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '' : money.format(value);
}

function formatDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function EbcSourcePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<EbcPayload | null>(null);
  const [month, setMonth] = useState<string | undefined>();
  const [airline, setAirline] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('');

  const load = useCallback(async (nextMonth?: string, nextAirline?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await billingApi.listEbc({ month: nextMonth, airline: nextAirline });
      setData(res);
      setMonth(res.month ?? undefined);
      setAirline(res.sheet?.airline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load EBC data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onImport = async (file: File) => {
    setImporting(true);
    setError('');
    setNotice('');
    try {
      const res = await billingApi.importEbc(file);
      const summary = (res.months ?? [])
        .map((item) => `${item.airline} ${item.label}: ${item.rows} rows`)
        .join(' · ');
      setNotice(summary ? `Imported ${summary}. Re-importing an airline replaces that month.` : 'Imported.');
      const last = res.months?.[res.months.length - 1];
      await load(last?.month, last?.airline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const sheet = data?.sheet;
  const modes = useMemo(() => {
    const found = new Set<string>();
    for (const row of sheet?.rows ?? []) {
      if (row.paymentMode) found.add(row.paymentMode);
    }
    return [...found].sort();
  }, [sheet]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (sheet?.rows ?? []).filter((row) => {
      if (mode && row.paymentMode !== mode) return false;
      if (!needle) return true;
      return [row.flightNo, row.passengerName, row.pnr, row.receiptNo, row.chargeType]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [sheet, query, mode]);

  const dayTotals = useMemo(() => {
    const map = new Map<string, EbcSplit>();
    for (const day of sheet?.dailyTotals ?? []) map.set(day.date, day);
    return map;
  }, [sheet]);

  const collected = sheet?.monthSplit?.total
    ?? filtered.reduce((sum, row) => sum + (row.total ?? 0), 0);

  return (
    <div className="min-w-0">
      <BillingPageHeader
        title="EBC"
        description="Excess baggage and ancillary collections recorded at the station."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void onImport(file);
              }}
            />
            <button
              type="button"
              className={billingUi.btnPrimary}
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import collection
            </button>
          </>
        }
      />

      {loading && !data ? (
        <div className={`${billingUi.card} flex min-h-[240px] items-center justify-center gap-2 text-sm text-[color:var(--billing-text-muted)]`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading collections…
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
      ) : null}

      {!loading && data && data.months.length === 0 ? (
        <div className={`${billingUi.card} flex min-h-[280px] flex-col items-center justify-center p-8 text-center`}>
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-accent-strong)]">
            <Wallet className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold">No EBC collection imported for this station yet</p>
          <p className="mt-1 max-w-md text-xs text-[color:var(--billing-text-muted)]">
            Import the QP collection CSV or the VJ monthly workbook. Each airline is stored separately for the month.
          </p>
        </div>
      ) : null}

      {data && data.months.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-[color:var(--billing-text-muted)]" htmlFor="ebc-month">
              Month
            </label>
            <select
              id="ebc-month"
              className="rounded-lg border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-3 py-1.5 text-sm"
              value={month ?? ''}
              onChange={(event) => {
                setQuery('');
                setMode('');
                void load(event.target.value);
              }}
            >
              {data.months.map((item) => (
                <option key={item.month} value={item.month}>
                  {item.label} · {item.rows} receipts
                </option>
              ))}
            </select>
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--billing-text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Flight, name, PNR, receipt"
                className="w-full rounded-lg border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] py-1.5 pl-8 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {data.airlines.map((name) => {
              const active = name === sheet?.airline;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setMode('');
                    void load(month, name);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-[color:var(--billing-primary)] bg-[color:var(--billing-primary)] text-white'
                      : 'border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] hover:bg-[color:var(--billing-surface-muted)]'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>

          {sheet ? (
            <>
              <div className={`mb-3 grid grid-cols-2 gap-2 ${sheet.layout === 'vj' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                <Stat label="Receipts" value={String(filtered.length)} />
                <Stat label="Collected" value={inr(query || mode ? filtered.reduce((sum, row) => sum + (row.total ?? 0), 0) : collected)} />
                {sheet.layout === 'vj' && sheet.monthSplit ? (
                  <>
                    <Stat label="UPI" value={inr(sheet.monthSplit.upi)} />
                    <Stat label="Cash" value={inr(sheet.monthSplit.cash)} />
                    <Stat label="Card" value={inr(sheet.monthSplit.card)} />
                  </>
                ) : (
                  <>
                    <Stat label="Card" value={String(sheet.rows.filter((row) => row.paymentMode === 'CARD').length)} />
                    <Stat label="Cash" value={String(sheet.rows.filter((row) => row.paymentMode === 'CASH').length)} />
                  </>
                )}
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                <ModeChip label="All payments" active={mode === ''} onClick={() => setMode('')} />
                {modes.map((item) => (
                  <ModeChip key={item} label={item} active={mode === item} onClick={() => setMode(item)} />
                ))}
              </div>

              <div className={`${billingUi.card} max-h-[70vh] overflow-auto`}>
                <table className="min-w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[color:var(--billing-surface-muted)]">
                    {sheet.layout === 'vj' ? (
                      <tr>
                        {['Date', 'Flight', 'Passenger', 'Receipt', 'PNR', 'Charge', 'Excess', 'Total', 'Payment', 'Note'].map((label) => (
                          <th key={label} className="whitespace-nowrap px-2 py-2 text-left font-semibold">{label}</th>
                        ))}
                      </tr>
                    ) : (
                      <tr>
                        {['Date', 'Flight', 'Passenger', 'PNR', 'Kgs', 'Rate', 'Amount', 'Tax', 'Total', 'Payment'].map((label) => (
                          <th key={label} className="whitespace-nowrap px-2 py-2 text-left font-semibold">{label}</th>
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filtered.map((row, index) => {
                      const previous = filtered[index - 1];
                      const showDay = sheet.layout === 'vj' && !query && !mode && previous && previous.date !== row.date;
                      const day = dayTotals.get(previous?.date ?? '');
                      return (
                        <FragmentRows
                          key={`${row.date}-${row.flightNo}-${row.pnr}-${index}`}
                          showDay={Boolean(showDay && day)}
                          day={day}
                          dayDate={previous?.date ?? ''}
                          row={row}
                          layout={sheet.layout}
                          zebra={index % 2 === 1}
                        />
                      );
                    })}
                    {sheet.layout === 'vj' && !query && !mode && filtered.length > 0 ? (
                      <DayTotalRow
                        date={filtered[filtered.length - 1].date}
                        split={dayTotals.get(filtered[filtered.length - 1].date)}
                      />
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function FragmentRows({
  showDay,
  day,
  dayDate,
  row,
  layout,
  zebra,
}: {
  showDay: boolean;
  day?: EbcSplit;
  dayDate: string;
  row: EbcRow;
  layout: 'qp' | 'vj';
  zebra: boolean;
}) {
  return (
    <>
      {showDay ? <DayTotalRow date={dayDate} split={day} /> : null}
      <tr className={zebra ? 'bg-[color:var(--billing-surface-muted)]/40' : ''}>
        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{formatDay(row.date)}</td>
        <td className="whitespace-nowrap px-2 py-1.5 font-medium">{row.flightNo}</td>
        <td className="px-2 py-1.5">{row.passengerName}</td>
        {layout === 'vj' ? (
          <>
            <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{row.receiptNo}</td>
            <td className="whitespace-nowrap px-2 py-1.5">{row.pnr}</td>
            <td className="px-2 py-1.5">{row.chargeType}</td>
            <td className="whitespace-nowrap px-2 py-1.5">{row.quantity}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{inr(row.total)}</td>
            <td className="whitespace-nowrap px-2 py-1.5">{row.paymentMode}</td>
            <td className="px-2 py-1.5 text-[color:var(--billing-text-muted)]">{row.paymentNote}</td>
          </>
        ) : (
          <>
            <td className="whitespace-nowrap px-2 py-1.5">{row.pnr}</td>
            <td className="whitespace-nowrap px-2 py-1.5">{row.quantity}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{inr(row.rate)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{inr(row.amount)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{inr(row.tax)}</td>
            <td className="px-2 py-1.5 text-right font-medium tabular-nums">{inr(row.total)}</td>
            <td className="whitespace-nowrap px-2 py-1.5">{row.paymentMode}</td>
          </>
        )}
      </tr>
    </>
  );
}

function DayTotalRow({ date, split }: { date: string; split?: EbcSplit }) {
  if (!split) return null;
  return (
    <tr className="bg-[color:var(--billing-accent-soft)] font-medium">
      <td className="px-2 py-1.5" colSpan={7}>
        {formatDay(date)} collection · UPI {inr(split.upi)} · Cash {inr(split.cash)} · Card {inr(split.card)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{inr(split.total)}</td>
      <td colSpan={2} />
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${billingUi.card} px-3 py-2`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--billing-text-muted)]">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-[color:var(--billing-text)]">{value}</p>
    </div>
  );
}

function ModeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        active
          ? 'border-[color:var(--billing-primary)] bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-heading)]'
          : 'border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] text-[color:var(--billing-text-muted)]'
      }`}
    >
      {label}
    </button>
  );
}
