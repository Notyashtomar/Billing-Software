import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceNsContactDocument = AdvanceNsContact & Document;

/** Advance → Non-scheduled airline contacts (master for NS Main Details Airline Rep). */
@Schema({ timestamps: true, collection: 'ns-advance-contact' })
export class AdvanceNsContact {
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
   */
  stationCode: string;
}

export const AdvanceNsContactSchema =
  SchemaFactory.createForClass(AdvanceNsContact);

AdvanceNsContactSchema.plugin(stationAwarePlugin, { required: false });
