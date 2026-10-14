import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Per–GSE line item embedded on `fhr_collection` (equipment / GSE report).
 */
@Schema({ _id: false })
export class FhrEquipmentDetailItem {
  @Prop({ default: '' })
  equipment_name: string;

  @Prop()
  equipment_quantity?: number;

  @Prop({ default: '' })
  from_date: string;

  @Prop({ default: '' })
  from_time: string;

  @Prop({ default: '' })
  to_date: string;

  @Prop({ default: '' })
  to_time: string;

  /** Engaged time (e.g. from Excel "Usages Time" / report "Eng. time"). */
  @Prop({ default: '' })
  usage_time: string;

  @Prop({ default: '' })
  remarks: string;

  /** Operator assigned on Equipment & Manpower form (GSE report). */
  @Prop({ default: '' })
  employee_name: string;

  @Prop({ default: '' })
  employee_id: string;

  @Prop({ default: '' })
  designation: string;
}

export const FhrEquipmentDetailItemSchema = SchemaFactory.createForClass(
  FhrEquipmentDetailItem,
);
