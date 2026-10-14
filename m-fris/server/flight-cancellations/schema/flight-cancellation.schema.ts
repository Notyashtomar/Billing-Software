import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type FlightCancellationDocument = HydratedDocument<FlightCancellation>;

/**
 * Date-specific operational cancellation: does not modify advance / raw master rows.
 * Key: instance serial (per-day stable Sl. No.) + cancelledDate (YYYY-MM-DD).
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'flight_cancellations',
})
export class FlightCancellation {
  /** Instance serial from `flight_instance_index` (same as row Sl. No.). */
  @Prop({ required: true, index: true })
  instanceSerial: string;

  /** Operating date of the occurrence, YYYY-MM-DD (local calendar). */
  @Prop({ required: true, index: true })
  cancelledDate: string;

  @Prop({ default: '' })
  reason: string;

  /** Denormalized row snapshot for history without re-expanding schedules. */
  @Prop({ default: '' })
  airlineName: string;

  @Prop({ default: '' })
  flightNo: string;

  @Prop({ default: '' })
  route: string;

  @Prop({ default: '' })
  source: string;

  @Prop({ default: '' })
  destination: string;

  @Prop({ default: '' })
  staDate: string;

  @Prop({ default: '' })
  staTime: string;

  @Prop({ default: '' })
  stdDate: string;

  @Prop({ default: '' })
  stdTime: string;

  @Prop({ default: '' })
  aircraft: string;

  /** Phone / email / system / other — how the airline intimated cancellation. */
  @Prop({ default: '' })
  intimationMode: string;

  /** Person who intimated cancellation (name / designation). */
  @Prop({ default: '' })
  intimatedBy: string;

  /** Email of the person who intimated cancellation. */
  @Prop({ default: '' })
  intimationPersonEmail: string;

  /** Proof filename or other media reference for intimation. */
  @Prop({ default: '' })
  intimationMedia: string;

  /** True when a proof file was stored (bytes live in `attachmentData`). */
  @Prop({ default: false })
  hasAttachment: boolean;

  @Prop({ default: '' })
  attachmentFileName: string;

  @Prop({ default: '' })
  attachmentMimeType: string;

  /** Proof file bytes. Omitted from list queries (`select: false`). */
  @Prop({ type: Buffer, select: false })
  attachmentData?: Buffer;

  /** `yyyy-MM-ddTHH:mm` when airline intimated cancellation. */
  @Prop({ default: '' })
  intimationTime: string;

  /** Logged-in userid (or equivalent) when cancelled via FRIS. */
  @Prop({ default: '' })
  cancelledByUserId: string;

  /**
   * `scheduled` (default / legacy) or `non-scheduled`.
   * Keeps OTP cancellations out of the other airline list/history.
   */
  @Prop({ default: '', index: true })
  flightKind: string;

  /** Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA. */
  stationCode: string;
}

export const FlightCancellationSchema =
  SchemaFactory.createForClass(FlightCancellation);

// Strategy A (shared global serial pool): the cancellation key stays GLOBALLY
// unique. stationCode is added for visibility/ownership only and never widens
// this uniqueness, so a serial+date can be cancelled once across the system.
FlightCancellationSchema.index(
  { instanceSerial: 1, cancelledDate: 1 },
  { unique: true },
);

// Station segregation (rollout: required:false so legacy MAA rows never fail
// validation before the manual backfill). Additive read index for scoped range
// queries; no legacy index is dropped or altered.
FlightCancellationSchema.plugin(stationAwarePlugin, { required: false });
FlightCancellationSchema.index({ stationCode: 1, cancelledDate: 1 });
