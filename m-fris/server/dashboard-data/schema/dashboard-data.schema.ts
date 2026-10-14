import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type DashboardDataDocument = DashboardData & Document;

@Schema({
  timestamps: true,
  collection: 'dashboard_data',
  strict: false,
})
export class DashboardData {
  @Prop({ type: String, required: true })
  flightId: string;

  /** Multi-station segregation key (added by stationAwarePlugin). */
  stationCode: string;
}

export const DashboardDataSchema = SchemaFactory.createForClass(DashboardData);

// Station segregation: mandatory, immutable, indexed `stationCode`.
DashboardDataSchema.plugin(stationAwarePlugin);
