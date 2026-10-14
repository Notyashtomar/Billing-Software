import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceScheduleSetupDocument = AdvanceScheduleSetup & Document;

/** Advance tab → Schedule Setup payloads (before / merged into raw_flight_data). */
@Schema({ timestamps: true, collection: 'advance_schedule_setup' })
export class AdvanceScheduleSetup {
  @Prop({ required: true, index: true })
  serialNo: string;

  @Prop({ type: Object, required: true })
  data: Record<string, unknown>;

  /**
   * Season identity for upsert: `seasonKey|airline|flightNo|routing`.
   * Enables one schedule per flight per season without scanning all masters.
   */
  @Prop({ index: true })
  identityKey?: string;

  /** e.g. summer-2026 / winter-2026 — derived from Valid From */
  @Prop({ index: true })
  seasonKey?: string;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only — does not affect serial allocation.
   */
  stationCode: string;
}

export const AdvanceScheduleSetupSchema =
  SchemaFactory.createForClass(AdvanceScheduleSetup);

AdvanceScheduleSetupSchema.index(
  { stationCode: 1, identityKey: 1 },
  {
    unique: true,
    sparse: true,
    name: 'station_identityKey_unique',
  },
);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceScheduleSetupSchema.plugin(stationAwarePlugin, { required: false });
