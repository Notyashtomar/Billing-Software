'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import {
  ACTIVE_FLIGHT_STAT_ITEMS,
  type ActiveFlightStatTheme,
  type ScheduledAirlinesActiveFlightStatKey,
  type ScheduledAirlinesActiveFlightStats,
} from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';

type Props = {
  stats: ScheduledAirlinesActiveFlightStats;
  selectedFilters: ReadonlySet<ScheduledAirlinesActiveFlightStatKey>;
  onToggleFilter: (key: ScheduledAirlinesActiveFlightStatKey) => void;
  onClearFilters?: () => void;
  loading?: boolean;
};

function cardBoxShadow(theme: ActiveFlightStatTheme, hovered: boolean, selected: boolean): string {
  const depth = hovered || selected ? theme.swatch : theme.accent;
  const drop = hovered || selected ? theme.hoverShadow : theme.shadow;
  return [
    'inset 0 1px 0 rgba(255,255,255,0.9)',
    'inset 0 -1px 0 rgba(0,0,0,0.06)',
    `0 2px 0 ${depth}`,
    `0 ${hovered || selected ? 10 : 5}px ${hovered || selected ? 20 : 12}px -4px ${drop}`,
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
  statKey: ScheduledAirlinesActiveFlightStatKey;
  label: string;
  theme: ActiveFlightStatTheme;
  value: number;
  loading: boolean;
  selected: boolean;
  onToggle: (key: ScheduledAirlinesActiveFlightStatKey) => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const checkboxId = `scheduled-flight-stat-${statKey}`;

  return (
    <motion.label
      htmlFor={checkboxId}
      className={`group relative flex min-w-0 w-full cursor-pointer flex-col gap-1 overflow-hidden rounded-lg border px-1.5 py-1.5 sm:px-2 sm:py-1.5 ${
        selected ? 'ring-2 ring-offset-1' : ''
      }`}
      style={{
        background: `linear-gradient(168deg, ${theme.bgTop} 0%, ${theme.bgBottom} 55%, ${theme.border}33 100%)`,
        borderColor: selected ? theme.accent : theme.border,
        boxShadow: cardBoxShadow(theme, hovered, selected),
        ['--tw-ring-color' as string]: theme.accent,
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ y: -2, scale: 1.015 }}
      whileTap={{ y: -1, scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-lg bg-gradient-to-b from-white/55 via-white/15 to-transparent"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-x-1.5 bottom-0 h-px rounded-full bg-white/40"
        aria-hidden
      />

      <div className="relative flex min-w-0 items-start justify-between gap-1">
        <div className="flex min-w-0 items-start gap-1">
          <span
            className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{
              background: `linear-gradient(145deg, ${theme.swatch} 0%, ${theme.accent} 100%)`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.18), 0 1px 3px ${theme.shadow}`,
            }}
            aria-hidden
          />
          <span className="min-w-0 whitespace-normal break-words text-[11px] font-semibold leading-tight text-gray-800 sm:text-xs">
            {label}
          </span>
        </div>
        <input
          id={checkboxId}
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(statKey)}
          className="mt-0.5 h-3 w-3 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          aria-label={`Filter by ${label}`}
        />
      </div>

      <div className="relative pl-3.5">
        {loading ? (
          <span
            aria-hidden
            className="inline-block h-4 w-7 animate-pulse rounded-md bg-white/50"
          />
        ) : (
          <span
            className="text-base font-extrabold tabular-nums leading-none drop-shadow-[0_1px_0_rgba(255,255,255,0.8)] sm:text-lg"
            style={{ color: theme.accent }}
          >
            <CountUpNumber
              value={value}
              duration={0.8}
              className="font-extrabold tabular-nums"
            />
          </span>
        )}
      </div>
    </motion.label>
  );
}

export default function ScheduledAirlinesActiveFlightsBar({
  stats,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  loading = false,
}: Props) {
  return (
    <motion.div
      id="scheduled-airlines-active-flight-stats"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="space-y-1.5 p-2 sm:space-y-2 sm:p-2.5">
        {selectedFilters.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <p className="text-xs text-gray-600">
              Showing flights matching {selectedFilters.size} selected categor
              {selectedFilters.size === 1 ? 'y' : 'ies'} (any match).
            </p>
            {onClearFilters ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 lg:gap-2">
          {ACTIVE_FLIGHT_STAT_ITEMS.map(({ key, label, theme }) => (
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
      </div>
    </motion.div>
  );
}
