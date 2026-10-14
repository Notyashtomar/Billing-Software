import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceNsGhrepDocument = AdvanceNsGhrep & Document;

/** Advance → Non-scheduled GH Representative employees. */
@Schema({ timestamps: true, collection: 'ns-advance-ghrep' })
export class AdvanceNsGhrep {
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

export const AdvanceNsGhrepSchema = SchemaFactory.createForClass(AdvanceNsGhrep);

AdvanceNsGhrepSchema.plugin(stationAwarePlugin, { required: false });
