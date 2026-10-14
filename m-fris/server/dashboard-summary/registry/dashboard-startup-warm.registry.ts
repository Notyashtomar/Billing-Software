import {
  ALL_DASHBOARD_CARD_KEYS,
  DASHBOARD_CARD_KEYS,
  PRIMARY_DASHBOARD_CARD_KEYS,
  SECONDARY_DASHBOARD_CARD_KEYS,
  type DashboardCardKey,
} from '../constants/dashboard-card-keys';
import {
  ALL_DASHBOARD_AGGREGATE_TYPES,
  DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';
import type { DashboardEquipmentMode } from '../interfaces';

export type WarmRange = { fromDate: string; tillDate: string };

export interface WarmPhaseSpec {
  /** Human-readable label for logs. */
  name: string;
  /** Date ranges to warm in this phase. Resolved at runtime. */
  getRanges: (ctx: WarmRangeContext) => WarmRange[];
  /** Cards to warm for each range × equipment mode. */
  cardKeys: readonly DashboardCardKey[];
  /** Equipment modes to warm. */
  modes: readonly DashboardEquipmentMode[];
  /** Daily aggregate types to warm for each date in ranges. */
  aggregateTypes: readonly DashboardAggregateType[];
  /** Whether to warm the FHR STA-window cache for these ranges. */
  warmFhrCache: boolean;
}

/** Resolved date context built at warmup start time. */
export interface WarmRangeContext {
  todayYmd: string;
  yesterdayYmd: string;
  last7FromYmd: string;
  monthStartYmd: string;
}

export function buildWarmRangeContext(now = new Date()): WarmRangeContext {
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const shift = (base: Date, delta: number): Date => {
    const d = new Date(base);
    d.setDate(d.getDate() + delta);
    return d;
  };

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return {
    todayYmd: fmt(today),
    yesterdayYmd: fmt(shift(today, -1)),
    last7FromYmd: fmt(shift(today, -6)),
    monthStartYmd: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
  };
}

/**
 * Centralised warm plan executed by {@link DashboardStartupWarmService}.
 *
 * Phase 1 — critical: today, high-traffic primary cards, both equipment modes.
 * Phase 2 — secondary: yesterday + rolling-7d, all cards.
 * Phase 3 — deferred: MTD, remaining aggregate types.
 *
 * Historical / niche ranges are left for lazy on-demand loading only.
 */
export const STARTUP_WARM_PHASES: WarmPhaseSpec[] = [
  {
    name: 'phase1_critical',
    getRanges: (ctx) => [{ fromDate: ctx.todayYmd, tillDate: ctx.todayYmd }],
    cardKeys: [
      DASHBOARD_CARD_KEYS.KPI_STRIP,
      DASHBOARD_CARD_KEYS.PERFORMANCE_REPORT,
      DASHBOARD_CARD_KEYS.ON_TIME_PERFORMANCE,
      DASHBOARD_CARD_KEYS.GHA_IMPROVEMENT,
      DASHBOARD_CARD_KEYS.EQUIPMENT_UTILIZATION,
    ] as const satisfies DashboardCardKey[],
    modes: ['4h', '6h'],
    aggregateTypes: [
      DASHBOARD_AGGREGATE_TYPES.KPI_STRIP,
      DASHBOARD_AGGREGATE_TYPES.PERFORMANCE_REPORT,
      DASHBOARD_AGGREGATE_TYPES.ON_TIME_PERFORMANCE,
      DASHBOARD_AGGREGATE_TYPES.GHA_IMPROVEMENT,
      DASHBOARD_AGGREGATE_TYPES.EQUIPMENT_UTILIZATION,
    ] as const satisfies DashboardAggregateType[],
    warmFhrCache: true,
  },
  {
    name: 'phase2_secondary',
    getRanges: (ctx) => [
      { fromDate: ctx.yesterdayYmd, tillDate: ctx.yesterdayYmd },
      { fromDate: ctx.last7FromYmd, tillDate: ctx.todayYmd },
    ],
    cardKeys: [
      ...PRIMARY_DASHBOARD_CARD_KEYS,
      ...SECONDARY_DASHBOARD_CARD_KEYS,
    ] as const satisfies DashboardCardKey[],
    modes: ['4h', '6h'],
    aggregateTypes: ALL_DASHBOARD_AGGREGATE_TYPES,
    warmFhrCache: true,
  },
  {
    name: 'phase3_deferred',
    getRanges: (ctx) => [
      { fromDate: ctx.monthStartYmd, tillDate: ctx.todayYmd },
    ],
    cardKeys: ALL_DASHBOARD_CARD_KEYS,
    modes: ['4h', '6h'],
    aggregateTypes: ALL_DASHBOARD_AGGREGATE_TYPES,
    warmFhrCache: false,
  },
];

/** FHR STA-window date windows to pre-warm (by phase). */
export const STARTUP_FHR_WARM_PHASE1_DAYS_BACK = 0; // just today
export const STARTUP_FHR_WARM_PHASE2_DAYS_BACK = 6; // today - 6 = last 7d
