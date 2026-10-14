import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceGatewayScheduledAirline,
  AdvanceGatewayScheduledAirlineSchema,
} from './schema/advance-gateway-scheduled-airline.schema';
import { AdvanceGatewayScheduledAirlineService } from './services/advance-gateway-scheduled-airline.service';
import { AdvanceGatewayScheduledAirlineController } from './controllers/advance-gateway-scheduled-airline.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: AdvanceGatewayScheduledAirline.name,
        schema: AdvanceGatewayScheduledAirlineSchema,
      },
    ]),
  ],
  controllers: [AdvanceGatewayScheduledAirlineController],
  providers: [AdvanceGatewayScheduledAirlineService],
  exports: [AdvanceGatewayScheduledAirlineService],
})
export class AdvanceGatewayScheduledAirlineModule {}
