import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from '../user/user.module';
import { Admin, AdminSchema } from './schema/admin.schema';
import { AdminService } from './services/admin.service';
import { AdminController } from './controllers/admin.controller';
import { AdminBootstrapService } from './services/admin-bootstrap.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
    forwardRef(() => UserModule),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminBootstrapService],
  exports: [AdminService],
})
export class AdminModule {}
