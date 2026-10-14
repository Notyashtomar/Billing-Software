import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceAmsService,
  AdvanceAmsServiceSchema,
} from './schema/advance-ams-services.schema';
import { AdvanceAmsServicesService } from './services/advance-ams-services.service';
import { AdvanceAmsServicesController } from './controllers/advance-ams-services.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceAmsService.name, schema: AdvanceAmsServiceSchema },
    ]),
  ],
  controllers: [AdvanceAmsServicesController],
  providers: [AdvanceAmsServicesService],
  exports: [AdvanceAmsServicesService],
})
export class AdvanceAmsServicesModule {}
