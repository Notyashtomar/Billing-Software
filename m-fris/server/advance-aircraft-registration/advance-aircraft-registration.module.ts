import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceAircraftRegistration,
  AdvanceAircraftRegistrationSchema,
} from './schema/advance-aircraft-registration.schema';
import { AdvanceAircraftRegistrationService } from './services/advance-aircraft-registration.service';
import { AdvanceAircraftRegistrationController } from './controllers/advance-aircraft-registration.controller';
import { AdvanceAirlineModule } from '../advance-airline/advance-airline.module';
import { AdvanceAircraftModule } from '../advance-aircraft/advance-aircraft.module';

@Module({
  imports: [
    AdvanceAirlineModule,
    AdvanceAircraftModule,
    MongooseModule.forFeature([
      {
        name: AdvanceAircraftRegistration.name,
        schema: AdvanceAircraftRegistrationSchema,
      },
    ]),
  ],
  controllers: [AdvanceAircraftRegistrationController],
  providers: [AdvanceAircraftRegistrationService],
  exports: [AdvanceAircraftRegistrationService],
})
export class AdvanceAircraftRegistrationModule {}
