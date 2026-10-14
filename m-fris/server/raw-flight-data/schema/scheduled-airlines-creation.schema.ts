import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type ScheduledAirlinesCreationDocument = ScheduledAirlinesCreation &
  Document;

/**
 * Creation → Schedule Airlines **daily operational overrides**.
 *
 * One document = one generated flight instance for one operating day.
 * Does NOT store or mutate the season master in `advance_schedule_setup`.
 *
 * Identity:
 * - `serialNo` — unique override key (prefer generated instance serial; else `master|YYYYMMDD`)
 * - `scheduleMasterSerial` — link back to Advance → Schedule Setup (read-only reference)
 * - `operationDate` — dd/MM/yyyy operating day this override applies to
 * - `instanceSerial` — generated per-day serial from `flight_instance_index` (unchanged)
 */
@Schema({ timestamps: true, collection: 'scheduled_airlines_creation' })
export class ScheduledAirlinesCreation {
  /**
   * Unique override document key.
   * Prefer the generated operational instance serial so saves never collide across days.
   */
  @Prop({ required: true, unique: true, index: true })
  serialNo: string;

  /** Master schedule serial from Advance → Schedule Setup (never updated from this collection). */
  @Prop({ index: true })
  scheduleMasterSerial?: string;

  /** Operating day this override applies to (dd/MM/yyyy). */
  @Prop({ index: true })
  operationDate?: string;

  /** Generated per-day serial from `flight_instance_index` (stable; do not reallocate). */
  @Prop({ index: true })
  instanceSerial?: string;

  /** Email / display name of last editor (audit). */
  @Prop()
  modifiedBy?: string;

  @Prop({ type: Object, required: true })
  data: Record<string, unknown>;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only — does not affect serial allocation.
   */
  stationCode: string;
}

export const ScheduledAirlinesCreationSchema = SchemaFactory.createForClass(
  ScheduledAirlinesCreation,
);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
ScheduledAirlinesCreationSchema.plugin(stationAwarePlugin, { required: false });

// Fast lookup for daily overlay: master + operating day.
ScheduledAirlinesCreationSchema.index(
  { scheduleMasterSerial: 1, operationDate: 1 },
  { name: 'idx_creation_master_operationDate' },
);
