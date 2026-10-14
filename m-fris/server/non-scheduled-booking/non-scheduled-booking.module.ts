import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdvanceAircraftModule } from '../advance-aircraft/advance-aircraft.module';
import { AdvanceNonScheduledAirlineModule } from '../advance-non-scheduled-airline/advance-non-scheduled-airline.module';
import { EquipmentManpower, EquipmentManpowerSchema } from '../equipment-manpower/schema/equipment-manpower.schema';
import { MainDetailsModule } from '../main-details/main-details.module';
import { NsFhrCollectionModule } from '../ns-fhr-collection/ns-fhr-collection.module';
import { RampDetails1, RampDetails1Schema } from '../ramp-details-1/schema/ramp-details-1.schema';
import { TerminalDetails, TerminalDetailsSchema } from '../terminal-details/schema/terminal-details.schema';
import {
  FlightSerialCounter,
  FlightSerialCounterSchema,
} from '../raw-flight-data/schema/flight-serial-counter.schema';
import { NonScheduledBookingController } from './controllers/non-scheduled-booking.controller';
import {
  NonScheduledBooking,
  NonScheduledBookingSchema,
} from './schema/non-scheduled-booking.schema';
import { NonScheduledBookingService } from './services/non-scheduled-booking.service';

@Module({
  imports: [
    MainDetailsModule,
    AdvanceNonScheduledAirlineModule,
    AdvanceAircraftModule,
    NsFhrCollectionModule,
    MongooseModule.forFeature([
      {
        name: NonScheduledBooking.name,
        schema: NonScheduledBookingSchema,
      },
      {
        name: FlightSerialCounter.name,
        schema: FlightSerialCounterSchema,
      },
      { name: TerminalDetails.name, schema: TerminalDetailsSchema },
      { name: RampDetails1.name, schema: RampDetails1Schema },
      { name: EquipmentManpower.name, schema: EquipmentManpowerSchema },
    ]),
  ],
  controllers: [NonScheduledBookingController],
  providers: [NonScheduledBookingService],
  exports: [NonScheduledBookingService],
})
export class NonScheduledBookingModule {}
