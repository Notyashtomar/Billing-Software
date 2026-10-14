import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import type { DashboardEquipmentMode } from '../interfaces';

export type DashboardDrillType = 'performance' | 'airlineRemarks';

export type DashboardDrilldownDocument = DashboardDrilldown & Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Schema({
  timestamps: true,
  collection: 'dashboard_drilldowns',
  versionKey: false,
  minimize: false,
})
export class DashboardDrilldown {
  /** Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA. */
  stationCode: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    match: YMD_PATTERN,
  })
  fromDate: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    match: YMD_PATTERN,
  })
  tillDate: string;

  @Prop({
    type: String,
    required: true,
    enum: ['4h', '6h'] satisfies DashboardEquipmentMode[],
  })
  equipmentMode: DashboardEquipmentMode;

  @Prop({
    type: String,
    required: true,
    enum: ['performance', 'airlineRemarks'] satisfies DashboardDrillType[],
  })
  drillType: DashboardDrillType;

  @Prop({ type: Date, required: true, default: (): Date => new Date() })
  generatedAt: Date;

  /** Same monotonic version string family as `dashboard_summaries.sourceVersion`. */
  @Prop({ type: String, default: '0' })
  sourceVersion: string;

  @Prop({ type: Boolean, default: false })
  isStale: boolean;

  /** Snapshot identifier aligned with parent summary (`dashboard_summaries.sourceSnapshotAt`). */
  @Prop({ type: Date })
  sourceSnapshotAt?: Date;

  /** Materialized modal payload (compact rows + metadata). */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload: Record<string, unknown>;

  /** Total rows / flights in payload before optional HTTP slicing (for pagination). */
  @Prop({ type: Number, required: true })
  entryCount: number;
}

export const DashboardDrilldownSchema =
  SchemaFactory.createForClass(DashboardDrilldown);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the materializing station.
DashboardDrilldownSchema.plugin(stationAwarePlugin, { required: false });

// Per-station uniqueness (replaces the legacy global `uniq_drill_range_mode_type`).
DashboardDrilldownSchema.index(
  { stationCode: 1, fromDate: 1, tillDate: 1, equipmentMode: 1, drillType: 1 },
  { unique: true, name: 'uniq_station_drill_range_mode_type' },
);

DashboardDrilldownSchema.index(
  { generatedAt: -1 },
  { name: 'drilldown_generatedAt_desc' },
);

DashboardDrilldownSchema.index(
  { isStale: 1, generatedAt: 1 },
  { name: 'drilldown_stale_generated' },
);
