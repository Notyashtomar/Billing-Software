'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import { Badge } from '@/components/ui/badge';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import {
  aggregateAdsMisCheckerRows,
  formatAdsInr,
  formatAdsQty,
  sumAdsMisCheckerRows,
  type MisCheckerAdsAirlineRow,
} from './misCheckerAdsAggregate';
import { downloadAdsMisCheckerExcel } from './misCheckerAdsExport';
import {
  getCurrentMonthDateRange,
  getMonthDateRange,
  getPreviousMonthDateRange,
  shiftMonthDateRange,
  toYearMonth,
} from './misCheckerDateRange';

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
 * ADS MIS Checker — airline subtotals (yellow) + service-code lines,
 * matching the classic MIS bill-check spreadsheet layout.
 */
export function MisCheckerAdsPage({ api }: Props) {
  const initialRange = useMemo(() => getPreviousMonthDateRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [monthValue, setMonthValue] = useState(() => toYearMonth(initialRange.from));
  const [stationCode, setStationCode] = useState('STN');
  const [airlines, setAirlines] = useState<MisCheckerAdsAirlineRow[]>([]);
  /** Airline keys with service rows expanded. Default: all collapsed. */
  const [expandedAirlines, setExpandedAirlines] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [hasFetched, setHasFetched] = useState(false);
  const [roeToInr, setRoeToInr] = useState(1);

  const totals = useMemo(() => sumAdsMisCheckerRows(airlines), [airlines]);
  const bannerTitle = `${stationCode} - BILL CHECK ANALYSIS - ADS`;

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
      const [adsRes, customersRes, roeRes] = await Promise.all([
        api.listAds({ from, to, dateBasis: 'schedule-date' }),
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

      const roePayload = roeRes as { data?: { rateToINR?: number } | null } | null;
      const roe = Number(roePayload?.data?.rateToINR);
      const effectiveRoe = Number.isFinite(roe) && roe > 0 ? roe : 1;
      setRoeToInr(effectiveRoe);

      const aggregated = aggregateAdsMisCheckerRows(adsRes.data?.rows ?? [], {
        customerDirectory: directory,
        roeToInr: effectiveRoe,
      });
      setAirlines(aggregated);
      setExpandedAirlines(new Set());
      setHasFetched(true);
    } catch (e) {
      setAirlines([]);
      setExpandedAirlines(new Set());
      setError(e instanceof Error ? e.message : 'Failed to load ADS analysis.');
      setHasFetched(true);
    } finally {
      setLoading(false);
    }
  }, [api, from, to]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const toggleAirline = (airlineKey: string) => {
    setExpandedAirlines((prev) => {
      const next = new Set(prev);
      if (next.has(airlineKey)) next.delete(airlineKey);
      else next.add(airlineKey);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedAirlines(new Set(airlines.map((a) => a.airlineKey)));
  };

  const collapseAll = () => {
    setExpandedAirlines(new Set());
  };

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
    if (airlines.length === 0) {
      setError('No ADS rows to export for selected period.');
      return;
    }
    setExporting(true);
    setError('');
    try {
      await downloadAdsMisCheckerExcel({
        stationCode,
        from,
        to,
        airlines,
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
        title="ADS — MIS Checker"
        description="Airline × service bill check — total quantity, chargeable units, INR"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/billing/mis-checker" className={billingUi.btnSecondary}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Sources
            </Link>
            <button
              type="button"
              className={billingUi.btnPrimary}
              disabled={exporting || loading || airlines.length === 0}
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

      <section className={`${billingUi.card} mb-4 p-4`} aria-label="ADS MIS filters">
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
            USD→INR ROE applied: 1 USD ={' '}
            {roeToInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} INR
          </p>
        ) : null}
      </section>

      {error ? (
        <div className={`${billingUi.alertDanger} mb-4`} role="alert">
          {error}
        </div>
      ) : null}

      <section className={`${billingUi.card} overflow-hidden`} aria-label="ADS bill check preview">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-violet-50/40 to-slate-50 px-4 py-4 sm:px-5">
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
                <>
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-white font-medium text-slate-700"
                  >
                    {airlines.length.toLocaleString('en-IN')} airlines
                  </Badge>
                  {airlines.length > 0 ? (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={expandAll}
                      >
                        Expand all
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={collapseAll}
                      >
                        Collapse all
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative max-h-[min(75vh,800px)] overflow-auto bg-white">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Loading ADS bill check analysis…
            </div>
          ) : airlines.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-slate-500">
              No ADS usage found for selected period.
            </div>
          ) : (
            <table className="min-w-[640px] w-full border-collapse text-left text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="bg-slate-50/95 backdrop-blur-sm">
                  <th
                    scope="col"
                    className="border border-slate-100 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs"
                  >
                    Service name
                  </th>
                  <th
                    scope="col"
                    className="border border-slate-100 bg-blue-50/50 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs"
                  >
                    Total quantity
                  </th>
                  <th
                    scope="col"
                    className="border border-slate-100 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs"
                  >
                    Chargeable units
                  </th>
                  <th
                    scope="col"
                    className="border border-slate-100 bg-amber-50/50 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs"
                  >
                    Total in local currency (INR)
                  </th>
                </tr>
              </thead>
              <tbody>
                {airlines.map((airline) => {
                  const isOpen = expandedAirlines.has(airline.airlineKey);
                  const serviceCount = airline.services.length;
                  return (
                    <AirlineGroup
                      key={airline.key}
                      airline={airline}
                      isOpen={isOpen}
                      serviceCount={serviceCount}
                      onToggle={() => toggleAirline(airline.airlineKey)}
                    />
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="border-t border-amber-200/80 bg-amber-50/90 font-semibold text-amber-950 shadow-[0_-4px_12px_rgba(15,23,42,0.04)]">
                  <td className="border border-slate-100 px-3 py-2.5">Grand Total</td>
                  <td className="border border-slate-100 bg-blue-50/40 px-3 py-2.5 text-right tabular-nums">
                    {formatAdsQty(totals.totalQuantity) || '—'}
                  </td>
                  <td className="border border-slate-100 px-3 py-2.5 text-right tabular-nums">
                    {formatAdsQty(totals.chargeableUnits) || (
                      <span className="font-normal text-slate-400">—</span>
                    )}
                  </td>
                  <td className="border border-slate-100 bg-amber-50/70 px-3 py-2.5 text-right tabular-nums">
                    {formatAdsInr(totals.totalInr) || '—'}
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

function AirlineGroup({
  airline,
  isOpen,
  serviceCount,
  onToggle,
}: {
  airline: MisCheckerAdsAirlineRow;
  isOpen: boolean;
  serviceCount: number;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer bg-amber-50/80 transition-colors hover:bg-amber-100/70"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label={`${airline.serviceName}, ${serviceCount} services. ${isOpen ? 'Collapse' : 'Expand'}`}
      >
        <td className="border border-slate-100 px-3 py-2 font-semibold text-slate-800">
          <span className="inline-flex items-center gap-1.5">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            )}
            {airline.serviceName}
            <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {serviceCount}
            </span>
          </span>
        </td>
        <td className="border border-slate-100 bg-blue-50/30 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
          {formatAdsQty(airline.totalQuantity) || '—'}
        </td>
        <td className="border border-slate-100 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
          {formatAdsQty(airline.chargeableUnits) || (
            <span className="font-normal text-slate-300">—</span>
          )}
        </td>
        <td className="border border-slate-100 bg-amber-50/40 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
          {formatAdsInr(airline.totalInr) || '—'}
        </td>
      </tr>
      {isOpen
        ? airline.services.map((row, index) => (
            <tr
              key={row.key}
              className={`transition-colors hover:bg-sky-50/40 ${
                index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
              }`}
            >
              <td className="border border-slate-100 px-3 py-1.5 pl-10 font-medium text-slate-700">
                {row.serviceName}
              </td>
              <td className="border border-slate-100 bg-blue-50/20 px-3 py-1.5 text-right tabular-nums text-slate-600">
                {formatAdsQty(row.totalQuantity) || (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="border border-slate-100 px-3 py-1.5 text-right tabular-nums text-slate-600">
                {formatAdsQty(row.chargeableUnits) || (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="border border-slate-100 bg-amber-50/25 px-3 py-1.5 text-right tabular-nums font-medium text-slate-800">
                {formatAdsInr(row.totalInr) || (
                  <span className="font-normal text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))
        : null}
    </>
  );
}
