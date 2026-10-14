'use client';

import { CountUpNumber } from '@/components/ui/CountUpNumber';
import type { ActiveFlightStatTheme } from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';
import {
  BILLING_ADS_BRIEF_ITEMS,
  buildAdsPaletteSections,
  billingAdsBriefHoverTitle,
  isMotorisedNbWbGroupPartial,
  isMotorisedNbWbGroupSelected,
  motorisedNbWbGroupCounts,
  motorisedNbWbGroupHoverTitle,
  WCH_SUBTYPE_LABELS,
  wchPaletteGroupCounts,
  wchPaletteGroupHoverTitle,
  type AdsBriefSelectionTotals,
  type BillingAdsBriefKey,
  type BillingAdsBriefStats,
  type BillingAdsWchBreakdown,
  type MotorisedNbWbPaletteGroup,
  type WchPaletteGroup,
} from './billingAdsBriefStats';

type Props = {
  stats: BillingAdsBriefStats;
  wchBreakdown: BillingAdsWchBreakdown;
  totalFlights: number;
  selectedFilters: ReadonlySet<BillingAdsBriefKey>;
  onToggleFilter: (key: BillingAdsBriefKey) => void;
  onToggleFilterGroup: (keys: readonly BillingAdsBriefKey[]) => void;
  onClearFilters: () => void;
  loading?: boolean;
  /** When set, only these palette chips render (ADS rate-card gate). */
  visibleKeys?: ReadonlySet<BillingAdsBriefKey> | null;
  emptyMessage?: string | null;
  /** Invoice used/charged detail for currently checked chip(s). */
  selectionTotals?: AdsBriefSelectionTotals | null;
};

function cardBoxShadow(theme: ActiveFlightStatTheme, selected: boolean): string {
  return [
    'inset 0 1px 0 rgba(255,255,255,0.9)',
    'inset 0 -1px 0 rgba(0,0,0,0.06)',
    `0 1px 0 ${selected ? theme.swatch : theme.accent}`,
    `0 3px 7px -4px ${selected ? theme.hoverShadow : theme.shadow}`,
  ].join(', ');
}

function resolveItemTheme(
  key: BillingAdsBriefKey,
  fallback: ActiveFlightStatTheme,
): ActiveFlightStatTheme {
  return BILLING_ADS_BRIEF_ITEMS.find((item) => item.key === key)?.theme ?? fallback;
}

function WchPaletteChip({
  group,
  stats,
  breakdown,
  selected,
  theme,
  loading,
  onToggle,
}: {
  group: WchPaletteGroup;
  stats: BillingAdsBriefStats;
  breakdown: BillingAdsWchBreakdown;
  selected: boolean;
  theme: ActiveFlightStatTheme;
  loading: boolean;
  onToggle: () => void;
}) {
  const checkboxId = `billing-ads-brief-${group.id}`;
  const counts = wchPaletteGroupCounts(breakdown, stats);
  const title = wchPaletteGroupHoverTitle(breakdown, stats);

  return (
    <label
      htmlFor={checkboxId}
      title={title}
      aria-label={title}
      className={`col-span-2 flex min-h-[2.65rem] min-w-0 cursor-pointer items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left sm:col-span-2 ${
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
        onChange={onToggle}
        className="mt-0.5 h-3 w-3 shrink-0 rounded border-gray-400 text-[color:var(--billing-accent)] focus:ring-1 focus:ring-[color:var(--billing-accent)]"
        aria-label={`Filter by ${group.label}`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold leading-tight text-gray-900 sm:text-[11px]">
          {group.label}
        </div>
        {loading ? (
          <span
            aria-hidden
            className="mt-1 block h-3 w-full max-w-[9rem] animate-pulse rounded bg-white/60"
          />
        ) : (
          <div
            className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[9px] font-semibold tabular-nums leading-tight sm:text-[10px]"
            style={{ color: theme.accent }}
          >
            {group.subtypes.map((subtype, index) => (
              <span key={subtype} className="inline-flex items-center gap-x-1">
                {index > 0 ? (
                  <span className="text-gray-400" aria-hidden>·</span>
                ) : null}
                <span>
                  {WCH_SUBTYPE_LABELS[subtype]}-{counts[subtype]}
                </span>
              </span>
            ))}
            <span className="text-gray-400" aria-hidden>·</span>
            <span className="font-extrabold">
              {group.label}-{counts.total}
            </span>
          </div>
        )}
      </div>
    </label>
  );
}

function MotorisedNbWbPaletteChip({
  group,
  stats,
  selected,
  partial,
  theme,
  loading,
  onToggle,
}: {
  group: MotorisedNbWbPaletteGroup;
  stats: BillingAdsBriefStats;
  selected: boolean;
  partial: boolean;
  theme: ActiveFlightStatTheme;
  loading: boolean;
  onToggle: () => void;
}) {
  const checkboxId = `billing-ads-brief-group-${group.id}`;
  const counts = motorisedNbWbGroupCounts(group, stats);
  const title = motorisedNbWbGroupHoverTitle(group, stats);

  return (
    <label
      htmlFor={checkboxId}
      title={title}
      aria-label={title}
      className={`col-span-2 flex min-h-[2.65rem] min-w-0 cursor-pointer items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left sm:col-span-2 ${
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
        ref={(el) => {
          if (el) el.indeterminate = partial;
        }}
        onChange={onToggle}
        className="mt-0.5 h-3 w-3 shrink-0 rounded border-gray-400 text-[color:var(--billing-accent)] focus:ring-1 focus:ring-[color:var(--billing-accent)]"
        aria-label={`Filter by ${group.label}`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold leading-tight text-gray-900 sm:text-[11px]">
          {group.label}
        </div>
        {loading ? (
          <span
            aria-hidden
            className="mt-1 block h-3 w-full max-w-[7rem] animate-pulse rounded bg-white/60"
          />
        ) : (
          <div
            className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[9px] font-semibold tabular-nums leading-tight sm:text-[10px]"
            style={{ color: theme.accent }}
          >
            {group.nbKey ? <span>NB-{counts.nb}</span> : null}
            {group.nbKey && group.wbKey ? (
              <span className="text-gray-400" aria-hidden>·</span>
            ) : null}
            {group.wbKey ? <span>WB-{counts.wb}</span> : null}
            <span className="text-gray-400" aria-hidden>·</span>
            <span className="font-extrabold">
              {group.label}-{counts.total}
            </span>
          </div>
        )}
      </div>
    </label>
  );
}

function PaletteChip({
  checkboxId,
  label,
  countLabel,
  countValue,
  title,
  selected,
  partial,
  theme,
  loading,
  onToggle,
}: {
  checkboxId: string;
  label: string;
  countLabel?: string;
  countValue?: number;
  title: string;
  selected: boolean;
  partial?: boolean;
  theme: ActiveFlightStatTheme;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      htmlFor={checkboxId}
      title={title}
      aria-label={title}
      className={`flex min-h-9 min-w-0 cursor-pointer items-center gap-1 rounded-lg border px-1.5 py-1 text-left ${
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
        ref={(el) => {
          if (el) el.indeterminate = Boolean(partial);
        }}
        onChange={onToggle}
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
      ) : countValue != null ? (
        <span className="shrink-0" style={{ color: theme.accent }}>
          <CountUpNumber
            value={countValue}
            duration={0.5}
            className="text-xs font-extrabold tabular-nums leading-none sm:text-sm"
          />
        </span>
      ) : (
        <span
          className="shrink-0 text-[9px] font-extrabold tabular-nums leading-tight sm:text-[10px]"
          style={{ color: theme.accent }}
        >
          {countLabel ?? ''}
        </span>
      )}
    </label>
  );
}

export function BillingAdsBriefStatsBar({
  stats,
  wchBreakdown,
  totalFlights,
  selectedFilters,
  onToggleFilter,
  onToggleFilterGroup,
  onClearFilters,
  loading = false,
  visibleKeys = null,
  emptyMessage = null,
  selectionTotals = null,
}: Props) {
  const items =
    visibleKeys == null
      ? BILLING_ADS_BRIEF_ITEMS
      : BILLING_ADS_BRIEF_ITEMS.filter((item) => visibleKeys.has(item.key));

  const sections = buildAdsPaletteSections(items);

  return (
    <section
      id="billing-ads-brief-stats"
      className="mb-4 rounded-xl border border-gray-100 bg-white p-2 shadow-sm"
      aria-label="ADS brief counts and filters"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5 text-[11px] text-gray-600">
        <span>
          {selectedFilters.size > 0
            ? `${selectedFilters.size} palette filter${selectedFilters.size === 1 ? '' : 's'} active`
            : `Total flights: ${totalFlights.toLocaleString()} · palette = FHR engagements in date range (1 per equipment line, MIS parity) · ${
                visibleKeys != null ? 'Rate-carded ADS services' : 'All categories'
              }`}
        </span>
        <button
          type="button"
          onClick={onClearFilters}
          disabled={selectedFilters.size === 0}
          className="shrink-0 rounded-md border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-2 py-1 font-semibold text-[color:var(--billing-accent-strong)] hover:bg-[color:var(--billing-accent-soft)] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--billing-accent)]"
        >
          Reset palette filters
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/80 px-3 py-4 text-center text-sm text-amber-950">
          {emptyMessage ??
            'Set ADS rate cards for this airline to see service counts here.'}
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.category}>
              <h3
                className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500"
              >
                {section.title}
              </h3>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-10 xl:grid-cols-12">
                {section.entries.map((entry) => {
                  if (entry.kind === 'nbWbGroup') {
                    const group = entry.group;
                    const theme = resolveItemTheme(
                      group.nbKey ?? group.keys[0],
                      items[0]?.theme ?? BILLING_ADS_BRIEF_ITEMS[0].theme,
                    );
                    return (
                      <MotorisedNbWbPaletteChip
                        key={group.id}
                        group={group}
                        stats={stats}
                        selected={isMotorisedNbWbGroupSelected(
                          group,
                          selectedFilters,
                        )}
                        partial={isMotorisedNbWbGroupPartial(
                          group,
                          selectedFilters,
                        )}
                        theme={theme}
                        loading={loading}
                        onToggle={() => onToggleFilterGroup(group.keys)}
                      />
                    );
                  }

                  if (entry.kind === 'wchGroup') {
                    const group = entry.group;
                    const theme = resolveItemTheme(
                      group.key,
                      items[0]?.theme ?? BILLING_ADS_BRIEF_ITEMS[0].theme,
                    );
                    return (
                      <WchPaletteChip
                        key={group.id}
                        group={group}
                        stats={stats}
                        breakdown={wchBreakdown}
                        selected={selectedFilters.has(group.key)}
                        theme={theme}
                        loading={loading}
                        onToggle={() => onToggleFilter(group.key)}
                      />
                    );
                  }

                  const { key, label, theme } = entry.item;
                  const selected = selectedFilters.has(key);
                  const checkboxId = `billing-ads-brief-${key}`;
                  return (
                    <PaletteChip
                      key={key}
                      checkboxId={checkboxId}
                      label={label}
                      countValue={stats[key]}
                      title={billingAdsBriefHoverTitle(key, label, stats[key])}
                      selected={selected}
                      theme={theme}
                      loading={loading}
                      onToggle={() => onToggleFilter(key)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectionTotals ? (
        <div
          className="mt-3 rounded-xl border-2 border-[color:var(--billing-primary)] bg-white px-3 py-3 shadow-sm"
          role="status"
          aria-live="polite"
          aria-label={`Invoice units for ${selectionTotals.label}`}
        >
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-[color:var(--billing-heading)]">
              {selectionTotals.label}
              <span className="ml-2 text-xs font-normal text-gray-600">
                invoice units from FHR remarks × qty
              </span>
            </div>
            <div className="text-[11px] text-gray-500">
              Palette count stays engagements; used/charged drive invoicing
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-[color:var(--billing-accent-soft)] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Unit of measurement
              </div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-gray-900">
                {selectionTotals.uom}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Engagements
              </div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-gray-900">
                {selectionTotals.engagements.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Used units
              </div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-[color:var(--billing-primary)]">
                {selectionTotals.usedUnits.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Charged units
              </div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-gray-900">
                {selectionTotals.chargedUnits.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-2 px-0.5 text-[11px] text-gray-500">
          Check palette equipment to filter the flight table and show engagement
          times. Select a chip to see Unit of measurement, Used units, and
          Charged units for invoicing.
        </p>
      )}
    </section>
  );
}
