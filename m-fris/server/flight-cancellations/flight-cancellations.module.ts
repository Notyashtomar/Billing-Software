import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FlightCancellation,
  FlightCancellationSchema,
} from './schema/flight-cancellation.schema';
import {
  AdminEmail,
  AdminEmailSchema,
} from '../auth/schema/admin-email.schema';
import { FlightCancellationsService } from './flight-cancellations.service';
import { FlightCancellationsController } from './flight-cancellations.controller';
import { RawFlightDataModule } from '../raw-flight-data/raw-flight-data.module';
import { FhrCollectionModule } from '../fhr-collection/fhr-collection.module';
import { AdvanceAirlineLogoModule } from '../advance-airline-logo/advance-airline-logo.module';

@Module({
  imports: [
    forwardRef(() => RawFlightDataModule),
    FhrCollectionModule,
    AdvanceAirlineLogoModule,
    MongooseModule.forFeature([
      { name: FlightCancellation.name, schema: FlightCancellationSchema },
      { name: AdminEmail.name, schema: AdminEmailSchema },
    ]),
  ],
  controllers: [FlightCancellationsController],
  providers: [FlightCancellationsService],
  exports: [FlightCancellationsService],
})
export class FlightCancellationsModule {}
