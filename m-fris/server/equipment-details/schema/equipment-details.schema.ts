import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type EquipmentDetailsDocument = EquipmentDetails & Document;

@Schema({ timestamps: true, collection: 'equipmentDetails' })
export class EquipmentDetails {
  @Prop({ default: '' })
  gsename: string;

  @Prop({ default: '' })
  gsecode: string;

  @Prop({ default: '' })
  empname: string;

  @Prop({ default: '' })
  empcode: string;

  @Prop({ default: '' })
  designation: string;

  @Prop({ default: '' })
  fromdate: string;

  @Prop({ default: '' })
  todate: string;

  @Prop({ default: '' })
  fromtime: string;

  @Prop({ default: '' })
  totime: string;

  @Prop({ default: '' })
  engagetime: string;
}

export const EquipmentDetailsSchema =
  SchemaFactory.createForClass(EquipmentDetails);

// Station segregation (rollout: required:false). No legacy unique index existed.
EquipmentDetailsSchema.plugin(stationAwarePlugin, { required: false });
