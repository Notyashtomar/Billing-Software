import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceAircraft,
  AdvanceAircraftSchema,
} from './schema/advance-aircraft.schema';
import { AdvanceAircraftService } from './services/advance-aircraft.service';
import { AdvanceAircraftIndexMigrationService } from './services/advance-aircraft-index-migration.service';
import { AdvanceAircraftController } from './controllers/advance-aircraft.controller';
import { RawFlightDataModule } from '../raw-flight-data/raw-flight-data.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceAircraft.name, schema: AdvanceAircraftSchema },
    ]),
    forwardRef(() => RawFlightDataModule),
  ],
  controllers: [AdvanceAircraftController],
  providers: [AdvanceAircraftService, AdvanceAircraftIndexMigrationService],
  exports: [AdvanceAircraftService],
})
export class AdvanceAircraftModule {}
