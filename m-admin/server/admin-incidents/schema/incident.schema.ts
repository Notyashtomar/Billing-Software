import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { IncidentCategory, IncidentSeverity, IncidentStatus } from '../constants/incident.enums';

export type IncidentDocument = Incident & Document;

@Schema({ _id: false })
export class IncidentTimelineEntry {
  @Prop({ required: true })
  at!: Date;

  @Prop({ required: true })
  event!: string;

  @Prop()
  actor?: string;

  @Prop()
  detail?: string;
}

@Schema({ _id: false })
export class IncidentComment {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  author!: string;

  @Prop()
  authorId?: string;

  @Prop({ required: true })
  body!: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ type: [String], default: [] })
  mentions!: string[];
}

@Schema({ _id: false })
export class IncidentAttachment {
  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop()
  url?: string;

  @Prop()
  kind?: string;
}

export const IncidentTimelineEntrySchema = SchemaFactory.createForClass(IncidentTimelineEntry);
export const IncidentCommentSchema = SchemaFactory.createForClass(IncidentComment);
export const IncidentAttachmentSchema = SchemaFactory.createForClass(IncidentAttachment);

@Schema({ timestamps: true, collection: 'incidents' })
export class Incident {
  @Prop({ required: true, unique: true, index: true })
  incidentId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: String, index: true, required: true })
  category!: IncidentCategory | string;

  @Prop({ type: String, index: true, required: true })
  severity!: IncidentSeverity | string;

  @Prop({ type: String, index: true, required: true, default: 'open' })
  status!: IncidentStatus | string;

  @Prop({ default: 'p3' })
  priority!: string;

  @Prop({ index: true })
  station?: string;

  @Prop()
  department?: string;

  @Prop()
  affectedArea?: string;

  @Prop()
  affectedSystem?: string;

  @Prop({ index: true })
  reportedBy?: string;

  @Prop()
  reportedById?: string;

  @Prop({ index: true })
  assignedTo?: string;

  @Prop()
  assignedToId?: string;

  @Prop()
  escalatedTo?: string;

  @Prop()
  approver?: string;

  @Prop({ index: true })
  createdAt!: Date;

  @Prop({ index: true })
  updatedAt!: Date;

  @Prop()
  resolvedAt?: Date;

  @Prop({ type: Date })
  slaTarget?: Date;

  @Prop({ default: false })
  slaBreached!: boolean;

  @Prop()
  rootCause?: string;

  @Prop({ type: [String], default: [] })
  contributingFactors!: string[];

  @Prop()
  resolutionSummary?: string;

  @Prop({ type: [String], default: [] })
  preventiveActions!: string[];

  @Prop({ type: [String], default: [] })
  correctiveActions!: string[];

  @Prop({ type: [IncidentAttachmentSchema], default: [] })
  attachments!: IncidentAttachment[];

  @Prop({ type: [IncidentTimelineEntrySchema], default: [] })
  timeline!: IncidentTimelineEntry[];

  @Prop({ type: [IncidentCommentSchema], default: [] })
  comments!: IncidentComment[];

  @Prop()
  sourceTicketNumber?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const IncidentSchema = SchemaFactory.createForClass(Incident);

IncidentSchema.index({ createdAt: -1 });
IncidentSchema.index({ station: 1, status: 1 });
IncidentSchema.index({ severity: 1, status: 1 });
IncidentSchema.index({ category: 1, createdAt: -1 });
