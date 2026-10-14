import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceScheduleEquipmentDocument = AdvanceScheduleEquipment &
  Document;

/** Advance → Schedule → Scheduled Airline Equipment setup. */
@Schema({ timestamps: true, collection: 'advance-schedule-equipment' })
export class AdvanceScheduleEquipment {
  @Prop({ required: true, trim: true })
  airlineName: string;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  airlineCode: string;

  @Prop({ required: true, trim: true, uppercase: true })
  aircraftBody: string;

  @Prop({ default: false })
  splitOperation: boolean;

  @Prop({ required: true, trim: true })
  equipmentName: string;

  @Prop({ required: true, trim: true, uppercase: true })
  equipmentCode: string;

  @Prop({ default: false })
  timeRequired: boolean;

  @Prop({ default: 'ATA', trim: true, uppercase: true })
  option1Basis: string;

  @Prop({ default: 'Minus', trim: true })
  option1Sign: string;

  @Prop({ default: 0 })
  option1Minutes: number;

  @Prop({ default: 'ATD', trim: true, uppercase: true })
  option2Basis: string;

  @Prop({ default: 'Plus', trim: true })
  option2Sign: string;

  @Prop({ default: 0 })
  option2Minutes: number;

  @Prop({ default: '', trim: true })
  remarks: string;

  @Prop({ default: true })
  active: boolean;

  stationCode: string;
}

export const AdvanceScheduleEquipmentSchema = SchemaFactory.createForClass(
  AdvanceScheduleEquipment,
);

AdvanceScheduleEquipmentSchema.plugin(stationAwarePlugin, { required: false });

AdvanceScheduleEquipmentSchema.index(
  {
    airlineCode: 1,
    aircraftBody: 1,
    equipmentCode: 1,
    splitOperation: 1,
    stationCode: 1,
  },
  { unique: true },
);
