import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceGatewayScheduledAirlineDocument =
  AdvanceGatewayScheduledAirline & Document;

@Schema({
  timestamps: true,
  collection: 'advance_gateway_scheduled_airline',
})
export class AdvanceGatewayScheduledAirline {
  @Prop({ default: '' })
  airlines: string;

  @Prop({ default: '' })
  code: string;

  @Prop({ default: 'Scheduled' })
  typeOfAirline: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ default: '' })
  address2: string;

  @Prop({ default: '' })
  reminderForInvoicing: string;

  @Prop({ default: '' })
  agreementValidFrom: string;

  @Prop({ default: '' })
  agreementValidTo: string;

  @Prop({ default: '' })
  emailId: string;

  @Prop({ default: false })
  changeScheduledEnable: boolean;

  @Prop({ default: 'Active' })
  type: string;

  @Prop({ default: false })
  linkAircraftRegistrationWithType: boolean;

  @Prop({ default: true })
  engineerReport: boolean;

  @Prop({ default: false })
  deepCleaning: boolean;

  @Prop({ default: false })
  nightHaltCleaning: boolean;

  @Prop({ default: false })
  exteriorCleaning: boolean;

  @Prop({ default: '' })
  dcsName: string;

  @Prop({ default: 'Comprehensive Handling' })
  handlingType: string;

  @Prop({ default: false })
  wheelchairService: boolean;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only.
   */
  stationCode: string;
}

export const AdvanceGatewayScheduledAirlineSchema = SchemaFactory.createForClass(
  AdvanceGatewayScheduledAirline,
);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceGatewayScheduledAirlineSchema.plugin(stationAwarePlugin, {
  required: false,
});
