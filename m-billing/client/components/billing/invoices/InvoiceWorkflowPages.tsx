'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  OTHER_STATION_BILLING_PERIOD,
  billingPeriodOverlaps,
  isDelhiStation,
  readLoginStationCode,
} from '@/lib/billing-default-period';
import { Building2, CalendarDays, ChevronLeft, Download, Loader2, Package, Plane, RefreshCw, UsersRound, Wrench } from 'lucide-react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import { BillingDataTable } from '../BillingDataTable';
import { StatusBadge } from '../StatusBadge';
import { InvoiceHeaderActionButtons } from './InvoiceHeaderActionButtons';
import { InvoiceViewPdfButton } from './InvoiceViewPdfButton';
import { InvoiceViewAnnexureButton, invoiceShowsAdsAnnexure } from './InvoiceViewAnnexureButton';
import { InvoiceSamplePdfButton } from './InvoiceSamplePdfButton';
import { InvoiceDeleteDialog } from './InvoiceDeleteDialog';
import { InvoiceBinDialog } from './InvoiceBinDialog';
import { InvoiceMergeDraftsDialog } from './InvoiceMergeDraftsDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InvoiceDraftParticularsHover } from './InvoiceDraftParticularsHover';
import { CustomInvoiceEditForm } from './CustomInvoiceEditForm';
import { DraftCustomBillForm } from './DraftCustomBillForm';
import { InvoiceLinesEditForm, linesToInvoiceEditLines } from './InvoiceLinesEditForm';
import { RafInvoiceRatesEditor, rafLinesNeedRates } from './RafInvoiceRatesEditor';
import { InvoiceConversionRatePanel } from './InvoiceConversionRatePanel';
import {
  PreparationWorkflowPanel,
  buildPreparationContext,
} from '../preparation/PreparationWorkflowPanel';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingInvoiceHeader, BillingPreparationRecord } from '@/lib/billing-shared/types';
import { formatBillingDate, formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';

type Props = { api: BillingApi };

type BulkDeleteResult = {
  deleted?: number;
  failed?: Array<{ id: string; message: string; label?: string }>;
  requested?: number;
};

function reportInvoiceBulkDelete(result: BulkDeleteResult, label: string, setMsg: (s: string) => void) {
  const deleted = result.deleted ?? 0;
  const failed = result.failed ?? [];
  if (failed.length === 0) {
    setMsg(`Deleted ${deleted} ${label}${deleted === 1 ? '' : 's'}.`);
    return;
  }
  const sample = failed
    .slice(0, 2)
    .map((f) => f.message)
    .join('; ');
  setMsg(
    `Deleted ${deleted} ${label}${deleted === 1 ? '' : 's'}. ${failed.length} could not be deleted${sample ? `: ${sample}` : ''}.`,
  );
}

type BulkBinResult = {
  moved?: number;
  restored?: number;
  failed?: Array<{ id: string; message: string; label?: string }>;
  requested?: number;
};

function reportInvoiceBulkBin(
  result: BulkBinResult,
  action: 'move' | 'restore',
  setMsg: (s: string) => void,
) {
  const count = action === 'move' ? (result.moved ?? 0) : (result.restored ?? 0);
  const label = action === 'move' ? 'moved to bin' : 'restored';
  const failed = result.failed ?? [];
  if (failed.length === 0) {
    setMsg(`${count} invoice${count === 1 ? '' : 's'} ${label}.`);
    return;
  }
  const sample = failed
    .slice(0, 2)
    .map((f) => f.message)
    .join('; ');
  setMsg(
    `${count} invoice${count === 1 ? '' : 's'} ${label}. ${failed.length} failed${sample ? `: ${sample}` : ''}.`,
  );
}

function isDraftStatus(status: string) {
  return status === 'draft' || status === 'pending_approval';
}

function canConvertInvoiceCurrency(header: BillingInvoiceHeader) {
  if (header.inBin) return false;
  return ['draft', 'pending_approval', 'approved', 'generated'].includes(header.status);
}

function canEditInvoice(header: BillingInvoiceHeader) {
  if (header.inBin) return false;
  return isDraftStatus(header.status) || header.status === 'approved';
}

function canDeleteInvoice(header: BillingInvoiceHeader) {
  if (isDraftStatus(header.status)) return true;
  return ['approved', 'generated', 'cancelled', 'archived'].includes(header.status);
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

function formatInvoiceCurrency(amount: number, currencyCode: string) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode === 'USD' ? 'USD' : 'INR',
  }).format(amount);
}

type InvoiceLineItem = {
  lineNo: number;
  serviceCode: string;
  description: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  lineDiscountPercent?: number;
  lineAmountExclTax: number;
  gstPercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineAmountInclTax: number;
  sourceType?: string;
  sourceRef?: Record<string, unknown>;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapInvoiceLine(line: Record<string, unknown>): InvoiceLineItem {
  return {
    lineNo: asNumber(line.lineNo),
    serviceCode: String(line.serviceCode ?? ''),
    description: String(line.description ?? ''),
    quantity: asNumber(line.quantity, 1),
    uom: String(line.uom ?? ''),
    unitPrice: asNumber(line.unitPrice),
    lineDiscountPercent:
      line.lineDiscountPercent == null ? undefined : asNumber(line.lineDiscountPercent),
    lineAmountExclTax: asNumber(line.lineAmountExclTax),
    gstPercent: asNumber(line.gstPercent),
    cgstAmount: asNumber(line.cgstAmount),
    sgstAmount: asNumber(line.sgstAmount),
    igstAmount: asNumber(line.igstAmount),
    lineAmountInclTax: asNumber(line.lineAmountInclTax),
    sourceType: line.sourceType ? String(line.sourceType) : undefined,
    sourceRef:
      line.sourceRef && typeof line.sourceRef === 'object'
        ? (line.sourceRef as Record<string, unknown>)
        : undefined,
  };
}

function isCeilingParticularLine(line: InvoiceLineItem): boolean {
  if (String(line.serviceCode ?? '').trim().toUpperCase() === 'CEILING') return true;
  if (line.sourceRef?.ceilingRate === true) return true;
  return /^ceiling rate$/i.test(String(line.description ?? '').trim());
}

function InvoiceAmountBreakdown({
  header,
  lines,
}: {
  header: BillingInvoiceHeader;
  lines: InvoiceLineItem[];
}) {
  const ceilingOnLines = lines.reduce(
    (sum, line) => sum + (isCeilingParticularLine(line) ? line.lineAmountExclTax : 0),
    0,
  );
  const particularsSubtotal = lines.reduce(
    (sum, line) => sum + (isCeilingParticularLine(line) ? 0 : line.lineAmountExclTax),
    0,
  );
  const headerSubtotal = header.subtotalExclTax;
  const headerConcession = header.concessionFeeAmount ?? 0;
  const headerAlreadyPeeled =
    lines.length > 0 && Math.abs(headerSubtotal - particularsSubtotal) < 0.05;
  const subtotalExclTax = headerAlreadyPeeled
    ? headerSubtotal
    : Math.max(0, headerSubtotal - ceilingOnLines);
  const concessionAmount = headerAlreadyPeeled
    ? headerConcession
    : headerConcession + ceilingOnLines;
  const concessionPercent = header.concessionFeePercent ?? 0;
  const currency = header.currencyCode === 'USD' ? 'USD' : 'INR';
  const usdReceivable = currency === 'USD' && Boolean(header.totalReceivableInUsd);
  const roe = Number(header.currencyFactor) > 0 ? Number(header.currencyFactor) : 1;
  const grossBilling = subtotalExclTax + concessionAmount;
  const grossInr = currency === 'USD' && !usdReceivable ? grossBilling * roe : grossBilling;
  const cgst = header.taxTotal > 0 ? header.taxTotal / 2 : 0;
  const sgst = header.taxTotal > 0 ? header.taxTotal / 2 : 0;

  return (
    <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/80 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Invoice totals
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4 sm:block">
          <dt className="text-gray-500">Total amount ({currency})</dt>
          <dd className="font-medium text-gray-900">
            {formatInvoiceCurrency(subtotalExclTax, currency)}
          </dd>
        </div>
        {concessionPercent > 0 && concessionAmount > 0.004 ? (
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-gray-500">Concession @ {concessionPercent.toFixed(2)}%</dt>
            <dd className="font-medium text-gray-900">
              {formatInvoiceCurrency(concessionAmount, currency)}
            </dd>
          </div>
        ) : concessionAmount > 0.004 ? (
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-gray-500">Concession</dt>
            <dd className="font-medium text-gray-900">
              {formatInvoiceCurrency(concessionAmount, currency)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 sm:block">
          <dt className="text-gray-500">Total gross revenue ({currency})</dt>
          <dd className="font-medium text-gray-900">
            {formatInvoiceCurrency(grossBilling, currency)}
          </dd>
        </div>
        {currency === 'USD' && !usdReceivable ? (
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-gray-500">Converted gross (INR @ ROE {roe})</dt>
            <dd className="font-medium text-gray-900">{fmt(grossInr)}</dd>
          </div>
        ) : null}
        {currency === 'USD' && usdReceivable ? (
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-gray-500">Exchange rate (ROE {roe})</dt>
            <dd className="font-medium text-gray-900">Reference only</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 sm:block">
          <dt className="text-gray-500">
            CGST + SGST ({usdReceivable ? 'USD' : 'INR'})
          </dt>
          <dd className="font-medium text-gray-900">
            {usdReceivable
              ? `${formatInvoiceCurrency(cgst, 'USD')} + ${formatInvoiceCurrency(sgst, 'USD')}`
              : `${fmt(cgst)} + ${fmt(sgst)}`}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-gray-200 pt-2 sm:col-span-2 sm:flex sm:justify-between">
          <dt className="font-semibold text-gray-700">
            Total receivable ({usdReceivable ? 'USD' : 'INR'})
          </dt>
          <dd className="font-semibold text-[color:var(--billing-accent-strong)]">
            {usdReceivable
              ? formatInvoiceCurrency(header.totalInclTax, 'USD')
              : fmt(header.totalInclTax)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function InvoiceCalculationDetails({
  header,
  lines,
  separateLineNos,
  splitting,
  onToggleSeparateLine,
  onCreateSeparateBill,
}: {
  header: BillingInvoiceHeader;
  lines: InvoiceLineItem[];
  separateLineNos?: Set<number>;
  splitting?: boolean;
  onToggleSeparateLine?: (lineNo: number) => void;
  onCreateSeparateBill?: () => void;
}) {
  const currency = header.currencyCode === 'USD' ? 'USD' : 'INR';
  const usdReceivable = currency === 'USD' && Boolean(header.totalReceivableInUsd);
  const concessionPercent = header.concessionFeePercent ?? 0;
  const concessionAmount = header.concessionFeeAmount ?? 0;
  const roe = Number(header.currencyFactor) > 0 ? Number(header.currencyFactor) : 1;
  const grossBilling = header.subtotalExclTax + concessionAmount;
  const grossInr = currency === 'USD' && !usdReceivable ? grossBilling * roe : grossBilling;
  const selectedCount = separateLineNos?.size ?? 0;
  const canSeparateAds =
    header.status === 'draft' &&
    String(header.invoiceCategory ?? '').trim().toUpperCase() === 'ADS' &&
    lines.length > 1 &&
    Boolean(onToggleSeparateLine && onCreateSeparateBill);
  const showAdsAnnexure = invoiceShowsAdsAnnexure(
    header.invoiceCategory,
    lines,
    header.customerCode,
  );
  const allSelected = selectedCount === lines.length;
  return (
    <div className="mt-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--billing-heading)]">Calculation details</h3>
          {canSeparateAds ? (
            <p className="mt-1 text-xs text-[color:var(--billing-accent-strong)]">
              All ADS entries bill together by default. Check one or more entries to move that
              combination into another bill for this airline.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {showAdsAnnexure ? (
            <InvoiceViewAnnexureButton compact customerCode={header.customerCode} />
          ) : null}
          {canSeparateAds ? (
            <button
              type="button"
              disabled={selectedCount === 0 || allSelected || splitting}
              onClick={onCreateSeparateBill}
              className="rounded-lg border border-[color:var(--billing-accent)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--billing-accent-strong)] hover:bg-[color:var(--billing-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {splitting
                ? 'Creating separate bill…'
                : `Create separate bill${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-xs text-[color:var(--billing-accent-strong)]">
        Rate/Amount stay in {currency}. Concession and gross use the same currency. GST and the
        final receivable are always in INR
        {currency === 'USD' ? ' after ROE conversion of gross revenue' : ''}.
      </p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-[color:var(--billing-accent-border)] bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-heading)]">
            <tr>
              {canSeparateAds ? (
                <th className="w-20 px-2 py-2 text-center">Separate</th>
              ) : null}
              <th className="px-2 py-2 text-left">Line</th>
              <th className="px-2 py-2 text-left">Condition / source</th>
              <th className="px-2 py-2 text-left">Formula</th>
              <th className="px-2 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--billing-border)] text-gray-800">
            {lines.map((line) => {
              const discountFactor =
                line.lineDiscountPercent && line.lineDiscountPercent > 0
                  ? 1 - line.lineDiscountPercent / 100
                  : 1;
              const computedExcl = line.quantity * line.unitPrice * discountFactor;
              return (
                <tr key={line.lineNo}>
                  {canSeparateAds ? (
                    <td className="px-2 py-2 text-center align-top">
                      <input
                        type="checkbox"
                        checked={separateLineNos?.has(line.lineNo) ?? false}
                        onChange={() => onToggleSeparateLine?.(line.lineNo)}
                        aria-label={`Bill ${line.description || line.serviceCode} separately`}
                        className="h-4 w-4 rounded border-gray-300 accent-[color:var(--billing-accent)]"
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-2 align-top">
                    #{line.lineNo}
                    <div className="text-[11px] text-gray-600">
                      {resolveInvoiceServiceTypeLabel(header.invoiceCategory, line.serviceCode)}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div>{line.description}</div>
                    <div className="text-[11px] text-gray-600">
                      {line.sourceType ? `Source: ${line.sourceType}` : 'Source: invoice line'}
                      {line.sourceRef?.serialNo
                        ? ` · Serial: ${String(line.sourceRef.serialNo)}`
                        : ''}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top text-[11px] text-gray-700">
                    Amount = Qty({line.quantity}) × Rate({line.unitPrice.toFixed(2)})
                    {line.lineDiscountPercent && line.lineDiscountPercent > 0
                      ? ` × (1 - ${line.lineDiscountPercent.toFixed(2)}%)`
                      : ''}
                    <br />
                    Line amount ({currency}) = {computedExcl.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    <div className="font-medium">
                      {formatInvoiceCurrency(line.lineAmountExclTax, currency)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canSeparateAds && allSelected ? (
        <p className="mt-2 text-xs font-medium text-amber-800">
          Leave at least one entry unchecked on this bill.
        </p>
      ) : null}

      <div className="mt-3 rounded-lg border border-[color:var(--billing-accent-border)] bg-white p-3 text-xs text-gray-800">
        <p>
          Total amount ({currency}) ={' '}
          <span className="font-semibold">
            {formatInvoiceCurrency(header.subtotalExclTax, currency)}
          </span>
        </p>
        <p>
          Concession{concessionPercent > 0 ? ` @ ${concessionPercent.toFixed(2)}%` : concessionAmount > 0 ? '' : ' (none)'} ={' '}
          <span className="font-semibold">
            {formatInvoiceCurrency(concessionAmount, currency)}
          </span>
        </p>
        <p>
          Total gross revenue ({currency}) ={' '}
          <span className="font-semibold">{formatInvoiceCurrency(grossBilling, currency)}</span>
        </p>
        {currency === 'USD' && !usdReceivable ? (
          <p>
            Converted gross (INR) = Gross × ROE({roe}) ={' '}
            <span className="font-semibold">{fmt(grossInr)}</span>
          </p>
        ) : null}
        {currency === 'USD' && usdReceivable ? (
          <p>
            Exchange rate ROE({roe}) shown for reference — tax and receivable stay in USD.
          </p>
        ) : null}
        <p>
          CGST 9% + SGST 9% on {usdReceivable ? 'USD' : 'INR'} gross ={' '}
          <span className="font-semibold">
            {usdReceivable
              ? formatInvoiceCurrency(header.taxTotal, 'USD')
              : fmt(header.taxTotal)}
          </span>
        </p>
        <p className="mt-1 border-t border-[color:var(--billing-accent-border)] pt-1 text-sm font-semibold text-[color:var(--billing-heading)]">
          Final receivable ({usdReceivable ? 'USD' : 'INR'}) ={' '}
          {usdReceivable
            ? formatInvoiceCurrency(header.totalInclTax, 'USD')
            : fmt(header.totalInclTax)}
        </p>
      </div>
    </div>
  );
}

const SENDABLE_STATUSES = new Set(['approved', 'generated', 'posted']);

function canSendOrExport(invoice: BillingInvoiceHeader) {
  return SENDABLE_STATUSES.has(invoice.status);
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 shrink-0 rounded border-gray-300 accent-[color:var(--billing-accent)] disabled:opacity-40"
    />
  );
}

export function InvoiceDraftsPage({ api }: Props) {
  const [rows, setRows] = useState<BillingInvoiceHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [binDialogOpen, setBinDialogOpen] = useState(false);
  const [binning, setBinning] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [navLevel, setNavLevel] = useState<
    'categories' | 'months' | 'airlines' | 'invoices'
  >('categories');
  const [selectedCategory, setSelectedCategory] = useState<DraftInvoiceCategory | null>(
    null,
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedAirlineKey, setSelectedAirlineKey] = useState<string | null>(null);
  /** Month key (`YYYY-MM`) while bulk PDF download runs for that card. */
  const [downloadingMonthKey, setDownloadingMonthKey] = useState<string | null>(null);
  const [airlineSearch, setAirlineSearch] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  useEffect(() => {
    if (isDelhiStation(readLoginStationCode())) return;
    setPeriodFrom(OTHER_STATION_BILLING_PERIOD.from);
    setPeriodTo(OTHER_STATION_BILLING_PERIOD.to);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.listInvoiceDrafts();
      setRows((res.data ?? []) as BillingInvoiceHeader[]);
      setSelected(new Set());
    } catch (e) {
      setRows([]);
      setSelected(new Set());
      setLoadError(e instanceof Error ? e.message : 'Could not load invoice drafts');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodRows = useMemo(() => {
    if (!periodFrom || !periodTo) return rows;
    return rows.filter((row) =>
      billingPeriodOverlaps(row.billingPeriodStart, row.billingPeriodEnd, periodFrom, periodTo),
    );
  }, [periodFrom, periodTo, rows]);

  const categoryGroups = useMemo(() => groupDraftsByCategory(periodRows), [periodRows]);

  const categoryRows = useMemo(() => {
    if (!selectedCategory) return [];
    return periodRows.filter((r) => resolveDraftInvoiceCategory(r) === selectedCategory);
  }, [periodRows, selectedCategory]);

  const monthGroups = useMemo(() => groupDraftsByMonth(categoryRows), [categoryRows]);

  useEffect(() => {
    if (navLevel === 'categories') return;
    if (!selectedCategory) {
      setNavLevel('categories');
      return;
    }
    if (navLevel === 'months') return;
    if (!selectedMonthKey) {
      setNavLevel('months');
      return;
    }
    const month = monthGroups.find((m) => m.key === selectedMonthKey);
    if (!month) {
      setSelectedMonthKey(null);
      setSelectedAirlineKey(null);
      setNavLevel('months');
      return;
    }
    if (navLevel === 'invoices' && selectedAirlineKey) {
      const airlineCodes = new Set(
        month.invoices.map((inv) => String(inv.customerCode ?? '').trim().toUpperCase() || 'UNKNOWN'),
      );
      if (!airlineCodes.has(selectedAirlineKey)) {
        setSelectedAirlineKey(null);
        setNavLevel('airlines');
      }
    }
  }, [monthGroups, navLevel, selectedAirlineKey, selectedCategory, selectedMonthKey]);

  const selectedMonth = useMemo(
    () => monthGroups.find((m) => m.key === selectedMonthKey) ?? null,
    [monthGroups, selectedMonthKey],
  );

  const airlineGroups = useMemo(
    () => (selectedMonth ? groupDraftsByAirline(selectedMonth.invoices) : []),
    [selectedMonth],
  );

  const filteredAirlineGroups = useMemo(
    () => airlineGroups.filter((airline) => airlineMatchesSearch(airline, airlineSearch)),
    [airlineGroups, airlineSearch],
  );

  const selectedAirline = useMemo(
    () => airlineGroups.find((a) => a.key === selectedAirlineKey) ?? null,
    [airlineGroups, selectedAirlineKey],
  );

  const visibleInvoices = selectedAirline?.invoices ?? [];

  const airlinePageInvoices = useMemo(
    () => filteredAirlineGroups.flatMap((airline) => airline.invoices),
    [filteredAirlineGroups],
  );

  /** Drafts this screen can select: one airline's table, or every card on the airline grid. */
  const pageInvoices = navLevel === 'airlines' ? airlinePageInvoices : visibleInvoices;

  const rowId = (r: BillingInvoiceHeader) => String(r._id);
  const selectedRows = pageInvoices.filter((r) => selected.has(rowId(r)));
  const allSelected =
    pageInvoices.length > 0 && pageInvoices.every((r) => selected.has(rowId(r)));
  const selectionLocked = deleting || binning || merging || refreshingAll || loading;

  const clearSelection = () => setSelected(new Set());

  const clearAirlineSearch = () => {
    setAirlineSearch('');
  };

  const openCategory = (category: DraftInvoiceCategory) => {
    setSelectedCategory(category);
    setSelectedMonthKey(null);
    setSelectedAirlineKey(null);
    clearAirlineSearch();
    clearSelection();
    setNavLevel('months');
  };

  const openMonth = (monthKey: string) => {
    setSelectedMonthKey(monthKey);
    setSelectedAirlineKey(null);
    clearAirlineSearch();
    clearSelection();
    setNavLevel('airlines');
  };

  const openAirline = (airlineKey: string) => {
    setSelectedAirlineKey(airlineKey);
    clearSelection();
    setNavLevel('invoices');
  };

  const backToCategories = () => {
    setSelectedCategory(null);
    setSelectedMonthKey(null);
    setSelectedAirlineKey(null);
    clearAirlineSearch();
    clearSelection();
    setNavLevel('categories');
  };

  const backToMonths = () => {
    setSelectedMonthKey(null);
    setSelectedAirlineKey(null);
    clearAirlineSearch();
    clearSelection();
    setNavLevel('months');
  };

  const backToAirlines = () => {
    setSelectedAirlineKey(null);
    clearSelection();
    setNavLevel('airlines');
  };

  /**
   * Download every draft in a billing month (all airlines) as one merged PDF.
   */
  const downloadAllMonthInvoices = async (month: DraftMonthGroup) => {
    if (month.invoices.length === 0) {
      setActionMsg(`No ${selectedCategory ?? ''} drafts in ${month.label} to download.`);
      return;
    }
    if (downloadingMonthKey) return;
    setDownloadingMonthKey(month.key);
    setActionMsg('');
    try {
      const sorted = [...month.invoices].sort((a, b) => {
        const airline = String(a.customerCode ?? '').localeCompare(String(b.customerCode ?? ''));
        if (airline !== 0) return airline;
        return String(a.draftNumber ?? '').localeCompare(String(b.draftNumber ?? ''));
      });
      const ids = sorted
        .map((inv) => String(inv._id ?? '').trim())
        .filter(Boolean);
      if (ids.length === 0) {
        setActionMsg(`Could not download PDFs for ${month.label} — missing draft ids.`);
        return;
      }
      const category = (selectedCategory ?? 'INVOICES').toUpperCase();
      const fileName = `${category}-${month.key}-all-airlines.pdf`;
      await api.downloadCombinedInvoicePdfs(ids, fileName);
      setActionMsg(
        `Downloaded combined ${category} PDF for ${month.label} — ${ids.length} invoice${ids.length === 1 ? '' : 's'} across ${month.airlineCount} airline${month.airlineCount === 1 ? '' : 's'}.`,
      );
    } catch (e) {
      setActionMsg(
        e instanceof Error ? e.message : `Could not download combined PDF for ${month.label}.`,
      );
    } finally {
      setDownloadingMonthKey(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(pageInvoices.map(rowId)));
  };

  const toggleAirlineSelection = (airline: DraftAirlineGroup) => {
    const ids = airline.invoices.map(rowId);
    if (ids.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const confirmDelete = async () => {
    if (selectedRows.length === 0) return;
    setDeleting(true);
    setActionMsg('');
    try {
      const res = await api.bulkDeleteInvoiceDrafts(selectedRows.map(rowId));
      reportInvoiceBulkDelete((res as { data: BulkDeleteResult }).data, 'draft', setActionMsg);
      setDeleteDialogOpen(false);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const confirmMoveToBin = async () => {
    if (selectedRows.length === 0) return;
    setBinning(true);
    setActionMsg('');
    try {
      const res = await api.moveInvoicesToBin(selectedRows.map(rowId));
      reportInvoiceBulkBin((res as { data: BulkBinResult }).data, 'move', setActionMsg);
      setBinDialogOpen(false);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Move to bin failed');
    } finally {
      setBinning(false);
    }
  };

  const confirmMergeDrafts = async () => {
    if (selectedRows.length < 2) return;
    setMerging(true);
    setActionMsg('');
    try {
      const res = await api.mergeInvoiceDrafts(selectedRows.map(rowId));
      const data = (res as {
        data?: { draftNumber?: string; mergedCount?: number };
      }).data;
      const mergedCount = data?.mergedCount ?? selectedRows.length - 1;
      setMergeDialogOpen(false);
      await load();
      setActionMsg(
        data?.draftNumber
          ? `Merged ${mergedCount + 1} drafts into ${data.draftNumber}.`
          : `Merged ${mergedCount + 1} drafts into one invoice.`,
      );
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  const confirmRefreshAllDrafts = async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    setActionMsg('');
    try {
      const res = await api.refreshAllInvoiceDrafts();
      const data = (res as {
        data?: {
          refreshed?: number;
          rebuilt?: number;
          mastersOnly?: number;
          skipped?: number;
          failed?: Array<{ id: string; draftNumber?: string; message: string }>;
          total?: number;
        };
      }).data;
      setRefreshDialogOpen(false);
      await load();
      const refreshed = data?.refreshed ?? 0;
      const rebuilt = data?.rebuilt ?? 0;
      const mastersOnly = data?.mastersOnly ?? 0;
      const failed = data?.failed ?? [];
      const total = data?.total ?? refreshed;
      if (failed.length === 0) {
        setActionMsg(
          `Refreshed ${refreshed} of ${total} open draft${total === 1 ? '' : 's'}` +
            (rebuilt > 0 || mastersOnly > 0
              ? ` (${rebuilt} rebuilt from preparation, ${mastersOnly} masters/concessions/FX).`
              : '.'),
        );
      } else {
        const sample = failed
          .slice(0, 2)
          .map((f) => f.draftNumber || f.message)
          .join('; ');
        setActionMsg(
          `Refreshed ${refreshed} draft${refreshed === 1 ? '' : 's'}. ${failed.length} failed${sample ? `: ${sample}` : ''}.`,
        );
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Refresh invoices failed');
    } finally {
      setRefreshingAll(false);
    }
  };

  const pageDescription =
    navLevel === 'categories'
      ? 'Open BHS, ADS, RAF, or MAAS to browse drafts by category'
      : navLevel === 'months' && selectedCategory
        ? `${selectedCategory} drafts — browse by billing month, then airline`
        : navLevel === 'airlines' && selectedMonth
          ? `${selectedCategory} · ${selectedMonth.label} — open an airline to review its draft invoices`
          : selectedAirline
            ? `${selectedCategory} · ${selectedAirline.name} drafts for ${selectedMonth?.label ?? 'selected month'}`
            : 'Draft invoices composed from preparation records';

  return (
    <>
      <BillingPageHeader
        title="Invoice drafts"
        description={pageDescription}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={refreshingAll || merging || binning || deleting || loading}
              onClick={() => setRefreshDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--billing-accent)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--billing-primary)] hover:bg-[color:var(--billing-surface)] disabled:opacity-40"
              title="Re-apply customer, contract, and conversion masters to all open drafts. Rebuilds from preparation when linked rows still exist."
            >
              {refreshingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              {refreshingAll ? 'Refreshing…' : 'Refresh invoices'}
            </button>
            {navLevel === 'invoices' || navLevel === 'airlines' ? (
              <>
                {navLevel === 'invoices' ? (
                  <>
                    <button
                      type="button"
                      disabled={selected.size < 2 || merging || binning || deleting || refreshingAll}
                      onClick={() => setMergeDialogOpen(true)}
                      className="rounded-lg border border-[color:var(--billing-accent)] bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-40"
                    >
                      {merging
                        ? 'Merging…'
                        : `Merge into one${selected.size > 1 ? ` (${selected.size})` : ''}`}
                    </button>
                    <button
                      type="button"
                      disabled={selected.size === 0 || binning || merging || refreshingAll}
                      onClick={() => setBinDialogOpen(true)}
                      className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40"
                    >
                      {binning ? 'Moving…' : `Move to bin${selected.size > 0 ? ` (${selected.size})` : ''}`}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={selectedRows.length === 0 || deleting || merging || refreshingAll}
                  onClick={() => setDeleteDialogOpen(true)}
                  className="min-h-11 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  {deleting
                    ? 'Deleting…'
                    : `Delete selected${selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}`}
                </button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Period from
          <input
            type="date"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
            className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Period to
          <input
            type="date"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
            className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        {periodFrom || periodTo ? (
          <button
            type="button"
            onClick={() => {
              setPeriodFrom('');
              setPeriodTo('');
            }}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Show all periods
          </button>
        ) : null}
      </div>

      {actionMsg ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-800">
          {actionMsg}
        </div>
      ) : null}
      {loadError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading drafts…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
          No drafts — create from preparation workspace
        </div>
      ) : navLevel === 'categories' ? (
        <section aria-label="Invoice draft categories">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Invoice categories</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              BHS, ADS, RAF, and MAAS drafts stay separate — open a card to list only that family.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryGroups.map((cat) => {
              const Icon =
                cat.key === 'ADS'
                  ? Package
                  : cat.key === 'RAF'
                    ? Wrench
                    : cat.key === 'MAAS'
                      ? UsersRound
                      : cat.key === 'CUSTOM'
                        ? Building2
                        : Plane;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => openCategory(cat.key)}
                  className="group flex w-full flex-col rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:border-[color:var(--billing-accent-border)] hover:shadow-md active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-accent-strong)]">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-gray-700">
                      {cat.invoiceCount} draft{cat.invoiceCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{cat.label}</h3>
                  <p className="mt-1 text-sm text-gray-600">{cat.description}</p>
                  <p className="mt-2 text-xs tabular-nums text-gray-500">
                    Total receivable {fmt(cat.totalInclTax)}
                  </p>
                  <span className="mt-4 text-sm font-medium text-[color:var(--billing-accent-strong)] group-hover:underline">
                    View {cat.key} drafts →
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : navLevel === 'months' ? (
        <section aria-label="Draft billing months">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={backToCategories}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Categories
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">
              {selectedCategory}
            </span>
          </div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Billing months</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Open a month to see airlines, or download one combined {selectedCategory} PDF for every
              airline in that period.
            </p>
          </div>
          {monthGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
              No {selectedCategory} drafts yet — create from preparation (ADS / scheduled / RAF / MAAS sources).
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {monthGroups.map((month) => {
              const isDownloading = downloadingMonthKey === month.key;
              const downloadBusy = downloadingMonthKey != null;
              return (
                <div
                  key={month.key}
                  className="group flex w-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-[border-color,box-shadow] hover:border-[color:var(--billing-accent-border)] hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => openMonth(month.key)}
                    className="flex w-full flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)] focus-visible:ring-offset-2 active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-accent-strong)]">
                        <CalendarDays className="h-5 w-5" aria-hidden />
                      </div>
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-gray-700">
                        {month.invoiceCount} draft{month.invoiceCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900">{month.label}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {month.airlineCount} airline{month.airlineCount === 1 ? '' : 's'}
                    </p>
                    <p className="mt-2 text-xs tabular-nums text-gray-500">
                      Total receivable {fmt(month.totalInclTax)}
                    </p>
                    <span className="mt-4 text-sm font-medium text-[color:var(--billing-accent-strong)] group-hover:underline">
                      View airlines →
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={downloadBusy || month.invoiceCount === 0}
                    onClick={() => void downloadAllMonthInvoices(month)}
                    aria-label={`Download combined ${selectedCategory ?? ''} PDF with all ${month.invoiceCount} invoices for ${month.label}`}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-3 py-2 text-sm font-semibold text-[color:var(--billing-accent-strong)] transition-[background-color,opacity,transform] hover:bg-[color:var(--billing-accent-soft)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                    {isDownloading
                      ? 'Building PDF…'
                      : `Download combined PDF (${month.invoiceCount})`}
                  </button>
                </div>
              );
            })}
          </div>
          )}
        </section>
      ) : navLevel === 'airlines' && selectedMonth ? (
        <section aria-label={`${selectedMonth.label} airlines`}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={backToCategories}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Categories
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <button
              type="button"
              onClick={backToMonths}
              className="truncate text-sm font-medium text-[color:var(--billing-accent-strong)] hover:underline"
            >
              {selectedCategory}
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">{selectedMonth.label}</span>
          </div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Airlines</h2>
            <p className="mt-0.5 text-xs text-gray-500" aria-live="polite">
              {airlineSearch.trim()
                ? filteredAirlineGroups.length === 0
                  ? `No airlines match “${airlineSearch.trim()}”.`
                  : `Showing ${filteredAirlineGroups.length} of ${airlineGroups.length} airlines for “${airlineSearch.trim()}”. Select cards to delete those drafts.`
                : `Select airlines to delete their ${selectedMonth.label} drafts, or open an airline to review each invoice.`}
            </p>
          </div>
          <form
            role="search"
            className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="min-w-0 flex-1 sm:max-w-md">
              <span className="sr-only">Airline name or code</span>
              <input
                type="search"
                value={airlineSearch}
                onChange={(event) => setAirlineSearch(event.target.value)}
                placeholder="Airline name or code"
                aria-label="Filter airlines by name or code"
                autoComplete="off"
                className={billingUi.input}
              />
            </label>
            {airlineSearch ? (
              <button type="button" onClick={clearAirlineSearch} className={billingUi.btnSecondary}>
                Clear
              </button>
            ) : null}
          </form>
          {airlineGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
              No airlines for {selectedMonth.label}.
            </div>
          ) : filteredAirlineGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
              <p>No airlines match “{airlineSearch}”.</p>
              <button
                type="button"
                onClick={clearAirlineSearch}
                className={`${billingUi.btnSecondary} mt-4`}
              >
                Clear search
              </button>
            </div>
          ) : (
          <>
          <div className="mb-3 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-800">
              <SelectionCheckbox
                checked={allSelected}
                indeterminate={selectedRows.length > 0 && !allSelected}
                disabled={selectionLocked || airlinePageInvoices.length === 0}
                onChange={toggleSelectAll}
                label={`Select all ${airlinePageInvoices.length} visible drafts`}
              />
              Select all visible
              <span className="font-normal tabular-nums text-gray-500">
                ({airlinePageInvoices.length} draft{airlinePageInvoices.length === 1 ? '' : 's'})
              </span>
            </label>
            {selectedRows.length > 0 ? (
              <p className="text-sm text-gray-600" aria-live="polite">
                {selectedRows.length} draft{selectedRows.length === 1 ? '' : 's'} selected
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAirlineGroups.map((airline) => {
              const airlineIds = airline.invoices.map(rowId);
              const selectedCount = airlineIds.filter((id) => selected.has(id)).length;
              const airlineAllSelected =
                airlineIds.length > 0 && selectedCount === airlineIds.length;
              const airlineSomeSelected = selectedCount > 0 && !airlineAllSelected;
              return (
                <article
                  key={airline.key}
                  className={`flex flex-col rounded-xl border bg-white p-5 text-left shadow-sm transition-[border-color,box-shadow] ${
                    airlineAllSelected || airlineSomeSelected
                      ? 'border-[color:var(--billing-accent-border)] ring-1 ring-[color:var(--billing-accent-border)]'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="inline-flex min-h-11 min-w-11 items-center">
                      <SelectionCheckbox
                        checked={airlineAllSelected}
                        indeterminate={airlineSomeSelected}
                        disabled={selectionLocked || airlineIds.length === 0}
                        onChange={() => toggleAirlineSelection(airline)}
                        label={`Select ${airline.invoiceCount} draft${airline.invoiceCount === 1 ? '' : 's'} for ${airline.code}`}
                      />
                    </label>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-gray-700">
                      {airline.invoiceCount} draft{airline.invoiceCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAirline(airline.key)}
                    className="group mt-2 flex w-full flex-col rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)] focus-visible:ring-offset-2"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                      <Building2 className="h-5 w-5" aria-hidden />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900">{airline.code}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">{airline.name}</p>
                    <p className="mt-2 text-xs tabular-nums text-gray-500">
                      Total receivable {fmt(airline.totalInclTax)}
                    </p>
                    <span className="mt-4 text-sm font-medium text-[color:var(--billing-accent-strong)] group-hover:underline">
                      View invoices →
                    </span>
                  </button>
                </article>
              );
            })}
          </div>
          </>
          )}
        </section>
      ) : selectedAirline && selectedMonth ? (
        <section aria-label={`${selectedAirline.code} invoices`}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={backToCategories}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Categories
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <button
              type="button"
              onClick={backToMonths}
              className="truncate text-sm font-medium text-[color:var(--billing-accent-strong)] hover:underline"
            >
              {selectedCategory}
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <button
              type="button"
              onClick={backToAirlines}
              className="truncate text-sm font-medium text-[color:var(--billing-accent-strong)] hover:underline"
            >
              {selectedMonth.label}
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">
              {selectedAirline.code}
            </span>
          </div>

          <BillingDataTable
            rows={visibleInvoices}
            getRowKey={(r) => String(r._id)}
            emptyMessage="No drafts for this airline in the selected month"
            columns={[
              {
                key: 'select',
                header: (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all drafts"
                    className="h-4 w-4 rounded border-white/40 accent-white"
                  />
                ),
                render: (r) => (
                  <input
                    type="checkbox"
                    checked={selected.has(rowId(r))}
                    onChange={() => toggleSelect(rowId(r))}
                    aria-label={`Select ${r.draftNumber}`}
                    className="h-4 w-4 rounded border-gray-300 accent-[color:var(--billing-accent)]"
                  />
                ),
              },
              {
                key: 'draft',
                header: 'Draft No.',
                render: (r) => (
                  <InvoiceDraftParticularsHover
                    api={api}
                    draftId={String(r._id)}
                    draftNumber={r.draftNumber}
                    currencyCode={r.currencyCode}
                  />
                ),
              },
              { key: 'customer', header: 'Customer', render: (r) => r.customerCode },
              {
                key: 'period',
                header: 'Period',
                render: (r) =>
                  formatBillingDateRange(r.billingPeriodStart, r.billingPeriodEnd),
              },
              {
                key: 'currency',
                header: 'Currency',
                render: (r) => r.currencyCode,
              },
              {
                key: 'total',
                header: 'Total',
                render: (r) => fmt(r.totalInclTax),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (r) => (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/billing/invoices/${r._id}`}
                      className="text-sm font-medium text-[color:var(--billing-accent-strong)] hover:underline"
                    >
                      Open
                    </Link>
                    {((isDraftStatus(String(r.status)) || r.status === 'approved') && !r.inBin) ? (
                      <Link
                        href={`/billing/invoices/${r._id}?edit=${
                          selectedCategory === 'CUSTOM' ? 'custom' : '1'
                        }`}
                        className="text-sm font-medium text-[color:var(--billing-accent-strong)] hover:underline"
                      >
                        Edit
                      </Link>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </section>
      ) : null}

      <p className="mt-4 text-sm text-gray-600">
        <Link href="/billing/invoice-bin" className="font-medium text-amber-800 underline">
          Invoice bin
        </Link>{' '}
        — hide drafts you no longer need without deleting them.
      </p>
      <InvoiceDeleteDialog
        mode="selected"
        variant="draft"
        record={null}
        selected={selectedRows}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => void confirmDelete()}
        deleting={deleting}
      />
      <InvoiceMergeDraftsDialog
        selected={selectedRows}
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        onConfirm={() => void confirmMergeDrafts()}
        merging={merging}
      />
      <InvoiceBinDialog
        action="move"
        selected={selectedRows}
        open={binDialogOpen}
        onOpenChange={setBinDialogOpen}
        onConfirm={() => void confirmMoveToBin()}
        busy={binning}
      />
      <AlertDialog open={refreshDialogOpen} onOpenChange={setRefreshDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh all open invoice drafts?</AlertDialogTitle>
            <AlertDialogDescription>
              Rebuilds every open draft (not in the bin) from the latest customers, contracts,
              concessions, rate cards, service catalog, taxes, and conversion rates — the same
              pass as Regenerate invoice. Royalty Setup, Airport Setup configure rules, Aircraft
              Master, and Equipment Master are not read. Posted invoices are not changed. Custom
              bill overrides keep their bill-to name and address.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refreshingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={refreshingAll}
              onClick={(e) => {
                e.preventDefault();
                void confirmRefreshAllDrafts();
              }}
            >
              {refreshingAll ? 'Refreshing…' : 'Refresh invoices'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type DraftMonthGroup = {
  key: string;
  label: string;
  invoiceCount: number;
  airlineCount: number;
  totalInclTax: number;
  invoices: BillingInvoiceHeader[];
};

type DraftAirlineGroup = {
  key: string;
  code: string;
  name: string;
  invoiceCount: number;
  totalInclTax: number;
  invoices: BillingInvoiceHeader[];
};

type DraftInvoiceCategory = 'BHS' | 'ADS' | 'RAF' | 'MAAS' | 'CUSTOM';

type DraftCategoryGroup = {
  key: DraftInvoiceCategory;
  label: string;
  description: string;
  invoiceCount: number;
  totalInclTax: number;
};

function resolveDraftInvoiceCategory(invoice: BillingInvoiceHeader): DraftInvoiceCategory {
  const raw = String(invoice.invoiceCategory ?? '')
    .trim()
    .toUpperCase();
  if (raw === 'ADS' || raw === 'RAF' || raw === 'BHS' || raw === 'CUSTOM' || raw === 'MAAS') {
    return raw;
  }
  return 'BHS';
}

/** ADS + Custom draft categories always show Service / Service Code as ADS. */
function resolveInvoiceServiceTypeLabel(
  invoiceCategory: string | undefined,
  serviceCode?: string,
): string {
  const cat = String(invoiceCategory ?? '')
    .trim()
    .toUpperCase();
  if (cat === 'ADS' || cat === 'CUSTOM') return 'ADS';
  if (cat === 'MAAS') return 'MAAS';
  const code = String(serviceCode ?? '').trim();
  if (/^custom(\s+billing)?$/i.test(code)) return 'ADS';
  return code || '—';
}

function groupDraftsByCategory(invoices: BillingInvoiceHeader[]): DraftCategoryGroup[] {
  const counts: Record<DraftInvoiceCategory, { count: number; total: number }> = {
    BHS: { count: 0, total: 0 },
    ADS: { count: 0, total: 0 },
    RAF: { count: 0, total: 0 },
    MAAS: { count: 0, total: 0 },
    CUSTOM: { count: 0, total: 0 },
  };
  for (const invoice of invoices) {
    const cat = resolveDraftInvoiceCategory(invoice);
    counts[cat].count += 1;
    counts[cat].total += Number(invoice.totalInclTax || 0);
  }
  const meta: Record<
    DraftInvoiceCategory,
    { label: string; description: string }
  > = {
    BHS: {
      label: 'BHS',
      description: 'Basic Handling — scheduled flight package invoices',
    },
    ADS: {
      label: 'ADS',
      description: 'Additional services — equipment / manpower usage invoices',
    },
    RAF: {
      label: 'RAF',
      description: 'Ramp Assistance Forms — Deep / Night Halt / Exterior cleaning invoices',
    },
    MAAS: {
      label: 'MAAS',
      description: 'Meet-and-greet escorts — passenger escort invoices by billing month',
    },
    CUSTOM: {
      label: 'Custom Bills',
      description: 'Airline custom bills — create or edit lines from Preparation / invoice detail',
    },
  };
  return (['BHS', 'ADS', 'RAF', 'MAAS', 'CUSTOM'] as DraftInvoiceCategory[]).map((key) => ({
    key,
    label: meta[key].label,
    description: meta[key].description,
    invoiceCount: counts[key].count,
    totalInclTax: counts[key].total,
  }));
}

function draftPeriodYearMonth(invoice: BillingInvoiceHeader): string {
  const raw = String(invoice.billingPeriodStart ?? '').trim();
  const ymd = /^(\d{4})-(\d{2})/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return 'unknown';
}

function formatDraftMonthLabel(yearMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return 'Unknown period';
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

function groupDraftsByMonth(invoices: BillingInvoiceHeader[]): DraftMonthGroup[] {
  const map = new Map<string, BillingInvoiceHeader[]>();
  for (const invoice of invoices) {
    const key = draftPeriodYearMonth(invoice);
    const list = map.get(key);
    if (list) list.push(invoice);
    else map.set(key, [invoice]);
  }

  return [...map.entries()]
    .map(([key, monthInvoices]) => {
      const airlines = new Set(
        monthInvoices.map((inv) => String(inv.customerCode ?? '').trim().toUpperCase() || 'UNKNOWN'),
      );
      return {
        key,
        label: formatDraftMonthLabel(key),
        invoiceCount: monthInvoices.length,
        airlineCount: airlines.size,
        totalInclTax: monthInvoices.reduce((sum, inv) => sum + Number(inv.totalInclTax || 0), 0),
        invoices: monthInvoices,
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

function airlineMatchesSearch(
  airline: Pick<DraftAirlineGroup, 'code' | 'name'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return airline.code.toLowerCase().startsWith(q) || airline.name.toLowerCase().startsWith(q);
}

function groupDraftsByAirline(invoices: BillingInvoiceHeader[]): DraftAirlineGroup[] {
  const map = new Map<string, BillingInvoiceHeader[]>();
  for (const invoice of invoices) {
    const key = String(invoice.customerCode ?? '').trim().toUpperCase() || 'UNKNOWN';
    const list = map.get(key);
    if (list) list.push(invoice);
    else map.set(key, [invoice]);
  }

  return [...map.entries()]
    .map(([key, airlineInvoices]) => ({
      key,
      code: key,
      name: String(airlineInvoices[0]?.customerName ?? key).trim() || key,
      invoiceCount: airlineInvoices.length,
      totalInclTax: airlineInvoices.reduce((sum, inv) => sum + Number(inv.totalInclTax || 0), 0),
      invoices: [...airlineInvoices].sort((a, b) =>
        String(b.draftNumber).localeCompare(String(a.draftNumber)),
      ),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function InvoiceReviewPage({ api }: Props) {
  const [rows, setRows] = useState<Array<BillingInvoiceHeader & { review?: { passed?: boolean } }>>([]);
  const [loading, setLoading] = useState(true);
  const [showApproved, setShowApproved] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setActionMsg('');
    try {
      const res = await api.listReviewQueue(showApproved ? { status: 'all' } : undefined);
      setRows((res.data ?? []) as typeof rows);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not load review queue');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, showApproved]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    setActionMsg('');
    try {
      const res = await api.approveReview(id);
      const data = (res as {
        data?: { mergedInvoiceIds?: string[]; totalFlights?: number };
      }).data;
      const merged = data?.mergedInvoiceIds?.length ?? 0;
      const flights = data?.totalFlights ?? 0;
      if (merged > 0) {
        setActionMsg(
          `Approved single invoice with ${flights} flight${flights === 1 ? '' : 's'} — merged ${merged} other invoice${merged === 1 ? '' : 's'} for this airline and period.`,
        );
      } else if (flights > 0) {
        setActionMsg(`Invoice approved with ${flights} flight${flights === 1 ? '' : 's'}.`);
      } else {
        setActionMsg('Invoice approved.');
      }
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <>
      <BillingPageHeader title="Invoice review" description="Approval queue with validation checks" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showApproved}
            onChange={(e) => setShowApproved(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show recently approved
        </label>
      </div>
      {actionMsg ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-800">
          {actionMsg}
        </div>
      ) : null}
      <BillingDataTable
        loading={loading}
        rows={rows}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No drafts pending review"
        columns={[
          { key: 'draft', header: 'Draft', render: (r) => r.draftNumber },
          { key: 'customer', header: 'Customer', render: (r) => r.customerCode },
          { key: 'total', header: 'Total', render: (r) => fmt(r.totalInclTax) },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <StatusBadge status={r.status} />,
          },
          {
            key: 'checks',
            header: 'Checks',
            render: (r) => (
              <span className={r.review?.passed ? 'text-[color:var(--billing-accent-strong)]' : 'text-red-600'}>
                {r.review?.passed ? 'Passed' : 'Review required'}
              </span>
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (r) => (
              <div className="flex gap-1">
                {r.status === 'pending_approval' ? (
                  <button
                    type="button"
                    disabled={approvingId === String(r._id)}
                    className="rounded border border-[color:var(--billing-accent)] px-2 py-1 text-xs text-[color:var(--billing-accent-strong)] disabled:opacity-50"
                    onClick={() => void handleApprove(String(r._id))}
                  >
                    {approvingId === String(r._id) ? 'Approving…' : 'Approve'}
                  </button>
                ) : null}
                <Link
                  href={`/billing/invoices/${r._id}`}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  Open
                </Link>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

export function InvoicesListPage({ api }: Props) {
  const [rows, setRows] = useState<BillingInvoiceHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [samplePdfLoading, setSamplePdfLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [binDialogOpen, setBinDialogOpen] = useState(false);
  const [binning, setBinning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.listInvoices(status ? { status } : undefined);
      setRows((res.data ?? []) as BillingInvoiceHeader[]);
      setSelected(new Set());
    } catch (e) {
      setRows([]);
      setSelected(new Set());
      setLoadError(e instanceof Error ? e.message : 'Could not load invoices');
    } finally {
      setLoading(false);
    }
  }, [api, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const rowId = (r: BillingInvoiceHeader) => String(r._id);
  const selectedRows = rows.filter((r) => selected.has(rowId(r)));
  /** Selected rows when checked; otherwise all visible rows — never requires selection. */
  const targetRows = selectedRows.length > 0 ? selectedRows : rows;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(rowId(r)));

  const openPdf = async (id: string) => {
    setPdfLoadingId(id);
    setActionMsg('');
    try {
      await api.openInvoicePdf(id);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not open PDF');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const downloadPdf = async (id: string) => {
    setPdfLoadingId(id);
    setActionMsg('');
    try {
      await api.downloadInvoicePdf(id);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'PDF download failed');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const openSamplePdf = async () => {
    setSamplePdfLoading(true);
    setActionMsg('');
    try {
      await api.openInvoiceSamplePdf();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not open sample PDF');
    } finally {
      setSamplePdfLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map(rowId)));
  };

  const handleExportPdf = async () => {
    if (targetRows.length === 0) {
      setActionMsg('No invoices in the list to download.');
      return;
    }
    setExporting(true);
    setActionMsg('');
    try {
      for (const row of targetRows) {
        await api.downloadInvoicePdf(rowId(row));
      }
      setActionMsg(`Downloaded ${targetRows.length} invoice PDF(s).`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleSendToAirline = async () => {
    if (targetRows.length === 0) {
      setActionMsg('No invoices in the list to send.');
      return;
    }
    setSending(true);
    setActionMsg('');
    try {
      const ids = targetRows.map((row) => rowId(row));
      const res = await api.sendInvoicesToAirline(ids);
      const data = res.data as {
        sent?: number;
        failed?: Array<{ id: string; message: string }>;
        recipients?: string[];
      };
      const sent = data.sent ?? 0;
      const failed = data.failed ?? [];
      const recipients = (data.recipients ?? []).join(', ');
      if (failed.length > 0 && sent === 0) {
        setActionMsg(failed[0]?.message ?? 'Could not send invoices to airline.');
        return;
      }
      if (failed.length > 0) {
        setActionMsg(
          `Sent ${sent} invoice(s) to ${recipients || 'airline'}. ${failed.length} failed: ${failed[0]?.message ?? 'see server log'}.`,
        );
        return;
      }
      setActionMsg(
        `Sent ${sent} invoice(s) to airline${recipients ? ` (${recipients})` : ''}.`,
      );
      void load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = async () => {
    if (selectedRows.length === 0) return;
    setDeleting(true);
    setActionMsg('');
    try {
      const res = await api.bulkDeleteInvoices(selectedRows.map(rowId));
      reportInvoiceBulkDelete((res as { data: BulkDeleteResult }).data, 'invoice', setActionMsg);
      setDeleteDialogOpen(false);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const confirmMoveToBin = async () => {
    if (selectedRows.length === 0) return;
    setBinning(true);
    setActionMsg('');
    try {
      const res = await api.moveInvoicesToBin(selectedRows.map(rowId));
      reportInvoiceBulkBin((res as { data: BulkBinResult }).data, 'move', setActionMsg);
      setBinDialogOpen(false);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Move to bin failed');
    } finally {
      setBinning(false);
    }
  };

  const emptyMessage =
    status === 'posted'
      ? 'No posted invoices yet. Open an approved invoice, click Generate PDF, then Post.'
      : status === 'generated'
        ? 'No generated PDFs yet. Approve a draft in Review, then open it here and click Generate PDF.'
        : status === 'approved'
          ? 'No approved invoices yet. Complete Review → Approve, or check Invoice drafts.'
          : status === 'cancelled'
            ? 'No cancelled invoices.'
            : 'No invoices yet. Create a draft from Preparation, then approve it in Review.';

  const columns = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleSelectAll}
          aria-label="Select all invoices"
          className="h-4 w-4 rounded border-white/40 accent-white"
        />
      ),
      render: (r: BillingInvoiceHeader) => (
        <input
          type="checkbox"
          checked={selected.has(rowId(r))}
          onChange={() => toggleSelect(rowId(r))}
          aria-label={`Select ${r.invoiceNumber ?? r.draftNumber}`}
          className="h-4 w-4 rounded border-gray-300 accent-[color:var(--billing-accent)]"
        />
      ),
    },
    {
      key: 'number',
      header: 'Invoice / Draft',
      render: (r: BillingInvoiceHeader) => (
        <Link href={`/billing/invoices/${r._id}`} className="text-[color:var(--billing-accent-strong)]">
          {r.invoiceNumber ?? r.draftNumber}
        </Link>
      ),
    },
    { key: 'customer', header: 'Customer', render: (r: BillingInvoiceHeader) => r.customerCode },
    { key: 'total', header: 'Total', render: (r: BillingInvoiceHeader) => fmt(r.totalInclTax) },
    {
      key: 'status',
      header: 'Status',
      render: (r: BillingInvoiceHeader) => <StatusBadge status={r.status} />,
    },
    {
      key: 'pdf',
      header: 'PDF',
      render: (r: BillingInvoiceHeader) => {
        const id = rowId(r);
        return (
          <div className="flex flex-wrap gap-1">
            <InvoiceViewPdfButton
              compact
              loading={pdfLoadingId === id}
              onView={() => void openPdf(id)}
            />
            <button
              type="button"
              disabled={pdfLoadingId === id}
              onClick={() => void downloadPdf(id)}
              className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-2 py-1.5 text-xs font-medium text-[color:var(--billing-accent-strong)] hover:bg-[color:var(--billing-accent-soft)] disabled:opacity-50"
              title="Download invoice PDF"
            >
              <span className="sr-only">Download</span>
              ↓
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <BillingPageHeader
        title="Invoices"
        description="View or download invoice PDFs — flights for the same airline are summed by service and aircraft type on each invoice"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selected.size === 0 || binning}
              onClick={() => setBinDialogOpen(true)}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40"
            >
              {binning ? 'Moving…' : `Move to bin${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || deleting}
              onClick={() => setDeleteDialogOpen(true)}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : `Delete selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
            <InvoiceSamplePdfButton
              loading={samplePdfLoading}
              onView={() => void openSamplePdf()}
            />
            <InvoiceViewPdfButton
              loading={pdfLoadingId != null || exporting}
              onView={() => {
                const first = targetRows[0];
                if (!first) {
                  setActionMsg('No invoices in the list to view.');
                  return;
                }
                void openPdf(rowId(first));
              }}
              onDownload={() => void handleExportPdf()}
            />
            <InvoiceHeaderActionButtons
            selectedCount={selected.size}
            hideExport
            exporting={exporting}
            sending={sending}
            disabled={rows.length === 0}
            onExportPdf={() => void handleExportPdf()}
            onSendToAirline={() => void handleSendToAirline()}
          />
          </div>
        }
      />
      {actionMsg ? (
        <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-2.5 text-sm text-[color:var(--billing-heading)]">
          {actionMsg}
        </div>
      ) : null}
      {loadError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Filter by invoice status"
        >
          <option value="">All (approved · generated · posted)</option>
          <option value="posted">Posted only</option>
          <option value="generated">Generated PDF only</option>
          <option value="approved">Approved only</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Link href="/billing/invoice-drafts" className="text-sm font-medium text-[color:var(--billing-accent-strong)] hover:text-[color:var(--billing-heading)]">
          Invoice drafts →
        </Link>
        <Link href="/billing/review" className="text-sm font-medium text-[color:var(--billing-accent-strong)] hover:text-[color:var(--billing-heading)]">
          Review queue →
        </Link>
        <Link href="/billing/invoice-bin" className="text-sm font-medium text-amber-800 hover:text-amber-950">
          Invoice bin →
        </Link>
      </div>
      {!loading && rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
          <p>{emptyMessage}</p>
          <p className="mt-4 text-xs text-gray-500">
            Drafts still in progress live under{' '}
            <Link href="/billing/invoice-drafts" className="text-[color:var(--billing-accent-strong)] underline">
              Invoice drafts
            </Link>
            . This page shows invoices after approval.
          </p>
        </div>
      ) : (
        <BillingDataTable
          loading={loading}
          rows={rows}
          getRowKey={(r) => String(r._id)}
          emptyMessage={emptyMessage}
          columns={columns}
        />
      )}
      <InvoiceDeleteDialog
        mode="selected"
        variant="invoice"
        record={null}
        selected={selectedRows}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => void confirmDelete()}
        deleting={deleting}
      />
      <InvoiceBinDialog
        action="move"
        selected={selectedRows}
        open={binDialogOpen}
        onOpenChange={setBinDialogOpen}
        onConfirm={() => void confirmMoveToBin()}
        busy={binning}
      />
    </>
  );
}

export function InvoiceBinPage({ api }: Props) {
  const [rows, setRows] = useState<BillingInvoiceHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState('');
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listInvoiceBin();
      setRows((res.data ?? []) as BillingInvoiceHeader[]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const rowId = (r: BillingInvoiceHeader) => String(r._id);
  const selectedRows = rows.filter((r) => selected.has(rowId(r)));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(rowId(r)));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map(rowId)));
  };

  const confirmRestore = async () => {
    if (selectedRows.length === 0) return;
    setRestoring(true);
    setActionMsg('');
    try {
      const res = await api.restoreInvoicesFromBin(selectedRows.map(rowId));
      reportInvoiceBulkBin((res as { data: BulkBinResult }).data, 'restore', setActionMsg);
      setRestoreDialogOpen(false);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (selectedRows.length === 0) return;
    setDeleting(true);
    setActionMsg('');
    try {
      const res = await api.bulkDeleteInvoiceBin(selectedRows.map(rowId));
      reportInvoiceBulkDelete((res as { data: BulkDeleteResult }).data, 'invoice', setActionMsg);
      setDeleteDialogOpen(false);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <BillingPageHeader
        title="Invoice bin"
        description="Invoices moved out of the main workflow — restore them or delete permanently"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={selected.size === 0 || restoring}
              onClick={() => setRestoreDialogOpen(true)}
              className="rounded-lg border border-[color:var(--billing-accent)] bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-40"
            >
              {restoring ? 'Restoring…' : `Restore selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || deleting}
              onClick={() => setDeleteDialogOpen(true)}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : `Delete permanently${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        }
      />
      {actionMsg ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-800">
          {actionMsg}
        </div>
      ) : null}
      <BillingDataTable
        loading={loading}
        rows={rows}
        getRowKey={(r) => String(r._id)}
        emptyMessage="Bin is empty — move unwanted invoices here from drafts or invoices"
        columns={[
          {
            key: 'select',
            header: (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="Select all binned invoices"
                className="h-4 w-4 rounded border-white/40 accent-white"
              />
            ),
            render: (r) => (
              <input
                type="checkbox"
                checked={selected.has(rowId(r))}
                onChange={() => toggleSelect(rowId(r))}
                aria-label={`Select ${r.invoiceNumber ?? r.draftNumber}`}
                className="h-4 w-4 rounded border-gray-300 accent-[color:var(--billing-accent)]"
              />
            ),
          },
          {
            key: 'number',
            header: 'Invoice / Draft',
            render: (r) => (
              <Link href={`/billing/invoices/${r._id}`} className="font-medium text-[color:var(--billing-accent-strong)]">
                {r.invoiceNumber ?? r.draftNumber}
              </Link>
            ),
          },
          { key: 'customer', header: 'Customer', render: (r) => r.customerCode },
          { key: 'total', header: 'Total', render: (r) => fmt(r.totalInclTax) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'binned',
            header: 'Moved to bin',
            render: (r) =>
              r.binnedAt ? (
                <span className="text-gray-600">
                  {formatBillingDate(r.binnedAt)}
                  {r.binnedBy ? ` · ${r.binnedBy}` : ''}
                </span>
              ) : (
                '—'
              ),
          },
        ]}
      />
      <InvoiceBinDialog
        action="restore"
        selected={selectedRows}
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={() => void confirmRestore()}
        busy={restoring}
      />
      <InvoiceDeleteDialog
        mode="selected"
        variant="invoice"
        record={null}
        selected={selectedRows}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => void confirmPermanentDelete()}
        deleting={deleting}
      />
    </>
  );
}

export function InvoiceDetailPage({ api, id }: Props & { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<{
    header?: BillingInvoiceHeader;
    lines?: Array<Record<string, unknown>>;
    auditTrail?: Array<Record<string, unknown>>;
    preparationRecords?: BillingPreparationRecord[];
    customerMaster?: { name?: string; address?: string; gstRegistrationNo?: string };
  } | null>(null);
  const [tab, setTab] = useState(() => {
    const edit = searchParams.get('edit');
    if (edit === 'custom') return 'custom-bill';
    if (edit === '1' || edit === 'true') return 'edit';
    return 'general';
  });
  const [msg, setMsg] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [settingUsdReceivable, setSettingUsdReceivable] = useState(false);
  const [settingInrReceivable, setSettingInrReceivable] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [separateAdsLineNos, setSeparateAdsLineNos] = useState<Set<number>>(new Set());
  const [splittingAds, setSplittingAds] = useState(false);
  const [masterExchangeRate, setMasterExchangeRate] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoadingDetail(true);
    setLoadError('');
    try {
      const res = await api.getInvoice(id);
      const data = (res as { data: typeof detail }).data;
      let preparationRecords = data?.preparationRecords;

      if (
        data?.header &&
        ['draft', 'pending_approval'].includes(String(data.header.status)) &&
        !preparationRecords?.length
      ) {
        try {
          const draftRes = await api.getInvoiceDraft(id);
          preparationRecords = (draftRes as { data?: { preparationRecords?: BillingPreparationRecord[] } })
            .data?.preparationRecords;
        } catch {
          // draft endpoint may not apply for all invoice ids
        }
      }

      setDetail({ ...data, preparationRecords: preparationRecords ?? [] });
      setSeparateAdsLineNos(new Set());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load invoice');
    } finally {
      setLoadingDetail(false);
    }
  }, [api, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const billingMonth = String(detail?.header?.billingPeriodStart ?? '').slice(0, 7);
    if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
      setMasterExchangeRate(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.listExchangeRates();
        if (cancelled) return;
        const items = (
          (res as { data?: { items?: Array<Record<string, unknown>> } }).data?.items ?? []
        ).filter((row) => String(row.currencyCode ?? 'USD').toUpperCase() === 'USD');
        const match = items.find(
          (row) => String(row.startingDate ?? '').slice(0, 7) === billingMonth,
        );
        const rate = Number(match?.rateToINR);
        setMasterExchangeRate(Number.isFinite(rate) && rate > 0 ? rate : null);
      } catch {
        if (!cancelled) setMasterExchangeRate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, detail?.header?.billingPeriodStart]);

  useEffect(() => {
    const h = detail?.header;
    if (!h) return;
    const canEditCustomBill = isDraftStatus(String(h.status)) && !h.inBin;
    if (searchParams.get('edit') === 'custom' && canEditCustomBill) {
      setTab('custom-bill');
      return;
    }
    if (
      canEditInvoice(h) &&
      (searchParams.get('edit') === '1' || searchParams.get('edit') === 'true')
    ) {
      setTab('edit');
    }
  }, [searchParams, detail?.header]);

  const header = detail?.header;
  const lines = (detail?.lines ?? []).map((line) =>
    mapInvoiceLine(line as Record<string, unknown>),
  );

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    setMsg('');
    try {
      await api.downloadInvoicePdf(id);
      setMsg('PDF downloaded.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleViewPdf = async () => {
    if (
      String(header?.invoiceCategory ?? '').trim().toUpperCase() === 'RAF' &&
      rafLinesNeedRates(lines)
    ) {
      setMsg(
        'Save a Rate/Unit for every RAF particular (Edit invoice) before View / Generate PDF.',
      );
      setTab('edit');
      return;
    }
    setExporting(true);
    setMsg('');
    try {
      await api.openInvoicePdf(id);
      setMsg('PDF opened in a new tab.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not open PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleSendToAirline = async () => {
    if (!header || !canSendOrExport(header)) {
      setMsg('Approve the invoice first before sending to airline.');
      return;
    }
    setSending(true);
    setMsg('');
    try {
      const res = await api.sendInvoiceToAirline(id);
      const data = res.data as { toEmails?: string[]; invoiceLabel?: string };
      const recipients = (data.toEmails ?? []).join(', ');
      setMsg(
        recipients
          ? `Sent ${data.invoiceLabel ?? 'invoice'} to ${recipients}.`
          : 'Invoice sent to airline.',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const usdReceivableActive =
    header?.currencyCode === 'USD' && Boolean(header.totalReceivableInUsd);
  const inrReceivableActive =
    header?.currencyCode === 'INR' && !header.totalReceivableInUsd;

  const handleSetTotalReceivableUsd = async () => {
    if (!header || usdReceivableActive) return;
    setSettingUsdReceivable(true);
    setMsg('');
    try {
      await api.setDraftTotalReceivableUsd(id);
      await reload();
      setMsg(
        'Amounts converted to USD. Concession and CGST/SGST are calculated on the USD gross.',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not set USD receivable');
    } finally {
      setSettingUsdReceivable(false);
    }
  };

  const handleSetTotalReceivableInr = async () => {
    if (!header || inrReceivableActive) return;
    setSettingInrReceivable(true);
    setMsg('');
    try {
      await api.setDraftTotalReceivableInr(id);
      await reload();
      setMsg(
        'Amounts converted to INR. Concession and CGST/SGST are calculated on the INR gross.',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not set INR receivable');
    } finally {
      setSettingInrReceivable(false);
    }
  };

  const handleRegenerateInvoice = async () => {
    if (!header) return;
    setRegenerating(true);
    setMsg('');
    try {
      const prepRecords = detail?.preparationRecords ?? [];
      const canRecomputeFromPrep =
        prepRecords.length > 0 &&
        !header.adsSplitFamilyId &&
        String(header.invoiceCategory ?? '').trim().toUpperCase() !== 'RAF';

      if (canRecomputeFromPrep) {
        const recomputeRes = await api.recomputeDraftFromPreparation(id);
        const recomputeData = (recomputeRes as { data?: typeof detail }).data;
        if (recomputeData?.header) {
          setDetail({
            ...recomputeData,
            preparationRecords: recomputeData.preparationRecords ?? [],
          });
        }
      }

      const ratesRes = await api.refreshDraftRates(id);
      const factor = (ratesRes as { data?: { header?: { currencyFactor?: number } } }).data?.header
        ?.currencyFactor;
      await reload();

      const roeNote =
        factor != null && Number.isFinite(Number(factor))
          ? ` ROE is now ${Number(factor).toFixed(4)}${
              header.currencyCode === 'USD' ? ' (USD line amounts updated)' : ''
            }.`
          : '';
      setMsg(
        canRecomputeFromPrep
          ? `Invoice regenerated for ${header.customerCode} from the latest customers, contracts, concessions, rate cards, service catalog, taxes, and conversion rates. Royalty Setup, Airport Setup configure rules, Aircraft Master, and Equipment Master were not used.${roeNote}`
          : `Invoice regenerated with the latest customers, taxes, and conversion rates. Royalty Setup, Airport Setup configure rules, Aircraft Master, and Equipment Master were not used.${roeNote}`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Invoice regeneration failed');
    } finally {
      setRegenerating(false);
    }
  };

  const toggleSeparateAdsLine = (lineNo: number) => {
    setSeparateAdsLineNos((previous) => {
      const next = new Set(previous);
      if (next.has(lineNo)) next.delete(lineNo);
      else next.add(lineNo);
      return next;
    });
  };

  const handleCreateSeparateAdsBill = async () => {
    if (!header || separateAdsLineNos.size === 0) return;
    setSplittingAds(true);
    setMsg('');
    try {
      const response = await api.splitAdsInvoiceDraft(
        id,
        [...separateAdsLineNos].sort((a, b) => a - b),
      );
      const created = (response as {
        data?: { created?: { draftNumber?: string }; createdDraftId?: string };
      }).data;
      await reload();
      setMsg(
        created?.created?.draftNumber
          ? `Separate ADS bill ${created.created.draftNumber} created. Unchecked entries remain on this bill.`
          : 'Separate ADS bill created. Unchecked entries remain on this bill.',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not create separate ADS bill');
    } finally {
      setSplittingAds(false);
    }
  };

  const confirmDelete = async () => {
    if (!header) return;
    setDeleting(true);
    setMsg('');
    try {
      if (header.inBin) {
        await api.bulkDeleteInvoiceBin([id]);
      } else if (isDraftStatus(header.status)) {
        await api.deleteInvoiceDraft(id);
      } else {
        await api.deleteInvoice(id);
      }
      setDeleteDialogOpen(false);
      router.push(header.inBin ? '/billing/invoice-bin' : isDraftStatus(header.status) ? '/billing/invoice-drafts' : '/billing/invoices');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const confirmRestoreFromBin = async () => {
    if (!header) return;
    setRestoring(true);
    setMsg('');
    try {
      await api.restoreInvoicesFromBin([id]);
      setRestoreDialogOpen(false);
      await reload();
      setMsg('Invoice restored to main workflow.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  if (!header) {
    if (loadError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Could not load invoice.</p>
          <p className="mt-1">{loadError}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void reload()}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
            >
              Retry
            </button>
            <Link href="/billing/invoice-drafts" className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100">
              Back to drafts
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="text-sm text-gray-500">
        {loadingDetail ? 'Loading invoice…' : 'Invoice unavailable.'}
      </div>
    );
  }

  const prepRecords = detail?.preparationRecords ?? [];
  const isCustomDraft =
    String(header.invoiceCategory ?? '').trim().toUpperCase() === 'CUSTOM';
  const isRafDraft =
    String(header.invoiceCategory ?? '').trim().toUpperCase() === 'RAF';
  const rafPdfBlocked = isRafDraft && rafLinesNeedRates(lines);
  const rafPdfHint =
    'Save a Rate/Unit for every RAF particular (Edit invoice) before View / Generate PDF.';
  const canEditCustomBill = isDraftStatus(header.status) && !header.inBin;
  const canEditInvoiceLines = canEditInvoice(header);
  const showAdsAnnexure = invoiceShowsAdsAnnexure(
    header.invoiceCategory,
    lines,
    header.customerCode,
  );
  const tabs = [
    'general',
    'lines',
    ...(canEditCustomBill ? (['custom-bill'] as const) : []),
    ...(canEditInvoiceLines ? (['edit'] as const) : []),
    ...(prepRecords.length > 0 ? (['preparation'] as const) : []),
    'audit',
  ] as const;

  return (
    <>
      <Link
        href="/billing/invoice-drafts"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--billing-primary)] hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to Invoice Drafts
      </Link>
      <BillingPageHeader
        title={header.invoiceNumber ?? header.draftNumber}
        description={`${header.customerName} — ${header.status}`}
        actions={
          <>
            {!header.inBin ? (
              <>
                {canEditCustomBill ? (
                  <button
                    type="button"
                    onClick={() => setTab('custom-bill')}
                    className="rounded-lg border border-amber-600 bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700"
                  >
                    Manual Billing
                  </button>
                ) : null}
                {canEditInvoiceLines ? (
                  <button
                    type="button"
                    onClick={() => setTab('edit')}
                    className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${
                      isCustomDraft
                        ? 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700'
                        : 'border-[color:var(--billing-primary)] bg-[color:var(--billing-primary)] text-white hover:bg-[color:var(--billing-primary-hover)]'
                    }`}
                  >
                    Edit invoice
                  </button>
                ) : null}
                <InvoiceViewPdfButton
                  loading={exporting}
                  disabled={rafPdfBlocked}
                  disabledTitle={rafPdfHint}
                  onView={() => void handleViewPdf()}
                />
                {showAdsAnnexure ? (
                  <InvoiceViewAnnexureButton customerCode={header.customerCode} />
                ) : null}
                <InvoiceHeaderActionButtons
                  exporting={exporting}
                  sending={sending}
                  hideExport
                  disabled={!canSendOrExport(header)}
                  onExportPdf={() => void handleExportPdf()}
                  onSendToAirline={() => void handleSendToAirline()}
                />
                {canConvertInvoiceCurrency(header) ? (
                  <>
                    <button
                      type="button"
                      disabled={settingUsdReceivable || settingInrReceivable || usdReceivableActive}
                      onClick={() => void handleSetTotalReceivableUsd()}
                      aria-pressed={usdReceivableActive}
                      title="Convert amounts to USD, then calculate concession and CGST/SGST on the USD gross."
                      className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-opacity disabled:cursor-not-allowed ${
                        usdReceivableActive
                          ? 'border-violet-400 bg-violet-100 text-violet-950'
                          : 'border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100'
                      }`}
                    >
                      {settingUsdReceivable
                        ? 'Applying USD receivable…'
                        : 'Total amount receivable as USD'}
                    </button>
                    <button
                      type="button"
                      disabled={settingUsdReceivable || settingInrReceivable || inrReceivableActive}
                      onClick={() => void handleSetTotalReceivableInr()}
                      aria-pressed={inrReceivableActive}
                      title="Convert amounts to INR, then calculate concession and CGST/SGST on the INR gross."
                      className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-opacity disabled:cursor-not-allowed ${
                        inrReceivableActive
                          ? 'border-emerald-400 bg-emerald-100 text-emerald-950'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                      }`}
                    >
                      {settingInrReceivable
                        ? 'Applying INR receivable…'
                        : 'Total amount receivable as INR'}
                    </button>
                  </>
                ) : null}
                {canEditInvoice(header) && !isRafDraft ? (
                  <button
                    type="button"
                    disabled={regenerating}
                    onClick={() => void handleRegenerateInvoice()}
                    title="Re-apply latest contracts, rate cards, master conversion rates, and rules, then recalculate invoice amounts."
                    aria-label="Regenerate invoice"
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100 active:scale-[0.97] disabled:opacity-50"
                  >
                    {regenerating ? 'Regenerating invoice…' : 'Regenerate invoice'}
                  </button>
                ) : null}
                {header.status === 'draft' ? (
                  <button
                    type="button"
                    onClick={() => void run(() => api.submitDraftApproval(id), 'Submitted')}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Submit approval
                  </button>
                ) : null}
                {canDeleteInvoice(header) ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setDeleteDialogOpen(true)}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                ) : null}
                {['approved', 'draft', 'generated', 'posted'].includes(header.status) ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => api.postInvoice(id, { postingDate: new Date().toISOString().slice(0, 10) }),
                          'Posted',
                        )
                      }
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Post
                    </button>
                    {header.status === 'posted' ? (
                      <Link
                        href={`/billing/credit-memos?invoiceId=${encodeURIComponent(id)}`}
                        className="rounded-lg border border-[color:var(--billing-border-strong)] bg-white px-4 py-2.5 text-sm font-medium text-[color:var(--billing-text-secondary)] hover:bg-[color:var(--billing-surface-muted)]"
                      >
                        Issue credit memo
                      </Link>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => setRestoreDialogOpen(true)}
                  className="rounded-lg border border-[color:var(--billing-accent)] bg-[color:var(--billing-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
                >
                  Restore
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteDialogOpen(true)}
                  className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete permanently
                </button>
              </>
            )}
          </>
        }
      />

      {msg ? (
        /sequence not configured/i.test(msg) ? (
          <div className={`mb-4 ${billingUi.alertDanger}`}>
            {msg}{' '}
            <Link href="/billing/settings/sequences" className="font-medium underline">
              Open invoice sequences
            </Link>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-2 text-sm">
            {msg}
          </div>
        )
      ) : null}

      {header.inBin ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This invoice is in the bin and hidden from drafts, review, and invoices.{' '}
          <Link href="/billing/invoice-bin" className="font-medium underline">
            Open invoice bin
          </Link>
        </div>
      ) : null}

      <div className="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${
              tab === t ? 'bg-[color:var(--billing-primary)] text-white' : 'text-gray-700'
            }`}
          >
            {t === 'custom-bill' ? 'Manual Billing' : t === 'edit' ? 'Edit' : t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {tab === 'general' && rafPdfBlocked ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          RAF PDF is locked until every particular has a Rate/Unit.{' '}
          <button
            type="button"
            onClick={() => setTab('edit')}
            className="font-semibold underline"
          >
            Set custom or adhoc rates
          </button>
          .
        </div>
      ) : null}

      {tab === 'general' ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Customer</dt>
              <dd>{header.customerCode}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Bill-to name</dt>
              <dd>{header.customerName}</dd>
            </div>
            {header.customerAddress?.trim() ? (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Bill-to address</dt>
                <dd className="mt-0.5 whitespace-pre-line text-gray-900">
                  {header.customerAddress.trim()}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-gray-500">Currency</dt>
              <dd>
                {header.currencyCode}
                {Number(header.currencyFactor) > 0
                  ? ` · ROE ${Number(header.currencyFactor).toFixed(4)}`
                  : ''}
                {header.totalReceivableInUsd ? ' · Receivable in USD' : ''}
              </dd>
            </div>
            {isCustomDraft ? (
              <div>
                <dt className="text-gray-500">Service type</dt>
                <dd>ADS</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-gray-500">Status</dt>
              <dd>
                <StatusBadge status={header.status} />
              </dd>
            </div>
            {header.customBillOverrides?.updatedAt ? (
              <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Custom bill overrides are applied on this draft. Open the{' '}
                <button
                  type="button"
                  onClick={() => setTab('custom-bill')}
                  className="font-semibold underline"
                >
                  Manual Billing
                </button>{' '}
                tab to review or edit.
              </div>
            ) : null}
          </dl>
          <InvoiceConversionRatePanel header={header} masterRateToInr={masterExchangeRate} />
          <InvoiceAmountBreakdown header={header} lines={lines} />
          <InvoiceCalculationDetails
            header={header}
            lines={lines.filter((line) => !isCeilingParticularLine(line))}
            separateLineNos={separateAdsLineNos}
            splitting={splittingAds}
            onToggleSeparateLine={toggleSeparateAdsLine}
            onCreateSeparateBill={() => void handleCreateSeparateAdsBill()}
          />
        </div>
      ) : null}

      {tab === 'lines' ? (
        <BillingDataTable
          rows={lines.filter((line) => !isCeilingParticularLine(line))}
          getRowKey={(l) => String(l.lineNo)}
          columns={[
            { key: 'no', header: '#', render: (l) => String(l.lineNo) },
            { key: 'desc', header: 'Description', render: (l) => String(l.description) },
            { key: 'service', header: 'Service', render: (l) => resolveInvoiceServiceTypeLabel(header.invoiceCategory, l.serviceCode) },
            { key: 'qty', header: 'Qty', render: (l) => String(l.quantity) },
            {
              key: 'price',
              header: 'Unit',
              render: (l) =>
                formatInvoiceCurrency(Number(l.unitPrice), header.currencyCode),
            },
            {
              key: 'excl',
              header: 'Excl tax',
              render: (l) =>
                formatInvoiceCurrency(Number(l.lineAmountExclTax), header.currencyCode),
            },
            {
              key: 'tax',
              header: 'Tax split',
              render: (l) =>
                `CGST ${asNumber(l.cgstAmount).toFixed(2)} + SGST ${asNumber(l.sgstAmount).toFixed(2)}${
                  asNumber(l.igstAmount) > 0
                    ? ` + IGST ${asNumber(l.igstAmount).toFixed(2)}`
                    : ''
                }`,
            },
            {
              key: 'total',
              header: 'Incl tax',
              render: (l) =>
                formatInvoiceCurrency(Number(l.lineAmountInclTax), header.currencyCode),
            },
          ]}
        />
      ) : null}

      {tab === 'edit' && canEditInvoiceLines ? (
        isRafDraft ? (
          <RafInvoiceRatesEditor
            api={api}
            draftId={id}
            currencyCode={header.currencyCode}
            lines={linesToInvoiceEditLines(lines)}
            onSaved={(message) => {
              setMsg(message);
              setTab('lines');
              void reload();
            }}
          />
        ) : isCustomDraft ? (
          <CustomInvoiceEditForm
            api={api}
            draftId={id}
            currencyCode={header.currencyCode}
            totalReceivableInUsd={header.totalReceivableInUsd}
            preparationRecords={prepRecords}
            invoiceLines={(detail?.lines ?? []) as Array<Record<string, unknown>>}
            onSaved={(message) => {
              setMsg(message);
              setTab('lines');
              void reload();
            }}
          />
        ) : (
          <InvoiceLinesEditForm
            api={api}
            draftId={id}
            currencyCode={header.currencyCode}
            lines={linesToInvoiceEditLines(lines)}
            onSaved={(message) => {
              setMsg(message);
              setTab('lines');
              void reload();
            }}
          />
        )
      ) : null}

      {tab === 'custom-bill' && canEditCustomBill && header ? (
        <DraftCustomBillForm
          api={api}
          draftId={id}
          header={header}
          invoiceLines={(detail?.lines ?? []) as Array<Record<string, unknown>>}
          customerMaster={detail?.customerMaster}
          isCustomCategory={isCustomDraft}
          onSaved={(message) => {
            setMsg(message);
            setTab('general');
            void reload();
          }}
        />
      ) : null}

      {tab === 'preparation' ? (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Review billing readiness checklists and exchange remarks with the preparation maker.
            {' '}
            <Link href="/billing/preparation?tab=ready_for_invoice" className="font-medium text-[color:var(--billing-accent-strong)] underline">
              Open preparation workspace
            </Link>
          </p>
          {prepRecords.map((record) => (
            <div
              key={String(record._id)}
              className="rounded-xl border border-gray-200 bg-gray-50/50 p-4"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  {record.sourceRef.serialNo ?? record.sourceRef.usageRowId ?? 'Flight'}{' '}
                  <span className="font-normal text-gray-500">· {record.customerCode}</span>
                </h3>
                <Link
                  href={`/billing/preparation?tab=${record.status === 'invoiced' ? 'ready_for_invoice' : record.status}`}
                  className="text-xs font-medium text-[color:var(--billing-accent-strong)] underline"
                >
                  View in preparation
                </Link>
              </div>
              <PreparationWorkflowPanel
                record={record}
                api={api}
                draftId={id}
                context={buildPreparationContext(record)}
                onUpdated={(updated) => {
                  setDetail((prev) =>
                    prev
                      ? {
                          ...prev,
                          preparationRecords: (prev.preparationRecords ?? []).map((r) =>
                            String(r._id) === String(updated._id) ? updated : r,
                          ),
                        }
                      : prev,
                  );
                }}
                onActionComplete={() => void reload()}
              />
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'audit' ? (
        <ul className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          {(detail?.auditTrail ?? []).map((a) => (
            <li key={String(a._id)}>
              <span className="font-medium">{String(a.action)}</span> by {String(a.userName)} —{' '}
              {String(a.timestamp).slice(0, 19)}
            </li>
          ))}
        </ul>
      ) : null}

      <InvoiceDeleteDialog
        mode="single"
        variant={isDraftStatus(header.status) ? 'draft' : 'invoice'}
        record={header}
        selected={[]}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => void confirmDelete()}
        deleting={deleting}
      />
      <InvoiceBinDialog
        action="restore"
        selected={[header]}
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={() => void confirmRestoreFromBin()}
        busy={restoring}
      />
    </>
  );
}
