import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BILLING_COLLECTION } from './billing-collection.constants';

export type BillingRootDocument = BillingRoot & Document;

/**
 * Base schema — all billing entities live in the `billing` collection.
 * `docType` discriminates document shape (customer, settings, invoice_header, …).
 */
@Schema({
  collection: BILLING_COLLECTION,
  discriminatorKey: 'docType',
  timestamps: true,
})
export class BillingRoot {}

export const BillingRootSchema = SchemaFactory.createForClass(BillingRoot);
BillingRootSchema.index({ docType: 1 });
BillingRootSchema.index({ docType: 1, stationCode: 1 });
