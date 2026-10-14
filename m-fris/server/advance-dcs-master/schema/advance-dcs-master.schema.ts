import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceDcsMasterDocument = AdvanceDcsMaster & Document;

@Schema({ timestamps: true, collection: 'advance-dcs-master' })
export class AdvanceDcsMaster {
  @Prop({ default: '' })
  dcsName: string;

  @Prop({ default: 'active' })
  status: string;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only.
   */
  stationCode: string;
}

export const AdvanceDcsMasterSchema =
  SchemaFactory.createForClass(AdvanceDcsMaster);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceDcsMasterSchema.plugin(stationAwarePlugin, { required: false });
