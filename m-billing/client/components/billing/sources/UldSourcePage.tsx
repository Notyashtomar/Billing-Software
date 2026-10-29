'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plane, Upload, XCircle } from 'lucide-react';
import { billingApi } from '@/lib/billing-api';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';

type UldFlag = '' | 'A320' | 'XXLD';

type UldSheet = {
  airline: string;
  uldTypes: string[];
  opening: Array<{ uldType: string; balance: number | null }>;
  rows: Array<{
    date: string;
    flightNo: string;
    flag: UldFlag;
    movements: Array<{ uldType: string; inQty: number | null; outQty: number | null; balance: number | null }>;
  }>;
};

type UldPayload = {
  months: Array<{ month: string; label: string; airlines: number; rows: number }>;
  month: string | null;
  airlines: string[];
  sheet: UldSheet | null;
};

function qty(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '' : String(value);
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

export function UldSourcePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<UldPayload | null>(null);
  const [month, setMonth] = useState<string | undefined>();
  const [airline, setAirline] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [askKind, setAskKind] = useState(false);
  const [kind, setKind] = useState<'others' | 'ua-vs'>('others');

  const load = useCallback(async (nextMonth?: string, nextAirline?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await billingApi.listUld({ month: nextMonth, airline: nextAirline });
      setData(res);
      setMonth(res.month ?? undefined);
      setAirline(res.sheet?.airline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ULD data.');
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
      const res = await billingApi.importUld(file, kind);
      const summary = (res.months ?? [])
        .map((item) => `${item.label}: ${item.airlines} airlines, ${item.rows} rows`)
        .join(' · ');
      setNotice(summary ? `Imported ${summary}. Re-importing a month replaces that month.` : 'Imported.');
      await load(res.months?.[res.months.length - 1]?.month);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const sheet = data?.sheet;
  const a320 = sheet?.rows.filter((row) => row.flag === 'A320').length ?? 0;
  const xxld = sheet?.rows.filter((row) => row.flag === 'XXLD').length ?? 0;

  return (
    <div className="min-w-0">
      <BillingPageHeader
        title="ULD"
        description="Monthly ULD control — one airline at a time, exactly as the station workbook."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
              onClick={() => setAskKind(true)}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import workbook
            </button>
          </>
        }
      />

      {loading && !data ? (
        <div className={`${billingUi.card} flex min-h-[240px] items-center justify-center gap-2 text-sm text-[color:var(--billing-text-muted)]`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading ULD movements…
        </div>
      ) : null}

      {askKind ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setAskKind(false)}>
          <div
            className={`${billingUi.card} w-full max-w-md p-5`}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold">Which workbook is this?</p>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
              United and Virgin arrive as one airline per sheet. Every other airline is the shared monthly matrix.
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className={billingUi.btnPrimary}
                onClick={() => {
                  setKind('ua-vs');
                  setAskKind(false);
                  fileRef.current?.click();
                }}
              >
                United & Virgin (UA / VS)
              </button>
              <button
                type="button"
                className="rounded-[var(--billing-radius)] border border-[color:var(--billing-border)] px-4 py-2 text-sm font-semibold"
                onClick={() => {
                  setKind('others');
                  setAskKind(false);
                  fileRef.current?.click();
                }}
              >
                Other airlines
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {!loading && data && data.months.length === 0 ? (
        <div className={`${billingUi.card} flex min-h-[280px] flex-col items-center justify-center p-8 text-center`}>
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-accent-strong)]">
            <Plane className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold">No ULD workbook imported for this station yet</p>
          <p className="mt-1 max-w-md text-xs text-[color:var(--billing-text-muted)]">
            Import the monthly Excel. Each sheet named like SEP 2026 is stored for that month, airline by airline.
            Green rows come in as A320 and red rows as XXLD (cancelled).
          </p>
        </div>
      ) : null}

      {data && data.months.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-[color:var(--billing-text-muted)]" htmlFor="uld-month">
              Month
            </label>
            <select
              id="uld-month"
              className="rounded-lg border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-3 py-1.5 text-sm"
              value={month ?? ''}
              onChange={(event) => void load(event.target.value)}
            >
              {data.months.map((item) => (
                <option key={item.month} value={item.month}>
                  {item.label} · {item.airlines} airlines
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-[color:var(--billing-text-muted)]">
              {loading ? 'Loading…' : `${data.airlines.length} airlines`}
            </span>
          </div>

          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {data.airlines.map((name) => {
              const active = name === sheet?.airline;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => void load(month, name)}
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
              <div className="mb-3 grid grid-cols-3 gap-2">
                <Stat label="Movements" value={String(sheet.rows.length)} />
                <Stat label="A320" value={String(a320)} tone="emerald" />
                <Stat label="XXLD cancelled" value={String(xxld)} tone="rose" />
              </div>
              <div className={`${billingUi.card} overflow-auto`}>
                <table className="min-w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[color:var(--billing-surface-muted)]">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold" rowSpan={2}>Date</th>
                      <th className="px-2 py-2 text-left font-semibold" rowSpan={2}>Flight</th>
                      <th className="px-2 py-2 text-left font-semibold" rowSpan={2}>Status</th>
                      {sheet.uldTypes.map((type) => (
                        <th
                          key={type}
                          colSpan={3}
                          className="border-l border-[color:var(--billing-border)] px-2 py-1.5 text-center font-semibold"
                        >
                          {type}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {sheet.uldTypes.map((type) => (
                        ['In', 'Out', 'Bal'].map((label) => (
                          <th
                            key={`${type}-${label}`}
                            className="border-l border-[color:var(--billing-border)] px-2 py-1 text-right font-medium text-[color:var(--billing-text-muted)]"
                          >
                            {label}
                          </th>
                        ))
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-[color:var(--billing-surface-muted)]/60 font-medium">
                      <td className="px-2 py-1.5" colSpan={3}>Opening balance</td>
                      {sheet.uldTypes.map((type) => {
                        const found = sheet.opening.find((item) => item.uldType === type);
                        return (
                          <QtyCells key={`open-${type}`} inQty={null} outQty={null} balance={found?.balance ?? null} />
                        );
                      })}
                    </tr>
                    {sheet.rows.map((row, index) => (
                      <tr
                        key={`${row.date}-${row.flightNo}-${index}`}
                        className={
                          row.flag === 'A320'
                            ? 'bg-emerald-500/10'
                            : row.flag === 'XXLD'
                              ? 'bg-rose-500/10'
                              : index % 2
                                ? 'bg-[color:var(--billing-surface-muted)]/40'
                                : ''
                        }
                      >
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{formatDay(row.date)}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-medium">{row.flightNo}</td>
                        <td className="px-2 py-1.5">
                          {row.flag === 'A320' ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              A320
                            </span>
                          ) : row.flag === 'XXLD' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                              <XCircle className="h-3 w-3" /> XXLD
                            </span>
                          ) : null}
                        </td>
                        {sheet.uldTypes.map((type) => {
                          const movement = row.movements.find((item) => item.uldType === type);
                          return (
                            <QtyCells
                              key={`${index}-${type}`}
                              inQty={movement?.inQty ?? null}
                              outQty={movement?.outQty ?? null}
                              balance={movement?.balance ?? null}
                            />
                          );
                        })}
                      </tr>
                    ))}
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'rose' }) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : 'text-[color:var(--billing-text)]';
  return (
    <div className={`${billingUi.card} px-3 py-2`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--billing-text-muted)]">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function QtyCells({
  inQty,
  outQty,
  balance,
}: {
  inQty: number | null;
  outQty: number | null;
  balance: number | null;
}) {
  return (
    <>
      <td className="border-l border-[color:var(--billing-border)] px-2 py-1.5 text-right tabular-nums">{qty(inQty)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{qty(outQty)}</td>
      <td className="px-2 py-1.5 text-right font-medium tabular-nums">{qty(balance)}</td>
    </>
  );
}
