import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type CreationAdditionalFlightsDocument = CreationAdditionalFlights & Document;

/**
 * Creation → Additional Flights — one-time operational flights.
 *
 * Collection: `creation-additional-flights`
 * Source of truth for flights that are NOT in Advance → Schedule Setup.
 * Appears on Schedule Airlines via daily-list merge; never writes masters.
 */
@Schema({ timestamps: true, collection: 'creation-additional-flights' })
export class CreationAdditionalFlights {
  /**
   * Operational serial shared with Schedule Airlines / flight_instance_index.
   * Allocated from the global flight serial counter (same family as daily list).
   */
  @Prop({ index: true })
  serialNo?: string;

  @Prop()
  airlines?: string;

  @Prop({ index: true })
  flightNo?: string;

  @Prop()
  acType?: string;

  @Prop()
  aBody?: string;

  @Prop()
  airlineCode?: string;

  @Prop()
  routing?: string;

  @Prop()
  staTime?: string;

  @Prop()
  stdTime?: string;

  /** STA / operating date (dd/MM/yyyy). */
  @Prop({ index: true })
  date?: string;

  /** STD date (dd/MM/yyyy); may differ for overnight turns. */
  @Prop({ index: true })
  date2?: string;

  /** Canonical operating day for this one-time flight (dd/MM/yyyy). */
  @Prop({ index: true })
  operationDate?: string;

  /**
   * Synthetic schedule identity (`ADD|YYYYMMDD|airline|flight`).
   * Used by flight_instance_index — not an advance_schedule_setup serial.
   */
  @Prop({ index: true })
  scheduleId?: string;

  @Prop()
  opsType?: string;

  /** Prefer "Additional" for this module. */
  @Prop()
  skdNonSkd?: string;

  @Prop()
  categoryOfFlight?: string;

  @Prop()
  freighter?: string;

  /** Explicit origin marker for UI / reporting. */
  @Prop({ default: 'Additional' })
  flightType?: string;

  @Prop({ default: true })
  isAdditionalFlight?: boolean;

  @Prop()
  createdBy?: string;

  @Prop()
  modifiedBy?: string;

  /** Owning station (stationAwarePlugin); legacy rows may omit. */
  stationCode: string;
}

export const CreationAdditionalFlightsSchema =
  SchemaFactory.createForClass(CreationAdditionalFlights);

CreationAdditionalFlightsSchema.plugin(stationAwarePlugin, { required: false });

/** Prevent duplicate one-time flights per station + airline + flight + day. */
CreationAdditionalFlightsSchema.index(
  { stationCode: 1, airlines: 1, flightNo: 1, operationDate: 1 },
  {
    name: 'idx_additional_station_airline_flight_date',
    unique: true,
    sparse: true,
  },
);

CreationAdditionalFlightsSchema.index(
  { scheduleId: 1 },
  { name: 'idx_additional_scheduleId', sparse: true },
);
