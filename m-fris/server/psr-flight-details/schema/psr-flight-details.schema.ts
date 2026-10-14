import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PsrFlightDetailsDocument = HydratedDocument<PsrFlightDetails>;

@Schema({ timestamps: true, collection: 'psr-flight-details' })
export class PsrFlightDetails {
  @Prop({ required: true, unique: true, trim: true })
  flightSerial: string;

  @Prop({ type: Object, default: {} })
  data: Record<string, unknown>;
}

export const PsrFlightDetailsSchema =
  SchemaFactory.createForClass(PsrFlightDetails);
