import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EquipmentDetails,
  EquipmentDetailsSchema,
} from './schema/equipment-details.schema';
import { EquipmentDetailsService } from './services/equipment-details.service';
import { EquipmentDetailsController } from './controllers/equipment-details.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EquipmentDetails.name, schema: EquipmentDetailsSchema },
    ]),
  ],
  controllers: [EquipmentDetailsController],
  providers: [EquipmentDetailsService],
  exports: [EquipmentDetailsService],
})
export class EquipmentDetailsModule {}
