import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type DashboardKpiFlightDocument = DashboardKpiFlight & Document;

@Schema({
  timestamps: true,
  collection: 'dashboard_kpi_flights',
  strict: false,
})
export class DashboardKpiFlight {
  @Prop({ type: Object, required: true })
  data: Record<string, unknown>;

  /** Multi-station segregation key (added by stationAwarePlugin). */
  stationCode: string;
}

export const DashboardKpiFlightSchema =
  SchemaFactory.createForClass(DashboardKpiFlight);

// Station segregation: mandatory, immutable, indexed `stationCode`.
DashboardKpiFlightSchema.plugin(stationAwarePlugin);
