import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type LoadControlDetailsDocument = LoadControlDetails & Document;

@Schema({ timestamps: true, collection: 'loadControlDetails' })
export class LoadControlDetails {
  @Prop({ required: true })
  serialNo: number;

  @Prop({ required: true, default: '' })
  airlinesOperator: string;

  @Prop({ default: '' })
  routing: string;

  @Prop({ default: '' })
  TypeCraft: string;

  @Prop({ default: '' })
  STDTime: string;

  @Prop({ required: true, default: '' })
  FlightNo: string;

  @Prop({ default: '' })
  Typeofflight: string;

  @Prop({ default: '' })
  STATime: string;

  @Prop({ default: '' })
  STADate: string;

  @Prop({ default: '' })
  STDDate: string;

  @Prop({ default: '' })
  loadingDiagramGivenAt: string;

  @Prop({ default: '' })
  loadingSheetPrintedAt: string;

  @Prop({ default: '' })
  loadingSheetDeliveredAt: string;

  @Prop({ default: '' })
  flightPlanFieldAt: string;

  @Prop({ default: '' })
  FICNO: string;

  @Prop({ default: '' })
  ADCNO: string;
}

export const LoadControlDetailsSchema =
  SchemaFactory.createForClass(LoadControlDetails);

// Station segregation (rollout: required:false). No legacy unique index existed.
LoadControlDetailsSchema.plugin(stationAwarePlugin, { required: false });
LoadControlDetailsSchema.index({ stationCode: 1, serialNo: 1 });
