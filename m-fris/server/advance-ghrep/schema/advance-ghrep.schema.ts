import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceGhrepDocument = AdvanceGhrep & Document;

/** Advance → GH Representative employees. */
@Schema({ timestamps: true, collection: 'advance-ghrep' })
export class AdvanceGhrep {
  @Prop({ required: true, trim: true })
  employeeName: string;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  employeeCode: string;

  @Prop({ required: true, trim: true, lowercase: true })
  emailId: string;

  @Prop({ default: true })
  active: boolean;

  /** PNG/JPEG data URL (`data:image/png;base64,...`) for report signatures. */
  @Prop({ default: '' })
  signatureUrl: string;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   */
  stationCode: string;
}

export const AdvanceGhrepSchema = SchemaFactory.createForClass(AdvanceGhrep);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceGhrepSchema.plugin(stationAwarePlugin, { required: false });
