import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { ImportHistoryStatus } from '../constants/flight-import.constants';

export type ImportHistoryDocument = ImportHistory & Document;

@Schema({ timestamps: true, collection: 'import_history' })
export class ImportHistory {
  @Prop({ required: true })
  filename!: string;

  @Prop({ default: '' })
  uploadedBy!: string;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt!: Date;

  @Prop({ default: 0 })
  totalRows!: number;

  @Prop({ default: 0 })
  importedRows!: number;

  @Prop({ default: 0 })
  failedRows!: number;

  @Prop({ type: String, default: 'pending' })
  status!: ImportHistoryStatus;

  @Prop({ default: '' })
  errorFilePath!: string;

  @Prop({ default: 0 })
  processingTimeMs!: number;
}

export const ImportHistorySchema = SchemaFactory.createForClass(ImportHistory);
