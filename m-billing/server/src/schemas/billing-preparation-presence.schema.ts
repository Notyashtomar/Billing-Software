import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BillingPreparationPresenceDocument = BillingPreparationPresence & Document;

/**
 * Soft advisory presence for Preparation multi-user overlap alerts.
 * Own collection (TTL) — not part of the billing discriminator root.
 */
@Schema({ collection: 'billing_preparation_presence', timestamps: true })
export class BillingPreparationPresence {
  @Prop({ required: true, uppercase: true, trim: true, index: true })
  stationCode!: string;

  @Prop({ required: true, trim: true })
  sessionId!: string;

  @Prop({ required: true, trim: true })
  userId!: string;

  @Prop({ required: true, trim: true })
  userName!: string;

  @Prop({ required: true, uppercase: true, trim: true })
  customerCode!: string;

  @Prop({ required: true, enum: ['BHS', 'ADS'], uppercase: true, trim: true })
  category!: 'BHS' | 'ADS';

  @Prop({ type: [String], default: [] })
  flightKeys!: string[];

  @Prop({ trim: true })
  periodFrom?: string;

  @Prop({ trim: true })
  periodTo?: string;

  @Prop({ required: true, type: Date })
  lastSeenAt!: Date;

  @Prop({ required: true, type: Date, index: true })
  expiresAt!: Date;
}

export const BillingPreparationPresenceSchema = SchemaFactory.createForClass(
  BillingPreparationPresence,
);

BillingPreparationPresenceSchema.index(
  { stationCode: 1, sessionId: 1, customerCode: 1, category: 1 },
  { unique: true },
);
BillingPreparationPresenceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
BillingPreparationPresenceSchema.index({
  stationCode: 1,
  customerCode: 1,
  category: 1,
  lastSeenAt: -1,
});
