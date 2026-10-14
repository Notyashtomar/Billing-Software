import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EquipmentManpower,
  EquipmentManpowerSchema,
} from './schema/equipment-manpower.schema';
import { EquipmentManpowerService } from './services/equipment-manpower.service';
import { EquipmentManpowerController } from './controllers/equipment-manpower.controller';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';
import { AdvanceScheduleEquipmentModule } from 'src/advance-schedule-equipment/advance-schedule-equipment.module';
import { AdvanceEquipmentModule } from 'src/advance-equipment/advance-equipment.module';

@Module({
  imports: [
    FhrCollectionModule,
    AdvanceScheduleEquipmentModule,
    AdvanceEquipmentModule,
    MongooseModule.forFeature([
      { name: EquipmentManpower.name, schema: EquipmentManpowerSchema },
    ]),
  ],
  controllers: [EquipmentManpowerController],
  providers: [EquipmentManpowerService],
  exports: [EquipmentManpowerService],
})
export class EquipmentManpowerModule {}
