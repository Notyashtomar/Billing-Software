import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type FlightInstanceStateDocument = HydratedDocument<FlightInstanceState>;

/**
 * One row per flight instance serial (same Sl. No. as daily expansion / flight_instance_index).
 * Updated only for scheduled-airlines cancellation & reopen flows (OTP + main-details sync).
 */
@Schema({ timestamps: true, collection: 'flight_instance_state' })
export class FlightInstanceState {
  /** Normalized instance serial (strip FL- prefix; same as flight_cancellations.instanceSerial). */
  @Prop({ required: true, unique: true, index: true })
  instanceSerial: string;

  @Prop({ required: true, default: false })
  isCancelled: boolean;

  @Prop({ type: String, enum: ['cancel', 'reopen'], default: undefined })
  lastAction?: 'cancel' | 'reopen';

  /** Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA. */
  stationCode: string;
}

export const FlightInstanceStateSchema =
  SchemaFactory.createForClass(FlightInstanceState);

// Strategy A (shared global serial pool): `instanceSerial` stays GLOBALLY unique
// (one state row per serial across all stations). stationCode is added for
// visibility/ownership only — it never widens this uniqueness. required:false so
// legacy MAA rows (no stationCode yet) never fail validation before the manual
// backfill; new rows are stamped via `$setOnInsert` in the service.
FlightInstanceStateSchema.plugin(stationAwarePlugin, { required: false });
