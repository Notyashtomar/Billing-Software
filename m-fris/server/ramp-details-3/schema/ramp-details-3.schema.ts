import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type RampDetails3Document = RampDetails3 & Document;

@Schema({ _id: false })
export class EmployeeAllocationRow {
  @Prop({ default: '' })
  employeeCode: string;

  @Prop({ default: '' })
  employeeName: string;

  @Prop({ default: '' })
  area: string;

  @Prop({ default: '' })
  dutyAllocation: string;

  @Prop({ default: '' })
  remarks: string;
}
const EmployeeAllocationRowSchema = SchemaFactory.createForClass(
  EmployeeAllocationRow,
);

@Schema({ timestamps: true, collection: 'rampDetails3' })
export class RampDetails3 {
  @Prop({ required: true })
  serialNo: number;

  @Prop({ default: '' })
  fhrNo: string;

  @Prop({ default: '' })
  Airline: string;

  @Prop({ default: '' })
  FlightNo: string;

  @Prop({ default: '' })
  aircraft: string;

  @Prop({ default: '' })
  Typeofflight: string;

  @Prop({ default: '' })
  STADate: string;

  @Prop({ default: '' })
  STATime: string;

  @Prop({ default: '' })
  STDDate: string;

  @Prop({ default: '' })
  STDTime: string;

  @Prop({ default: '' })
  Route: string;

  @Prop({ default: '' })
  ATADate: string;

  @Prop({ default: '' })
  ATATime: string;

  @Prop({ default: '' })
  ATDDate: string;

  @Prop({ default: '' })
  ATDTime: string;

  @Prop({ type: [EmployeeAllocationRowSchema], default: [] })
  employeeAllocations: EmployeeAllocationRow[];
}

export const RampDetails3Schema = SchemaFactory.createForClass(RampDetails3);

// Station segregation (rollout: required:false). No legacy unique index existed.
RampDetails3Schema.plugin(stationAwarePlugin, { required: false });
RampDetails3Schema.index({ stationCode: 1, serialNo: 1 });
