import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ScheduledAirlinesCreation,
  ScheduledAirlinesCreationSchema,
} from '../raw-flight-data/schema/scheduled-airlines-creation.schema';
import {
  CreationAdditionalFlights,
  CreationAdditionalFlightsSchema,
} from './schema/creation-additional-flights.schema';
import { CreationRaf, CreationRafSchema } from './schema/creation-raf.schema';
import { CreationController } from './creation.controller';
import { CreationService } from './creation.service';
import { DailyFlightOverrideService } from './daily-flight-override.service';
import { AdditionalFlightService } from './additional-flight.service';
import { CreationRafService } from './creation-raf.service';
import { AdvanceAirlineModule } from '../advance-airline/advance-airline.module';
import { AdvanceAircraftModule } from '../advance-aircraft/advance-aircraft.module';
import { AdvanceNonScheduledAirlineModule } from '../advance-non-scheduled-airline/advance-non-scheduled-airline.module';
import { AdvanceRafAirlineModule } from '../advance-raf-airline/advance-raf-airline.module';
import { RawFlightDataModule } from '../raw-flight-data/raw-flight-data.module';

@Module({
  imports: [
    AdvanceAirlineModule,
    AdvanceAircraftModule,
    AdvanceNonScheduledAirlineModule,
    AdvanceRafAirlineModule,
    forwardRef(() => RawFlightDataModule),
    MongooseModule.forFeature([
      { name: ScheduledAirlinesCreation.name, schema: ScheduledAirlinesCreationSchema },
      { name: CreationRaf.name, schema: CreationRafSchema },
      { name: CreationAdditionalFlights.name, schema: CreationAdditionalFlightsSchema },
    ]),
  ],
  controllers: [CreationController],
  providers: [
    CreationService,
    DailyFlightOverrideService,
    AdditionalFlightService,
    CreationRafService,
  ],
  exports: [
    CreationService,
    DailyFlightOverrideService,
    AdditionalFlightService,
    CreationRafService,
  ],
})
export class CreationModule {}
