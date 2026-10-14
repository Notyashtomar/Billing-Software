import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import type { DashboardEquipmentMode } from '../interfaces';
import type { DashboardDrillType } from './dashboard-drilldown.schema';

export type NsDashboardDrilldownDocument = NsDashboardDrilldown & Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Non-scheduled mirror of `dashboard_drilldowns`.
 * Primary drill reads still use embedded `ns_dashboard_summaries.drilldowns`;
 * this collection keeps parity with the scheduled architecture.
 */
@Schema({
  timestamps: true,
  collection: 'ns_dashboard_drilldowns',
  versionKey: false,
  minimize: false,
})
export class NsDashboardDrilldown {
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

  @Prop({ type: String, default: '0' })
  sourceVersion: string;

  @Prop({ type: Boolean, default: false })
  isStale: boolean;

  @Prop({ type: Date })
  sourceSnapshotAt?: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: Number, required: true })
  entryCount: number;
}

export const NsDashboardDrilldownSchema = SchemaFactory.createForClass(
  NsDashboardDrilldown,
);

NsDashboardDrilldownSchema.plugin(stationAwarePlugin, { required: false });

NsDashboardDrilldownSchema.index(
  { stationCode: 1, fromDate: 1, tillDate: 1, equipmentMode: 1, drillType: 1 },
  { unique: true, name: 'uniq_station_drill_range_mode_type' },
);

NsDashboardDrilldownSchema.index(
  { generatedAt: -1 },
  { name: 'drilldown_generatedAt_desc' },
);

NsDashboardDrilldownSchema.index(
  { isStale: 1, generatedAt: 1 },
  { name: 'drilldown_stale_generated' },
);
