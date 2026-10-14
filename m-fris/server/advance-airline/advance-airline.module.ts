import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceAirline,
  AdvanceAirlineSchema,
} from './schema/advance-airline.schema';
import { AdvanceAirlineService } from './services/advance-airline.service';
import { AdvanceAirlineIndexMigrationService } from './services/advance-airline-index-migration.service';
import { AdvanceAirlineController } from './controllers/advance-airline.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceAirline.name, schema: AdvanceAirlineSchema },
    ]),
  ],
  controllers: [AdvanceAirlineController],
  providers: [AdvanceAirlineService, AdvanceAirlineIndexMigrationService],
  exports: [AdvanceAirlineService],
})
export class AdvanceAirlineModule {}
