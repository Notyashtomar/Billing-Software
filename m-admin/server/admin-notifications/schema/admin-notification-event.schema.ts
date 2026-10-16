import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminNotificationEventDocument = HydratedDocument<AdminNotificationEvent>;

@Schema({ timestamps: true, collection: 'admin_notification_events' })
export class AdminNotificationEvent {
  @Prop({ required: true, index: true })
  kind!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  subtitle!: string;

  @Prop()
  actorName?: string;

  @Prop()
  entityType?: string;

  @Prop({ index: true })
  entityId?: string;

  @Prop()
  ticketNumber?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ required: true, index: true })
  eventDate!: string;

  /** When true, admin may broadcast this alert to FRIS users (centered popup up to 2 times + dashboard inbox). */
  @Prop({ default: false })
  shootableToUsers!: boolean;

  @Prop({ default: false, index: true })
  userBroadcastSent!: boolean;

  @Prop({ type: [String], default: [] })
  readByAdminIds!: string[];
}

export const AdminNotificationEventSchema =
  SchemaFactory.createForClass(AdminNotificationEvent);

AdminNotificationEventSchema.index({ createdAt: -1 });
AdminNotificationEventSchema.index({ kind: 1, createdAt: -1 });
