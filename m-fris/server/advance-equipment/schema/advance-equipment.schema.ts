import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceEquipmentDocument = AdvanceEquipment & Document;

@Schema({ timestamps: true, collection: 'advance-equipment' })
export class AdvanceEquipment {
  @Prop({ default: '' })
  equipmentName: string;

  @Prop({ default: '' })
  equipmentCode: string;

  @Prop({ default: '' })
  category: string;

  @Prop({ default: true })
  active: boolean;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only.
   */
  stationCode: string;
}

export const AdvanceEquipmentSchema =
  SchemaFactory.createForClass(AdvanceEquipment);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceEquipmentSchema.plugin(stationAwarePlugin, { required: false });
