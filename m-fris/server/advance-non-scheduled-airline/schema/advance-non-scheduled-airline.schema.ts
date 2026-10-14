import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import { NS_ADVANCE_NON_SCHEDULED_AIRLINE_COLLECTION } from '../utils/airline-code.util';

export type AdvanceNonScheduledAirlineDocument = AdvanceNonScheduledAirline &
  Document;

@Schema({ timestamps: true, collection: NS_ADVANCE_NON_SCHEDULED_AIRLINE_COLLECTION })
export class AdvanceNonScheduledAirline {
  @Prop({ default: '' })
  airline: string;

  @Prop({ default: '' })
  airlineCode: string;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   */
  stationCode: string;
}

export const AdvanceNonScheduledAirlineSchema = SchemaFactory.createForClass(
  AdvanceNonScheduledAirline,
);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceNonScheduledAirlineSchema.plugin(stationAwarePlugin, {
  required: false,
});

AdvanceNonScheduledAirlineSchema.index({ stationCode: 1, airline: 1 }, { unique: true });
