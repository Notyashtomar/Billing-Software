import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type ManifestDocument = Manifest & Document;

@Schema({ timestamps: true, collection: 'manifest' })
export class Manifest {
  @Prop({ required: true })
  serialNo: number;

  @Prop({ default: '' })
  airlineName: string;

  @Prop({ default: '' })
  flightNumber: string;

  @Prop({ default: '' })
  place: string;

  /** Multi-station segregation key (added by stationAwarePlugin). */
  stationCode: string;
}

export const ManifestSchema = SchemaFactory.createForClass(Manifest);

// Station segregation: mandatory, immutable, indexed `stationCode`.
ManifestSchema.plugin(stationAwarePlugin);

// Flight serials are unique *per station* (the legacy global-unique index on
// `serialNo` is dropped by the migration script).
ManifestSchema.index({ stationCode: 1, serialNo: 1 }, { unique: true });
