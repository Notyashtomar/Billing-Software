import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/schema/user.schema';
import {
  UserNotificationCenter,
  UserNotificationCenterSchema,
} from '../user-activity-notifications/schema/user-notification-center.schema';
import {
  AdminNotificationEvent,
  AdminNotificationEventSchema,
} from './schema/admin-notification-event.schema';
import { AdminNotificationService } from './services/admin-notification.service';
import { AdminNotificationListener } from './listeners/admin-notification.listener';
import { AdminNotificationFeedController } from './controllers/admin-notification-feed.controller';
import { AdminMutationNotificationInterceptor } from './interceptors/admin-mutation-notification.interceptor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminNotificationEvent.name, schema: AdminNotificationEventSchema },
      { name: UserNotificationCenter.name, schema: UserNotificationCenterSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminNotificationFeedController],
  providers: [
    AdminNotificationService,
    AdminNotificationListener,
    AdminMutationNotificationInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminMutationNotificationInterceptor,
    },
  ],
  exports: [AdminNotificationService],
})
export class AdminNotificationsModule {}
