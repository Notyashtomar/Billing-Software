import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import type { DashboardEquipmentMode } from '../interfaces';

export type DashboardSummaryDocument = DashboardSummary & Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Schema({
  timestamps: true,
  collection: 'dashboard_summaries',
  versionKey: false,
  minimize: false,
})
export class DashboardSummary {
  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Part of the per-station unique key so two stations can each own a shard for
   * the same calendar day + mode without colliding.
   */
  stationCode: string;

  /**
   * Single operating day this shard summarizes (STA window / `yyyy-MM-dd`).
   * Arbitrary multi-day ranges are composed in memory from daily shards only.
   */
  @Prop({
    type: String,
    required: true,
    trim: true,
    match: YMD_PATTERN,
  })
  summaryDate: string;

  /** Equipment utilization slab mode for the stored `equipmentUtilization` card. */
  @Prop({
    type: String,
    required: true,
    enum: ['4h', '6h'] satisfies DashboardEquipmentMode[],
  })
  equipmentMode: DashboardEquipmentMode;

  /** When this snapshot was computed (distinct from Mongoose `updatedAt`). */
  @Prop({
    type: Date,
    required: true,
    default: (): Date => new Date(),
  })
  generatedAt: Date;

  /**
   * Precomputed card payloads (`airlineRemarks`, `aircraftAnalysis`, `equipmentUtilization`, …).
   * Mixed allows evolving card shapes without schema migrations.
   */
  @Prop({
    type: MongooseSchema.Types.Mixed,
    required: true,
  })
  cards: Record<string, unknown>;

  /** Writer metadata (row counts, timing, cache flags). */
  @Prop({
    type: MongooseSchema.Types.Mixed,
    required: true,
  })
  perf: Record<string, unknown>;

  /**
   * Daily modal drill-down payloads (performance flight lists, airline remark rows, …).
   * Merged across days on read when the user selects a multi-day range.
   */
  @Prop({ type: MongooseSchema.Types.Mixed })
  drilldowns?: Record<string, unknown>;

  @Prop({ type: Boolean, default: false })
  isStale: boolean;

  @Prop({ type: Date })
  sourceSnapshotAt?: Date;

  @Prop({ type: String, default: '0' })
  sourceVersion: string;

  @Prop({ type: Date })
  lastInvalidatedAt?: Date;

  @Prop({ type: Boolean, default: false })
  refreshInProgress: boolean;

  @Prop({ type: Date })
  refreshFailedAt?: Date;
}

export const DashboardSummarySchema =
  SchemaFactory.createForClass(DashboardSummary);

// required:false so legacy MAA shards (no stationCode yet) keep working before
// the manual backfill; new shards are stamped from the materializing station.
DashboardSummarySchema.plugin(stationAwarePlugin, { required: false });

/**
 * Indexes (created on app bootstrap via Mongoose).
 *
 * - `uniq_station_day_mode`: one summary shard per station + calendar day +
 *   equipment slab mode (replaces the legacy global `uniq_day_mode`).
 * - `generatedAt_desc`: fast “latest snapshots” / stale checks.
 * - `day_generatedAt`: optional compound for day-scoped freshness queries.
 */
DashboardSummarySchema.index(
  { stationCode: 1, summaryDate: 1, equipmentMode: 1 },
  { unique: true, name: 'uniq_station_day_mode' },
);

DashboardSummarySchema.index(
  { generatedAt: -1 },
  { name: 'generatedAt_desc' },
);

DashboardSummarySchema.index(
  { summaryDate: 1, equipmentMode: 1, generatedAt: -1 },
  { name: 'day_generatedAt' },
);

DashboardSummarySchema.index(
  { isStale: 1, generatedAt: 1 },
  { name: 'stale_generated' },
);

/** Lean read projection — omit version noise, keep card payload fields only. */
export const DASHBOARD_SUMMARY_LEAN_PROJECTION = {
  _id: 1,
  stationCode: 1,
  summaryDate: 1,
  equipmentMode: 1,
  generatedAt: 1,
  cards: 1,
  drilldowns: 1,
  perf: 1,
  isStale: 1,
  sourceSnapshotAt: 1,
  sourceVersion: 1,
  lastInvalidatedAt: 1,
  refreshInProgress: 1,
  refreshFailedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

/** Bird dashboard card bundles — excludes heavy `drilldowns` on hot path / range tiles. */
export const DASHBOARD_SUMMARY_CARDS_ONLY_PROJECTION = {
  _id: 1,
  stationCode: 1,
  summaryDate: 1,
  equipmentMode: 1,
  generatedAt: 1,
  cards: 1,
  perf: 1,
  isStale: 1,
  sourceSnapshotAt: 1,
  sourceVersion: 1,
  lastInvalidatedAt: 1,
  refreshInProgress: 1,
  refreshFailedAt: 1,
} as const;

/** Drill merge path — `drilldowns` + identity fields only (no card blobs). */
export const DASHBOARD_SUMMARY_DRILLDOWN_PROJECTION = {
  stationCode: 1,
  summaryDate: 1,
  equipmentMode: 1,
  generatedAt: 1,
  drilldowns: 1,
  isStale: 1,
  perf: 1,
} as const;
