import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../admin/schema/admin.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { AdminAccessControlController } from './controllers/admin-access-control.controller';
import { AdminAccessControlService } from './services/admin-access-control.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
  ],
  controllers: [AdminAccessControlController],
  providers: [AdminAccessControlService],
  exports: [AdminAccessControlService],
})
export class AdminAccessControlModule {}
