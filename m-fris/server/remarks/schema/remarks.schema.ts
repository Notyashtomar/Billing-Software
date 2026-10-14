import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type RemarksDocument = Remarks & Document;

@Schema({ timestamps: true, collection: 'remarks' })
export class Remarks {
  @Prop({ required: true })
  serialNo: number;

  @Prop({ default: '' })
  Airline: string;

  @Prop({ default: '' })
  FlightNo: string;

  @Prop({ default: false })
  toOpenInTab: boolean;

  @Prop({ default: '' })
  PaxGHAirlineRep_Name: string;

  /** Canonical GH remarks (workbook column `ghremarks` / form `ghRemarks`). Kept in sync with `PaxGHAirlineRep_Name` on save. */
  @Prop({ default: '' })
  ghRemarks: string;

  /** Canonical GH representative name (workbook column `ghrep` / form `ghRep`). Kept in sync with `PAX_Airline_SignByDate` on save. */
  @Prop({ default: '' })
  ghRep: string;

  @Prop({ default: '' })
  AirRepRem: string;

  @Prop({ default: '' })
  airlineRemarksRating: string;

  @Prop({ default: '' })
  flightStaDateIso: string;

  @Prop({ default: false })
  wantFeedback: boolean;

  @Prop({ default: '' })
  feedbackRemarks: string;

  @Prop({ default: '' })
  PAX_Airline_SignByDate: string;

  @Prop({ default: '' })
  airrep: string;

  @Prop({ default: false })
  flightCancelled: boolean;
}

export const RemarksSchema = SchemaFactory.createForClass(Remarks);

// Station segregation (rollout: required:false). No legacy unique index existed.
RemarksSchema.plugin(stationAwarePlugin, { required: false });
RemarksSchema.index({ stationCode: 1, serialNo: 1 });
RemarksSchema.index({ stationCode: 1, flightStaDateIso: 1 });
