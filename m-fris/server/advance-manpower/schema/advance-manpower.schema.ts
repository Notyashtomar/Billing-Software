import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceManpowerDocument = AdvanceManpower & Document;

@Schema({ timestamps: true, collection: 'advance-manpower' })
export class AdvanceManpower {
  @Prop({ default: '' })
  manpower: string;

  @Prop({ default: '' })
  code: string;

  @Prop({ default: true })
  active: boolean;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   */
  stationCode: string;
}

export const AdvanceManpowerSchema =
  SchemaFactory.createForClass(AdvanceManpower);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceManpowerSchema.plugin(stationAwarePlugin, { required: false });
