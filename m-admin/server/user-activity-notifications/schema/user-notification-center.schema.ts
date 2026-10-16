import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserNotificationCenterDocument = UserNotificationCenter & Document;

@Schema({ timestamps: true, collection: 'user_notification_center' })
export class UserNotificationCenter {
  @Prop({ index: true, required: true })
  userId!: string;

  @Prop()
  userName?: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ index: true })
  sourceLogId?: string;

  /** yyyy-MM-dd — inbox grouping by calendar day. */
  @Prop({ index: true, required: true })
  notificationDate!: string;

  @Prop({ default: false, index: true })
  delivered!: boolean;

  @Prop()
  deliveredAt?: Date;

  /** How many times the centered popup has been shown to this user. */
  @Prop({ default: 0 })
  popupShowCount!: number;

  /** Stop showing the centered popup after this many displays (universal = 2). */
  @Prop({ default: 2 })
  maxPopupShows!: number;

  @Prop()
  readAt?: Date;

  @Prop()
  shotByAdminId?: string;

  @Prop()
  shotByAdminName?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserNotificationCenterSchema =
  SchemaFactory.createForClass(UserNotificationCenter);

UserNotificationCenterSchema.index({ userId: 1, notificationDate: -1, createdAt: -1 });
UserNotificationCenterSchema.index({ userId: 1, delivered: 1, createdAt: -1 });
UserNotificationCenterSchema.index({ sourceLogId: 1, userId: 1 }, { unique: true });
