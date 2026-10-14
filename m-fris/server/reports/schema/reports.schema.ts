import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReportDocument = Report & Document;

@Schema({ timestamps: true, collection: 'reports' })
export class Report {
  @Prop({ required: true })
  serialNo: number;

  /** Main Report | Equipment Sheet | Safety Report | Ramp Duty Allocation */
  @Prop({ required: true })
  reportType: string;

  @Prop({ default: '' })
  viewedAt: string;

  @Prop({ default: '' })
  viewedBy: string;

  @Prop({ default: false })
  signatureCleared: boolean;

  @Prop({ default: '' })
  signatureClearedAt: string;

  @Prop({ default: '' })
  signatureClearedBy: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
