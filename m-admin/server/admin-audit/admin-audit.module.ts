import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../admin/schema/admin.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import {
  UserActionLog,
  UserActionLogSchema,
} from '../user-activity-notifications/schema/user-action-log.schema';
import { AdminAuditController } from './controllers/admin-audit.controller';
import { AuditLog, AuditLogSchema } from './schema/audit-log.schema';
import { AdminAuditService } from './services/admin-audit.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: UserActionLog.name, schema: UserActionLogSchema },
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
  ],
  controllers: [AdminAuditController],
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AdminAuditModule {}
