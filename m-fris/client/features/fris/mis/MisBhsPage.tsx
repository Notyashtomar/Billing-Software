'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { billingApi } from '@/lib/billing-api';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { Badge } from '@/components/ui/badge';
import {
  getCurrentMonthDateRange,
  getMonthDateRange,
  getPreviousMonthDateRange,
  shiftMonthDateRange,
  toYearMonth,
} from '@/components/billing/output/misCheckerDateRange';
import type { BhsMisSheetStatus, BhsMisStatusPayload } from './misBhsTypes';

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

function statusIcon(status: BhsMisSheetStatus['status']) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
    case 'partial':
      return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />;
    case 'missing':
      return <XCircle className="h-4 w-4 text-rose-500" aria-hidden />;
    default:
      return <CircleDashed className="h-4 w-4 text-slate-400" aria-hidden />;
  }
}

function statusBadgeClass(status: BhsMisSheetStatus['status']): string {
  switch (status) {
    case 'complete':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'partial':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'missing':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

/**
 * MIS BHS — one-click workbook export with sheet-wise billing readiness.
 */
export function MisBhsPage() {
  const initialRange = useMemo(() => getPreviousMonthDateRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [monthValue, setMonthValue] = useState(() => toYearMonth(initialRange.from));
  const [stationCode, setStationCode] = useState('STN');
  const [status, setStatus] = useState<BhsMisStatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [showGapDialog, setShowGapDialog] = useState(false);

  useEffect(() => {
    setStationCode(readStationCode());
  }, []);

  const loadStatus = useCallback(async () => {
    if (!from || !to || from > to) {
      setError('Select a valid month range.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await billingApi.getMisBhsStatus({ from, to });
      setStatus((res as { data?: BhsMisStatusPayload }).data ?? null);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : 'Failed to load MIS BHS status.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const applyRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setMonthValue(toYearMonth(nextFrom));
  };

  const onMonthChange = (value: string) => {
    setMonthValue(value);
    const range = getMonthDateRange(value);
    if (!range) return;
    applyRange(range.from, range.to);
  };

  const runDownload = async () => {
    setExporting(true);
    setError('');
    try {
      await billingApi.downloadMisBhsExcel({ from, to });
      setShowGapDialog(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MIS BHS export failed.');
    } finally {
      setExporting(false);
    }
  };

  const onDownloadClick = () => {
    if (status && status.missingBilling.length > 0) {
      setShowGapDialog(true);
      return;
    }
    void runDownload();
  };

  const displayStation = status?.stationLabel || stationCode;
  const title = `${displayStation} — MIS BHS`;

  return (
    <div className="min-h-full bg-emerald-50">
      <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader title={title} icon={FileSpreadsheet} />

        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[10rem] flex-col gap-1 text-sm font-medium text-slate-700">
                Billing month
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
                    const range = shiftMonthDateRange(from, -1);
                    if (!range) return;
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
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
              onClick={onDownloadClick}
              disabled={exporting}
              aria-label="Download MIS BHS Excel workbook"
            >
              {exporting ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <ExcelLogoIcon className="h-5 w-5" />
              )}
              <Download className="h-4 w-4" aria-hidden />
              MIS BHS
            </button>
          </div>

          {status ? (
            <p className="mt-3 text-sm text-slate-600">
              {status.stationLabel} · {status.monthLabel} · {status.summary.scheduledFlights}{' '}
              scheduled flight(s) · {status.summary.bhsInvoices} BHS invoice(s) ·{' '}
              {status.summary.billedAirlines}/{status.summary.priceCardAirlines} airlines billed.
            </p>
          ) : null}
          {exporting ? (
            <p className="mt-3 text-sm font-medium text-emerald-800" aria-live="polite">
              Building the MIS BHS workbook. Stay on this page — a full month can take a few minutes.
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm font-medium text-rose-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {status ? (
          <section
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
            aria-label="Sheet-wise BHS billing status"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Sheet-wise status</h2>
              <Badge
                className={
                  status.readyForExport
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }
              >
                {status.readyForExport ? 'Ready for export' : 'Billing gaps remain'}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {status.sheets.map((sheet) => (
                <article
                  key={sheet.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 p-4"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {statusIcon(sheet.status)}
                      <h3 className="text-sm font-semibold text-slate-900">{sheet.label}</h3>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(sheet.status)}`}
                    >
                      {sheet.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">{sheet.message}</p>
                  {sheet.expectedCount != null ? (
                    <p className="mt-2 text-xs tabular-nums text-slate-500">
                      {sheet.rowCount ?? 0} / {sheet.expectedCount} airlines
                    </p>
                  ) : sheet.rowCount != null ? (
                    <p className="mt-2 text-xs tabular-nums text-slate-500">{sheet.rowCount} rows</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {showGapDialog && status && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mis-bhs-gap-title"
            >
              <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: '85dvh' }}>
                <div className="px-6 pt-6">
                  <h2 id="mis-bhs-gap-title" className="text-lg font-semibold text-slate-900">
                    Billing incomplete for {status.monthLabel}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    The MIS workbook can still be downloaded with template formulas, but these airlines
                    need BHS billing completed before numbers will match the billing system exactly.
                  </p>
                </div>
                <div
                  className="px-6"
                  style={{
                    marginTop: 16,
                    maxHeight: 'min(22rem, 50dvh)',
                    overflowX: 'hidden',
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                  }}
                  tabIndex={0}
                  onWheel={(event) => event.stopPropagation()}
                >
                <ul
                  className="space-y-2 pb-1"
                  aria-label="Airlines without a BHS invoice this month"
                >
                  {status.missingBilling.map((row) => (
                    <li
                      key={row.customerCode}
                      className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                    >
                      <span className="font-semibold">{row.customerCode}</span> — {row.airlineName}
                      <span className="mt-0.5 block text-xs text-amber-800">{row.reason}</span>
                    </li>
                  ))}
                </ul>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                    onClick={() => setShowGapDialog(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => void runDownload()}
                    disabled={exporting}
                  >
                    <FileSpreadsheet className="h-4 w-4" aria-hidden />
                    Download anyway
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
