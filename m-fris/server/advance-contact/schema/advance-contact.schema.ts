import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceContactDocument = AdvanceContact & Document;

@Schema({ timestamps: true, collection: 'advance-contact' })
export class AdvanceContact {
  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  contact: string;

  @Prop({ default: '' })
  airline: string;

  @Prop({ default: '' })
  airlineRepresentative: string;

  @Prop({ default: '' })
  mobileNo: string;

  @Prop({ default: '' })
  weekDay: string;

  @Prop({ default: '' })
  companyName: string;

  /** PNG/JPEG data URL for airline representative signatures. */
  @Prop({ default: '' })
  signatureUrl: string;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only.
   */
  stationCode: string;
}

export const AdvanceContactSchema =
  SchemaFactory.createForClass(AdvanceContact);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceContactSchema.plugin(stationAwarePlugin, { required: false });
