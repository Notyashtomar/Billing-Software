import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PaxDutyAllocation,
  PaxDutyAllocationSchema,
} from './schema/pax-duty-allocation.schema';
import { PaxDutyAllocationService } from './services/pax-duty-allocation.service';
import { PaxDutyAllocationController } from './controllers/pax-duty-allocation.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaxDutyAllocation.name, schema: PaxDutyAllocationSchema },
    ]),
  ],
  controllers: [PaxDutyAllocationController],
  providers: [PaxDutyAllocationService],
  exports: [PaxDutyAllocationService],
})
export class PaxDutyAllocationModule {}
