import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SupportTicketDocument = SupportTicket & Document;

@Schema({ _id: false })
export class SupportTicketAttachment {
  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  sizeBytes: number;

  /** Base64 payload (no data-URL prefix). */
  @Prop({ required: true })
  base64: string;
}

export const SupportTicketAttachmentSchema =
  SchemaFactory.createForClass(SupportTicketAttachment);

@Schema({ timestamps: true, collection: 'support_tickets' })
export class SupportTicket {
  /** Human-readable ticket id, e.g. TKT-20260521-A1B2C3 */
  @Prop({ required: true, unique: true })
  ticketNumber: string;

  @Prop({ required: true, enum: ['users', 'admin'] })
  accountCollection: 'users' | 'admin';

  @Prop({ required: true })
  raisedByMongoId: string;

  @Prop({ required: true })
  raisedByUserid: string;

  @Prop({ required: true })
  raisedByName: string;

  @Prop({ required: true })
  raisedByEmail: string;

  @Prop({ default: '' })
  raisedByRole: string;

  /** Explicit raise timestamp (also available as createdAt). */
  @Prop({ required: true, type: Date })
  raisedAt: Date;

  @Prop({ required: true })
  navigationPageLabel: string;

  @Prop({ required: true })
  navigationPagePath: string;

  @Prop({ required: true })
  subPageLabel: string;

  @Prop({ required: true })
  subPagePath: string;

  @Prop({ required: true })
  issueReason: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, enum: ['urgent', 'non-urgent'] })
  urgency: 'urgent' | 'non-urgent';

  @Prop({ required: true })
  issueType: string;

  @Prop({ type: [SupportTicketAttachmentSchema], default: [] })
  attachments: SupportTicketAttachment[];

  @Prop({ default: 'open', enum: ['open', 'closed'] })
  status: 'open' | 'closed';

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ default: '' })
  closedByUserid?: string;

  /** Required when the raiser closes the ticket. */
  @Prop({ default: '' })
  closeComment?: string;

  /** Admin resolution from the Raise ticket query panel. */
  @Prop({ default: '' })
  adminResolutionNote?: string;

  @Prop({ default: '' })
  resolvedByAdminMongoId?: string;

  @Prop({ default: '' })
  resolvedByAdminName?: string;

  @Prop({ type: Date })
  adminResolvedAt?: Date;
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
