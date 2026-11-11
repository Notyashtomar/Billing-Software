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

  /**
   * Trip / unit count parsed from `remarks` (e.g. `02 trip`, `01 TRIP FOR DEP`).
   * Per-trip equipment bills this count. Absent when remarks are duration only.
   */
  @Prop()
  remarks_quantity?: number;

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
