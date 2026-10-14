import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PerformanceFlightsSnapshotDocument = PerformanceFlightsSnapshot &
  Document;

@Schema({ timestamps: true, collection: 'performance_flights_snapshots' })
export class PerformanceFlightsSnapshot {
  /** Stable id for a dataset, e.g. `bird-flight-delhi-jan-march-2026` */
  @Prop({ required: true, unique: true, index: true })
  reportKey: string;

  @Prop({ type: String, default: '' })
  title: string;

  @Prop({
    type: [
      {
        sta: { type: String, default: '' },
        ata: { type: String, default: '' },
        std: { type: String, default: '' },
        atd: { type: String, default: '' },
      },
    ],
    default: [],
  })
  flights: { sta: string; ata: string; std: string; atd: string }[];
}

export const PerformanceFlightsSnapshotSchema = SchemaFactory.createForClass(
  PerformanceFlightsSnapshot,
);
