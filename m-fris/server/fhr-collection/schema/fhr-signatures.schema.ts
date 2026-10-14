import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Lifecycle status for the FHR document once representative signatures are captured. */
export const FHR_STATUSES = ['DRAFT', 'FINALIZED'] as const;
export type FhrStatus = (typeof FHR_STATUSES)[number];

/**
 * Digital representative signatures captured in the Main Details form.
 * Signature images are stored as data URLs (PNG base64) inside the embedded document.
 */
@Schema({ _id: false })
export class FhrSignatures {
  // ---- GH representative (auto-filled from the authenticated user) ----
  @Prop({ default: '' })
  ghRepresentativeName: string;

  /**
   * Reference to the reusable `representative_signatures` record. Preferred
   * source of truth — the image is resolved from the repository at render time.
   */
  @Prop({ default: '' })
  ghSignatureId: string;

  /**
   * Legacy / denormalized PNG data URL. Kept for backward compatibility and as
   * a fallback when no repository reference exists. Empty when not yet signed.
   */
  @Prop({ default: '' })
  ghSignatureUrl: string;

  @Prop({ type: Date, default: null })
  ghSignedAt: Date | null;

  @Prop({ default: '' })
  ghSignedByUserId: string;

  // ---- Airline representative (name comes from Main Details) ----
  @Prop({ default: '' })
  airlineRepresentativeName: string;

  @Prop({ default: '' })
  airlineSignatureId: string;

  @Prop({ default: '' })
  airlineSignatureUrl: string;

  @Prop({ type: Date, default: null })
  airlineSignedAt: Date | null;

  @Prop({ default: '' })
  airlineSignedByUserId: string;
}

export const FhrSignaturesSchema = SchemaFactory.createForClass(FhrSignatures);
