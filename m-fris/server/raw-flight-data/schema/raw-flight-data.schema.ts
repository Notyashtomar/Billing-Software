import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type RawFlightDataDocument = RawFlightData & Document;

@Schema({ timestamps: true, collection: 'raw_flight_data', strict: false })
export class RawFlightData {
  @Prop({ type: Object, required: true })
  data: Record<string, any>;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Stored at the TOP LEVEL (sibling of `data`) so the free-form `data` bag and
   * all existing `data.*` serial filters stay untouched.
   */
  stationCode: string;
}

export const RawFlightDataSchema = SchemaFactory.createForClass(RawFlightData);

// Station segregation for raw flight rows. Strategy A (shared global serial
// pool) is unaffected: serials live inside `data` and stay globally unique;
// `stationCode` is for visibility/ownership only. required:false so legacy MAA
// rows (no stationCode yet) keep working before the manual backfill; new rows
// are stamped from the authenticated station in the service create paths.
RawFlightDataSchema.plugin(stationAwarePlugin, { required: false });

// Hot-path indexes for scheduled billing joins by serial fields.
RawFlightDataSchema.index({ 'data.Serial No': 1 });
RawFlightDataSchema.index({ 'data.SlNo': 1 });
RawFlightDataSchema.index({ 'data.serialNo': 1 });
RawFlightDataSchema.index({ stationCode: 1, 'data.Serial No': 1 });
RawFlightDataSchema.index({ stationCode: 1, 'data.SlNo': 1 });
RawFlightDataSchema.index({ stationCode: 1, 'data.serialNo': 1 });
