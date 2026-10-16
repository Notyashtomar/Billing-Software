import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { AuditEventType, AuditModule, AuditResult, AuditSeverity } from '../constants/audit.enums';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  @Prop({ index: true })
  sourceLogId?: string;

  @Prop({ required: true, index: true })
  timestamp!: Date;

  @Prop({ index: true, required: true })
  userId!: string;

  @Prop({ index: true })
  employeeId?: string;

  @Prop({ required: true })
  userName!: string;

  @Prop()
  userEmail?: string;

  @Prop()
  role?: string;

  @Prop({ index: true })
  station?: string;

  @Prop({ index: true })
  department?: string;

  @Prop({ type: String, index: true, required: true })
  module!: AuditModule | string;

  @Prop({ type: String, index: true, required: true })
  action!: AuditEventType | string;

  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop({ type: Object })
  before?: Record<string, unknown>;

  @Prop({ type: Object })
  after?: Record<string, unknown>;

  @Prop({ type: String, index: true, required: true })
  severity!: AuditSeverity;

  @Prop({ type: String, index: true, required: true })
  result!: AuditResult;

  @Prop({ index: true })
  ipAddress?: string;

  @Prop({ index: true })
  requestId?: string;

  @Prop()
  correlationId?: string;

  @Prop()
  device?: string;

  @Prop()
  browser?: string;

  @Prop()
  os?: string;

  @Prop({ default: 0 })
  riskScore!: number;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ type: Object })
  rawPayload?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ module: 1, timestamp: -1 });
AuditLogSchema.index({ station: 1, timestamp: -1 });
AuditLogSchema.index({ severity: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ result: 1, timestamp: -1 });
