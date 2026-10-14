import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import type { DashboardEquipmentMode } from '../interfaces';
import {
  DASHBOARD_SUMMARY_CARDS_ONLY_PROJECTION,
  DASHBOARD_SUMMARY_DRILLDOWN_PROJECTION,
  DASHBOARD_SUMMARY_LEAN_PROJECTION,
} from './dashboard-summary.schema';

export type NsDashboardSummaryDocument = NsDashboardSummary & Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Non-scheduled mirror of `dashboard_summaries`.
 * Source: `ns_fhr_collection` via `ns_dashboard_daily_aggregates`.
 */
@Schema({
  timestamps: true,
  collection: 'ns_dashboard_summaries',
  versionKey: false,
  minimize: false,
})
export class NsDashboardSummary {
  stationCode: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    match: YMD_PATTERN,
  })
  summaryDate: string;

  @Prop({
    type: String,
    required: true,
    enum: ['4h', '6h'] satisfies DashboardEquipmentMode[],
  })
  equipmentMode: DashboardEquipmentMode;

  @Prop({
    type: Date,
    required: true,
    default: (): Date => new Date(),
  })
  generatedAt: Date;

  @Prop({
    type: MongooseSchema.Types.Mixed,
    required: true,
  })
  cards: Record<string, unknown>;

  @Prop({
    type: MongooseSchema.Types.Mixed,
    required: true,
  })
  perf: Record<string, unknown>;

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

export const NsDashboardSummarySchema =
  SchemaFactory.createForClass(NsDashboardSummary);

NsDashboardSummarySchema.plugin(stationAwarePlugin, { required: false });

NsDashboardSummarySchema.index(
  { stationCode: 1, summaryDate: 1, equipmentMode: 1 },
  { unique: true, name: 'uniq_station_day_mode' },
);

NsDashboardSummarySchema.index(
  { generatedAt: -1 },
  { name: 'generatedAt_desc' },
);

NsDashboardSummarySchema.index(
  { summaryDate: 1, equipmentMode: 1, generatedAt: -1 },
  { name: 'day_generatedAt' },
);

NsDashboardSummarySchema.index(
  { isStale: 1, generatedAt: 1 },
  { name: 'stale_generated' },
);

export const NS_DASHBOARD_SUMMARY_LEAN_PROJECTION =
  DASHBOARD_SUMMARY_LEAN_PROJECTION;
export const NS_DASHBOARD_SUMMARY_CARDS_ONLY_PROJECTION =
  DASHBOARD_SUMMARY_CARDS_ONLY_PROJECTION;
export const NS_DASHBOARD_SUMMARY_DRILLDOWN_PROJECTION =
  DASHBOARD_SUMMARY_DRILLDOWN_PROJECTION;
