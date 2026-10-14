import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type RafCollectionDocument = RafCollection & Document;

/**
 * Ramp Assistance Form (RAF) flight documents.
 * Formerly embedded as `rafAdhocDetails` / `rafCleaningServices` on `fhr_collection`.
 * Collection name: `raf_collection`.
 */
@Schema({ timestamps: true, collection: 'raf_collection' })
export class RafCollection {
  /** Owning station (stationAwarePlugin). Legacy rows may omit → treated as MAA. */
  stationCode: string;

  @Prop({ required: true, unique: true, index: true })
  SerialNo: number;

  @Prop()
  flightSerialNumber: number;

  @Prop({ type: Object })
  mainDetails: Record<string, unknown> | null;

  /** Equipment / manpower / service lines (Billing → Sources → RAF). */
  @Prop({ type: Object })
  rafAdhocDetails: Record<string, unknown> | null;

  /** Deep / Night Halt / Exterior cleaning payload. */
  @Prop({ type: Object })
  rafCleaningServices: Record<string, unknown> | null;

  @Prop()
  lastSnapshotAt: Date;

  @Prop({ default: '' })
  lastSnapshotReason: string;
}

export const RafCollectionSchema = SchemaFactory.createForClass(RafCollection);

RafCollectionSchema.plugin(stationAwarePlugin, { required: false });
RafCollectionSchema.index({ stationCode: 1, SerialNo: 1 });
