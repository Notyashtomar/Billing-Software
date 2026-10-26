'use client';

import { CountUpNumber } from '@/components/ui/CountUpNumber';
import type { ActiveFlightStatTheme } from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';
import {
  buildRafEquipmentPaletteSections,
  rafEquipmentHoverTitle,
  type RafEquipmentPaletteStats,
  type RafEquipmentSelectionTotals,
  type RafSeededEquipmentCode,
} from './billingRafEquipmentPalette';

type Props = {
  stats: RafEquipmentPaletteStats;
  totalFlights: number;
  selectedFilters: ReadonlySet<string>;
  onToggleFilter: (code: RafSeededEquipmentCode) => void;
  onClearFilters: () => void;
  loading?: boolean;
  selectionTotals?: RafEquipmentSelectionTotals | null;
};

function cardBoxShadow(theme: ActiveFlightStatTheme, selected: boolean): string {
  return [
    'inset 0 1px 0 rgba(255,255,255,0.9)',
    'inset 0 -1px 0 rgba(0,0,0,0.06)',
    `0 1px 0 ${selected ? theme.swatch : theme.accent}`,
    `0 3px 7px -4px ${selected ? theme.hoverShadow : theme.shadow}`,
  ].join(', ');
}

export function BillingRafEquipmentPaletteBar({
  stats,
  totalFlights,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  loading = false,
  selectionTotals = null,
}: Props) {
  const sections = buildRafEquipmentPaletteSections();

  return (
    <section
      id="billing-raf-equipment-palette"
      className="mb-4 rounded-xl border border-gray-100 bg-white p-2 shadow-sm"
      aria-label="RAF equipment counts by Equipment No"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5 text-[11px] text-gray-600">
        <span>
          {selectedFilters.size > 0
            ? `${selectedFilters.size} palette filter${selectedFilters.size === 1 ? '' : 's'} active`
            : `Total flights: ${totalFlights.toLocaleString()} · chip total = every Equipment No usage line (same code on one flight counts each time)`}
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

      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.category}>
            <h3 className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">
              {section.title}
            </h3>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {section.items.map((item) => {
                const selected = selectedFilters.has(item.code);
                const count = stats[item.code] ?? 0;
                const checkboxId = `billing-raf-eq-${item.code}`;
                const theme = item.theme;
                return (
                  <label
                    key={item.code}
                    htmlFor={checkboxId}
                    title={rafEquipmentHoverTitle(item, count)}
                    aria-label={rafEquipmentHoverTitle(item, count)}
                    className={`billing-palette-chip flex min-h-[2.65rem] min-w-0 cursor-pointer items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left ${
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
                      onChange={() => onToggleFilter(item.code)}
                      className="mt-0.5 h-3 w-3 shrink-0 rounded border-gray-400 text-[color:var(--billing-accent)] focus:ring-1 focus:ring-[color:var(--billing-accent)]"
                      aria-label={`Filter by ${item.label}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-bold leading-tight text-gray-900">
                        {item.label}
                      </div>
                      <div className="truncate text-[9px] leading-tight text-gray-600">
                        {item.fullName}
                      </div>
                    </div>
                    {loading ? (
                      <span
                        aria-hidden
                        className="mt-0.5 inline-block h-4 w-6 animate-pulse rounded bg-white/70"
                      />
                    ) : (
                      <span
                        className="shrink-0 text-sm font-extrabold tabular-nums leading-none"
                        style={{ color: theme.accent }}
                      >
                        <CountUpNumber value={count} duration={0.6} />
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

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
                invoice units from RAF equipment lines
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Palette count stays engagements; used/charged drive invoicing
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Unit of measurement
              </div>
              <div className="mt-0.5 text-sm font-bold text-amber-950">
                {selectionTotals.uom}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                Engagements
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                {selectionTotals.engagements.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                Used units
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-sky-950">
                {selectionTotals.usedUnits.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Charged units
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-950">
                {selectionTotals.chargedUnits.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-2 px-0.5 text-[11px] text-gray-500">
          Check palette equipment to filter the flight table and show engagement
          / used / charged for that Equipment No.
        </p>
      )}
    </section>
  );
}
