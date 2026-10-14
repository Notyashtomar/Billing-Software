'use client';

import { Plane } from 'lucide-react';
import type { BillingContract, BillingPriceCardAirline } from '@/lib/billing-shared/types';
import type { BhsAirlineCardGroup } from '@/lib/billing-shared/price-card-handling';
import { isPriceCardEntryExpired } from '@/lib/billing-shared/price-card-airline-rows';

type Props = {
  groups: BhsAirlineCardGroup[];
  contracts: BillingContract[];
  onOpenRateCards: (group: BhsAirlineCardGroup) => void;
};

function airlineCardStatus(
  group: BhsAirlineCardGroup,
  contracts: BillingContract[],
): 'active' | 'expired' | 'mixed' {
  let expired = 0;
  let total = 0;
  for (const aircraftGroup of group.aircraftGroups) {
    for (const row of aircraftGroup.rows) {
      total += 1;
      if (isPriceCardEntryExpired(row, contracts)) expired += 1;
    }
  }
  if (total === 0 || expired === 0) return 'active';
  if (expired === total) return 'expired';
  return 'mixed';
}

function formatBhsPrice(price: number | undefined) {
  if (price == null || !Number.isFinite(price)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(price);
}

function formatBhsPriceRange(prices: number[]) {
  const unique = [...new Set(prices)].sort((a, b) => a - b);
  if (unique.length === 0) return '—';
  if (unique.length === 1) return formatBhsPrice(unique[0]);
  return `${formatBhsPrice(unique[0])} – ${formatBhsPrice(unique[unique.length - 1])}`;
}

function uniqueBhsPrices(group: BhsAirlineCardGroup): number[] {
  const prices = new Set<number>();
  for (const aircraftGroup of group.aircraftGroups) {
    for (const row of aircraftGroup.rows) {
      if (row.price != null && Number.isFinite(row.price)) {
        prices.add(row.price);
      }
    }
  }
  return [...prices].sort((a, b) => a - b);
}

function BhsAirlineCard({
  group,
  contracts,
  onOpenRateCards,
}: {
  group: BhsAirlineCardGroup;
} & Pick<Props, 'contracts' | 'onOpenRateCards'>) {
  const bhsPrices = uniqueBhsPrices(group);
  const status = airlineCardStatus(group, contracts);
  const expired = status === 'expired';

  return (
    <article
      className={
        expired
          ? 'flex h-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50/40 shadow-sm transition-[border-color,box-shadow] hover:border-red-300 hover:shadow-md'
          : 'flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-[border-color,box-shadow] hover:border-[color:var(--billing-accent-border)] hover:shadow-md'
      }
    >
      <button
        type="button"
        onClick={() => onOpenRateCards(group)}
        className="flex flex-1 flex-col text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--billing-accent)]"
      >
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-accent-strong)]">
              <Plane className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-accent-strong)]">
                {group.customerCode}
              </p>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <h3 className="min-w-0 line-clamp-2 text-base font-semibold leading-snug text-gray-900">
                  {group.airlineName}
                </h3>
                <span
                  className={
                    status === 'expired'
                      ? 'inline-flex shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800'
                      : status === 'mixed'
                        ? 'inline-flex shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900'
                        : 'inline-flex shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                  }
                >
                  {status === 'expired' ? 'Expired' : status === 'mixed' ? 'Partly expired' : 'Active'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto border-t border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-600">
              {group.aircraftCount} aircraft{group.aircraftCount === 1 ? '' : 's'}
            </span>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                BHS service
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                {formatBhsPriceRange(bhsPrices)}
              </p>
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}

export function BhsAirlineCardGrid({ groups, contracts, onOpenRateCards }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <BhsAirlineCard
          key={group.customerCode}
          group={group}
          contracts={contracts}
          onOpenRateCards={onOpenRateCards}
        />
      ))}
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
