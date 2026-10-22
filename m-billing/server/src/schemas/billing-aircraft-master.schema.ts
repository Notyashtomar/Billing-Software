import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BillingDocType } from './billing-collection.constants';

export type BillingAircraftMasterDocument = BillingAircraftMaster & Document;

@Schema()
export class BillingAircraftMaster {
  /** Shared catalog. GLOBAL so every station sees the same aircraft master. */
  @Prop({ required: true, default: 'GLOBAL', trim: true, uppercase: true })
  stationCode: string;

  @Prop({ default: 0 })
  sortIndex: number;

  @Prop({ default: '' })
  serialNo: string;

  @Prop({ default: '' })
  aircraftType: string;

  @Prop({ default: '' })
  icaoCode: string;

  @Prop({ default: '' })
  mtowKg: string;

  @Prop({ default: '' })
  passengerCapacity: string;

  @Prop({ default: '' })
  manufacturer: string;

  @Prop({ default: '' })
  aircraftBody: string;

  @Prop({ default: '' })
  wingspanM: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  active: string;

  @Prop({ default: '' })
  category: string;

  /** Second Category column on the sheet (A, B, C, E). */
  @Prop({ default: '' })
  categoryCode: string;

  /** Second "Active" column on the import sheet. */
  @Prop({ default: '' })
  activeSecondary: string;

  @Prop({ default: '' })
  ceilingRate: string;

  @Prop({ default: '' })
  arrayRate: string;

  /** Date the ceiling and Aera rates apply until. */
  @Prop({ default: '' })
  validTill: string;
}

export const BillingAircraftMasterSchema =
  SchemaFactory.createForClass(BillingAircraftMaster);
BillingAircraftMasterSchema.index(
  { stationCode: 1, sortIndex: 1 },
  { partialFilterExpression: { docType: BillingDocType.AircraftMaster } },
);
