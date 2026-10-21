import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BillingDocType } from './billing-collection.constants';

export type BillingEquipmentMasterDocument = BillingEquipmentMaster & Document;

@Schema({ _id: false })
export class BillingEquipmentMasterUom {
  @Prop({ default: '', trim: true })
  uom: string;

  @Prop({ default: '', trim: true })
  abbreviation: string;
}

const BillingEquipmentMasterUomSchema = SchemaFactory.createForClass(BillingEquipmentMasterUom);

/**
 * Global equipment, service, and manpower catalog.
 * Shared by every station. `stationCode` stays GLOBAL so station filters do not split it.
 */
@Schema()
export class BillingEquipmentMaster {
  @Prop({ required: true, default: 'GLOBAL', trim: true, uppercase: true })
  stationCode: string;

  @Prop({ default: 0 })
  sortIndex: number;

  /** Sheet column "No." — equipment or service code. */
  @Prop({ default: '', trim: true })
  itemNo: string;

  @Prop({ default: '', trim: true })
  description: string;

  /** Sheet column "Unit Type" — equipment, service, or manpower. */
  @Prop({ default: '', trim: true })
  unitType: string;

  @Prop({ type: [BillingEquipmentMasterUomSchema], default: [] })
  uoms: BillingEquipmentMasterUom[];
}

export const BillingEquipmentMasterSchema =
  SchemaFactory.createForClass(BillingEquipmentMaster);
BillingEquipmentMasterSchema.index(
  { sortIndex: 1, itemNo: 1 },
  { partialFilterExpression: { docType: BillingDocType.EquipmentMaster } },
);
