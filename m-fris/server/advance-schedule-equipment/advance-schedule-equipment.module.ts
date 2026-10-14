import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceScheduleEquipment,
  AdvanceScheduleEquipmentSchema,
} from './schema/advance-schedule-equipment.schema';
import { AdvanceScheduleEquipmentService } from './services/advance-schedule-equipment.service';
import { AdvanceScheduleEquipmentController } from './controllers/advance-schedule-equipment.controller';
import { AdvanceAirlineModule } from '../advance-airline/advance-airline.module';
import { AdvanceEquipmentModule } from '../advance-equipment/advance-equipment.module';

@Module({
  imports: [
    AdvanceAirlineModule,
    AdvanceEquipmentModule,
    MongooseModule.forFeature([
      {
        name: AdvanceScheduleEquipment.name,
        schema: AdvanceScheduleEquipmentSchema,
      },
    ]),
  ],
  controllers: [AdvanceScheduleEquipmentController],
  providers: [AdvanceScheduleEquipmentService],
  exports: [AdvanceScheduleEquipmentService],
})
export class AdvanceScheduleEquipmentModule {}
