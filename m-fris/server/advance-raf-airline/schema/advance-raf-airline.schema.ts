import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceRafAirlineDocument = AdvanceRafAirline & Document;

@Schema({ timestamps: true, collection: 'advance-raf-airline' })
export class AdvanceRafAirline {
  @Prop({ default: '' })
  airline: string;

  @Prop({ default: '' })
  airlineCode: string;

  @Prop({ default: false })
  deepCleaning: boolean;

  @Prop({ default: false })
  nightHaltCleaning: boolean;

  @Prop({ default: false })
  exteriorCleaning: boolean;

  /** Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA. */
  stationCode: string;
}

export const AdvanceRafAirlineSchema =
  SchemaFactory.createForClass(AdvanceRafAirline);

AdvanceRafAirlineSchema.plugin(stationAwarePlugin, { required: false });
