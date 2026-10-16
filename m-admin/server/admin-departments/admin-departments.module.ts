import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../admin/schema/admin.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { AdminDepartmentsController } from './controllers/admin-departments.controller';
import {
  AdminDepartment,
  AdminDepartmentSchema,
} from './schema/admin-department.schema';
import { AdminDepartmentsService } from './services/admin-departments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminDepartment.name, schema: AdminDepartmentSchema },
      { name: User.name, schema: UserSchema },
      { name: Admin.name, schema: AdminSchema },
    ]),
  ],
  controllers: [AdminDepartmentsController],
  providers: [AdminDepartmentsService],
  exports: [AdminDepartmentsService],
})
export class AdminDepartmentsModule {}
