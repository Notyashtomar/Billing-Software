import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FlightInstanceState,
  FlightInstanceStateSchema,
} from './schema/flight-instance-state.schema';
import { FlightInstanceStateService } from './flight-instance-state.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightInstanceState.name, schema: FlightInstanceStateSchema },
    ]),
  ],
  providers: [FlightInstanceStateService],
  exports: [FlightInstanceStateService],
})
export class FlightInstanceStateModule {}
