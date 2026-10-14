'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plane, Trash2 } from 'lucide-react';
import type { BillingContract, BillingPriceCardAirline, BillingRateCard } from '@/lib/billing-shared/types';
import { formatPriceCardAirlineCategory, isOpenEndedBillingDate } from '@/lib/billing-shared/enums';
import { formatBillingDate, formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import {
  countRateCardsForPriceCardEntry,
  type BhsAirlineCardGroup,
} from '@/lib/billing-shared/price-card-handling';
import { displayAircraftTypesForPriceCardEntry } from '@/lib/billing-shared/bhs-grouped-aircraft';
import type { PriceCardHandlingType } from '@/lib/billing-shared/enums';
import { bhsPriceTypeLabel } from '@/lib/billing-shared/exclusive-bhs-concession';
import {
  contractForPriceCardEntry,
  isPriceCardEntryExpired,
} from '@/lib/billing-shared/price-card-airline-rows';

type Props = {
  group: BhsAirlineCardGroup;
  handling: PriceCardHandlingType;
  allRateCards: BillingRateCard[];
  contracts: BillingContract[];
  serviceCategoryByCode: Map<string, string>;
  onSelectEntry: (entry: BillingPriceCardAirline) => void;
  onEditEntry: (entry: BillingPriceCardAirline) => void;
  onDeleteEntry: (entry: BillingPriceCardAirline) => void;
  /** BHS shows package price column; ADS exclusive-services view hides it. */
  showPackageColumn?: boolean;
  /** Hide the repeated airline summary card when the parent already shows it. */
  hideHeader?: boolean;
};

type RateCardRow = {
  rowKey: string;
  entry: BillingPriceCardAirline;
  aircraftType: string;
  categoryLabel: string;
  priceTypeLabel: ReturnType<typeof bhsPriceTypeLabel>;
  serviceCount: number;
};

function formatBhsPrice(price: number | undefined, currency?: string) {
  if (price == null || !Number.isFinite(price)) return '—';
  const amount = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(price);
  return currency === 'USD' ? `USD ${amount}` : `INR ${amount}`;
}

export function BhsAirlineCategoryRateCards({
  group,
  handling,
  allRateCards,
  contracts,
  serviceCategoryByCode,
  onSelectEntry,
  onEditEntry,
  onDeleteEntry,
  showPackageColumn = true,
  hideHeader = false,
}: Props) {
  const [aircraftFilter, setAircraftFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const tableRows = useMemo((): RateCardRow[] => {
    const rows: RateCardRow[] = [];
    for (const aircraftGroup of group.aircraftGroups) {
      for (const entry of aircraftGroup.rows) {
        const aircraftTypes = displayAircraftTypesForPriceCardEntry(entry);
        const serviceCount = countRateCardsForPriceCardEntry(
          allRateCards,
          handling,
          entry,
          serviceCategoryByCode,
        );
        for (const aircraftType of aircraftTypes) {
          rows.push({
            rowKey: `${entry._id}|${aircraftType}|${entry.category}`,
            entry,
            aircraftType,
            categoryLabel: formatPriceCardAirlineCategory(entry.category),
            priceTypeLabel: bhsPriceTypeLabel(
              contractForPriceCardEntry(entry, contracts)?.bhsConcessionCoverage,
            ),
            serviceCount,
          });
        }
      }
    }
    return rows.sort((a, b) => {
      const byAircraft = a.aircraftType.localeCompare(b.aircraftType);
      if (byAircraft !== 0) return byAircraft;
      return a.categoryLabel.localeCompare(b.categoryLabel);
    });
  }, [allRateCards, contracts, group.aircraftGroups, handling, serviceCategoryByCode]);

  const aircraftOptions = useMemo(() => {
    const values = new Set(tableRows.map((row) => row.aircraftType));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [tableRows]);

  const categoryOptions = useMemo(() => {
    const scoped = aircraftFilter
      ? tableRows.filter((row) => row.aircraftType === aircraftFilter)
      : tableRows;
    const values = new Set(
      scoped
        .map((row) => row.categoryLabel)
        .filter((label) => label !== 'Turnaround'),
    );
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [aircraftFilter, tableRows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tableRows.filter((row) => {
      if (aircraftFilter && row.aircraftType !== aircraftFilter) return false;
      if (categoryFilter && row.categoryLabel !== categoryFilter) return false;
      const expired = isPriceCardEntryExpired(row.entry, contracts);
      if (statusFilter === 'active' && expired) return false;
      if (statusFilter === 'expired' && !expired) return false;
      if (!query) return true;

      const haystack = [
        row.aircraftType,
        row.entry.remarks ?? '',
        row.categoryLabel,
        row.priceTypeLabel,
        formatBhsPrice(row.entry.price, row.entry.currencyCode),
        String(row.serviceCount),
        formatBillingDate(row.entry.validFrom),
        formatBillingDate(row.entry.validTo),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [aircraftFilter, categoryFilter, contracts, searchQuery, statusFilter, tableRows]);

  const hasActiveFilters = Boolean(
    aircraftFilter || categoryFilter || statusFilter || searchQuery.trim(),
  );

  const clearFilters = () => {
    setAircraftFilter('');
    setCategoryFilter('');
    setStatusFilter('');
    setSearchQuery('');
  };

  return (
    <section className="mb-6" aria-label={`${group.airlineName} rate cards`}>
      {!hideHeader ? (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-accent-strong)]">
              <Plane className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
                {group.customerCode}
              </p>
              <h2 className="text-lg font-semibold text-gray-900">{group.airlineName}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {group.aircraftCount} aircraft{group.aircraftCount === 1 ? '' : 's'} · Valid{' '}
                {formatBillingDateRange(group.validFrom, group.validTo)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-gray-600">
            Aircraft type
            <select
              value={aircraftFilter}
              onChange={(e) => {
                setAircraftFilter(e.target.value);
                if (
                  categoryFilter &&
                  !tableRows.some(
                    (row) =>
                      row.aircraftType === e.target.value &&
                      row.categoryLabel === categoryFilter,
                  )
                ) {
                  setCategoryFilter('');
                }
              }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All aircraft</option>
              {aircraftOptions.map((aircraftType) => (
                <option key={aircraftType} value={aircraftType}>
                  {aircraftType}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-gray-600">
            Flight category
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-gray-600">
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
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-gray-600 sm:max-w-sm">
            Search
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Aircraft, category, price…"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </label>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Clear filters
            </button>
          ) : null}
        </div>
        {hasActiveFilters ? (
          <p className="text-xs text-gray-600">
            Showing {filteredRows.length} of {tableRows.length} rate card
            {tableRows.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      <div className="billing-table-scroll rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Aircraft type
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Category
              </th>
              {showPackageColumn ? (
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Flight
                </th>
              ) : null}
              {showPackageColumn ? (
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                  BHS package
                </th>
              ) : null}
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Price type
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Status
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                Price validity
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={showPackageColumn ? 8 : 6} className="px-4 py-10 text-center text-sm text-gray-500">
                  No rate cards match your filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const expired = isPriceCardEntryExpired(row.entry, contracts);
                return (
                <tr key={row.rowKey} className={expired ? 'bg-red-50/70 hover:bg-red-50' : 'hover:bg-gray-50'}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900">{row.aircraftType}</div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{row.categoryLabel}</td>
                  {showPackageColumn ? (
                    <td className="px-3 py-2.5 text-sm text-gray-800">
                      {row.entry.flightOperation === 'additional' ? 'Additional' : 'Scheduled'}
                    </td>
                  ) : null}
                  {showPackageColumn ? (
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <span>{formatBhsPrice(row.entry.price, row.entry.currencyCode)}</span>
                        {row.entry.incrementalFlightsActive &&
                        Number(row.entry.incrementalPrice) > 0 ? (
                          <span
                            className="inline-flex rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-violet-800"
                            title={`Incremental price ${formatBhsPrice(row.entry.incrementalPrice, row.entry.currencyCode)} for a later same-day flight`}
                          >
                            INC
                          </span>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  <td className="px-3 py-2.5">
                    {row.priceTypeLabel === '—' ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span
                        className={
                          row.priceTypeLabel === 'Exclusive'
                            ? 'inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900'
                            : row.priceTypeLabel === 'Inclusive'
                              ? 'inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                              : 'inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700'
                        }
                      >
                        {row.priceTypeLabel}
                      </span>
                    )}
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
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">
                    {formatBillingDateRange(row.entry.validFrom, row.entry.validTo, {
                      openEndedTo:
                        row.entry.openEnded || isOpenEndedBillingDate(row.entry.validTo),
                    })}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEditEntry(row.entry)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-[color:var(--billing-primary)] shadow-xs transition-colors hover:border-[color:var(--billing-accent)] hover:bg-[color:var(--billing-accent-soft)]"
                        aria-label={`Edit ${row.aircraftType} ${row.categoryLabel} rate card`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteEntry(row.entry)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-xs transition-colors hover:bg-red-50"
                        aria-label={`Delete ${row.aircraftType} ${row.categoryLabel} rate card`}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectEntry(row.entry)}
                        className="ml-1 text-sm font-semibold text-[color:var(--billing-primary)] hover:underline"
                      >
                        View services →
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {filteredRows.length} rate card{filteredRows.length === 1 ? '' : 's'}
        {hasActiveFilters ? ` (filtered from ${tableRows.length})` : ''}
      </p>
    </section>
  );
}
