import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceAirlineDocument = AdvanceAirline & Document;

@Schema({ timestamps: true, collection: 'advance-airline' })
export class AdvanceAirline {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, minlength: 1, maxlength: 5 })
  code: string;

  /** Legal / parent company name (optional; does not replace airline `name`). */
  @Prop({ default: '' })
  parentCompanyName: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ default: '' })
  address2: string;

  @Prop({ default: '' })
  address3: string;

  @Prop({ default: '' })
  stateCode: string;

  @Prop({ default: '' })
  gstRegistrationNo: string;

  /** Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA. */
  stationCode: string;
}

export const AdvanceAirlineSchema =
  SchemaFactory.createForClass(AdvanceAirline);

// required:false so legacy MAA rows (no stationCode yet) keep working before the
// manual backfill; new rows are stamped from the authenticated station.
AdvanceAirlineSchema.plugin(stationAwarePlugin, { required: false });

// Name/code are unique WITHIN a station, not globally (replaces the old global
// `name_1` / `code_1` unique indexes — see station-collections.config
// indexSwaps). Default index names match the migration's compound names.
AdvanceAirlineSchema.index({ stationCode: 1, name: 1 }, { unique: true });
AdvanceAirlineSchema.index({ stationCode: 1, code: 1 }, { unique: true });
