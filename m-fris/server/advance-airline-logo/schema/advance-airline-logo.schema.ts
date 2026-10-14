import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceAirlineLogoDocument = AdvanceAirlineLogo & Document;

@Schema({ timestamps: true, collection: 'advance-airline-logo' })
export class AdvanceAirlineLogo {
  @Prop({ default: '' })
  airlineName: string;

  /** Base64 data URL (e.g. data:image/png;base64,...) from client upload */
  @Prop({ default: '' })
  logoDataUrl: string;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * Visibility/ownership only.
   */
  stationCode: string;
}

export const AdvanceAirlineLogoSchema =
  SchemaFactory.createForClass(AdvanceAirlineLogo);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceAirlineLogoSchema.plugin(stationAwarePlugin, { required: false });
