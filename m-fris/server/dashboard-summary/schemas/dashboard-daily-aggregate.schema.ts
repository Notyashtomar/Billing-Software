import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import {
  ALL_DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';

export type DashboardDailyAggregateDocument = DashboardDailyAggregate & Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * INTERNAL worker-only day shards — not read by HTTP APIs or the frontend.
 * {@link DashboardCardGeneratorService} merges these into `dashboard_summaries`.
 */
@Schema({
  timestamps: true,
  collection: 'dashboard_daily_aggregates',
  versionKey: false,
  minimize: false,
})
export class DashboardDailyAggregate {
  /** Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA. */
  stationCode: string;

  @Prop({ type: String, required: true, trim: true, match: YMD_PATTERN })
  date: string;

  @Prop({
    type: String,
    required: true,
    enum: ALL_DASHBOARD_AGGREGATE_TYPES,
  })
  aggregateType: DashboardAggregateType;

  /** `4h` / `6h` for equipment utilization; empty string otherwise. */
  @Prop({ type: String, default: '', enum: ['', '4h', '6h'] })
  equipmentMode: '' | '4h' | '6h';

  @Prop({
    type: Date,
    required: true,
    default: (): Date => new Date(),
  })
  generatedAt: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  perf: Record<string, unknown>;

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

export const DashboardDailyAggregateSchema = SchemaFactory.createForClass(
  DashboardDailyAggregate,
);

// required:false so legacy MAA shards (no stationCode yet) keep working before
// the manual backfill; new shards are stamped from the materializing station.
DashboardDailyAggregateSchema.plugin(stationAwarePlugin, { required: false });

// Per-station uniqueness (replaces the legacy global `uniq_date_type_mode` —
// see station-collections.config indexSwaps).
DashboardDailyAggregateSchema.index(
  { stationCode: 1, date: 1, aggregateType: 1, equipmentMode: 1 },
  { unique: true, name: 'uniq_station_date_type_mode' },
);

DashboardDailyAggregateSchema.index(
  { generatedAt: -1 },
  { name: 'generatedAt_desc' },
);

DashboardDailyAggregateSchema.index({ aggregateType: 1 }, { name: 'aggregateType' });

DashboardDailyAggregateSchema.index({ date: 1 }, { name: 'date' });

DashboardDailyAggregateSchema.index(
  { isStale: 1, date: 1 },
  { name: 'stale_date' },
);

export const DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION = {
  _id: 1,
  stationCode: 1,
  date: 1,
  aggregateType: 1,
  equipmentMode: 1,
  generatedAt: 1,
  data: 1,
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
