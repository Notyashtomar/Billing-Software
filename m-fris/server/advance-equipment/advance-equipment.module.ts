import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceEquipment,
  AdvanceEquipmentSchema,
} from './schema/advance-equipment.schema';
import { AdvanceEquipmentService } from './services/advance-equipment.service';
import { AdvanceEquipmentController } from './controllers/advance-equipment.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceEquipment.name, schema: AdvanceEquipmentSchema },
    ]),
  ],
  controllers: [AdvanceEquipmentController],
  providers: [AdvanceEquipmentService],
  exports: [AdvanceEquipmentService],
})
export class AdvanceEquipmentModule {}
