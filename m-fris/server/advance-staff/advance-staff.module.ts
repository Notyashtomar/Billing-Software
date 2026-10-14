import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceStaff,
  AdvanceStaffSchema,
} from './schema/advance-staff.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { AdvanceStaffService } from './services/advance-staff.service';
import { AdvanceStaffController } from './controllers/advance-staff.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceStaff.name, schema: AdvanceStaffSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdvanceStaffController],
  providers: [AdvanceStaffService],
  exports: [AdvanceStaffService],
})
export class AdvanceStaffModule {}
