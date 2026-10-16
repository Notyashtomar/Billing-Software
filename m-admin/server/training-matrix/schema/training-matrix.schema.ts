import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TrainingMatrixDocument = TrainingMatrix & Document;

@Schema({ timestamps: true, collection: 'training-matrix' })
export class TrainingMatrix {
  /** Legacy single-station field. New writes use stationIds. */
  @Prop({ trim: true })
  stationId?: string;

  @Prop({ type: [String], default: [] })
  stationIds: string[];

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Number, default: null })
  minPassPercent?: number | null;

  /** null = one-time training (Once) */
  @Prop({ type: Number, default: null })
  frequencyMonths: number | null;

  @Prop({ type: [String], default: [] })
  departments: string[];

  @Prop({ trim: true, default: '' })
  note?: string;
}

export const TrainingMatrixSchema =
  SchemaFactory.createForClass(TrainingMatrix);
