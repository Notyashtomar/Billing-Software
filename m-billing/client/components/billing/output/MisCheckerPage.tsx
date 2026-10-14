'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import { Badge } from '@/components/ui/badge';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import {
  aggregateRbhsBillCheckRows,
  formatInAmount,
  formatInInteger,
  sumMisCheckerAggRows,
  type MisCheckerAggRow,
} from './misCheckerAggregate';
import {
  getCurrentMonthDateRange,
  getMonthDateRange,
  getPreviousMonthDateRange,
  shiftMonthDateRange,
  toYearMonth,
} from './misCheckerDateRange';
import { downloadRbhsBillCheckExcel } from './misCheckerExport';

const thBase =
  'border border-slate-100 px-3 py-2.5 text-[11px] uppercase tracking-wide text-slate-600 font-semibold sm:text-xs';
const thNum = `${thBase} text-right`;
const tdBase = 'border border-slate-100 px-3 py-2';
const tdNum = `${tdBase} text-right tabular-nums text-slate-600 font-medium`;
const tdMoney = `${tdBase} text-right tabular-nums font-semibold text-slate-800`;

type Props = { api: BillingApi };

function readStationCode(): string {
  if (typeof window === 'undefined') return 'STN';
  return (
    localStorage.getItem('userStationCode')?.trim().toUpperCase() ||
    localStorage.getItem('stationCode')?.trim().toUpperCase() ||
    'STN'
  );
}

/**
 * MIS Checker — RBHS Bill Check Analysis.
 *
 * UX: Finance lands on previous month, picks month/range, loads live BHS sources,
 * reviews airline×rate aggregation in Excel-styled preview, downloads workbook.
 */
export function MisCheckerPage({ api }: Props) {
  const initialRange = useMemo(() => getPreviousMonthDateRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [monthValue, setMonthValue] = useState(() => toYearMonth(initialRange.from));
  const [stationCode, setStationCode] = useState('STN');
  const [rows, setRows] = useState<MisCheckerAggRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [hasFetched, setHasFetched] = useState(false);
  const [roeToInr, setRoeToInr] = useState(1);

  const totals = useMemo(() => sumMisCheckerAggRows(rows), [rows]);
  const bannerTitle = `${stationCode} - BILL CHECK ANALYSIS - RBHS`;

  useEffect(() => {
    setStationCode(readStationCode());
  }, []);

  const loadAnalysis = useCallback(async () => {
    if (!from || !to) {
      setError('Select both From and To dates.');
      return;
    }
    if (from > to) {
      setError('From date must be on or before To date.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [flightsRes, customersRes, roeRes] = await Promise.all([
        api.listScheduledFlights({
          from,
          to,
          dateBasis: 'schedule-date',
        }),
        api.listCustomers({ limit: 5000, active: 'all' }).catch(() => ({ data: [] })),
        api
          .getEffectiveExchangeRate({ currencyCode: 'USD', date: to })
          .catch(() => null),
      ]);

      const directory = new Map<string, string>();
      for (const c of (customersRes.data ?? []) as Array<{
        customerCode?: string;
        name?: string;
      }>) {
        const code = String(c.customerCode ?? '').trim().toUpperCase();
        const name = String(c.name ?? '').trim();
        if (code) directory.set(code, name);
      }

      const roePayload = roeRes as {
        data?: { rateToINR?: number } | null;
      } | null;
      const roe = Number(roePayload?.data?.rateToINR);
      const effectiveRoe = Number.isFinite(roe) && roe > 0 ? roe : 1;
      setRoeToInr(effectiveRoe);

      const sourceRows = flightsRes.data?.rows ?? [];
      const aggregated = aggregateRbhsBillCheckRows(sourceRows, {
        customerDirectory: directory,
        roeToInr: effectiveRoe,
      });
      setRows(aggregated);
      setHasFetched(true);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Failed to load RBHS analysis.');
      setHasFetched(true);
    } finally {
      setLoading(false);
    }
  }, [api, from, to]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const applyRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setMonthValue(toYearMonth(nextFrom));
  };

  const onMonthChange = (value: string) => {
    setMonthValue(value);
    const range = getMonthDateRange(value);
    if (!range) return;
    setFrom(range.from);
    setTo(range.to);
  };

  const onDownload = async () => {
    if (rows.length === 0) {
      setError('No RBHS rows to export for selected period.');
      return;
    }
    setExporting(true);
    setError('');
    try {
      await downloadRbhsBillCheckExcel({
        stationCode,
        from,
        to,
        rows,
        totals,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={billingUi.page}>
      <BillingPageHeader
        title="BHS — MIS Checker"
        description="RBHS Bill Check Analysis — airline × rate aggregation with concession & GST"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/billing/mis-checker" className={billingUi.btnSecondary}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Sources
            </Link>
            <button
              type="button"
              className={billingUi.btnPrimary}
              disabled={exporting || loading || rows.length === 0}
              onClick={() => void onDownload()}
              aria-label="Download Excel"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
              )}
              <Download className="h-4 w-4" aria-hidden />
              Download Excel
            </button>
          </div>
        }
      />

      <section className={`${billingUi.card} mb-4 p-4`} aria-label="MIS Checker filters">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className={`${billingUi.label} flex min-w-[9rem] flex-1 flex-col gap-1`}>
            From Date
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setMonthValue(toYearMonth(e.target.value));
              }}
              className={billingUi.input}
            />
          </label>
          <label className={`${billingUi.label} flex min-w-[9rem] flex-1 flex-col gap-1`}>
            To Date
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={billingUi.input}
            />
          </label>
          <label className={`${billingUi.label} flex min-w-[10rem] flex-1 flex-col gap-1`}>
            Select Month
            <input
              type="month"
              value={monthValue}
              onChange={(e) => onMonthChange(e.target.value)}
              className={billingUi.input}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={billingUi.btnSecondary}
              onClick={() => {
                const range = shiftMonthDateRange(from, -1);
                if (range) applyRange(range.from, range.to);
              }}
            >
              Previous Month
            </button>
            <button
              type="button"
              className={billingUi.btnSecondary}
              onClick={() => {
                const range = getCurrentMonthDateRange();
                applyRange(range.from, range.to);
              }}
            >
              Current Month
            </button>
            <button
              type="button"
              className={billingUi.btnAccent}
              disabled={loading}
              onClick={() => void loadAnalysis()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Refresh / Load Analysis
            </button>
          </div>
        </div>
        {roeToInr > 1 ? (
          <p className={`${billingUi.hint} mt-2`}>
            USD→INR ROE applied: 1 USD = {formatInAmount(roeToInr)} INR
          </p>
        ) : null}
      </section>

      {error ? (
        <div className={`${billingUi.alertDanger} mb-4`} role="alert">
          {error}
        </div>
      ) : null}

      <section
        className={`${billingUi.card} overflow-hidden`}
        aria-label="RBHS bill check preview"
      >
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 px-4 py-4 sm:px-5">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              {bannerTitle}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-slate-200 bg-white font-medium text-slate-700"
              >
                {from} → {to}
              </Badge>
              {hasFetched && !loading ? (
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-white font-medium text-slate-700"
                >
                  {formatInInteger(totals.flights)} flights
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative max-h-[min(70vh,720px)] overflow-auto bg-white">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Loading RBHS bill check analysis…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-slate-500">
              No RBHS flights found for selected period.
            </div>
          ) : (
            <table className="min-w-[960px] w-full border-collapse text-left text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="bg-slate-50/95 backdrop-blur-sm">
                  <th rowSpan={2} scope="col" className={`${thBase} text-left`}>
                    Airline
                  </th>
                  <th rowSpan={2} scope="col" className={thNum}>
                    Flights
                  </th>
                  <th rowSpan={2} scope="col" className={thNum}>
                    Rate
                  </th>
                  <th rowSpan={2} scope="col" className={thNum}>
                    Amount
                  </th>
                  <th rowSpan={2} scope="col" className={thNum}>
                    Consession
                  </th>
                  <th rowSpan={2} scope="col" className={thNum}>
                    Total
                  </th>
                  <th rowSpan={2} scope="col" className={thNum}>
                    Cgst
                  </th>
                  <th rowSpan={2} scope="col" className={thNum}>
                    Sgst
                  </th>
                  <th
                    colSpan={2}
                    scope="colgroup"
                    className="border border-blue-100 bg-blue-50/60 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-blue-800 sm:text-xs"
                  >
                    Inv. Amt - Application
                  </th>
                </tr>
                <tr className="bg-slate-50/95">
                  <th
                    scope="col"
                    className="border border-blue-100 bg-blue-50/50 px-3 py-1.5 text-right text-[11px] font-semibold text-blue-800"
                  >
                    USD
                  </th>
                  <th
                    scope="col"
                    className="border border-blue-100 bg-amber-50/60 px-3 py-1.5 text-right text-[11px] font-semibold text-amber-900"
                  >
                    INR
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.key}
                    className={`transition-colors hover:bg-sky-50/50 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                    }`}
                  >
                    <td className={`${tdBase} font-medium text-slate-800`}>
                      {row.airline}
                    </td>
                    <td className={tdNum}>{formatInInteger(row.flights)}</td>
                    <td className={tdNum}>{formatInAmount(row.rate)}</td>
                    <td className={tdNum}>{formatInAmount(row.amount)}</td>
                    <td className={tdNum}>{formatInAmount(row.consession)}</td>
                    <td className={tdNum}>{formatInAmount(row.total)}</td>
                    <td className={tdNum}>{formatInAmount(row.cgst)}</td>
                    <td className={tdNum}>{formatInAmount(row.sgst)}</td>
                    <td className={`${tdMoney} bg-blue-50/20`}>
                      {row.usd > 0 ? (
                        formatInAmount(row.usd)
                      ) : (
                        <span className="font-normal text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`${tdMoney} bg-amber-50/30`}>
                      {formatInAmount(row.inr)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800 shadow-[0_-4px_12px_rgba(15,23,42,0.04)]">
                  <td className={`${tdBase} font-semibold text-slate-800`}>TOTAL</td>
                  <td className={`${tdNum} font-semibold text-slate-800`}>
                    {formatInInteger(totals.flights)}
                  </td>
                  <td className={tdBase} />
                  <td className={`${tdNum} font-semibold text-slate-800`}>
                    {formatInAmount(totals.amount)}
                  </td>
                  <td className={`${tdNum} font-semibold text-slate-800`}>
                    {formatInAmount(totals.consession)}
                  </td>
                  <td className={`${tdNum} font-semibold text-slate-800`}>
                    {formatInAmount(totals.total)}
                  </td>
                  <td className={`${tdNum} font-semibold text-slate-800`}>
                    {formatInAmount(totals.cgst)}
                  </td>
                  <td className={`${tdNum} font-semibold text-slate-800`}>
                    {formatInAmount(totals.sgst)}
                  </td>
                  <td className={`${tdMoney} bg-blue-50/40 font-semibold`}>
                    {totals.usd > 0 ? (
                      formatInAmount(totals.usd)
                    ) : (
                      <span className="font-normal text-slate-300">—</span>
                    )}
                  </td>
                  <td className={`${tdMoney} bg-amber-50/50 font-semibold`}>
                    {formatInAmount(totals.inr)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
