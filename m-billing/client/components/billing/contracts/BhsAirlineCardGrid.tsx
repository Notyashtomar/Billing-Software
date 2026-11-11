'use client';

import { ChevronRight, Plane } from 'lucide-react';
import type { BillingContract, BillingPriceCardAirline } from '@/lib/billing-shared/types';
import type { BhsAirlineCardGroup } from '@/lib/billing-shared/price-card-handling';
import { isPriceCardEntryExpired } from '@/lib/billing-shared/price-card-airline-rows';

type Props = {
  groups: BhsAirlineCardGroup[];
  contracts: BillingContract[];
  onOpenRateCards: (group: BhsAirlineCardGroup) => void;
  /** Aircraft from this month's flights that are not on the rate card, keyed by airline code. */
  missingAircraftCounts?: Record<string, number>;
  /** Column heading for the price column, e.g. "BHS service". */
  serviceLabel?: string;
};

type AirlineStatus = 'active' | 'discontinued' | 'mixed';

function airlineCardStatus(group: BhsAirlineCardGroup, contracts: BillingContract[]): AirlineStatus {
  let expired = 0;
  let total = 0;
  for (const aircraftGroup of group.aircraftGroups) {
    for (const row of aircraftGroup.rows) {
      total += 1;
      if (isPriceCardEntryExpired(row, contracts)) expired += 1;
    }
  }
  if (total === 0 || expired === 0) return 'active';
  if (expired === total) return 'discontinued';
  return 'mixed';
}

function currencySymbol(currencyCode: string | undefined): string {
  const code = String(currencyCode ?? 'INR').trim().toUpperCase();
  if (code === 'USD') return '$';
  if (code === 'EUR') return '€';
  return '₹';
}

function formatBhsPrice(price: number, currencyCode?: string) {
  const locale = String(currencyCode ?? 'INR').toUpperCase() === 'INR' ? 'en-IN' : 'en-US';
  return `${currencySymbol(currencyCode)}${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(price)}`;
}

function formatBhsPriceRange(prices: number[], currencyCode?: string) {
  const unique = [...new Set(prices)].sort((a, b) => a - b);
  if (unique.length === 0) return '—';
  if (unique.length === 1) return formatBhsPrice(unique[0], currencyCode);
  return `${formatBhsPrice(unique[0], currencyCode)} – ${formatBhsPrice(
    unique[unique.length - 1],
    currencyCode,
  )}`;
}

/** Price ranges per currency (an airline may carry both INR and USD rows). */
function priceRangesByCurrency(group: BhsAirlineCardGroup): string[] {
  const byCurrency = new Map<string, Set<number>>();
  for (const aircraftGroup of group.aircraftGroups) {
    for (const row of aircraftGroup.rows) {
      if (row.price == null || !Number.isFinite(row.price)) continue;
      const code = String(row.currencyCode ?? 'INR').trim().toUpperCase() || 'INR';
      if (!byCurrency.has(code)) byCurrency.set(code, new Set());
      byCurrency.get(code)!.add(row.price);
    }
  }
  if (byCurrency.size === 0) return ['—'];
  return [...byCurrency.entries()]
    .sort(([a], [b]) => (a === 'INR' ? -1 : b === 'INR' ? 1 : a.localeCompare(b)))
    .map(([code, prices]) => formatBhsPriceRange([...prices], code));
}

function aircraftTypesOf(group: BhsAirlineCardGroup): string[] {
  return [...new Set(group.aircraftGroups.map((g) => g.aircraftType.trim()).filter(Boolean))];
}

const STATUS_BADGE: Record<AirlineStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className:
      'border-[color:var(--billing-success-border)] bg-[color:var(--billing-success-soft)] text-[color:var(--billing-success)]',
  },
  mixed: {
    label: 'Partly discontinued',
    className:
      'border-[color:var(--billing-warning-border)] bg-[color:var(--billing-warning-soft)] text-[color:var(--billing-warning)]',
  },
  discontinued: {
    label: 'Discontinued',
    className:
      'border-[color:var(--billing-danger-border)] bg-[color:var(--billing-danger-soft)] text-[color:var(--billing-danger)]',
  },
};

/** Active (and partly discontinued) airlines A–Z first, then discontinued ones A–Z. */
export function sortAirlineGroupsForList(
  groups: BhsAirlineCardGroup[],
  contracts: BillingContract[],
): Array<{ group: BhsAirlineCardGroup; status: AirlineStatus }> {
  const byName = (a: BhsAirlineCardGroup, b: BhsAirlineCardGroup) =>
    a.airlineName.localeCompare(b.airlineName, undefined, { sensitivity: 'base' }) ||
    a.customerCode.localeCompare(b.customerCode);
  const live: BhsAirlineCardGroup[] = [];
  const gone: BhsAirlineCardGroup[] = [];
  const statusOf = new Map<string, AirlineStatus>();
  for (const group of groups) {
    const status = airlineCardStatus(group, contracts);
    statusOf.set(group.customerCode, status);
    (status === 'discontinued' ? gone : live).push(group);
  }
  return [...live.sort(byName), ...gone.sort(byName)].map((group) => ({
    group,
    status: statusOf.get(group.customerCode) ?? 'active',
  }));
}

function AirlineRow({
  group,
  status,
  onOpenRateCards,
  missingAircraftCount = 0,
}: {
  group: BhsAirlineCardGroup;
  status: AirlineStatus;
  missingAircraftCount?: number;
} & Pick<Props, 'onOpenRateCards'>) {
  const discontinued = status === 'discontinued';
  const badge = STATUS_BADGE[status];
  const aircraft = aircraftTypesOf(group);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenRateCards(group)}
        aria-label={`Open ${group.airlineName} rate cards`}
        className={`group grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 text-left transition-colors hover:bg-[color:var(--billing-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--billing-info)] sm:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_11rem_1rem] ${
          discontinued ? 'opacity-70 hover:opacity-100' : ''
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--billing-radius)] ${
            discontinued
              ? 'bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-text-muted)]'
              : 'bg-[color:var(--billing-primary-soft)] text-[color:var(--billing-primary)]'
          }`}
        >
          <Plane className="h-4 w-4" aria-hidden />
        </span>

        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-[color:var(--billing-heading)]">
              {group.airlineName}
            </span>
            <span className="shrink-0 rounded-md bg-[color:var(--billing-surface-muted)] px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-[color:var(--billing-text-secondary)]">
              {group.customerCode}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-[color:var(--billing-text-muted)] sm:hidden">
            {group.aircraftCount} aircraft{group.aircraftCount === 1 ? '' : 's'}
            {aircraft.length ? ` · ${aircraft.join(', ')}` : ''}
          </span>
          {missingAircraftCount > 0 ? (
            <span className="mt-0.5 block text-xs font-semibold text-[color:var(--billing-warning)]">
              {missingAircraftCount} aircraft from this month{' '}
              {missingAircraftCount === 1 ? 'is' : 'are'} not on the rate card
            </span>
          ) : null}
        </span>

        <span className="hidden min-w-0 sm:block">
          <span className="block text-xs text-[color:var(--billing-text-muted)]">
            {group.aircraftCount} aircraft{group.aircraftCount === 1 ? '' : 's'}
          </span>
          <span className="block truncate text-sm text-[color:var(--billing-text-secondary)]">
            {aircraft.length ? aircraft.join(', ') : '—'}
          </span>
        </span>

        <span className="flex flex-col items-end gap-1">
          {priceRangesByCurrency(group).map((range) => (
            <span
              key={range}
              className="text-sm font-semibold tabular-nums text-[color:var(--billing-text)]"
            >
              {range}
            </span>
          ))}
          <span
            className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        </span>

        <ChevronRight
          className="hidden h-4 w-4 shrink-0 text-[color:var(--billing-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--billing-primary)] sm:block"
          aria-hidden
        />
      </button>
    </li>
  );
}

export function BhsAirlineCardGrid({
  groups,
  contracts,
  onOpenRateCards,
  missingAircraftCounts,
  serviceLabel = 'Service price',
}: Props) {
  const sorted = sortAirlineGroupsForList(groups, contracts);
  const firstDiscontinued = sorted.findIndex((item) => item.status === 'discontinued');
  const activeCount = firstDiscontinued === -1 ? sorted.length : firstDiscontinued;
  const discontinuedCount = sorted.length - activeCount;

  return (
    <div className="overflow-hidden rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] shadow-[var(--billing-shadow-sm)]">
      <div className="hidden grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_11rem_1rem] items-center gap-x-4 border-b border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)] sm:grid">
        <span aria-hidden />
        <span>Airline</span>
        <span>Aircraft types</span>
        <span className="text-right">{serviceLabel} · Status</span>
        <span aria-hidden />
      </div>

      <ul className="divide-y divide-[color:var(--billing-border)]">
        {sorted.flatMap(({ group, status }, index) => {
          const items = [];
          if (index === firstDiscontinued && activeCount > 0) {
            items.push(
              <li
                key="__discontinued-divider"
                aria-hidden
                className="bg-[color:var(--billing-surface-muted)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]"
              >
                Discontinued ({discontinuedCount})
              </li>,
            );
          }
          items.push(
            <AirlineRow
              key={group.customerCode}
              group={group}
              status={status}
              onOpenRateCards={onOpenRateCards}
              missingAircraftCount={
                missingAircraftCounts?.[group.customerCode.trim().toUpperCase()] ?? 0
              }
            />,
          );
          return items;
        })}
      </ul>

      <div className="border-t border-[color:var(--billing-border)] px-4 py-2 text-xs text-[color:var(--billing-text-muted)]">
        {activeCount} active{discontinuedCount > 0 ? ` · ${discontinuedCount} discontinued` : ''}
      </div>
    </div>
  );
}

export function primaryBhsEntryForGroup(
  group: BhsAirlineCardGroup,
): BillingPriceCardAirline | null {
  for (const aircraftGroup of group.aircraftGroups) {
    if (aircraftGroup.rows[0]) return aircraftGroup.rows[0];
  }
  return null;
}
