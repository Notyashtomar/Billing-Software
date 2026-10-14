import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RepresentativeSignatureDocument = RepresentativeSignature & Document;

/** Representative categories supported by the reusable signature repository. */
export const REPRESENTATIVE_TYPES = [
  'GH_REPRESENTATIVE',
  'AIRLINE_REPRESENTATIVE',
] as const;
export type RepresentativeType = (typeof REPRESENTATIVE_TYPES)[number];

/**
 * Centralized, reusable representative signatures shared across FHR, GSE and
 * Team reports. A representative draws their signature once; future reports
 * auto-fetch and reuse it (with an explicit override path).
 */
@Schema({ timestamps: true, collection: 'representative_signatures' })
export class RepresentativeSignature {
  @Prop({ required: true, trim: true })
  representativeName: string;

  /** Lower-cased, trimmed name used for case-insensitive lookups. */
  @Prop({ required: true, trim: true, lowercase: true, index: true })
  nameKey: string;

  @Prop({ type: String, required: true, enum: REPRESENTATIVE_TYPES, index: true })
  representativeType: RepresentativeType;

  /** PNG/JPEG data URL (`data:image/png;base64,...`). */
  @Prop({ required: true })
  signatureUrl: string;

  @Prop({ default: '' })
  createdBy: string;

  @Prop({ default: '', trim: true, index: true })
  station: string;

  @Prop({ default: true, index: true })
  active: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RepresentativeSignatureSchema = SchemaFactory.createForClass(
  RepresentativeSignature,
);

// Fast lookups by representative type + normalized name.
RepresentativeSignatureSchema.index({ representativeType: 1, nameKey: 1, active: 1 });
RepresentativeSignatureSchema.index({ updatedAt: -1 });
