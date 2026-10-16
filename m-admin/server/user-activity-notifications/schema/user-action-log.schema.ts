import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserActionLogDocument = UserActionLog & Document;

@Schema({ timestamps: true, collection: 'user_action_logs' })
export class UserActionLog {
  @Prop({ index: true, required: true })
  userId!: string;

  @Prop({ index: true, required: true })
  userName!: string;

  @Prop()
  userEmail?: string;

  @Prop({ type: String, index: true, required: true })
  accountType!: 'admin' | 'user';

  @Prop({ index: true, required: true })
  action!: string;

  /**
   * Self-explanatory, human-readable description of exactly what happened
   * (who did what to whom, with old/new values where relevant).
   */
  @Prop()
  summary?: string;

  // --- Actor (who performed the action) ---
  @Prop()
  actorRole?: string;

  // --- Station context ---
  @Prop({ index: true })
  stationId?: string;

  @Prop()
  stationName?: string;

  // --- Where in the app (human-readable) ---
  @Prop()
  module?: string;

  @Prop()
  page?: string;

  @Prop()
  tab?: string;

  @Prop()
  section?: string;

  // --- Affected entity (who/what was acted upon) ---
  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop()
  entityName?: string;

  /** Field-level diff: [{ field, oldValue, newValue }]. */
  @Prop({ type: [Object], default: undefined })
  changes?: Array<{ field: string; oldValue?: unknown; newValue?: unknown }>;

  // --- Request context ---
  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  method?: string;

  @Prop()
  path?: string;

  /** yyyy-MM-dd — grouped in admin UI and notification center. */
  @Prop({ index: true, required: true })
  actionDate!: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: false, index: true })
  notificationSent!: boolean;

  @Prop()
  notificationId?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserActionLogSchema = SchemaFactory.createForClass(UserActionLog);

UserActionLogSchema.index({ createdAt: -1 });
UserActionLogSchema.index({ actionDate: -1, createdAt: -1 });
