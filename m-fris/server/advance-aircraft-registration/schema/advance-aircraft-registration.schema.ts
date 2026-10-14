import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceAircraftRegistrationDocument = AdvanceAircraftRegistration &
  Document;

@Schema({ timestamps: true, collection: 'advance-aircraft-registration' })
export class AdvanceAircraftRegistration {
  @Prop({ default: '' })
  airline: string;

  @Prop({ default: '' })
  regnNo: string;

  @Prop({ default: '' })
  aircraft: string;

  @Prop({ default: '' })
  mtow: string;

  @Prop({ default: true })
  active: boolean;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only.
   */
  stationCode: string;
}

export const AdvanceAircraftRegistrationSchema = SchemaFactory.createForClass(
  AdvanceAircraftRegistration,
);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceAircraftRegistrationSchema.plugin(stationAwarePlugin, {
  required: false,
});
