'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { ChevronLeft, Download, Minus, Package, Pencil, Plane, Plus, Trash2, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { AddPriceCardAirlineDialog } from './AddPriceCardAirlineDialog';
import { BhsAirlineCardGrid } from './BhsAirlineCardGrid';
import { BhsAirlineCategoryRateCards } from './BhsAirlineCategoryRateCards';
import { PriceCardAirlineDeleteDialog } from './PriceCardAirlineDeleteDialog';
import { exportBhsPriceCardsToExcel } from './exportBhsPriceCardExcel';
import { contractUi } from './ContractUi';
import type { BillingApi } from '@/lib/billing-api';
import type {
  BillingContract,
  BillingCustomer,
  BillingPriceCardAirline,
  BillingRateCard,
  BillingServiceCatalogItem,
} from '@/lib/billing-shared/types';
import {
  PRICE_CARD_HANDLING_TYPES,
  formatPriceCardAirlineCategory,
  isOpenEndedBillingDate,
  type PriceCardHandlingType,
} from '@/lib/billing-shared/enums';
import { formatBillingDate, formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import {
  PRICE_CARD_HANDLING_DESCRIPTIONS,
  PRICE_CARD_HANDLING_LABELS,
  buildServiceCategoryMap,
  countCustomersForHandling,
  countRateCardsForPriceCardEntry,
  groupBhsPriceCardAirlines,
  listPriceCardEntriesInAircraftPeriod,
  type BhsAirlineCardGroup,
} from '@/lib/billing-shared/price-card-handling';
import {
  defaultContractForCustomer,
  isPriceCardEntryExpired,
} from '@/lib/billing-shared/price-card-airline-rows';
import { listContractChargePercents } from '@/lib/billing-shared/contract-concessions';
import {
  appliesToSummary,
  clauseTypeLabel,
  clausesFromContract,
} from '@/lib/billing-shared/contract-clauses';
import { EditPriceCardAirlineDialog } from './EditPriceCardAirlineDialog';
import { RafAdhocRatesPanel } from './RafAdhocRatesPanel';

const HANDLING_ICONS: Record<PriceCardHandlingType, ComponentType<{ className?: string }>> = {
  BHS: Plane,
  ADS: Package,
  RAF: UsersRound,
};

export type PriceCardNavLevel = 'categories' | 'airlines' | 'airline-rate-cards' | 'rates';

type Props = {
  api: BillingApi;
  customers: BillingCustomer[];
  contracts: BillingContract[];
  allRateCards: BillingRateCard[];
  allPriceCardAirlines: BillingPriceCardAirline[];
  services: BillingServiceCatalogItem[];
  selectedHandling: PriceCardHandlingType | null;
  selectedCustomerCode: string | null;
  selectedPriceCardEntry: BillingPriceCardAirline | null;
  selectedBhsAirlineGroup: BhsAirlineCardGroup | null;
  navLevel: PriceCardNavLevel;
  onSelectHandling: (handling: PriceCardHandlingType) => void;
  onSelectCustomer: (entry: BillingPriceCardAirline) => void;
  onOpenAirline: (group: BhsAirlineCardGroup) => void;
  onBackToCategories: () => void;
  onBackToAirlines: () => void;
  onBackToAirlineRateCards: () => void;
  onCustomerAssigned: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

function HandlingCategoryCard({
  handling,
  airlineCount,
  onClick,
}: {
  handling: PriceCardHandlingType;
  airlineCount: number;
  onClick: () => void;
}) {
  const Icon = HANDLING_ICONS[handling];
  return (
    <button
      type="button"
      onClick={onClick}
      className="contract-handling-tile group flex w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--billing-primary-soft)] text-[color:var(--billing-primary)]">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <span className="rounded-full bg-[color:var(--billing-surface)] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[color:var(--billing-text-secondary)] ring-1 ring-[color:var(--billing-border)]">
          {airlineCount} airline{airlineCount === 1 ? '' : 's'}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-[color:var(--billing-heading)]">
        {handling}
      </h3>
      <p className="mt-1 text-sm font-medium text-[color:var(--billing-text-secondary)]">
        {PRICE_CARD_HANDLING_LABELS[handling]}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[color:var(--billing-text-muted)]">
        {PRICE_CARD_HANDLING_DESCRIPTIONS[handling]}
      </p>
      <span className="mt-4 text-sm font-semibold text-[color:var(--billing-secondary)] group-hover:underline">
        Open airlines →
      </span>
    </button>
  );
}

function formatValidTo(value: string, openEnded?: boolean) {
  if (openEnded || isOpenEndedBillingDate(value)) return 'Open';
  return formatBillingDate(value);
}

function formatPercentValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`;
}

function SummaryMetric({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--billing-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--billing-heading)]">{value}</p>
    </>
  );
  const className =
    'rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-3 py-2.5 text-left shadow-[var(--billing-shadow-sm)]';
  if (!href) {
    return <div className={className}>{body}</div>;
  }
  return (
    <Link
      href={href}
      className={`${className} transition hover:border-[color:var(--billing-accent)] hover:bg-[color:var(--billing-accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--billing-accent)]`}
    >
      {body}
    </Link>
  );
}

export function PriceCardHandlingSection({
  api,
  customers,
  contracts,
  allRateCards,
  allPriceCardAirlines,
  services,
  selectedHandling,
  selectedCustomerCode,
  selectedPriceCardEntry,
  selectedBhsAirlineGroup,
  navLevel,
  onSelectHandling,
  onSelectCustomer,
  onOpenAirline,
  onBackToCategories,
  onBackToAirlines,
  onBackToAirlineRateCards,
  onCustomerAssigned,
  onError,
  onSuccess,
}: Props) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [addDialogCustomerCode, setAddDialogCustomerCode] = useState<string | null>(null);
  const [entries, setEntries] = useState<BillingPriceCardAirline[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<BillingPriceCardAirline | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editEntry, setEditEntry] = useState<BillingPriceCardAirline | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [airlineFilter, setAirlineFilter] = useState('');
  const [aircraftTypeFilter, setAircraftTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [clausesExpanded, setClausesExpanded] = useState(false);
  const [exportingPriceCard, setExportingPriceCard] = useState(false);

  const serviceCategoryByCode = useMemo(
    () => buildServiceCategoryMap(services),
    [services],
  );

  const loadEntries = useCallback(async () => {
    if (!selectedHandling) {
      setEntries([]);
      return;
    }
    setLoadingEntries(true);
    try {
      const res = await api.listPriceCardAirlines({ handlingType: selectedHandling });
      const data = res.data as { items?: BillingPriceCardAirline[] };
      setEntries(data.items ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [api, selectedHandling]);

  useEffect(() => {
    if (
      (navLevel !== 'airlines' && navLevel !== 'airline-rate-cards') ||
      !selectedHandling
    ) {
      return;
    }

    // Instant open: parent already loaded all price-card airlines on page mount.
    const fromParent = allPriceCardAirlines.filter(
      (entry) => entry.handlingType === selectedHandling,
    );
    setEntries(fromParent);
    setLoadingEntries(false);
  }, [allPriceCardAirlines, navLevel, selectedHandling]);

  useEffect(() => {
    setAirlineFilter('');
    setAircraftTypeFilter('');
    setStatusFilter('');
    setSearchQuery('');
  }, [selectedHandling, navLevel]);

  useEffect(() => {
    setClausesExpanded(false);
  }, [selectedBhsAirlineGroup?.customerCode, selectedHandling, navLevel]);

  const airlineOptions = useMemo(() => {
    const codes = new Set(entries.map((entry) => entry.customerCode.trim().toUpperCase()));
    return [...codes].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const aircraftTypeOptions = useMemo(() => {
    const scoped = airlineFilter
      ? entries.filter(
          (entry) => entry.customerCode.trim().toUpperCase() === airlineFilter,
        )
      : entries;
    const types = new Set(
      scoped.map((entry) => entry.aircraftType.trim().toUpperCase()).filter(Boolean),
    );
    return [...types].sort((a, b) => a.localeCompare(b));
  }, [airlineFilter, entries]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (airlineFilter && entry.customerCode.trim().toUpperCase() !== airlineFilter) {
        return false;
      }
      if (
        aircraftTypeFilter &&
        entry.aircraftType.trim().toUpperCase() !== aircraftTypeFilter
      ) {
        return false;
      }
      const expired = isPriceCardEntryExpired(entry, contracts);
      if (statusFilter === 'active' && expired) return false;
      if (statusFilter === 'expired' && !expired) return false;
      if (!query) return true;

      const haystack = [
        entry.customerCode,
        entry.airlineName,
        entry.aircraftType,
        entry.remarks ?? '',
        formatPriceCardAirlineCategory(entry.category),
        entry.validFrom,
        entry.validTo,
        entry.price != null ? String(entry.price) : '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [aircraftTypeFilter, airlineFilter, contracts, entries, searchQuery, statusFilter]);

  const hasActiveAirlineFilters = Boolean(
    airlineFilter || aircraftTypeFilter || statusFilter || searchQuery.trim(),
  );

  const isBhsAirlinesView = selectedHandling === 'BHS';
  const isAdsAirlinesView = selectedHandling === 'ADS';
  const usesAirlineCardGrid = isBhsAirlinesView || isAdsAirlinesView;

  const airlineGroups = useMemo(() => {
    if (!usesAirlineCardGrid) return [];
    return groupBhsPriceCardAirlines(filteredEntries);
  }, [filteredEntries, usesAirlineCardGrid]);

  const bhsAirlineGroups = airlineGroups;

  const clearAirlineFilters = () => {
    setAirlineFilter('');
    setAircraftTypeFilter('');
    setStatusFilter('');
    setSearchQuery('');
  };

  const openAddAirline = () => {
    setAddDialogCustomerCode(null);
    setAssignOpen(true);
  };

  const openRateCardsForGroup = (group: BhsAirlineCardGroup) => {
    onOpenAirline(group);
  };

  const openAddRateCardForGroup = (group: BhsAirlineCardGroup) => {
    setAddDialogCustomerCode(group.customerCode);
    setAssignOpen(true);
  };

  const existingPriceCardEntriesForHandling = useMemo(
    () =>
      selectedHandling
        ? allPriceCardAirlines.filter((entry) => entry.handlingType === selectedHandling)
        : [],
    [allPriceCardAirlines, selectedHandling],
  );

  const refreshAfterSave = () => {
    void loadEntries();
    onCustomerAssigned();
  };

  const openDeleteDialog = (entry: BillingPriceCardAirline) => {
    setDeleteEntry(entry);
    setDeleteDialogOpen(true);
  };

  const openEditDialog = (entry: BillingPriceCardAirline) => {
    setEditEntry(entry);
    setEditOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    try {
      await api.deletePriceCardAirline(deleteEntry._id);
      onSuccess(
        `Removed ${deleteEntry.customerCode} · ${deleteEntry.aircraftType} from ${deleteEntry.handlingType}.`,
      );
      setDeleteDialogOpen(false);
      setDeleteEntry(null);
      refreshAfterSave();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete airline entry');
    } finally {
      setDeleting(false);
    }
  };

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.customerCode === selectedCustomerCode),
    [customers, selectedCustomerCode],
  );

  const airlineSummary = useMemo(() => {
    if (!selectedBhsAirlineGroup || !selectedHandling) return null;

    const contract = defaultContractForCustomer(
      selectedBhsAirlineGroup.customerCode,
      contracts,
    );

    const totals = selectedBhsAirlineGroup.aircraftGroups.reduce(
      (acc, aircraftGroup) => {
        for (const entry of aircraftGroup.rows) {
          acc.totalAddedServices += countRateCardsForPriceCardEntry(
            allRateCards,
            selectedHandling,
            entry,
            serviceCategoryByCode,
          );
        }
        return acc;
      },
      { totalAddedServices: 0 },
    );

    return {
      totalAddedServices: totals.totalAddedServices,
      contractId: contract?._id ?? '',
      charges: listContractChargePercents(contract),
    };
  }, [
    allRateCards,
    contracts,
    selectedBhsAirlineGroup,
    selectedHandling,
    serviceCategoryByCode,
  ]);

  const expandedContract = useMemo(
    () =>
      selectedBhsAirlineGroup
        ? defaultContractForCustomer(selectedBhsAirlineGroup.customerCode, contracts)
        : undefined,
    [contracts, selectedBhsAirlineGroup],
  );

  const visibleClauses = useMemo(
    () => (expandedContract ? clausesFromContract(expandedContract) : []),
    [expandedContract],
  );

  if (navLevel === 'categories') {
    return (
      <section className="mb-6" aria-label="Price card handling types">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Handling types</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Open a category to see airlines and their price card rates.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRICE_CARD_HANDLING_TYPES.map((handling) => (
            <HandlingCategoryCard
              key={handling}
              handling={handling}
              airlineCount={countCustomersForHandling(
                handling,
                customers,
                allRateCards,
                serviceCategoryByCode,
                allPriceCardAirlines,
              )}
              onClick={() => onSelectHandling(handling)}
            />
          ))}
        </div>
      </section>
    );
  }

  if (navLevel === 'airlines' && selectedHandling) {
    return (
      <section className="mb-6" aria-label={`${selectedHandling} airlines`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onBackToCategories}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Handling types
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">{selectedHandling}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedHandling === 'BHS' ? (
              <button
                type="button"
                disabled={exportingPriceCard}
                onClick={() => {
                  setExportingPriceCard(true);
                  void exportBhsPriceCardsToExcel(allPriceCardAirlines, contracts)
                    .then(() => onSuccess('BHS comprehensive price card exported.'))
                    .catch((e) =>
                      onError(e instanceof Error ? e.message : 'Could not export the price card.'),
                    )
                    .finally(() => setExportingPriceCard(false));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--billing-accent-border)] bg-white px-3 py-1.5 text-sm font-medium text-[color:var(--billing-accent-strong)] hover:bg-[color:var(--billing-accent-soft)] disabled:opacity-60"
              >
                <Download className="h-4 w-4" aria-hidden />
                {exportingPriceCard ? 'Exporting…' : 'Export price card'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={openAddAirline}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add airline
            </button>
          </div>
        </div>

        {!isBhsAirlinesView ? (
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-900">
              {PRICE_CARD_HANDLING_LABELS[selectedHandling]}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {PRICE_CARD_HANDLING_DESCRIPTIONS[selectedHandling]}
            </p>
          </div>
        ) : null}

        {selectedHandling === 'RAF' ? (
          <RafAdhocRatesPanel api={api} onError={onError} onSuccess={onSuccess} />
        ) : null}

        {!loadingEntries && entries.length > 0 && !isBhsAirlinesView ? (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-gray-600 sm:max-w-[14rem]">
                Airline
                <select
                  value={airlineFilter}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAirlineFilter(value);
                    if (
                      aircraftTypeFilter &&
                      !entries.some(
                        (entry) =>
                          entry.customerCode.trim().toUpperCase() === value &&
                          entry.aircraftType.trim().toUpperCase() === aircraftTypeFilter,
                      )
                    ) {
                      setAircraftTypeFilter('');
                    }
                  }}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">All airlines</option>
                  {airlineOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-gray-600 sm:max-w-[14rem]">
                Aircraft type
                <select
                  value={aircraftTypeFilter}
                  onChange={(e) => setAircraftTypeFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">All aircraft types</option>
                  {aircraftTypeOptions.map((aircraftType) => (
                    <option key={aircraftType} value={aircraftType}>
                      {aircraftType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-gray-600 sm:max-w-[12rem]">
                Status
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  aria-label="Filter by contract status"
                >
                  <option value="">All status</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
              <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-gray-600">
                Search
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Code, name, aircraft, category, remarks…"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                />
              </label>
              {hasActiveAirlineFilters ? (
                <button
                  type="button"
                  onClick={clearAirlineFilters}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
            {hasActiveAirlineFilters ? (
              <p className="text-xs text-gray-600">
                Showing {filteredEntries.length} of {entries.length} row
                {entries.length === 1 ? '' : 's'}
                {airlineFilter ? ` · ${airlineFilter}` : ''}
                {aircraftTypeFilter ? ` · ${aircraftTypeFilter}` : ''}
                {searchQuery.trim() ? ` · “${searchQuery.trim()}”` : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        {!loadingEntries && entries.length > 0 && usesAirlineCardGrid ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search airlines…"
              aria-label="Search airlines"
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <span className="sr-only">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter airlines by contract status"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              >
                <option value="">All status</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
              </select>
            </label>
            {searchQuery.trim() || statusFilter ? (
              <button
                type="button"
                onClick={clearAirlineFilters}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        {loadingEntries ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
            Loading airlines…
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
            <p className="text-sm font-medium text-gray-800">No airlines in {selectedHandling} yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Add an airline — rows are created per aircraft type from schedule and contract data.
            </p>
            <button
              type="button"
              onClick={openAddAirline}
              className="mt-4 rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)]"
            >
              Add airline
            </button>
          </div>
        ) : filteredEntries.length === 0 || (isBhsAirlinesView && bhsAirlineGroups.length === 0) ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
            <p className="text-sm font-medium text-gray-800">
              {isBhsAirlinesView ? 'No airlines match your filters' : 'No rows match your filters'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Try a different airline, aircraft type, or search term.
            </p>
            <button
              type="button"
              onClick={clearAirlineFilters}
              className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear filters
            </button>
          </div>
        ) : usesAirlineCardGrid ? (
          <BhsAirlineCardGrid
            groups={airlineGroups}
            contracts={contracts}
            onOpenRateCards={openRateCardsForGroup}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Code
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Airline name
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Valid from
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Valid to
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Remarks
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Aircraft type
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Category
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Rates
                  </th>
                  <th className="w-28 px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEntries.map((entry) => {
                  const expired = isPriceCardEntryExpired(entry, contracts);
                  return (
                  <tr key={entry._id} className={expired ? 'bg-red-50/70 hover:bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-2.5 font-medium text-[color:var(--billing-accent-strong)]">{entry.customerCode}</td>
                    <td className="px-3 py-2.5 text-gray-900">{entry.airlineName}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">{formatBillingDate(entry.validFrom)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">{formatValidTo(entry.validTo, entry.openEnded)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{entry.remarks?.trim() || '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{entry.aircraftType}</td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {formatPriceCardAirlineCategory(entry.category)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          expired
                            ? 'inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800'
                            : 'inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                        }
                      >
                        {expired ? 'Expired' : 'Active'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectCustomer(entry)}
                        className="text-sm font-medium text-[color:var(--billing-accent-strong)] hover:underline"
                      >
                        Rate cards →
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDialog(entry)}
                          className={contractUi.iconBtn}
                          aria-label={`Edit ${entry.customerCode} ${entry.aircraftType}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteDialog(entry)}
                          className={contractUi.iconDanger}
                          aria-label={`Delete ${entry.customerCode} ${entry.aircraftType}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <AddPriceCardAirlineDialog
          api={api}
          handling={selectedHandling}
          customers={customers}
          contracts={contracts}
          open={assignOpen}
          onOpenChange={(open) => {
            if (!open) setAddDialogCustomerCode(null);
            setAssignOpen(open);
          }}
          prefillCustomerCode={addDialogCustomerCode}
          existingEntries={existingPriceCardEntriesForHandling}
          onSaved={refreshAfterSave}
          onError={onError}
          onSuccess={onSuccess}
        />

        <EditPriceCardAirlineDialog
          api={api}
          entry={editEntry}
          customers={customers}
          open={editOpen}
          onOpenChange={(open) => {
            if (!open) {
              setEditOpen(false);
              setEditEntry(null);
            }
          }}
          onSaved={refreshAfterSave}
          onError={onError}
          onSuccess={onSuccess}
        />

        <PriceCardAirlineDeleteDialog
          entry={deleteEntry}
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setDeleteDialogOpen(false);
              setDeleteEntry(null);
            }
          }}
          onConfirm={() => void confirmDelete()}
          deleting={deleting}
        />
      </section>
    );
  }

  if (
    navLevel === 'airline-rate-cards' &&
    (selectedHandling === 'BHS' || selectedHandling === 'ADS') &&
    selectedBhsAirlineGroup
  ) {
    return (
      <section
        className="mb-6"
        aria-label={`${selectedBhsAirlineGroup.airlineName} ${selectedHandling} rate cards`}
      >
        <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)] lg:items-start">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onBackToCategories}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Handling types
                </button>
                <span className="text-gray-300" aria-hidden>
                  /
                </span>
                <button
                  type="button"
                  onClick={onBackToAirlines}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {selectedHandling}
                </button>
                <span className="text-gray-300" aria-hidden>
                  /
                </span>
                <span className="truncate text-sm font-semibold text-gray-900">
                  {selectedBhsAirlineGroup.customerCode}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="truncate text-xl font-semibold leading-tight text-gray-900 sm:text-2xl">
                  {selectedBhsAirlineGroup.airlineName}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>
                  {selectedBhsAirlineGroup.aircraftCount} aircraft
                  {selectedBhsAirlineGroup.aircraftCount === 1 ? '' : 's'}
                </span>
                <span>
                  Valid {formatBillingDateRange(
                    selectedBhsAirlineGroup.validFrom,
                    selectedBhsAirlineGroup.validTo,
                    { openEndedTo: isOpenEndedBillingDate(selectedBhsAirlineGroup.validTo) },
                  )}
                </span>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setClausesExpanded((prev) => !prev)}
                  aria-expanded={clausesExpanded}
                  className="inline-flex items-center gap-1 rounded-md px-0 py-1 text-sm font-medium text-[color:var(--billing-accent-strong)] hover:text-[color:var(--billing-heading)]"
                >
                  {clausesExpanded ? <Minus className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                  {clausesExpanded ? 'Hide clauses & conditions' : 'Show clauses & conditions'}
                </button>
              </div>
            </div>

            {airlineSummary ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Contract charge percentages">
                {airlineSummary.charges.length === 0 ? (
                  <p className="col-span-full text-xs text-gray-500">
                    No percentage charges are saved on this contract.
                  </p>
                ) : (
                  airlineSummary.charges.map((charge) => (
                    <SummaryMetric
                      key={charge.key}
                      label={charge.label}
                      value={formatPercentValue(charge.percent)}
                      href={
                        airlineSummary.contractId
                          ? `/billing/contracts?contract=${encodeURIComponent(airlineSummary.contractId)}&condition=${encodeURIComponent(charge.key)}`
                          : undefined
                      }
                    />
                  ))
                )}
                <SummaryMetric
                  label="Total added services"
                  value={String(airlineSummary.totalAddedServices)}
                />
              </div>
            ) : null}
          </div>

          {clausesExpanded ? (
            <div className="mt-4 rounded-xl border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Contract clauses & conditions</h3>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Conditions and clause text saved for this airline.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClausesExpanded(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Collapse
                </button>
              </div>

              {visibleClauses.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {visibleClauses.map((clause, index) => (
                    <article
                      key={`${clause.clauseType}-${index}`}
                      className="rounded-lg border border-[color:var(--billing-accent-border)] bg-white p-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
                            {clauseTypeLabel(clause.clauseType)}
                          </p>
                          {clause.label?.trim() ? (
                            <p className="mt-1 text-sm font-semibold text-gray-900">{clause.label}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full bg-[color:var(--billing-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
                          {appliesToSummary(clause.appliesTo)}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {clause.body}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600">No extra clauses were added for this airline.</p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-[color:var(--billing-accent-border)] bg-white px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
                    Airline contract
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {expandedContract?.contractNumber ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--billing-accent-border)] bg-white px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
                    Customer
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {expandedContract?.customerCode ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--billing-accent-border)] bg-white px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
                    Category
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {expandedContract?.category ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--billing-accent-border)] bg-white px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
                    Cancellation window
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {expandedContract?.cancellationWithinHours != null
                      ? `${expandedContract.cancellationWithinHours} hours`
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => openAddRateCardForGroup(selectedBhsAirlineGroup)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {selectedHandling === 'BHS' ? 'Add rate card' : 'Add ADS row'}
            </button>
          </div>
        </div>

        <BhsAirlineCategoryRateCards
          group={selectedBhsAirlineGroup}
          handling={selectedHandling}
          allRateCards={allRateCards}
          contracts={contracts}
          serviceCategoryByCode={serviceCategoryByCode}
          onSelectEntry={onSelectCustomer}
          onEditEntry={openEditDialog}
          onDeleteEntry={openDeleteDialog}
          showPackageColumn={selectedHandling === 'BHS'}
          hideHeader
        />

        <EditPriceCardAirlineDialog
          api={api}
          entry={editEntry}
          customers={customers}
          open={editOpen}
          onOpenChange={(open) => {
            if (!open) {
              setEditOpen(false);
              setEditEntry(null);
            }
          }}
          onSaved={refreshAfterSave}
          onError={onError}
          onSuccess={onSuccess}
        />

        <AddPriceCardAirlineDialog
          api={api}
          handling={selectedHandling}
          customers={customers}
          contracts={contracts}
          open={assignOpen}
          onOpenChange={(open) => {
            if (!open) setAddDialogCustomerCode(null);
            setAssignOpen(open);
          }}
          prefillCustomerCode={addDialogCustomerCode}
          existingEntries={existingPriceCardEntriesForHandling}
          onSaved={refreshAfterSave}
          onError={onError}
          onSuccess={onSuccess}
        />

        <PriceCardAirlineDeleteDialog
          entry={deleteEntry}
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setDeleteDialogOpen(false);
              setDeleteEntry(null);
            }
          }}
          onConfirm={() => void confirmDelete()}
          deleting={deleting}
        />
      </section>
    );
  }

  if (navLevel === 'rates' && selectedHandling && selectedCustomerCode) {
    const categorySiblings = selectedPriceCardEntry
      ? listPriceCardEntriesInAircraftPeriod(
          allPriceCardAirlines,
          selectedHandling,
          selectedPriceCardEntry,
        )
      : [];

    return (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBackToCategories}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Handling types
        </button>
        <span className="text-gray-300" aria-hidden>
          /
        </span>
        <button
          type="button"
          onClick={onBackToAirlines}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {selectedHandling}
        </button>
        <span className="text-gray-300" aria-hidden>
          /
        </span>
        {selectedHandling === 'BHS' && selectedBhsAirlineGroup ? (
          <>
            <button
              type="button"
              onClick={onBackToAirlineRateCards}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {selectedBhsAirlineGroup.customerCode}
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">
              {selectedPriceCardEntry?.aircraftType}
              {selectedPriceCardEntry
                ? ` · ${formatPriceCardAirlineCategory(selectedPriceCardEntry.category)}`
                : ''}
            </span>
          </>
        ) : selectedHandling === 'ADS' && selectedBhsAirlineGroup ? (
          <>
            <button
              type="button"
              onClick={onBackToAirlineRateCards}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {selectedBhsAirlineGroup.customerCode}
            </button>
            <span className="text-gray-300" aria-hidden>
              /
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">
              {selectedPriceCardEntry?.aircraftType}
              {selectedPriceCardEntry
                ? ` · ${formatPriceCardAirlineCategory(selectedPriceCardEntry.category)}`
                : ''}
            </span>
          </>
        ) : (
          <span className="truncate text-sm font-semibold text-gray-900">
            {selectedCustomerCode}
            {selectedCustomer ? ` — ${selectedCustomer.name}` : ''}
            {selectedPriceCardEntry ? (
              <>
                {' · '}
                {selectedPriceCardEntry.aircraftType}
                {' · '}
                {formatBillingDateRange(
                  selectedPriceCardEntry.validFrom,
                  selectedPriceCardEntry.validTo,
                  {
                    openEndedTo:
                      selectedPriceCardEntry.openEnded ||
                      isOpenEndedBillingDate(selectedPriceCardEntry.validTo),
                  },
                )}
              </>
            ) : null}
          </span>
        )}
        {categorySiblings.length > 1 ? (
          <div
            className="ml-1 inline-flex rounded-lg border border-gray-200 bg-white p-0.5"
            role="tablist"
            aria-label="Flight category"
          >
            {categorySiblings.map((entry) => {
              const active = entry._id === selectedPriceCardEntry?._id;
              return (
                <button
                  key={entry._id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectCustomer(entry)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[color:var(--billing-primary)] text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {formatPriceCardAirlineCategory(entry.category)}
                </button>
              );
            })}
          </div>
        ) : selectedPriceCardEntry ? (
          <span className="text-sm text-gray-600">
            · {formatPriceCardAirlineCategory(selectedPriceCardEntry.category)}
          </span>
        ) : null}
      </div>
    );
  }

  return null;
}
