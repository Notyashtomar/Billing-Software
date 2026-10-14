import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FlightSerialCounterDocument = FlightSerialCounter & Document;

/** Atomic counter for globally unique flight serial assignment. */
@Schema({ timestamps: true, collection: 'flight_serial_counter' })
export class FlightSerialCounter {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true, default: 0 })
  seq: number;
}

export const FlightSerialCounterSchema =
  SchemaFactory.createForClass(FlightSerialCounter);
