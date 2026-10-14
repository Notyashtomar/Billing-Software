import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShippedBagDocument = HydratedDocument<ShippedBag>;

@Schema({ _id: false })
export class ShippedBagRow {
  @Prop({ required: true })
  id: string;

  @Prop({ default: '' })
  optionSection: string;

  @Prop({ default: '' })
  remarks: string;
}

const ShippedBagRowSchema = SchemaFactory.createForClass(ShippedBagRow);

@Schema({ timestamps: true, collection: 'shipped-bags' })
export class ShippedBag {
  /** Flight instance serial (same as schedule `slNo` / Main Details flight serial). */
  @Prop({ required: true, unique: true, trim: true })
  flightSerial: string;

  @Prop({ default: '' })
  noOfBags: string;

  @Prop({ type: [ShippedBagRowSchema], default: [] })
  rows: ShippedBagRow[];
}

export const ShippedBagSchema = SchemaFactory.createForClass(ShippedBag);
