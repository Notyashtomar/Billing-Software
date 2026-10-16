import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { OtpFailureReason, OtpStatus } from '../constants/messaging.enums';

export type OtpLogDocument = OtpLog & Document;

@Schema({ timestamps: true, collection: 'otp_logs' })
export class OtpLog {
  @Prop({ required: true, unique: true, index: true })
  otpId!: string;

  @Prop({ index: true })
  userId?: string;

  @Prop({ index: true })
  email?: string;

  @Prop({ index: true })
  phone?: string;

  @Prop({ index: true, required: true })
  generatedAt!: Date;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ default: 0 })
  attemptCount!: number;

  @Prop({ index: true })
  ipAddress?: string;

  @Prop()
  device?: string;

  @Prop({ default: 0 })
  riskScore!: number;

  @Prop({ type: String, index: true, required: true })
  status!: OtpStatus | string;

  @Prop({ type: String })
  failureReason?: OtpFailureReason | string;

  @Prop()
  purpose?: string;

  @Prop()
  flightId?: string;

  @Prop()
  messageId?: string;

  @Prop()
  verificationTimeMs?: number;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OtpLogSchema = SchemaFactory.createForClass(OtpLog);

OtpLogSchema.index({ generatedAt: -1 });
OtpLogSchema.index({ status: 1, generatedAt: -1 });
OtpLogSchema.index({ email: 1, generatedAt: -1 });
OtpLogSchema.index({ ipAddress: 1, generatedAt: -1 });
