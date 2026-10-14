import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Master rows from Equipment Master.xlsx (abbr ← No., description, unit_type). */
@Schema({ _id: false })
export class EquipmentManpowerCatalogItem {
  @Prop({ default: '' })
  abbr: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  unit_type: string;

  /** Motorised / non-motorised / towable (`M` | `NM` | `T`) for dashboard equipment utilization. */
  @Prop({ default: '' })
  category?: string;
}

export const EquipmentManpowerCatalogItemSchema = SchemaFactory.createForClass(
  EquipmentManpowerCatalogItem,
);
