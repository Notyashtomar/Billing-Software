import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type RampDetails2Document = RampDetails2 & Document;

@Schema({ timestamps: true, collection: 'rampDetails2' })
export class RampDetails2 {
  @Prop({ required: true })
  serialNo: number;

  @Prop({ default: '' })
  fhrNo: string;

  @Prop({ default: '' })
  chooseEmployee: string;

  @Prop({ default: '' })
  name: string;

  @Prop({ default: '' })
  area: string;

  @Prop({ default: '' })
  dutyAllocation: string;

  @Prop({ default: '' })
  remarks: string;

  @Prop({ default: '' })
  aircraft: string;

  @Prop({ default: '' })
  STATime: string;

  @Prop({ default: '' })
  Route: string;

  @Prop({ default: '' })
  ATDDate: string;

  @Prop({ default: '' })
  Airline: string;

  @Prop({ default: '' })
  Typeofflight: string;

  @Prop({ default: '' })
  STDDate: string;

  @Prop({ default: '' })
  ATADate: string;

  @Prop({ default: '' })
  ATDTime: string;

  @Prop({ default: '' })
  FlightNo: string;

  @Prop({ default: '' })
  STADate: string;

  @Prop({ default: '' })
  STDTime: string;

  @Prop({ default: '' })
  ATATime: string;
}

export const RampDetails2Schema = SchemaFactory.createForClass(RampDetails2);

// Station segregation (rollout: required:false). No legacy unique index existed.
RampDetails2Schema.plugin(stationAwarePlugin, { required: false });
RampDetails2Schema.index({ stationCode: 1, serialNo: 1 });
