import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AdminStationsModule } from '../admin-stations/admin-stations.module';
import { Admin, AdminSchema } from '../admin/schema/admin.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import {
  UserActionLog,
  UserActionLogSchema,
} from './schema/user-action-log.schema';
import {
  UserNotificationCenter,
  UserNotificationCenterSchema,
} from './schema/user-notification-center.schema';
import { UserActionLogService } from './services/user-action-log.service';
import { UserNotificationCenterService } from './services/user-notification-center.service';
import { UserActivityLogListener } from './listeners/user-activity-log.listener';
import { UserActionLogInterceptor } from './interceptors/user-action-log.interceptor';
import { AdminUserActivityController } from './controllers/admin-user-activity.controller';
import { UserNotificationCenterController } from './controllers/user-notification-center.controller';

@Module({
  imports: [
    AdminAuditModule,
    AdminStationsModule,
    MongooseModule.forFeature([
      { name: UserActionLog.name, schema: UserActionLogSchema },
      { name: UserNotificationCenter.name, schema: UserNotificationCenterSchema },
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
  ],
  controllers: [AdminUserActivityController, UserNotificationCenterController],
  providers: [
    UserActionLogService,
    UserNotificationCenterService,
    UserActivityLogListener,
    {
      provide: APP_INTERCEPTOR,
      useClass: UserActionLogInterceptor,
    },
  ],
  exports: [UserActionLogService, UserNotificationCenterService],
})
export class UserActivityNotificationsModule {}
