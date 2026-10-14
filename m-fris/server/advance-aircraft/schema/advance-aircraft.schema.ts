import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceAircraftDocument = AdvanceAircraft & Document;

@Schema({ timestamps: true, collection: 'advance-aircraft' })
export class AdvanceAircraft {
  /** Normalized: UPPERCASE, optional hyphen or slash between segments (e.g. B737-800, A320/B737). Globally unique. */
  @Prop({ required: true })
  aircraft: string;

  @Prop({ default: 'NB' })
  aircraftBody: string;

  @Prop({ default: '' })
  mtow: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  manufacturer: string;

  /** Wingspan in metres, whole metres (seed rounds from spreadsheet). */
  @Prop({ type: Number, required: false, default: null })
  wingspan: number | null;

  /** Typical passenger capacity when numeric; non-numeric cells (e.g. Cargo) are null. */
  @Prop({ type: Number, required: false, default: null })
  passengerCapacity: number | null;

  /** ICAO aircraft type designator from master data, if present. */
  @Prop({ default: '' })
  icaoCode: string;

  @Prop({ default: '' })
  category: string;

  @Prop({ default: true })
  active: boolean;

  /**
   * Full Excel row (e.g. master / universal workbook): every column as string,
   * keyed by Mongo-safe header names (matches seed util).
   */
  @Prop({ type: Object, required: false })
  universalRow?: Record<string, string>;

  /** Global catalog row — same aircraft master for every station. */
  stationCode: string;
}

export const AdvanceAircraftSchema =
  SchemaFactory.createForClass(AdvanceAircraft);

// required:false so legacy rows keep working before consolidation; new rows use GLOBAL.
AdvanceAircraftSchema.plugin(stationAwarePlugin, { required: false });

// Aircraft type is globally unique — one shared catalog for all stations.
AdvanceAircraftSchema.index({ aircraft: 1 }, { unique: true });
