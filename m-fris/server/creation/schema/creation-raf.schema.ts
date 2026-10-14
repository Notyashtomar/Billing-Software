import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type CreationRafDocument = CreationRaf & Document;

/**
 * Creation → RAF form rows (`creation-raf` collection).
 * Non-customer ramp assistance flights — listed on Open Flights → Ramp Assistance Forms.
 */
@Schema({ timestamps: true, collection: 'creation-raf' })
export class CreationRaf {
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

  /** STD date (dd/MM/yyyy). */
  @Prop({ index: true })
  date2?: string;

  /** Canonical operating day (dd/MM/yyyy). */
  @Prop({ index: true })
  operationDate?: string;

  /** Synthetic schedule identity (`RAF|YYYYMMDD|airline|flight`). */
  @Prop({ index: true })
  scheduleId?: string;

  @Prop()
  opsType?: string;

  @Prop()
  skdNonSkd?: string;

  @Prop()
  categoryOfFlight?: string;

  @Prop({ default: 'RAF' })
  flightType?: string;

  @Prop({ default: true })
  isRafFlight?: boolean;

  @Prop({ default: 'creation_raf' })
  scheduleSource?: string;

  @Prop()
  createdBy?: string;

  @Prop()
  modifiedBy?: string;

  /** Owning station (stationAwarePlugin); legacy rows may omit. */
  stationCode: string;
}

export const CreationRafSchema = SchemaFactory.createForClass(CreationRaf);

CreationRafSchema.plugin(stationAwarePlugin, { required: false });

CreationRafSchema.index(
  { stationCode: 1, airlines: 1, flightNo: 1, operationDate: 1 },
  {
    name: 'idx_raf_station_airline_flight_date',
    unique: true,
    sparse: true,
  },
);

CreationRafSchema.index(
  { scheduleId: 1 },
  { name: 'idx_raf_scheduleId', sparse: true },
);
