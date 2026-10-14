'use client';

import React from 'react';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import {
  BILLING_SCHEDULED_FLIGHT_STAT_ITEMS,
  type BillingScheduledFlightStatKey,
  type BillingScheduledFlightStats,
} from './billingScheduledFlightStats';
import type { ActiveFlightStatTheme } from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';

type Props = {
  stats: BillingScheduledFlightStats;
  selectedFilters: ReadonlySet<BillingScheduledFlightStatKey>;
  onToggleFilter: (key: BillingScheduledFlightStatKey) => void;
  onClearFilters?: () => void;
  loading?: boolean;
};

/** Match ADS brief palette chips — compact horizontal size. */
function cardBoxShadow(theme: ActiveFlightStatTheme, selected: boolean): string {
  return [
    'inset 0 1px 0 rgba(255,255,255,0.9)',
    'inset 0 -1px 0 rgba(0,0,0,0.06)',
    `0 1px 0 ${selected ? theme.swatch : theme.accent}`,
    `0 3px 7px -4px ${selected ? theme.hoverShadow : theme.shadow}`,
  ].join(', ');
}

function FilterableStatCard({
  statKey,
  label,
  theme,
  value,
  loading,
  selected,
  onToggle,
}: {
  statKey: BillingScheduledFlightStatKey;
  label: string;
  theme: ActiveFlightStatTheme;
  value: number;
  loading: boolean;
  selected: boolean;
  onToggle: (key: BillingScheduledFlightStatKey) => void;
}) {
  const checkboxId = `billing-flight-stat-${statKey}`;

  return (
    <label
      htmlFor={checkboxId}
      title={label}
      className={`flex min-h-10 min-w-[10.5rem] flex-1 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left ${
        selected ? 'ring-2 ring-offset-1' : ''
      }`}
      style={{
        background: `linear-gradient(168deg, ${theme.bgTop} 0%, ${theme.bgBottom} 100%)`,
        borderColor: selected ? theme.accent : theme.border,
        boxShadow: cardBoxShadow(theme, selected),
        ['--tw-ring-color' as string]: theme.accent,
      }}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(statKey)}
        className="h-3 w-3 shrink-0 rounded border-gray-400 text-[color:var(--billing-accent)] focus:ring-1 focus:ring-[color:var(--billing-accent)]"
        aria-label={`Filter by ${label}`}
      />
      <span className="min-w-0 flex-1 text-[9px] font-semibold leading-tight text-gray-800 sm:text-[10px]">
        {label}
      </span>
      {loading ? (
        <span
          aria-hidden
          className="h-3.5 w-4 shrink-0 animate-pulse rounded bg-white/60"
        />
      ) : (
        <span className="shrink-0" style={{ color: theme.accent }}>
          <CountUpNumber
            value={value}
            duration={0.5}
            className="text-xs font-extrabold tabular-nums leading-none sm:text-sm"
          />
        </span>
      )}
    </label>
  );
}

export function BillingScheduledFlightsStatsBar({
  stats,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  loading = false,
}: Props) {
  return (
    <section
      id="billing-scheduled-flights-stats"
      className="mb-4 min-w-0 rounded-xl border border-gray-100 bg-white p-2 shadow-sm"
      aria-label="BHS flight counts and filters"
    >
      {selectedFilters.size > 0 ? (
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 px-0.5 text-[11px] text-gray-600">
          <p>
            Showing flights matching {selectedFilters.size} selected categor
            {selectedFilters.size === 1 ? 'y' : 'ies'} (any match).
          </p>
          {onClearFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="shrink-0 rounded-md border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-2 py-1 font-semibold text-[color:var(--billing-accent-strong)] hover:bg-[color:var(--billing-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--billing-accent)]"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {BILLING_SCHEDULED_FLIGHT_STAT_ITEMS.map(({ key, label, theme }) => (
          <FilterableStatCard
            key={key}
            statKey={key}
            label={label}
            theme={theme}
            value={stats[key]}
            loading={loading}
            selected={selectedFilters.has(key)}
            onToggle={onToggleFilter}
          />
        ))}
      </div>
    </section>
  );
}
