'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  OTHER_STATION_BILLING_PERIOD,
  isDelhiStation,
  readLoginStationCode,
} from '@/lib/billing-default-period';
import {
  AlertCircle,
  Calendar,
  CheckCheck,
  ChevronRight,
  FilePlus2,
  FileStack,
  Inbox,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import { StatusBadge } from '../StatusBadge';
import { MatchIndicator, ValidationIndicator } from '../sources/ValidationIndicator';
import { PreparationWorkflowPanel, buildPreparationContext } from './PreparationWorkflowPanel';
import { CustomBillingForm } from './CustomBillingForm';
import { getChecklistSummary } from '@/lib/billing-shared/preparation-checklist';
import {
  buildContractsFixHref,
  buildRateCardsFixHref,
} from '@/lib/billing-shared/preparation-fix-links';
import {
  groupPreparationRowsByFlight,
  prepLineEquipmentLabel,
  type PrepFlightGroup,
} from '@/lib/billing-shared/preparation-flight-groups';
import {
  buildRafFormsHrefFromPreparation,
  buildScheduledAirlinesHrefFromPreparation,
} from '@/lib/preparationScheduledAirlinesNav';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingPreparationRecord } from '@/lib/billing-shared/types';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import {
  preparationDisplayFlightNo,
  preparationFlightKind,
  type PreparationFlightKindFilter,
} from '@/lib/billing-shared/preparation-flight-display';
import type { PreparationStatus } from '@/lib/billing-shared/enums';
import {
  getBillingWorkspacePageSlice,
  setBillingWorkspacePageSlice,
  useBillingWorkspaceIdentity,
} from '@/lib/billing-workspace/store';

const TABS: Array<{ id: PreparationStatus; label: string; empty: string }> = [
  {
    id: 'eligible',
    label: 'Eligible',
    empty:
      'No eligible rows — this tab is for flights missing a contract or rate match. Matched flights land in Pending.',
  },
  {
    id: 'pending',
    label: 'Pending',
    empty: 'No pending rows — validation passed with contract and rate matched.',
  },
  {
    id: 'validation_error',
    label: 'Validation errors',
    empty: 'No validation errors — great job.',
  },
  {
    id: 'rejected',
    label: 'Rejected',
    empty: 'No rejected rows.',
  },
  {
    id: 'ready_for_invoice',
    label: 'Ready for invoice',
    empty: 'Mark validated rows ready to create invoice drafts (Phase 4).',
  },
];

const CUSTOM_TAB = {
  id: 'custom' as const,
  label: 'Custom',
  empty:
    'Enter customer, period, and billing lines below — Submit creates an invoice draft (no flights).',
};

type PreparationTabId = PreparationStatus | 'custom';

/** Prefer where successful sends land when default Eligible tab is empty. */
const TAB_AUTOSWITCH_ORDER: PreparationStatus[] = [
  'pending',
  'eligible',
  'validation_error',
  'ready_for_invoice',
  'rejected',
];

type Props = { api: BillingApi };

function draftCreationMessage(data?: {
  created?: string[];
  merged?: string[];
  totalFlights?: number;
  skippedGroups?: Array<{
    customerCode: string;
    recordCount: number;
    reason?: string;
  }>;
}): string {
  const created = data?.created?.length ?? 0;
  const merged = data?.merged?.length ?? 0;
  const flights = data?.totalFlights ?? 0;
  const skipped = data?.skippedGroups ?? [];
  const flightLabel =
    flights > 0 ? ` — ${flights} flight${flights === 1 ? '' : 's'} on invoice` : '';
  const skipLabel =
    skipped.length > 0
      ? ` Skipped ${skipped
          .map((g) =>
            g.reason
              ? `${g.customerCode}: ${g.reason}`
              : g.customerCode,
          )
          .join(' · ')}.`
      : '';
  if (merged > 0 && created > 0) {
    return `Created ${created} draft(s) and updated ${merged} existing draft(s) with all ready flights${flightLabel}.${skipLabel}`;
  }
  if (merged > 0) {
    return `Updated ${merged} existing draft(s) with all ready flights for this period${flightLabel}.${skipLabel}`;
  }
  if (created > 0) {
    return `Created ${created} invoice draft(s) with all ready flights for this period${flightLabel}.${skipLabel}`;
  }
  return skipLabel.trim() || 'Draft updated.';
}

const PREPARATION_DEFAULT_FROM = '2026-08-01';
const PREPARATION_DEFAULT_TO = '2026-08-31';
/** Max rows loaded per list request (server caps at 10000). */
const PREPARATION_LIST_LIMIT = 10000;
/** Chunk size for id-based bulk ready / delete when not using filter select-all. */
const BULK_READY_CHUNK = 500;

const PREPARATION_PERIOD_KEY = 'preparation.period';
const DEFAULT_FLIGHT_MONTH_KEY = 'billing.preparation.defaultFlightMonth';

function defaultFlightMonthStorageKey(): string {
  const station = readLoginStationCode()?.trim().toUpperCase() || 'station';
  return `${DEFAULT_FLIGHT_MONTH_KEY}:${station}`;
}

function readStoredDefaultFlightMonth(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(defaultFlightMonthStorageKey())?.trim() ?? '';
    return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredDefaultFlightMonth(month: string): void {
  try {
    localStorage.setItem(defaultFlightMonthStorageKey(), month);
  } catch {
    /* private mode — the current page range still updates */
  }
}

function monthBounds(month: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (monthIndex < 1 || monthIndex > 12) return null;
  const lastDay = new Date(year, monthIndex, 0).getDate();
  const mm = String(monthIndex).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

/* ── Page-scoped presentation tokens (styling only) ── */
const prepFocusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)] focus-visible:ring-offset-1';
const prepRowActionBase = `inline-flex min-h-7 items-center gap-1 rounded-[var(--billing-radius)] border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color] duration-150 ${prepFocusRing}`;
const prepRowActionNeutral = `${prepRowActionBase} border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] text-[color:var(--billing-text-secondary)] hover:bg-[color:var(--billing-surface-muted)] hover:text-[color:var(--billing-text)]`;
const prepRowActionPrimary = `${prepRowActionBase} border-[color:var(--billing-primary)] bg-[color:var(--billing-surface)] text-[color:var(--billing-primary)] hover:bg-[color:var(--billing-primary-soft)] disabled:cursor-not-allowed disabled:border-[color:var(--billing-border)] disabled:text-[color:var(--billing-text-muted)] disabled:hover:bg-transparent`;
const prepRowActionInfo = `${prepRowActionBase} border-[color:var(--billing-info-border)] bg-[color:var(--billing-surface)] text-[color:var(--billing-info)] hover:bg-[color:var(--billing-info-soft)]`;
const prepRowActionDanger = `${prepRowActionBase} border-[color:var(--billing-danger-border)] bg-[color:var(--billing-surface)] text-[color:var(--billing-danger)] hover:bg-[color:var(--billing-danger-soft)]`;
const prepInlineLink = `font-medium text-[color:var(--billing-info)] underline decoration-[color:var(--billing-info-border)] underline-offset-2 transition-colors hover:text-[color:var(--billing-primary)] ${prepFocusRing}`;
const prepCheckbox =
  'h-4 w-4 cursor-pointer rounded border-[color:var(--billing-border-strong)] accent-[color:var(--billing-primary)] disabled:cursor-not-allowed disabled:opacity-40';

type PreparationPeriodSlice = {
  from: string;
  to: string;
  customerCode: string;
  tab: string;
};

export function PreparationPage({ api }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceIdentity = useBillingWorkspaceIdentity();
  const tabParam = searchParams.get('tab');
  const [restoredTab, setRestoredTab] = useState<string | null>(null);
  const tab = ((tabParam || restoredTab) as PreparationTabId) || 'eligible';
  const resolvedTab: PreparationTabId =
    tab === 'custom' || TABS.some((t) => t.id === tab) ? tab : 'eligible';
  const isCustomTab = resolvedTab === 'custom';

  const [from, setFrom] = useState(
    () => searchParams.get('from')?.trim() || PREPARATION_DEFAULT_FROM,
  );
  const [to, setTo] = useState(
    () => searchParams.get('to')?.trim() || PREPARATION_DEFAULT_TO,
  );
  const [customerCode, setCustomerCode] = useState(
    () => searchParams.get('customer')?.trim() || '',
  );
  const [periodReady, setPeriodReady] = useState(false);
  const [flightKind, setFlightKind] = useState<PreparationFlightKindFilter>('all');
  const [rows, setRows] = useState<BillingPreparationRecord[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [scopedTotal, setScopedTotal] = useState(0);
  const [scopedReadyCount, setScopedReadyCount] = useState(0);
  const [fetchedLineTotal, setFetchedLineTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** When true, Mark ready applies to every row matching the current tab filters. */
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [markingReadyRowId, setMarkingReadyRowId] = useState<string | null>(null);
  const [creatingDrafts, setCreatingDrafts] = useState(false);
  const [draftProgress, setDraftProgress] = useState('');
  const [draftingRowId, setDraftingRowId] = useState<string | null>(null);

  const activeTab = isCustomTab
    ? CUSTOM_TAB
    : (TABS.find((t) => t.id === resolvedTab) ?? TABS[0]);

  const periodStatusSummary = useMemo(() => {
    if (scopedTotal <= 0) return '';
    const parts = [
      ...TABS.filter((t) => (tabCounts[t.id] ?? 0) > 0).map(
        (t) => `${tabCounts[t.id]} ${t.label.toLowerCase()}`,
      ),
      (tabCounts.custom ?? 0) > 0
        ? `${tabCounts.custom} custom`
        : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '';
  }, [scopedTotal, tabCounts]);

  /** ADS-family lines collapse to one row per flight (same as ADS usage page). */
  const allFlightGroups = useMemo(() => groupPreparationRowsByFlight(rows), [rows]);
  const kindFilterActive =
    resolvedTab === 'validation_error' && flightKind !== 'all';
  const flightGroups = useMemo(() => {
    if (!kindFilterActive) return allFlightGroups;
    return allFlightGroups.filter(
      (group) => preparationFlightKind(group.row) === flightKind,
    );
  }, [allFlightGroups, kindFilterActive, flightKind]);
  const validationKindCounts = useMemo(() => {
    if (resolvedTab !== 'validation_error') return null;
    const counts = { all: 0, cancelled: 0, scheduled: 0, additional: 0 };
    for (const group of allFlightGroups) {
      counts.all += 1;
      counts[preparationFlightKind(group.row)] += 1;
    }
    return counts;
  }, [resolvedTab, allFlightGroups]);
  /** RAF has no contract concept — hide Contract column when this page is RAF-only. */
  const hideContractColumn = useMemo(
    () =>
      flightGroups.length > 0 &&
      flightGroups.every((g) => String(g.row.sourceType ?? '').toLowerCase() === 'raf'),
    [flightGroups],
  );

  const currentTabFlightCount =
    !isCustomTab &&
    rows.length > 0 &&
    fetchedLineTotal > 0 &&
    rows.length >= fetchedLineTotal
      ? flightGroups.length
      : null;

  const tabBadgeCount = (id: string) =>
    id === resolvedTab && currentTabFlightCount != null
      ? currentTabFlightCount
      : (tabCounts[id] ?? 0);

  const readyInPeriod =
    resolvedTab === 'ready_for_invoice' && currentTabFlightCount != null
      ? currentTabFlightCount
      : scopedReadyCount;

  const linesByGroupKey = useMemo(() => {
    const map = new Map<string, BillingPreparationRecord[]>();
    for (const g of flightGroups) map.set(g.key, g.lines);
    return map;
  }, [flightGroups]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listPreparation({
        status: isCustomTab ? undefined : (resolvedTab as PreparationStatus),
        sourceType: isCustomTab ? 'custom' : undefined,
        from,
        to,
        customerCode: customerCode || undefined,
        limit: PREPARATION_LIST_LIMIT,
      });
      setRows((res.data ?? []) as BillingPreparationRecord[]);
      const meta = res.meta ?? {};
      const scoped =
        (meta.scopedTabCounts as Record<string, number> | undefined) ??
        (meta.tabCounts as Record<string, number> | undefined) ??
        {};
      setTabCounts(scoped);
      const customCount =
        Number(meta.scopedCustomCount ?? scoped.custom ?? 0) || 0;
      const statusOnlyTotal = TABS.reduce(
        (sum, t) => sum + (Number(scoped[t.id] ?? 0) || 0),
        0,
      );
      // Prefer visible-tab sum (excludes invoiced) + custom; fall back to server total.
      const visibleTotal = statusOnlyTotal + customCount;
      setScopedTotal(
        visibleTotal > 0
          ? visibleTotal
          : Number(meta.scopedTotal ?? 0) || 0,
      );
      setScopedReadyCount(Number(meta.scopedReadyCount ?? 0) || 0);
      setFetchedLineTotal(Number(meta.total ?? 0) || 0);
      setSelected(new Set());
      setSelectAllMatching(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load preparation records');
    } finally {
      setLoading(false);
    }
  }, [api, resolvedTab, isCustomTab, from, to, customerCode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspaceIdentity || periodReady) return;
    const saved = getBillingWorkspacePageSlice<PreparationPeriodSlice>(
      PREPARATION_PERIOD_KEY,
    );
    const storedMonth = readStoredDefaultFlightMonth();
    const storedRange = storedMonth ? monthBounds(storedMonth) : null;
    if (!searchParams.get('from')?.trim()) {
      if (storedRange) setFrom(storedRange.from);
      else if (saved?.from) setFrom(saved.from);
    }
    if (!searchParams.get('to')?.trim()) {
      if (storedRange) setTo(storedRange.to);
      else if (saved?.to) setTo(saved.to);
    }
    if (!searchParams.get('customer')?.trim() && saved?.customerCode) {
      setCustomerCode(saved.customerCode);
    }
    if (!searchParams.get('tab')?.trim() && saved?.tab) setRestoredTab(saved.tab);
    if (
      !storedRange &&
      !saved?.from &&
      !searchParams.get('from')?.trim() &&
      !isDelhiStation(readLoginStationCode())
    ) {
      setFrom(OTHER_STATION_BILLING_PERIOD.from);
      setTo(OTHER_STATION_BILLING_PERIOD.to);
    }
    setPeriodReady(true);
  }, [workspaceIdentity, periodReady, searchParams]);

  useEffect(() => {
    if (tab === resolvedTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', resolvedTab);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    router.replace(`/billing/preparation?${params.toString()}`);
  }, [tab, resolvedTab, router, searchParams, from, to]);

  useEffect(() => {
    if (!periodReady) return;
    setBillingWorkspacePageSlice(PREPARATION_PERIOD_KEY, {
      from,
      to,
      customerCode,
      tab: resolvedTab,
    });
  }, [periodReady, from, to, customerCode, resolvedTab]);

  /** Restore period filters when returning from Scheduled Airlines. */
  useEffect(() => {
    const fromParam = searchParams.get('from')?.trim();
    const toParam = searchParams.get('to')?.trim();
    const customerParam = searchParams.get('customer')?.trim();
    if (fromParam) setFrom(fromParam);
    if (toParam) setTo(toParam);
    if (customerParam !== null && customerParam !== undefined) {
      setCustomerCode(customerParam);
    }
  }, [searchParams]);

  /**
   * Default landing is Eligible, but successful sends with contract+rate match
   * land in Pending. When URL has no explicit tab and Eligible is empty, jump
   * to the first non-empty tab so ingested flights are visible.
   */
  useEffect(() => {
    if (loading || tabParam) return;
    if ((tabCounts[resolvedTab] ?? 0) > 0) return;
    if (scopedTotal <= 0) return;
    const next = TAB_AUTOSWITCH_ORDER.find((id) => (tabCounts[id] ?? 0) > 0);
    if (!next || next === resolvedTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    router.replace(`/billing/preparation?${params.toString()}`);
  }, [
    loading,
    tabParam,
    tabCounts,
    scopedTotal,
    resolvedTab,
    router,
    searchParams,
    from,
    to,
  ]);

  const setTab = (id: PreparationTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (customerCode.trim()) params.set('customer', customerCode.trim());
    else params.delete('customer');
    router.replace(`/billing/preparation?${params.toString()}`);
  };

  const applyDefaultFlightMonth = (month: string) => {
    const range = monthBounds(month);
    if (!range) return;
    writeStoredDefaultFlightMonth(month);
    setFrom(range.from);
    setTo(range.to);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', resolvedTab);
    params.set('from', range.from);
    params.set('to', range.to);
    if (customerCode.trim()) params.set('customer', customerCode.trim());
    else params.delete('customer');
    router.replace(`/billing/preparation?${params.toString()}`);
  };

  const defaultFlightMonthValue = /^\d{4}-\d{2}/.test(from) ? from.slice(0, 7) : '';
  const defaultMonthInputRef = useRef<HTMLInputElement>(null);

  const openDefaultMonthPicker = () => {
    const input = defaultMonthInputRef.current;
    if (!input) return;
    input.focus();
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  };

  const syncPeriodToUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', resolvedTab);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (customerCode.trim()) params.set('customer', customerCode.trim());
    else params.delete('customer');
    router.replace(`/billing/preparation?${params.toString()}`);
  }, [searchParams, resolvedTab, from, to, customerCode, router]);

  const rowId = (r: BillingPreparationRecord) => String(r._id);

  const lineIdsForSelectedFlights = useCallback(() => {
    return [...selected].flatMap((key) =>
      (linesByGroupKey.get(key) ?? []).map((l) => String(l._id)),
    );
  }, [selected, linesByGroupKey]);

  const toggleSelect = (groupKey: string) => {
    setSelectAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const tabTotal = tabCounts[resolvedTab] ?? 0;
  /** Header checkbox + Delete use flight count when known; filter-delete covers every line in the tab. */
  const selectedFlightCount = selectAllMatching
    ? flightGroups.length
    : selected.size;
  const selectedCount = selectedFlightCount;
  const allSelected =
    flightGroups.length > 0 &&
    (selectAllMatching || selected.size === flightGroups.length);
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
      setSelectAllMatching(false);
      setActionMsg('');
      return;
    }
    setSelectingAll(true);
    setActionMsg('');
    try {
      setSelected(new Set(flightGroups.map((g) => g.key)));
      setSelectAllMatching(!kindFilterActive);
      const flights = flightGroups.length;
      setActionMsg(
        flights > 0
          ? `Selected all ${flights} flight${flights === 1 ? '' : 's'}${
              kindFilterActive ? ` in ${flightKind}` : ' in this tab'
            }.`
          : '',
      );
    } finally {
      setSelectingAll(false);
    }
  };

  const updateRow = useCallback((updated: BillingPreparationRecord) => {
    setRows((prev) =>
      prev.map((r) => (String(r._id) === String(updated._id) ? updated : r)),
    );
  }, []);

  const toggleExpand = (groupKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const canBulkReady = useMemo(
    () =>
      !isCustomTab &&
      (resolvedTab === 'pending' || resolvedTab === 'eligible'),
    [resolvedTab, isCustomTab],
  );

  const deleteSelected = async () => {
    if (selectedCount === 0 || deleting || isCustomTab) return;

    const useFilterDelete =
      selectAllMatching &&
      TABS.some((t) => t.id === tab);

    const flightLabel = `${selectedCount} flight${selectedCount === 1 ? '' : 's'}`;
    const confirmed = window.confirm(
      `Delete ${flightLabel} from preparation? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setActionMsg('');
    setError('');
    try {
      let failedCount = 0;
      const failed: Array<{ id: string; message: string }> = [];

      if (useFilterDelete) {
        setActionMsg(`Deleting ${selectedCount} flight${selectedCount === 1 ? '' : 's'}…`);
        const res = await api.bulkDeletePreparationByFilter({
          status: tab as
            | 'pending'
            | 'eligible'
            | 'validation_error'
            | 'rejected'
            | 'ready_for_invoice',
          from,
          to,
          customerCode: customerCode || undefined,
        });
        failedCount = res.data?.failedCount ?? res.data?.failed?.length ?? 0;
        failed.push(...(res.data?.failed ?? []));
      } else {
        const ids = lineIdsForSelectedFlights();
        for (let i = 0; i < ids.length; i += BULK_READY_CHUNK) {
          const chunk = ids.slice(i, i + BULK_READY_CHUNK);
          const res = await api.bulkDeletePreparation(chunk);
          failed.push(...(res.data?.failed ?? []));
        }
        failedCount = failed.length;
      }

      setSelected(new Set());
      setSelectAllMatching(false);
      await load();

      const flightWord = `${selectedCount} flight${selectedCount === 1 ? '' : 's'}`;
      if (failedCount === 0) {
        setActionMsg(`Deleted ${flightWord}.`);
      } else {
        const sample = failed
          .slice(0, 2)
          .map((f) => f.message)
          .join('; ');
        setActionMsg(
          `Could not delete every one of the ${flightWord}${sample ? `: ${sample}` : ''}.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      setActionMsg(msg);
      setError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const markReadySelected = async () => {
    if (selectedCount === 0 || markingReady) return;
    const count = selectedCount;

    setMarkingReady(true);
    setActionMsg('');
    setError('');
    try {
      let failed = 0;
      let results: Array<{ id: string; ok: boolean; message?: string }> = [];

      const canFilterReady =
        selectAllMatching &&
        (tab === 'pending' || tab === 'eligible' || tab === 'validation_error');

      if (canFilterReady) {
        const res = await api.bulkMarkPreparationReadyByFilter({
          status: tab,
          from,
          to,
          customerCode: customerCode || undefined,
        });
        const data = res.data;
        failed = data?.failed ?? 0;
        results = data?.results ?? [];
      } else {
        const ids = lineIdsForSelectedFlights();
        for (let i = 0; i < ids.length; i += BULK_READY_CHUNK) {
          const chunk = ids.slice(i, i + BULK_READY_CHUNK);
          const res = await api.bulkMarkPreparationReady(chunk);
          const data = res.data;
          failed += data?.failed ?? 0;
          results = results.concat(data?.results ?? []);
        }
      }

      const failedIds = new Set(
        results.filter((row) => !row.ok).map((row) => row.id),
      );

      setRows((prev) => prev.filter((row) => failedIds.has(String(row._id))));
      setSelected(new Set());
      setSelectAllMatching(false);
      if (failed === 0) {
        setTabCounts((prev) => ({
          ...prev,
          [tab]: Math.max(0, (prev[tab] ?? 0) - count),
          ready_for_invoice: (prev.ready_for_invoice ?? 0) + count,
        }));
        setScopedReadyCount((prev) => prev + count);
        setActionMsg(
          `Marked ${count} flight${count === 1 ? '' : 's'} ready for invoice.`,
        );
      } else {
        const failMessages = results
          .filter((row) => !row.ok)
          .map((row) => row.message)
          .filter(Boolean) as string[];
        const uniqueReasons = [...new Set(failMessages)].slice(0, 3);
        const sample = uniqueReasons.join(' · ');
        const summary = `Could not mark every one of the ${count} flight${count === 1 ? '' : 's'} ready for invoice${sample ? `: ${sample}` : ''}.`;
        setError(summary);
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark ready failed');
    } finally {
      setMarkingReady(false);
    }
  };

  const markReadyGroup = async (group: PrepFlightGroup) => {
    if (markingReadyRowId) return;
    const ids = group.lines.map((l) => String(l._id));
    if (ids.length === 0) return;
    setMarkingReadyRowId(group.key);
    setActionMsg('');
    try {
      let failed = 0;
      for (let i = 0; i < ids.length; i += BULK_READY_CHUNK) {
        const chunk = ids.slice(i, i + BULK_READY_CHUNK);
        const res = await api.bulkMarkPreparationReady(chunk);
        failed += res.data?.failed ?? 0;
      }
      setSelectAllMatching(false);
      if (failed === 0) {
        setTabCounts((prev) => ({
          ...prev,
          [tab]: Math.max(0, (prev[tab] ?? 0) - 1),
          ready_for_invoice: (prev.ready_for_invoice ?? 0) + 1,
        }));
        setScopedReadyCount((prev) => prev + 1);
        setRows((prev) => prev.filter((row) => !ids.includes(String(row._id))));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(group.key);
          return next;
        });
        setActionMsg('Marked this flight ready for invoice.');
      } else {
        setError('This flight could not be marked ready for invoice.');
        await load();
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Mark ready failed');
    } finally {
      setMarkingReadyRowId(null);
    }
  };

  const validateGroup = async (group: PrepFlightGroup) => {
    setActionMsg('');
    try {
      for (const line of group.lines) {
        await api.validatePreparation(String(line._id));
      }
      setActionMsg('Re-validated this flight.');
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const rejectGroup = async (group: PrepFlightGroup) => {
    const reason = window.prompt('Rejection reason (optional)');
    setActionMsg('');
    try {
      for (const line of group.lines) {
        await api.rejectPreparation(String(line._id), reason ?? undefined);
      }
      setActionMsg('Rejected this flight.');
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    setActionMsg('');
    setError('');
    try {
      const res = await api.refreshPreparation({
        from,
        to,
        customerCode: customerCode || undefined,
        status: isCustomTab ? undefined : (resolvedTab as PreparationStatus),
      });
      const refreshed = res.data?.refreshed ?? 0;
      const statusChanged = res.data?.statusChanged ?? 0;
      const failed = res.data?.failed ?? 0;

      if (refreshed === 0 && failed === 0) {
        setActionMsg('No flights to refresh for this tab and period.');
      } else if (failed > 0) {
        setActionMsg(
          'Flights were refreshed. Some flights could not be updated.',
        );
      } else {
        setActionMsg(
          statusChanged > 0
            ? 'Flights were refreshed. Some moved to a different tab.'
            : 'Flights were refreshed with the latest contracts, rate cards, and validation rules.',
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="preparation-workspace flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
      <BillingPageHeader
        title="Preparation workspace"
        description="Bridge operational data to invoice drafts — review eligibility, fix validation errors, mark ready."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isCustomTab ? (
            <button
              type="button"
              disabled={refreshing || loading}
              onClick={() => void refreshAll()}
              title="Re-apply latest contracts, rate cards, and validation rules for rows on this tab"
              className={billingUi.btnSecondary}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            ) : null}
            {!isCustomTab ? (
              <button
                type="button"
                disabled={selectedCount === 0 || deleting || markingReady}
                onClick={() => void deleteSelected()}
                className={billingUi.btnDangerOutline}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {`Delete selected (${selectedCount})`}
                  </>
                )}
              </button>
            ) : null}
            {canBulkReady ? (
              <button
                type="button"
                disabled={selectedCount === 0 || markingReady || deleting || refreshing}
                onClick={() => void markReadySelected()}
                className={billingUi.btnPrimary}
              >
                {markingReady ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Marking ready…
                  </>
                ) : (
                  <>
                    <CheckCheck className="h-4 w-4" aria-hidden />
                    {`Mark ready (${selectedCount})`}
                  </>
                )}
              </button>
            ) : null}
            {tab === 'ready_for_invoice' && !isCustomTab ? (
              <button
                type="button"
                disabled={readyInPeriod === 0 || creatingDrafts || draftingRowId != null}
                onClick={() =>
                  void (async () => {
                    if (creatingDrafts || draftingRowId != null) return;
                    setCreatingDrafts(true);
                    setDraftProgress('');
                    setActionMsg('');
                    setError('');
                    try {
                      const listed = await api.listReadyInvoiceCustomers({
                        from,
                        to,
                        customerCode: customerCode || undefined,
                      });
                      const codes = (listed.data ?? []).filter(Boolean);
                      const targets = codes.length > 0 ? codes : [customerCode || ''];
                      const created: string[] = [];
                      const merged: string[] = [];
                      const skippedGroups: Array<{
                        customerCode: string;
                        recordCount: number;
                        reason?: string;
                      }> = [];
                      let totalFlights = 0;
                      for (let index = 0; index < targets.length; index += 1) {
                        const code = targets[index] ?? '';
                        setDraftProgress(
                          code
                            ? `${code} (${index + 1} of ${targets.length})`
                            : `${index + 1} of ${targets.length}`,
                        );
                        try {
                          const res = await api.createDraftsFromPreparation({
                            billingPeriodStart: from,
                            billingPeriodEnd: to,
                            customerCode: code || undefined,
                            groupByCustomer: true,
                            mergeOpenDraft: false,
                          });
                          const payload = (
                            res as {
                              data?: {
                                created?: string[];
                                merged?: string[];
                                totalFlights?: number;
                                skippedGroups?: Array<{
                                  customerCode: string;
                                  recordCount: number;
                                  reason: string;
                                }>;
                              };
                            }
                          ).data;
                          created.push(...(payload?.created ?? []));
                          merged.push(...(payload?.merged ?? []));
                          skippedGroups.push(...(payload?.skippedGroups ?? []));
                          totalFlights += payload?.totalFlights ?? 0;
                        } catch (err) {
                          const message = err instanceof Error ? err.message : 'Create draft failed';
                          const skippable =
                            /no ready preparation|no billable|fortnight billing/i.test(message);
                          if (skippable && code) {
                            skippedGroups.push({
                              customerCode: code,
                              recordCount: 0,
                              reason: message,
                            });
                            continue;
                          }
                          if (created.length + merged.length > 0) {
                            setActionMsg(
                              draftCreationMessage({
                                created,
                                merged,
                                totalFlights,
                                skippedGroups,
                              }),
                            );
                          }
                          throw new Error(
                            code
                              ? `${code}: ${message}. Invoices already created for earlier airlines are kept.`
                              : message,
                          );
                        }
                      }
                      setActionMsg(
                        draftCreationMessage({
                          created,
                          merged,
                          totalFlights,
                          skippedGroups,
                        }),
                      );
                      if (skippedGroups.length === 0 && created.length + merged.length > 0) {
                        setScopedReadyCount(0);
                        setTabCounts((prev) => ({
                          ...prev,
                          ready_for_invoice: 0,
                        }));
                        router.push('/billing/invoice-drafts');
                      } else {
                        await load();
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Create draft failed');
                      await load();
                    } finally {
                      setCreatingDrafts(false);
                      setDraftProgress('');
                    }
                  })()
                }
                className={billingUi.btnOutline}
              >
                {creatingDrafts ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {draftProgress ? `Creating ${draftProgress}…` : 'Creating invoice…'}
                  </>
                ) : (
                  <>
                    <FilePlus2 className="h-4 w-4" aria-hidden />
                    {`Create invoice (${readyInPeriod} flights)`}
                  </>
                )}
              </button>
            ) : null}
            <div className="relative">
              <button
                type="button"
                onClick={openDefaultMonthPicker}
                className={billingUi.btnSecondary}
              >
                <Calendar className="h-4 w-4" aria-hidden />
                Set default month for flights
              </button>
              <input
                ref={defaultMonthInputRef}
                type="month"
                aria-label="Set default month for flights"
                min="2000-01"
                max="2100-12"
                value={defaultFlightMonthValue}
                onChange={(event) => {
                  const month = event.target.value;
                  if (/^\d{4}-\d{2}$/.test(month)) applyDefaultFlightMonth(month);
                }}
                tabIndex={-1}
                className="pointer-events-none absolute h-px w-px opacity-0"
              />
            </div>
          </div>
        }
      />

      <div
        role="tablist"
        aria-label="Preparation status"
        className="z-20 -mx-4 mb-4 flex flex-wrap gap-1 border-b border-[color:var(--billing-border)] bg-[color:var(--billing-bg)]/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 supports-[backdrop-filter]:bg-[color:var(--billing-bg)]/90"
      >
        <div className="flex w-full gap-1 overflow-x-auto rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-1 shadow-[var(--billing-shadow-sm)]">
        {TABS.map((t) => {
          const active = resolvedTab === t.id;
          const count = tabBadgeCount(t.id);
          return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setTab(t.id)}
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--billing-radius-lg)] px-3.5 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ${prepFocusRing} ${
              active
                ? 'bg-[color:var(--billing-primary)] text-[color:var(--billing-text-inverse)] shadow-[var(--billing-shadow-sm)]'
                : 'text-[color:var(--billing-text-secondary)] hover:bg-[color:var(--billing-primary-soft)] hover:text-[color:var(--billing-primary)]'
            }`}
          >
            {t.label}
            <span
              className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                active
                  ? 'bg-white/20 text-[color:var(--billing-text-inverse)]'
                  : count > 0
                    ? 'bg-[color:var(--billing-info-soft)] text-[color:var(--billing-info)]'
                    : 'bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-text-muted)]'
              }`}
            >
              {count}
            </span>
          </button>
          );
        })}
        <span className="mx-1 my-1.5 w-px shrink-0 bg-[color:var(--billing-border)]" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={isCustomTab}
          onClick={() => setTab('custom')}
          className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--billing-radius-lg)] px-3.5 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ${prepFocusRing} ${
            isCustomTab
              ? 'bg-[color:var(--billing-warning)] text-[color:var(--billing-text-inverse)] shadow-[var(--billing-shadow-sm)]'
              : 'text-[color:var(--billing-text-secondary)] hover:bg-[color:var(--billing-warning-soft)] hover:text-[color:var(--billing-warning)]'
          }`}
        >
          {CUSTOM_TAB.label}
          <span
            className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
              isCustomTab
                ? 'bg-white/20 text-[color:var(--billing-text-inverse)]'
                : (tabCounts.custom ?? 0) > 0
                  ? 'bg-[color:var(--billing-warning-soft)] text-[color:var(--billing-warning)]'
                  : 'bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-text-muted)]'
            }`}
          >
            {tabCounts.custom ?? 0}
          </span>
        </button>
        </div>
      </div>

      {!loading && scopedTotal > 0 ? (
        <p className="mb-3 flex items-start gap-2 text-sm text-[color:var(--billing-text-secondary)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--billing-text-muted)]" aria-hidden />
          <span>
          <strong className="font-semibold text-[color:var(--billing-heading)]">{scopedTotal}</strong>{' '}
          flight{scopedTotal === 1 ? '' : 's'} in this period
          {periodStatusSummary ? ` — ${periodStatusSummary}` : ''}.
          {resolvedTab === 'pending' ? (
            <>
              {' '}
              Pending means validation passed and contract/rate are matched — check{' '}
              <button
                type="button"
                className={prepInlineLink}
                onClick={() => setTab('validation_error')}
              >
                Validation errors
              </button>{' '}
              or{' '}
              <button
                type="button"
                className={prepInlineLink}
                onClick={() => setTab('eligible')}
              >
                Eligible
              </button>{' '}
              for other issues. Rows already on drafts are in{' '}
              <Link
                href="/billing/invoice-drafts"
                className={prepInlineLink}
              >
                Invoice drafts
              </Link>
              .
            </>
          ) : null}
          </span>
        </p>
      ) : null}

      {selectAllMatching && flightGroups.length > 0 && !isCustomTab ? (
        <p className={`${billingUi.alertInfo} mb-3 flex items-start gap-2.5`}>
          <CheckCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
          All <strong>{flightGroups.length}</strong> flight
          {flightGroups.length === 1 ? '' : 's'} in this tab selected.
          <strong> Delete selected</strong> removes those flights for the
          current period and customer filter
          {canBulkReady
            ? '; Mark ready sends them to Ready for invoice'
            : ''}
          .
          </span>
        </p>
      ) : null}

      {!isCustomTab ? (
      <div className={`${billingUi.filterBar} mb-4`}>
        <label className={`${billingUi.filterField} sm:max-w-[11rem]`}>
          Period from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={syncPeriodToUrl}
            className={`${billingUi.input} min-h-10`}
          />
        </label>
        <label className={`${billingUi.filterField} sm:max-w-[11rem]`}>
          Period to
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onBlur={syncPeriodToUrl}
            className={`${billingUi.input} min-h-10`}
          />
        </label>
        <label className={`${billingUi.filterField} sm:max-w-[9rem]`}>
          Customer
          <input
            type="text"
            value={customerCode}
            onChange={(e) => setCustomerCode(e.target.value.toUpperCase())}
            placeholder="Optional"
            className={`${billingUi.input} min-h-10 uppercase placeholder:normal-case`}
          />
        </label>
        {resolvedTab === 'validation_error' && validationKindCounts ? (
          <label className={`${billingUi.filterField} sm:max-w-[14rem]`}>
            Flight kind
            <select
              value={flightKind}
              onChange={(e) => {
                setFlightKind(e.target.value as PreparationFlightKindFilter);
                setSelected(new Set());
                setSelectAllMatching(false);
              }}
              className={`${billingUi.select} min-h-10`}
              aria-label="Filter validation errors by flight kind"
            >
              <option value="all">All flights ({validationKindCounts.all})</option>
              <option value="cancelled">
                Cancelled flights ({validationKindCounts.cancelled})
              </option>
              <option value="scheduled">
                Scheduled flights ({validationKindCounts.scheduled})
              </option>
              <option value="additional">
                Additional flights ({validationKindCounts.additional})
              </option>
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => {
            syncPeriodToUrl();
            void load();
          }}
          className={`${billingUi.btnPrimary} min-h-10 sm:self-end`}
        >
          <Search className="h-4 w-4" aria-hidden />
          Search
        </button>
      </div>
      ) : null}

      {deleting ? (
        <div
          className={`${billingUi.alertDanger} mb-4 flex items-center gap-3`}
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>
            Deleting <strong>{selectedCount}</strong> flight
            {selectedCount === 1 ? '' : 's'}…
          </span>
        </div>
      ) : null}

      {markingReady ? (
        <div
          className={`${billingUi.alertInfo} mb-4 flex items-center gap-3`}
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>
            Marking <strong>{selectedCount}</strong> flight
            {selectedCount === 1 ? '' : 's'} ready for invoice…
          </span>
        </div>
      ) : null}

      {creatingDrafts ? (
        <div
          className={`${billingUi.alertInfo} mb-4 flex items-center gap-3`}
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>
            Creating invoice drafts one airline at a time
            {draftProgress ? (
              <>
                {' '}
                — <strong>{draftProgress}</strong>
              </>
            ) : null}
            . Keep this page open until the operation finishes.
          </span>
        </div>
      ) : null}

      {actionMsg ? (
        <div className={`${billingUi.alertSuccess} mb-4 flex items-start gap-2.5`} role="status">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{actionMsg}</span>
        </div>
      ) : null}

      {error ? (
        <div className={`${billingUi.alertDanger} mb-4 flex items-start gap-2.5`} role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}
      </div>

      {isCustomTab ? (
        <div className="min-h-0">
        <CustomBillingForm
          api={api}
          defaultFrom={from}
          defaultTo={to}
          defaultCustomerCode={customerCode}
          onSubmitted={(msg) => {
            setActionMsg(msg);
            // Stay on Custom tab — form clears after successful submit.
          }}
        />
        </div>
      ) : loading ? (
        <div
          className={`${billingUi.card} flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center`}
          role="status"
          aria-live="polite"
        >
          <span className={billingUi.spinner} aria-hidden />
          <p className="text-sm text-[color:var(--billing-text-muted)]">Loading preparation records…</p>
        </div>
      ) : flightGroups.length === 0 ? (
        <div className="flex flex-col items-center rounded-[var(--billing-radius-xl)] border border-dashed border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] px-6 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--billing-primary-soft)] text-[color:var(--billing-primary)]">
            <Inbox className="h-6 w-6" aria-hidden />
          </span>
          <p className="mt-4 max-w-xl text-sm font-semibold text-[color:var(--billing-heading)]">
            {kindFilterActive
              ? `No ${flightKind} flights in validation errors for this period.`
              : activeTab.empty}
          </p>
          {scopedTotal > 0 ? (
            <p className="mt-3 max-w-xl text-sm text-[color:var(--billing-text-secondary)]">
              {scopedTotal} flight{scopedTotal === 1 ? '' : 's'} in this period are in other
              tabs
              {periodStatusSummary ? ` (${periodStatusSummary})` : ''}.
              {(tabCounts.custom ?? 0) > 0 && !isCustomTab ? (
                <>
                  {' '}
                  Custom bills are under{' '}
                  <button
                    type="button"
                    onClick={() => setTab('custom')}
                    className="mx-1 font-medium text-[color:var(--billing-warning)] underline underline-offset-2 hover:opacity-80"
                  >
                    Custom ({tabCounts.custom})
                  </button>
                  .
                </>
              ) : null}
              {TAB_AUTOSWITCH_ORDER.filter(
                (id) => id !== resolvedTab && (tabCounts[id] ?? 0) > 0,
              ).map((id) => {
                const label = TABS.find((t) => t.id === id)?.label ?? id;
                const count = tabCounts[id] ?? 0;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`mx-1 ${prepInlineLink}`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </p>
          ) : (
            <p className="mt-3 max-w-xl text-xs text-[color:var(--billing-text-muted)]">
              Period filter uses the billing period start from when flights were sent. Match
              Period from/to to the source page dates used for Send to preparation.
              {isCustomTab
                ? ' After sending from Operational sources → Custom, open this Custom tab (not Pending).'
                : ''}
            </p>
          )}
        </div>
      ) : (
        <div className={`${billingUi.tableWrap} overflow-hidden`}>
          <div
            className="billing-table-scroll"
            role="region"
            aria-label="Preparation flights"
          >
            <table className="billing-table min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-heading)] shadow-[0_1px_0_var(--billing-border)]">
                <tr>
                  <th className="w-10 px-3 py-3" />
                  <th className="w-10 px-3 py-3" scope="col">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label={
                        selectAllMatching
                          ? `All ${tabTotal} flights in this tab selected`
                          : 'Select all flights in this tab'
                      }
                      disabled={selectingAll || flightGroups.length === 0}
                      className={prepCheckbox}
                    />
                  </th>
                  <th className={billingUi.tableHeadCell}>Source</th>
                  <th className={billingUi.tableHeadCell}>Serial / ID</th>
                  <th className={billingUi.tableHeadCell}>Flight no</th>
                  <th className={billingUi.tableHeadCell}>Customer</th>
                  <th className={billingUi.tableHeadCell}>Period</th>
                  {hideContractColumn ? null : (
                    <th className={billingUi.tableHeadCell}>
                      Contract
                    </th>
                  )}
                  <th className={billingUi.tableHeadCell}>Rate</th>
                  <th className={billingUi.tableHeadCell}>Validation</th>
                  <th className={billingUi.tableHeadCell}>Status</th>
                  <th className={billingUi.tableHeadCell}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--billing-border)]">
                {flightGroups.map((group) => {
                  const { row, key: groupKey, lines, lineCount, isAdsFamily } = group;
                  const context = buildPreparationContext(row);
                  const checklist = getChecklistSummary(row);
                  // All lines must pass checklist before flight-level Ready.
                  const allLinesReady = lines.every(
                    (line) => getChecklistSummary(line).allConfirmed,
                  );
                  const isOpen = expanded.has(groupKey);
                  const flightNo = preparationDisplayFlightNo(row);
                  const rowKind = preparationFlightKind(row);
                  const serialLabel =
                    row.sourceRef.serialNo ??
                    (isAdsFamily ? flightNo || '—' : row.sourceRef.usageRowId) ??
                    '—';
                  const isRafRow = String(row.sourceType ?? '').toLowerCase() === 'raf';
                  const prepNavCtx = {
                    prepTab: isCustomTab
                      ? ('pending' as PreparationStatus)
                      : (resolvedTab as PreparationStatus),
                    prepFrom: from,
                    prepTo: to,
                    prepCustomer: customerCode || undefined,
                  };
                  const serialHref =
                    row.sourceRef.serialNo &&
                    (row.sourceType === 'scheduled_flight' ||
                      row.sourceType === 'ads' ||
                      row.sourceType === 'equipment' ||
                      row.sourceType === 'manpower' ||
                      row.sourceType === 'raf')
                      ? row.sourceType === 'raf'
                        ? buildRafFormsHrefFromPreparation(
                            row.sourceRef.serialNo,
                            prepNavCtx,
                            row.operationalSnapshot,
                          )
                        : buildScheduledAirlinesHrefFromPreparation(
                            row.sourceRef.serialNo,
                            prepNavCtx,
                            row.operationalSnapshot,
                          )
                      : undefined;
                  const contractHref =
                    isRafRow || row.contractMatch?.matched
                      ? undefined
                      : buildContractsFixHref(context);
                  const rateHref = row.rateMatch?.matched
                    ? undefined
                    : buildRateCardsFixHref(context);
                  return (
                    <Fragment key={groupKey}>
                      <tr
                        className={`transition-colors duration-150 hover:bg-[color:var(--billing-surface-muted)] ${
                          isOpen ? 'bg-[color:var(--billing-primary-soft)]' : ''
                        }`}
                      >
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpand(groupKey)}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Collapse flight details' : 'Expand flight details'}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-[var(--billing-radius)] text-[color:var(--billing-text-muted)] transition-colors hover:bg-[color:var(--billing-primary-soft)] hover:text-[color:var(--billing-primary)] ${prepFocusRing}`}
                          >
                            <ChevronRight
                              className={`h-4 w-4 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                              aria-hidden
                            />
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectAllMatching || selected.has(groupKey)}
                            onChange={() => toggleSelect(groupKey)}
                            aria-label={`Select flight ${serialLabel}`}
                            className={prepCheckbox}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-[color:var(--billing-surface-muted)] px-2 py-0.5 text-xs font-medium capitalize text-[color:var(--billing-text-secondary)]">
                            {row.sourceType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[color:var(--billing-text-secondary)]">
                          {serialHref ? (
                            <a
                              href={serialHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={prepInlineLink}
                              title={
                                isRafRow
                                  ? 'Open this flight on Ramp Assistance Forms'
                                  : 'Open this flight on Scheduled Airlines'
                              }
                            >
                              {serialLabel}
                            </a>
                          ) : (
                            serialLabel
                          )}
                        </td>
                        <td className="px-4 py-3 text-[color:var(--billing-text)]">
                          <span className="font-semibold tabular-nums">{flightNo || '—'}</span>
                          {rowKind === 'cancelled' ? (
                            <span className={`${billingUi.badgeDanger} mt-1 normal-case`}>
                              Cancelled
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-[color:var(--billing-text)]">
                          <span className="font-medium">{row.customerCode}</span>
                          {row.customerName ? (
                            <span className="block max-w-[14rem] truncate text-xs text-[color:var(--billing-text-muted)]">
                              {row.customerName}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-[color:var(--billing-text-secondary)]">
                          {formatBillingDateRange(row.billingPeriodStart, row.billingPeriodEnd)}
                        </td>
                        {hideContractColumn ? null : (
                          <td className="px-4 py-3">
                            {isRafRow ? (
                              <span
                                className="text-xs text-[color:var(--billing-text-muted)]"
                                title="RAF is billed on adhoc rates only — no contract"
                              >
                                —
                              </span>
                            ) : (
                              <MatchIndicator
                                matched={Boolean(row.contractMatch?.matched)}
                                label="Contract"
                                href={contractHref}
                              />
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <MatchIndicator
                            matched={Boolean(row.rateMatch?.matched)}
                            label="Rate"
                            href={isRafRow ? undefined : rateHref}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <ValidationIndicator
                            passed={allLinesReady}
                            errorCount={lines.reduce((n, line) => {
                              const c = getChecklistSummary(line);
                              return n + (c.total - c.confirmed);
                            }, 0)}
                            onClick={!allLinesReady ? () => toggleExpand(groupKey) : undefined}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => void validateGroup(group)}
                              className={prepRowActionNeutral}
                            >
                              Validate
                            </button>
                            {row.status !== 'rejected' &&
                            row.status !== 'ready_for_invoice' &&
                            row.status !== 'invoiced' ? (
                              <button
                                type="button"
                                disabled={
                                  !allLinesReady ||
                                  markingReady ||
                                  markingReadyRowId === groupKey
                                }
                                title={
                                  allLinesReady
                                    ? 'Mark this flight ready for invoice'
                                    : 'Complete the billing readiness checklist for this flight first'
                                }
                                onClick={() => void markReadyGroup(group)}
                                className={prepRowActionPrimary}
                              >
                                {markingReadyRowId === groupKey ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                    …
                                  </>
                                ) : (
                                  'Ready'
                                )}
                              </button>
                            ) : null}
                            {row.status === 'invoiced' ? (
                              <Link
                                href={
                                  row.invoiceDraftId
                                    ? `/billing/invoice-drafts?draft=${row.invoiceDraftId}`
                                    : '/billing/invoice-drafts'
                                }
                                className={prepRowActionInfo}
                              >
                                Open draft
                              </Link>
                            ) : null}
                            {row.status === 'ready_for_invoice' ? (
                              <button
                                type="button"
                                title="Create invoice draft from this flight"
                                disabled={creatingDrafts || draftingRowId != null}
                                onClick={() =>
                                  void (async () => {
                                    if (creatingDrafts || draftingRowId != null) return;
                                    setDraftingRowId(groupKey);
                                    setActionMsg('');
                                    try {
                                      await api.createDraftsFromPreparation({
                                        billingPeriodStart: String(row.billingPeriodStart).slice(
                                          0,
                                          10,
                                        ),
                                        billingPeriodEnd: String(row.billingPeriodEnd).slice(0, 10),
                                        customerCode: row.customerCode,
                                        groupByCustomer: true,
                                        mergeOpenDraft: false,
                                      });
                                      setActionMsg('Invoice draft updated');
                                      router.push('/billing/invoice-drafts');
                                    } catch (e) {
                                      setActionMsg(
                                        e instanceof Error ? e.message : 'Create draft failed',
                                      );
                                    } finally {
                                      setDraftingRowId(null);
                                    }
                                  })()
                                }
                                className={prepRowActionPrimary}
                              >
                                {draftingRowId === groupKey ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                    …
                                  </>
                                ) : (
                                  <>
                                    <FileStack className="h-3 w-3" aria-hidden />
                                    Draft
                                  </>
                                )}
                              </button>
                            ) : null}
                            {row.status !== 'rejected' ? (
                              <button
                                type="button"
                                onClick={() => void rejectGroup(group)}
                                className={prepRowActionDanger}
                              >
                                Reject
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-[color:var(--billing-surface-muted)]">
                          <td colSpan={11} className="border-l-2 border-[color:var(--billing-primary)] px-6 py-4">
                              <>
                            {isAdsFamily && lineCount > 1 ? (
                              <div className={`${billingUi.card} mb-4 overflow-x-auto`}>
                                <p className="border-b border-[color:var(--billing-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-heading)]">
                                  Equipment / manpower lines on this flight
                                </p>
                                <table className="min-w-full text-left text-xs">
                                  <thead className="bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-text-muted)]">
                                    <tr>
                                      <th className="px-3 py-2 font-medium">Equipment / service</th>
                                      <th className="px-3 py-2 font-medium">Rate</th>
                                      <th className="px-3 py-2 font-medium">Checklist</th>
                                      <th className="px-3 py-2 font-medium">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[color:var(--billing-border)]">
                                    {lines.map((line) => {
                                      const lineCheck = getChecklistSummary(line);
                                      return (
                                        <tr key={String(line._id)}>
                                          <td className="px-3 py-2 text-[color:var(--billing-text)]">
                                            {prepLineEquipmentLabel(line)}
                                          </td>
                                          <td className="px-3 py-2">
                                            <MatchIndicator
                                              matched={Boolean(line.rateMatch?.matched)}
                                              label="Rate"
                                            />
                                          </td>
                                          <td className="px-3 py-2 tabular-nums text-[color:var(--billing-text-secondary)]">
                                            {lineCheck.confirmed}/{lineCheck.total}
                                          </td>
                                          <td className="px-3 py-2">
                                            <StatusBadge status={line.status} />
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                            <div className="space-y-4">
                              {lines.map((line) => (
                                <div
                                  key={String(line._id)}
                                  className={
                                    lineCount > 1
                                      ? `${billingUi.card} p-3`
                                      : undefined
                                  }
                                >
                                  {lineCount > 1 ? (
                                    <p className="mb-2 text-xs font-semibold text-[color:var(--billing-heading)]">
                                      {prepLineEquipmentLabel(line)}
                                    </p>
                                  ) : null}
                                  <PreparationWorkflowPanel
                                    record={line}
                                    api={api}
                                    context={buildPreparationContext(line)}
                                    onUpdated={updateRow}
                                    onActionComplete={() => void load()}
                                  />
                                </div>
                              ))}
                            </div>
                              </>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
