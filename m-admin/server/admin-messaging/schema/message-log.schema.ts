import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { MessageStatus, MessageType } from '../constants/messaging.enums';

export type MessageLogDocument = MessageLog & Document;

@Schema({ timestamps: true, collection: 'message_logs' })
export class MessageLog {
  @Prop({ required: true, unique: true, index: true })
  messageId!: string;

  @Prop({ type: String, index: true, required: true })
  messageType!: MessageType | string;

  @Prop({ index: true, default: 'gmail-smtp' })
  provider!: string;

  @Prop({ index: true, required: true })
  recipient!: string;

  @Prop()
  template?: string;

  @Prop({ index: true })
  module?: string;

  @Prop({ type: String, index: true, required: true })
  status!: MessageStatus | string;

  @Prop({ index: true })
  sentAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop()
  errorCode?: string;

  @Prop()
  errorMessage?: string;

  @Prop({ default: 0 })
  retryCount!: number;

  @Prop({ index: true })
  requestId?: string;

  @Prop({ index: true })
  station?: string;

  @Prop()
  subject?: string;

  @Prop()
  deliveryTimeMs?: number;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  otpId?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MessageLogSchema = SchemaFactory.createForClass(MessageLog);

MessageLogSchema.index({ sentAt: -1 });
MessageLogSchema.index({ messageType: 1, sentAt: -1 });
MessageLogSchema.index({ status: 1, sentAt: -1 });
MessageLogSchema.index({ module: 1, sentAt: -1 });
