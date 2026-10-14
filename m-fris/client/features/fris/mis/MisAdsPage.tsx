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
  shiftMonthDateRange,
  toYearMonth,
} from '@/components/billing/output/misCheckerDateRange';
import type { AdsMisPreviewSheet, AdsMisSheetStatus, AdsMisStatusPayload } from './misAdsTypes';
import { MisAdsWorkbookPreview } from './MisAdsWorkbookPreview';

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

function statusIcon(status: AdsMisSheetStatus['status']) {
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

function statusBadgeClass(status: AdsMisSheetStatus['status']): string {
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
 * MIS ADS — one-click workbook export with sheet-wise billing readiness & formula preservation.
 */
export function MisAdsPage() {
  const initialRange = useMemo(() => {
    const now = new Date();
    const current = getCurrentMonthDateRange(now);
    return shiftMonthDateRange(current.from, -1) ?? current;
  }, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [monthValue, setMonthValue] = useState(() => toYearMonth(initialRange.from));
  const [stationCode, setStationCode] = useState('STN');
  const [status, setStatus] = useState<AdsMisStatusPayload | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [showGapDialog, setShowGapDialog] = useState(false);
  const [previewSheets, setPreviewSheets] = useState<AdsMisPreviewSheet[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStationCode(readStationCode());
  }, []);

  const loadPreview = useCallback(async () => {
    if (!from || !to || from > to) {
      setError('Select a valid month range.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await billingApi.getMisAdsPreview({ from, to });
      const data = (res as { data?: AdsMisStatusPayload }).data ?? null;
      setStatus(data);
      setPreviewSheets(data?.previewSheets ?? []);
    } catch (e) {
      setStatus(null);
      setPreviewSheets(null);
      setError(e instanceof Error ? e.message : 'Failed to load MIS ADS preview.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

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
      await billingApi.downloadMisAdsExcel({ from, to });
      setShowGapDialog(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MIS ADS export failed.');
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

  const title = `${stationCode} — MIS ADS`;

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-emerald-50">
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 lg:px-8 xl:px-10">
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
                  onClick={() => void loadPreview()}
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
              aria-label="Download MIS ADS Excel workbook"
            >
              {exporting ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <ExcelLogoIcon className="h-5 w-5" />
              )}
              <Download className="h-4 w-4" aria-hidden />
              MIS ADS
            </button>
          </div>

          {status ? (
            <p className="mt-3 text-sm text-slate-600">
              {status.stationLabel} · {status.monthLabel} · {status.summary.adsInvoices} ADS
              invoice(s) · {status.summary.billedAirlines}/{status.summary.priceCardAirlines}{' '}
              airlines billed. Preview matches the export workbook for this station and month.
            </p>
          ) : loading ? (
            <p className="mt-3 text-sm text-slate-500" aria-live="polite">
              Loading workbook preview for this station and month…
            </p>
          ) : null}
          {exporting ? (
            <p className="mt-3 text-sm font-medium text-emerald-800" aria-live="polite">
              Building the MIS ADS workbook from indexed usage. Stay on this page.
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm font-medium text-rose-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {loading && !status ? (
          <section
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
            aria-busy="true"
            aria-label="Loading sheet status"
          >
            <div className="mb-4 h-5 w-40 animate-pulse rounded bg-slate-200" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          </section>
        ) : null}

        {error && !status ? (
          <section
            className="rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-6"
            role="alert"
          >
            <p className="text-sm font-medium text-rose-800">Could not load MIS ADS preview.</p>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-rose-800 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => void loadPreview()}
            >
              Try again
            </button>
          </section>
        ) : null}

        {status ? (
          <section
            className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
            aria-label="Sheet-wise ADS billing status"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Workbook preview</h2>
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
            <div className="flex flex-wrap gap-2">
              {status.sheets.map((sheet) => (
                <span
                  key={sheet.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(sheet.status)}`}
                >
                  {statusIcon(sheet.status)}
                  {sheet.label}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <MisAdsWorkbookPreview sheets={previewSheets} loading={loading} />
      </div>

      {showGapDialog && status && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mis-ads-gap-title"
            >
              <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: '85dvh' }}>
                <div className="px-6 pt-6">
                  <h2 id="mis-ads-gap-title" className="text-lg font-semibold text-slate-900">
                    Billing incomplete for {status.monthLabel}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Invoices are optional. Workbook still exports station/month ADS usage. These airlines
                    have a price card but no ADS invoice in the period yet.
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
                  aria-label="Airlines without an ADS invoice this month"
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
                    <ExcelLogoIcon className="h-4 w-4" />
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
