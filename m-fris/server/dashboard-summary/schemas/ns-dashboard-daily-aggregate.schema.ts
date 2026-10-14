import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import {
  ALL_DASHBOARD_AGGREGATE_TYPES,
  type DashboardAggregateType,
} from '../constants/dashboard-aggregate-types';
import { DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION } from './dashboard-daily-aggregate.schema';

export type NsDashboardDailyAggregateDocument = NsDashboardDailyAggregate &
  Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Non-scheduled mirror of `dashboard_daily_aggregates`.
 * Source: `ns_fhr_collection`. Same shard key shape as scheduled.
 */
@Schema({
  timestamps: true,
  collection: 'ns_dashboard_daily_aggregates',
  versionKey: false,
  minimize: false,
})
export class NsDashboardDailyAggregate {
  stationCode: string;

  @Prop({ type: String, required: true, trim: true, match: YMD_PATTERN })
  date: string;

  @Prop({
    type: String,
    required: true,
    enum: ALL_DASHBOARD_AGGREGATE_TYPES,
  })
  aggregateType: DashboardAggregateType;

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

export const NsDashboardDailyAggregateSchema = SchemaFactory.createForClass(
  NsDashboardDailyAggregate,
);

NsDashboardDailyAggregateSchema.plugin(stationAwarePlugin, { required: false });

NsDashboardDailyAggregateSchema.index(
  { stationCode: 1, date: 1, aggregateType: 1, equipmentMode: 1 },
  { unique: true, name: 'uniq_station_date_type_mode' },
);

NsDashboardDailyAggregateSchema.index(
  { generatedAt: -1 },
  { name: 'generatedAt_desc' },
);

NsDashboardDailyAggregateSchema.index(
  { aggregateType: 1 },
  { name: 'aggregateType' },
);

NsDashboardDailyAggregateSchema.index({ date: 1 }, { name: 'date' });

NsDashboardDailyAggregateSchema.index(
  { isStale: 1, date: 1 },
  { name: 'stale_date' },
);

export const NS_DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION =
  DASHBOARD_DAILY_AGGREGATE_LEAN_PROJECTION;
