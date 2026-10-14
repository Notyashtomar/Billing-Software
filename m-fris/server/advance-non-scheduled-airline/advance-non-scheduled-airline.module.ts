import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceNonScheduledAirline,
  AdvanceNonScheduledAirlineSchema,
} from './schema/advance-non-scheduled-airline.schema';
import { AdvanceNonScheduledAirlineService } from './services/advance-non-scheduled-airline.service';
import { AdvanceNonScheduledAirlineController } from './controllers/advance-non-scheduled-airline.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: AdvanceNonScheduledAirline.name,
        schema: AdvanceNonScheduledAirlineSchema,
      },
    ]),
  ],
  controllers: [AdvanceNonScheduledAirlineController],
  providers: [AdvanceNonScheduledAirlineService],
  exports: [AdvanceNonScheduledAirlineService],
})
export class AdvanceNonScheduledAirlineModule {}
