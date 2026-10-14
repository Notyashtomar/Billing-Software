import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PsrSickLeave,
  PsrSickLeaveSchema,
} from './schema/psr-sick-leave.schema';
import { PsrSickLeaveService } from './services/psr-sick-leave.service';
import { PsrSickLeaveController } from './controllers/psr-sick-leave.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PsrSickLeave.name, schema: PsrSickLeaveSchema },
    ]),
  ],
  controllers: [PsrSickLeaveController],
  providers: [PsrSickLeaveService],
  exports: [PsrSickLeaveService],
})
export class PsrSickLeaveModule {}
