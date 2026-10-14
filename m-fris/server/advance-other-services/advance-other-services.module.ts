import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceOtherService,
  AdvanceOtherServiceSchema,
} from './schema/advance-other-services.schema';
import { AdvanceOtherServicesService } from './services/advance-other-services.service';
import { AdvanceOtherServicesController } from './controllers/advance-other-services.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceOtherService.name, schema: AdvanceOtherServiceSchema },
    ]),
  ],
  controllers: [AdvanceOtherServicesController],
  providers: [AdvanceOtherServicesService],
  exports: [AdvanceOtherServicesService],
})
export class AdvanceOtherServicesModule {}
