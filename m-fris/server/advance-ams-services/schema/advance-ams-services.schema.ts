import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceAmsServiceDocument = AdvanceAmsService & Document;

@Schema({ timestamps: true, collection: 'advance-ams-services' })
export class AdvanceAmsService {
  @Prop({ default: '' })
  serviceName: string;

  @Prop({ default: true })
  active: boolean;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only.
   */
  stationCode: string;
}

export const AdvanceAmsServiceSchema =
  SchemaFactory.createForClass(AdvanceAmsService);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceAmsServiceSchema.plugin(stationAwarePlugin, { required: false });
