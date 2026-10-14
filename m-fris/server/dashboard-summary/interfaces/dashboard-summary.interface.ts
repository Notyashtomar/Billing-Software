/**
 * Precomputed FRIS dashboard card payloads stored in `dashboard_summaries`
 * (or `ns_dashboard_summaries` for non-scheduled).
 * Read-optimized: frontend loads these instead of aggregating from FHR source.
 */

import type { DashboardFlightScope } from '../constants/dashboard-flight-scope';

export type DashboardEquipmentMode = '4h' | '6h';

/** ISO calendar day `yyyy-MM-dd`. */
export type DashboardSummaryYmd = string;

export interface DashboardAirlineRemarksCard {
  from: DashboardSummaryYmd;
  to: DashboardSummaryYmd;
  total: number;
  blanks: number;
  buckets: { rating: string; count: number }[];
}

export interface DashboardAircraftCategoryMix {
  SIP: number;
  SIF: number;
  SDP: number;
  SDF: number;
  'SCH-I-P-NB': number;
  'SCH-I-P-WB': number;
  'SCH-D-P-NB': number;
  'SCH-D-P-WB': number;
  'SCH-I-F-NB': number;
  'SCH-I-F-WB': number;
  'SCH-D-F-NB': number;
  'SCH-D-F-WB': number;
  other: number;
  total: number;
}

export interface DashboardAircraftAnalysisCard {
  scheduled: DashboardAircraftCategoryMix;
  additional: DashboardAircraftCategoryMix;
}

export interface DashboardEquipmentUtilSlotRow {
  label: string;
  motorisedCount: number;
  motorisedPct: number;
  nonMotorisedCount: number;
  nonMotorisedPct: number;
  towableCount: number;
  towablePct: number;
  motorisedEquipment: { equipmentName: string; count: number }[];
  nonMotorisedEquipment: { equipmentName: string; count: number }[];
  towableEquipment: { equipmentName: string; count: number }[];
}

export interface DashboardEquipmentUtilizationCard {
  slots: DashboardEquipmentUtilSlotRow[];
  totalRow: {
    motorisedCount: number;
    motorisedPct: number;
    nonMotorisedCount: number;
    nonMotorisedPct: number;
    towableCount: number;
    towablePct: number;
  };
  categoryTotals: {
    motorisedCount: number;
    nonMotorisedCount: number;
    towableCount: number;
  };
  entryCount: number;
  unclassifiedCount: number;
}

/**
 * Named card slots. Stored as flexible Mixed in Mongo; these types document the expected shape.
 * Additional keys may be added without a migration.
 */
export interface DashboardSummaryCards {
  airlineRemarks: DashboardAirlineRemarksCard | Record<string, unknown>;
  aircraftAnalysis: DashboardAircraftAnalysisCard | Record<string, unknown>;
  equipmentUtilization:
    | DashboardEquipmentUtilizationCard
    | Record<string, unknown>;
  performanceReport: Record<string, unknown>;
  ghaImprovement: Record<string, unknown>;
  onTimePerformance: Record<string, unknown>;
  kpiStrip: Record<string, unknown>;
}

export interface DashboardSummaryPerf {
  sourceRows: number;
  aggregationMs: number;
  mongoWallMs?: number;
  staWindowCacheHit?: boolean;
}

/** Plain document returned from `.lean()` queries (no Mongoose Document methods). */
export interface DashboardSummaryLean {
  _id: string;
  /** Owning station; legacy rows = MAA. */
  stationCode?: string;
  /** Present on stored daily shards; omitted on composed (virtual) summaries. */
  summaryDate?: DashboardSummaryYmd;
  /** Request window start — for shards equals `summaryDate`; for composed reads equals requested `fromDate`. */
  fromDate: DashboardSummaryYmd;
  /** Request window end — for shards equals `summaryDate`; for composed reads equals requested `tillDate`. */
  tillDate: DashboardSummaryYmd;
  equipmentMode: DashboardEquipmentMode;
  generatedAt: Date;
  cards: DashboardSummaryCards;
  drilldowns?: Record<string, unknown>;
  perf: DashboardSummaryPerf;
  isStale?: boolean;
  sourceSnapshotAt?: Date;
  sourceVersion?: string;
  lastInvalidatedAt?: Date;
  refreshInProgress?: boolean;
  refreshFailedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Input for upsert / precompute writers — one calendar day only. */
export interface DashboardSummaryUpsertInput {
  summaryDate: DashboardSummaryYmd;
  equipmentMode: DashboardEquipmentMode;
  /** Concrete owning station to stamp/target (e.g. `MAA`, `AGR`). */
  stationCode?: string;
  /** `nonScheduled` writes `ns_dashboard_summaries`. Default scheduled. */
  flightScope?: DashboardFlightScope;
  generatedAt?: Date;
  cards: DashboardSummaryCards;
  drilldowns?: Record<string, unknown>;
  perf: DashboardSummaryPerf;
  isStale?: boolean;
  sourceSnapshotAt?: Date;
  sourceVersion?: string;
  lastInvalidatedAt?: Date;
  refreshInProgress?: boolean;
  /** Pass `null` (not `undefined`) to clear a prior failure — Mongo drops `undefined` keys from `$set`. */
  refreshFailedAt?: Date | null;
}

/** Natural key for a daily materialized shard. */
export interface DashboardSummaryShardKey {
  summaryDate: DashboardSummaryYmd;
  equipmentMode: DashboardEquipmentMode;
}

/** @deprecated Use {@link DashboardSummaryShardKey} — arbitrary range documents are removed. */
export type DashboardSummaryRangeKey = DashboardSummaryShardKey;
