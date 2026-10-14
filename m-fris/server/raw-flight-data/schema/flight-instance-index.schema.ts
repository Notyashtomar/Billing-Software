import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FlightInstanceIndexDocument = FlightInstanceIndex & Document;

/**
 * Stable sequence mapping for dynamically generated schedule instances.
 * One row per (operationDate + instanceKey).
 */
@Schema({ timestamps: true, collection: 'flight_instance_index' })
export class FlightInstanceIndex {
  /** Operation date in DD/MM/YYYY used by scheduled rows. */
  @Prop({ required: true, index: true })
  operationDate: string;

  /** Source master schedule identifier (advance_schedule_setup.serialNo). */
  @Prop({ required: true, index: true })
  scheduleId: string;

  /** Deterministic hash for one generated instance on a specific date. */
  @Prop({ required: true })
  instanceKey: string;

  /** Stable sequence within operationDate. */
  @Prop({ required: true, index: true })
  sequenceNumber: number;

  /** Numeric-compatible serial used by existing modules. Example: 20260315007. */
  @Prop({ required: true })
  serialNo: string;

  /** Display serial. Example: FL-20260315-007. */
  @Prop({ required: true })
  serialLabel: string;
}

export const FlightInstanceIndexSchema =
  SchemaFactory.createForClass(FlightInstanceIndex);

// GLOBAL serial-mapping infrastructure (NOT station-owned). Under the approved
// Strategy A (shared global serial pool) sequence numbers come from the global
// allocator, so both keys below MUST stay GLOBALLY unique. This collection is
// never station-scoped: scoping its reads would let two stations diverge on the
// serial for the same instanceKey (or violate these unique indexes). No
// stationCode is added and StationScope is intentionally not applied here.
FlightInstanceIndexSchema.index(
  { operationDate: 1, instanceKey: 1 },
  { unique: true, name: 'uniq_operationDate_instanceKey' },
);
FlightInstanceIndexSchema.index(
  { operationDate: 1, sequenceNumber: 1 },
  { unique: true, name: 'uniq_operationDate_sequenceNumber' },
);
