import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceOtherServiceDocument = AdvanceOtherService & Document;

@Schema({ timestamps: true, collection: 'advance-other-services' })
export class AdvanceOtherService {
  @Prop({ default: '' })
  service: string;

  @Prop({ default: '' })
  code: string;

  @Prop({ default: '' })
  unit: string;

  @Prop({ default: true })
  active: boolean;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   */
  stationCode: string;
}

export const AdvanceOtherServiceSchema =
  SchemaFactory.createForClass(AdvanceOtherService);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceOtherServiceSchema.plugin(stationAwarePlugin, { required: false });
