import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AttachmentsDocument = Attachments & Document;

@Schema({ _id: false })
export class ReportEntry {
  @Prop({ default: false })
  checked: boolean;

  @Prop({ default: '' })
  reportName: string;

  @Prop({ default: '' })
  reportNo: string;
}
const ReportEntrySchema = SchemaFactory.createForClass(ReportEntry);

@Schema({ timestamps: true, collection: 'attachments' })
export class Attachments {
  /** Flight serial / FHR - flight identifier */
  @Prop({ required: true })
  fhrNo: number;

  /** Report 1 to Report 6 */
  @Prop({ type: [ReportEntrySchema], default: [] })
  reports: ReportEntry[];

  @Prop({ default: '' })
  noOfScanReports: string;

  /** Attachment file name (as uploaded) */
  @Prop({ default: '' })
  attachmentFileName: string;

  /** Stored file path or URL */
  @Prop({ default: '' })
  attachmentPath: string;
}

export const AttachmentsSchema = SchemaFactory.createForClass(Attachments);

// Station segregation (rollout: required:false). No legacy unique index existed.
AttachmentsSchema.plugin(stationAwarePlugin, { required: false });
AttachmentsSchema.index({ stationCode: 1, fhrNo: 1 });
